import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import SessionStore from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import LlmRuntime, { CallId, type ToolCallBlock } from '@deepseek-ai/dsh-llm'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { executeToolCalls } from '../src/tool-calls.ts'
import {
  assertNexusToolAllowed,
  buildNexusExecutionEvent,
  NEXUS_DSH_AGENT_LOOP_BLOCKED,
  NEXUS_DSH_EXECUTION_CONTEXT_REQUIRED,
  NEXUS_DSH_TOOL_POLICY_BLOCKED,
  NexusDshExecutorOnlyError,
  requireNexusExecutionRequest,
  validateNexusExecutionRequest,
} from '../src/nexus-executor-only-experiment.ts'

afterEach(() => {
  vi.unstubAllEnvs()
})

async function harness(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  return ctx
}

function executorPolicy(allowedTools?: readonly string[]) {
  return {
    mode: 'executor-only',
    allowNativeAgentLoop: false,
    requirePolicyGate: true,
    requireArtifactStore: true,
    ...allowedTools === undefined ? {} : { allowedTools },
  } as const
}

describe('NexusAgent DSH executor-only experiment', () => {
  it('blocks native AgentLoop creation when executor-only mode is enabled', async () => {
    vi.stubEnv('NEXUS_DSH_EXECUTOR_ONLY', '1')
    const ctx = await harness()

    expect(() => ctx.agentLoop.create(SessionId('native'), { provider: 'mock', model: 'mock' }))
      .toThrowError(expect.objectContaining({ code: NEXUS_DSH_AGENT_LOOP_BLOCKED }))
  })

  it('requires platform execution_id and policy before executor work', () => {
    vi.stubEnv('NEXUS_DSH_EXECUTOR_ONLY', '1')

    expect(() => requireNexusExecutionRequest())
      .toThrowError(expect.objectContaining({ code: NEXUS_DSH_EXECUTION_CONTEXT_REQUIRED }))

    vi.stubEnv('NEXUS_DSH_EXECUTION_ID', 'exec-123')
    vi.stubEnv('NEXUS_DSH_EXECUTION_POLICY', JSON.stringify(executorPolicy(['bash'])))
    const request = requireNexusExecutionRequest()

    expect(request.execution_id).toBe('exec-123')
    expect(request.policy.mode).toBe('executor-only')
    expect(request.policy.allowedTools).toEqual(['bash'])
  })

  it('blocks tools outside the platform policy allowlist', () => {
    const request = validateNexusExecutionRequest({
      execution_id: 'exec-123',
      trace_id: 'trace-123',
      policy: executorPolicy(['bash']),
    })

    expect(() => assertNexusToolAllowed(request, 'bash')).not.toThrow()
    expect(() => assertNexusToolAllowed(request, 'memory_search'))
      .toThrowError(expect.objectContaining({ code: NEXUS_DSH_TOOL_POLICY_BLOCKED }))
  })

  it('exposes a platform-parseable execution event', () => {
    const request = validateNexusExecutionRequest({
      execution_id: 'exec-123',
      trace_id: 'trace-123',
      policy: executorPolicy(),
    })

    expect(buildNexusExecutionEvent(request, 'execution.accepted', 'accepted', { provider: 'dsh-p0' }))
      .toEqual({
        schema_version: 'nexus.execution_event.p0.v1',
        execution_id: 'exec-123',
        trace_id: 'trace-123',
        event_type: 'execution.accepted',
        status: 'accepted',
        payload: { provider: 'dsh-p0' },
      })
  })

  it('rejects tool-call scheduling before any native tool scheduler runs without platform context', async () => {
    vi.stubEnv('NEXUS_DSH_EXECUTOR_ONLY', '1')
    const ctx = new Context()
    await ctx.plugin(AgentRegistry)
    const toolCall: ToolCallBlock = {
      type: 'tool-call',
      id: CallId('call-1'),
      name: 'bash',
      arguments: '{}',
    }
    const fakeAgent = { session: { events: [], append: vi.fn() } }

    await expect(ctx.agents.withInitiator(fakeAgent as never, () => executeToolCalls(
      ctx,
      1,
      1,
      [toolCall],
      new AbortController().signal,
      () => undefined,
    ))).rejects.toThrowError(NexusDshExecutorOnlyError)
    expect(fakeAgent.session.append).not.toHaveBeenCalled()
  })
})

