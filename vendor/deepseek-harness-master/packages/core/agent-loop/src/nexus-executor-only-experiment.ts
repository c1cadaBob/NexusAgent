/** NexusAgent P0 executor-only experiment helpers.
 * @module dsh-agent-loop/nexus-executor-only-experiment
 */

export const NEXUS_DSH_EXECUTOR_ONLY_ENV = 'NEXUS_DSH_EXECUTOR_ONLY'
export const NEXUS_DSH_EXECUTION_ID_ENV = 'NEXUS_DSH_EXECUTION_ID'
export const NEXUS_DSH_EXECUTION_POLICY_ENV = 'NEXUS_DSH_EXECUTION_POLICY'
export const NEXUS_DSH_EXECUTION_EVENT_SCHEMA_VERSION = 'nexus.execution_event.p0.v1'
export const NEXUS_DSH_AGENT_LOOP_BLOCKED = 'NEXUS_DSH_EXECUTOR_ONLY_AGENT_LOOP_BLOCKED'
export const NEXUS_DSH_EXECUTION_CONTEXT_REQUIRED = 'NEXUS_DSH_EXECUTION_CONTEXT_REQUIRED'
export const NEXUS_DSH_TOOL_POLICY_BLOCKED = 'NEXUS_DSH_TOOL_POLICY_BLOCKED'

const TRUTHY = new Set(['1', 'true', 'yes', 'on'])

/** Minimal platform execution policy used by the P0 executor-only proof. */
export interface NexusExecutionPolicy {
  readonly mode: 'executor-only'
  readonly allowNativeAgentLoop: false
  readonly requirePolicyGate: true
  readonly requireArtifactStore: true
  readonly allowedTools?: readonly string[]
}

/** Platform execution context required before DSH may run executor work. */
export interface NexusExecutionRequest {
  readonly execution_id: string
  readonly trace_id?: string
  readonly policy: NexusExecutionPolicy
}

/** Platform-parseable execution event emitted by the P0 proof helpers. */
export interface NexusExecutionEvent {
  readonly schema_version: typeof NEXUS_DSH_EXECUTION_EVENT_SCHEMA_VERSION
  readonly execution_id: string
  readonly trace_id?: string
  readonly event_type: 'execution.accepted' | 'execution.blocked' | 'tool.blocked' | 'tool.result'
  readonly status: 'accepted' | 'blocked' | 'completed' | 'failed'
  readonly payload: Record<string, unknown>
}

/** Structured P0 guard error; callers inspect `code`, never message text. */
export class NexusDshExecutorOnlyError extends Error {
  constructor(readonly code: string, message: string, options: { cause?: unknown } = {}) {
    super(message, options)
    this.name = 'NexusDshExecutorOnlyError'
  }
}

function envValue(name: string): string | undefined {
  return globalThis.process?.env?.[name]
}

/** Return true when the P0 DSH executor-only experiment is explicitly enabled. */
export function isNexusDshExecutorOnlyEnabled(): boolean {
  return TRUTHY.has((envValue(NEXUS_DSH_EXECUTOR_ONLY_ENV) ?? '').trim().toLowerCase())
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringList(value: unknown): readonly string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || item.length === 0)) {
    throw new NexusDshExecutorOnlyError(
      NEXUS_DSH_EXECUTION_CONTEXT_REQUIRED,
      'NexusAgent executor policy allowedTools must be a string array when present',
    )
  }
  return value
}

/** Validate one platform execution policy. */
export function validateNexusExecutionPolicy(value: unknown): NexusExecutionPolicy {
  if (!isRecord(value)) {
    throw new NexusDshExecutorOnlyError(
      NEXUS_DSH_EXECUTION_CONTEXT_REQUIRED,
      'NexusAgent executor request requires a policy object',
    )
  }
  if (value.mode !== 'executor-only'
    || value.allowNativeAgentLoop !== false
    || value.requirePolicyGate !== true
    || value.requireArtifactStore !== true) {
    throw new NexusDshExecutorOnlyError(
      NEXUS_DSH_EXECUTION_CONTEXT_REQUIRED,
      'NexusAgent executor policy must require executor-only, Policy-Gate, and Artifact Store',
    )
  }
  const allowedTools = stringList(value.allowedTools)
  return {
    mode: 'executor-only',
    allowNativeAgentLoop: false,
    requirePolicyGate: true,
    requireArtifactStore: true,
    ...allowedTools === undefined ? {} : { allowedTools },
  }
}

/** Validate the P0 platform execution request that gates executor work. */
export function validateNexusExecutionRequest(value: unknown): NexusExecutionRequest {
  if (!isRecord(value)) {
    throw new NexusDshExecutorOnlyError(
      NEXUS_DSH_EXECUTION_CONTEXT_REQUIRED,
      'NexusAgent executor request must be an object',
    )
  }
  if (typeof value.execution_id !== 'string' || value.execution_id.trim().length === 0) {
    throw new NexusDshExecutorOnlyError(
      NEXUS_DSH_EXECUTION_CONTEXT_REQUIRED,
      'NexusAgent executor request requires execution_id',
    )
  }
  if (value.trace_id !== undefined && typeof value.trace_id !== 'string') {
    throw new NexusDshExecutorOnlyError(
      NEXUS_DSH_EXECUTION_CONTEXT_REQUIRED,
      'NexusAgent executor request trace_id must be a string when present',
    )
  }
  return {
    execution_id: value.execution_id,
    ...value.trace_id === undefined ? {} : { trace_id: value.trace_id },
    policy: validateNexusExecutionPolicy(value.policy),
  }
}

/** Read the P0 platform execution request projection from process env. */
export function readNexusExecutionRequestFromEnv(): NexusExecutionRequest | undefined {
  const executionId = envValue(NEXUS_DSH_EXECUTION_ID_ENV)
  const rawPolicy = envValue(NEXUS_DSH_EXECUTION_POLICY_ENV)
  if (executionId === undefined && rawPolicy === undefined) return undefined
  let parsedPolicy: unknown
  try {
    parsedPolicy = rawPolicy === undefined ? undefined : JSON.parse(rawPolicy)
  } catch (cause: unknown) {
    throw new NexusDshExecutorOnlyError(
      NEXUS_DSH_EXECUTION_CONTEXT_REQUIRED,
      'NexusAgent executor policy must be JSON',
      { cause },
    )
  }
  return validateNexusExecutionRequest({ execution_id: executionId, policy: parsedPolicy })
}

/** Require the platform execution request when executor-only mode is enabled. */
export function requireNexusExecutionRequest(): NexusExecutionRequest {
  const request = readNexusExecutionRequestFromEnv()
  if (request !== undefined) return request
  throw new NexusDshExecutorOnlyError(
    NEXUS_DSH_EXECUTION_CONTEXT_REQUIRED,
    'NexusAgent executor-only mode requires execution_id and policy before tool execution',
  )
}

/** Throw when native agent-loop behavior is attempted under executor-only mode. */
export function assertNexusNativeAgentLoopAllowed(action: string): void {
  if (!isNexusDshExecutorOnlyEnabled()) return
  throw new NexusDshExecutorOnlyError(
    NEXUS_DSH_AGENT_LOOP_BLOCKED,
    `NexusAgent executor-only mode blocks native DSH agent-loop action: ${action}`,
  )
}

/** Enforce the platform tool allowlist from the P0 execution policy. */
export function assertNexusToolAllowed(request: NexusExecutionRequest, toolName: string): void {
  const allowed = request.policy.allowedTools
  if (allowed === undefined || allowed.includes(toolName)) return
  throw new NexusDshExecutorOnlyError(
    NEXUS_DSH_TOOL_POLICY_BLOCKED,
    `NexusAgent executor policy blocks tool: ${toolName}`,
  )
}

/** Build one platform-parseable execution event for docs and adapter tests. */
export function buildNexusExecutionEvent(
  request: NexusExecutionRequest,
  eventType: NexusExecutionEvent['event_type'],
  status: NexusExecutionEvent['status'],
  payload: Record<string, unknown> = {},
): NexusExecutionEvent {
  return {
    schema_version: NEXUS_DSH_EXECUTION_EVENT_SCHEMA_VERSION,
    execution_id: request.execution_id,
    ...request.trace_id === undefined ? {} : { trace_id: request.trace_id },
    event_type: eventType,
    status,
    payload,
  }
}

