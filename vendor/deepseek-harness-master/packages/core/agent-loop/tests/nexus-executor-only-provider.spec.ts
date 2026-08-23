import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { agentEvents, assembleContextFor } from '@deepseek-ai/dsh-agent'
import LlmRuntime, { CallId, type ToolCallBlock } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { ReactLoopAgent } from '../src/agent.ts'
import { RuntimeContextProjection } from '../src/runtime-context.ts'
import { executeToolCalls } from '../src/tool-calls.ts'
import {
  buildNexusProviderExecutionEvent,
  NEXUS_DSH_AGENT_LOOP_BLOCKED,
  NEXUS_DSH_DEFAULT_PROVIDER_ID,
  NEXUS_DSH_EXECUTION_CANCELLED,
  NEXUS_DSH_PROVIDER_DISABLED,
  NEXUS_DSH_PROVIDER_INVALID,
  NexusDshExecutorOnlyError,
  requireNexusExecutionRequest,
  validateNexusExecutionRequest,
} from '../src/nexus-executor-only-experiment.ts'

afterEach(() => {
  vi.unstubAllEnvs()
})

function executorPolicy(allowedTools?: readonly string[]) {
  return {
    mode: 'executor-only',
    allowNativeAgentLoop: false,
    requirePolicyGate: true,
    requireArtifactStore: true,
    ...allowedTools === undefined ? {} : { allowedTools },
  } as const
}

function enableExecutorEnv(allowedTools: readonly string[] = ['bash']): void {
  vi.stubEnv('NEXUS_DSH_EXECUTOR_ONLY', '1')
  vi.stubEnv('NEXUS_DSH_EXECUTION_ID', 'exec-123')
  vi.stubEnv('NEXUS_DSH_TRACE_ID', 'trace-123')
  vi.stubEnv('NEXUS_DSH_PROVIDER_ID', NEXUS_DSH_DEFAULT_PROVIDER_ID)
  vi.stubEnv('NEXUS_DSH_EXECUTION_POLICY', JSON.stringify(executorPolicy(allowedTools)))
}

async function executorHarness(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  return ctx
}

function toolCall(name = 'bash'): ToolCallBlock {
  return {
    type: 'tool-call',
    id: CallId('call-1'),
    name,
    arguments: '{}',
  }
}

function fakeAgent() {
  const append = vi.fn((_type: string) => ({ seq: append.mock.calls.length + 1 }))
  return {
    append,
    agent: {
      session: { events: [], append },
    },
  }
}

describe('NexusAgent DSH executor-only P2 provider guard', () => {
  it('blocks native ReactLoopAgent construction, runtime context projection, and agent dispatch', () => {
    vi.stubEnv('NEXUS_DSH_EXECUTOR_ONLY', '1')

    expect(() => new ReactLoopAgent({} as never, SessionId('native'), {}, {} as never))
      .toThrowError(expect.objectContaining({ code: NEXUS_DSH_AGENT_LOOP_BLOCKED }))
    expect(() => new RuntimeContextProjection({} as never, {} as never))
      .toThrowError(expect.objectContaining({ code: NEXUS_DSH_AGENT_LOOP_BLOCKED }))
    expect(() => agentEvents({} as never, {} as never, {} as never))
      .toThrowError(expect.objectContaining({ code: NEXUS_DSH_AGENT_LOOP_BLOCKED }))
    expect(() => assembleContextFor({} as never))
      .toThrowError(expect.objectContaining({ code: NEXUS_DSH_AGENT_LOOP_BLOCKED }))
  })

  it('blocks native AgentLoop createAgent and resume entrypoints', async () => {
    vi.stubEnv('NEXUS_DSH_EXECUTOR_ONLY', '1')
    const ctx = await executorHarness()

    await expect(ctx.agentLoop.createAgent(ctx, { sessionId: SessionId('native-create') }))
      .rejects.toThrowError(expect.objectContaining({ code: NEXUS_DSH_AGENT_LOOP_BLOCKED }))
    await expect(ctx.agentLoop.resume(ctx, { resumeSessionId: SessionId('native-resume') }))
      .rejects.toThrowError(expect.objectContaining({ code: NEXUS_DSH_AGENT_LOOP_BLOCKED }))
  })

  it('accepts an executor-only platform request with provider metadata and runs an allowed tool', async () => {
    enableExecutorEnv(['bash'])
    const ctx = await executorHarness()
    const { append, agent } = fakeAgent()
    ctx.tools.register(defineContentToolFixture({
      name: 'bash',
      description: 'P2 provider baseline allowed tool',
      parameters: {},
      async execute() {
        return [{ type: 'text', text: 'ok' }]
      },
    }))

    await ctx.agents.withInitiator(agent as never, () => executeToolCalls(
      ctx,
      1,
      1,
      [toolCall()],
      new AbortController().signal,
      () => undefined,
    ))

    expect(append.mock.calls.map(([type]) => type)).toEqual(['tool/call', 'tool/result'])
    expect(requireNexusExecutionRequest().provider).toEqual({
      provider_id: NEXUS_DSH_DEFAULT_PROVIDER_ID,
      enabled: true,
    })
  })

  it('rejects disabled provider and invalid rollback metadata before native scheduling', () => {
    enableExecutorEnv(['bash'])
    vi.stubEnv('NEXUS_DSH_PROVIDER_ENABLED', 'false')

    expect(() => requireNexusExecutionRequest())
      .toThrowError(expect.objectContaining({ code: NEXUS_DSH_PROVIDER_DISABLED }))

    expect(() => validateNexusExecutionRequest({
      execution_id: 'exec-123',
      policy: executorPolicy(['bash']),
      provider: {
        provider_id: NEXUS_DSH_DEFAULT_PROVIDER_ID,
        enabled: true,
        rollback_provider_id: NEXUS_DSH_DEFAULT_PROVIDER_ID,
      },
    })).toThrowError(expect.objectContaining({ code: NEXUS_DSH_PROVIDER_INVALID }))
  })

  it('returns a traceable cancellation result before tool dispatch', async () => {
    enableExecutorEnv(['bash'])
    vi.stubEnv('NEXUS_DSH_CANCEL_REQUESTED', 'true')
    vi.stubEnv('NEXUS_DSH_CANCEL_REASON', 'platform user cancelled execution')
    const ctx = await executorHarness()
    const { append, agent } = fakeAgent()

    await expect(ctx.agents.withInitiator(agent as never, () => executeToolCalls(
      ctx,
      1,
      1,
      [toolCall()],
      new AbortController().signal,
      () => undefined,
    ))).rejects.toThrowError(expect.objectContaining({ code: NEXUS_DSH_EXECUTION_CANCELLED }))
    expect(append).not.toHaveBeenCalled()

    const request = requireNexusExecutionRequest()
    expect(buildNexusProviderExecutionEvent(request, 'execution.cancelled', 'cancelled', { reason: request.cancel?.reason }))
      .toEqual({
        schema_version: 'nexus.execution_event.p2.v1',
        execution_id: 'exec-123',
        trace_id: 'trace-123',
        provider_id: NEXUS_DSH_DEFAULT_PROVIDER_ID,
        event_type: 'execution.cancelled',
        status: 'cancelled',
        payload: { reason: 'platform user cancelled execution' },
      })
  })

  it('still blocks tools outside the platform allowlist under P2 provider metadata', async () => {
    enableExecutorEnv(['bash'])
    const ctx = await executorHarness()
    const { append, agent } = fakeAgent()

    await expect(ctx.agents.withInitiator(agent as never, () => executeToolCalls(
      ctx,
      1,
      1,
      [toolCall('memory_search')],
      new AbortController().signal,
      () => undefined,
    ))).rejects.toThrowError(NexusDshExecutorOnlyError)
    expect(append).not.toHaveBeenCalled()
  })
})
