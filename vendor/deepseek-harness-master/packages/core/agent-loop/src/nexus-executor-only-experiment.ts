/** NexusAgent executor-only guard helpers.
 * @module dsh-agent-loop/nexus-executor-only-experiment
 */

import {
  NEXUS_DSH_CANCEL_REASON_ENV,
  NEXUS_DSH_CANCEL_REQUESTED_ENV,
  NEXUS_DSH_DEFAULT_PROVIDER_ID,
  NEXUS_DSH_EXECUTION_ID_ENV,
  NEXUS_DSH_EXECUTION_POLICY_ENV,
  NEXUS_DSH_EXECUTOR_ONLY_ENV,
  NEXUS_DSH_PROVIDER_ENABLED_ENV,
  NEXUS_DSH_PROVIDER_ID_ENV,
  NEXUS_DSH_ROLLBACK_PROVIDER_ID_ENV,
  NEXUS_DSH_TRACE_ID_ENV,
} from './constants.ts'

export {
  NEXUS_DSH_CANCEL_REASON_ENV,
  NEXUS_DSH_CANCEL_REQUESTED_ENV,
  NEXUS_DSH_DEFAULT_PROVIDER_ID,
  NEXUS_DSH_EXECUTION_ID_ENV,
  NEXUS_DSH_EXECUTION_POLICY_ENV,
  NEXUS_DSH_EXECUTOR_ONLY_ENV,
  NEXUS_DSH_PROVIDER_ENABLED_ENV,
  NEXUS_DSH_PROVIDER_ID_ENV,
  NEXUS_DSH_ROLLBACK_PROVIDER_ID_ENV,
  NEXUS_DSH_TRACE_ID_ENV,
} from './constants.ts'

export const NEXUS_DSH_EXECUTION_EVENT_SCHEMA_VERSION = 'nexus.execution_event.p0.v1'
export const NEXUS_DSH_EXECUTION_EVENT_P2_SCHEMA_VERSION = 'nexus.execution_event.p2.v1'
export const NEXUS_DSH_AGENT_LOOP_BLOCKED = 'NEXUS_DSH_EXECUTOR_ONLY_AGENT_LOOP_BLOCKED'
export const NEXUS_DSH_EXECUTION_CONTEXT_REQUIRED = 'NEXUS_DSH_EXECUTION_CONTEXT_REQUIRED'
export const NEXUS_DSH_TOOL_POLICY_BLOCKED = 'NEXUS_DSH_TOOL_POLICY_BLOCKED'
export const NEXUS_DSH_PROVIDER_DISABLED = 'NEXUS_DSH_PROVIDER_DISABLED'
export const NEXUS_DSH_PROVIDER_INVALID = 'NEXUS_DSH_PROVIDER_INVALID'
export const NEXUS_DSH_EXECUTION_CANCELLED = 'NEXUS_DSH_EXECUTION_CANCELLED'

const TRUTHY = new Set(['1', 'true', 'yes', 'on'])
const FALSY = new Set(['0', 'false', 'no', 'off'])
const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/

/** Minimal platform execution policy used by the P0 executor-only proof. */
export interface NexusExecutionPolicy {
  readonly mode: 'executor-only'
  readonly allowNativeAgentLoop: false
  readonly requirePolicyGate: true
  readonly requireArtifactStore: true
  readonly allowedTools?: readonly string[]
}

/** Provider metadata required before this DSH snapshot may execute work. */
export interface NexusExecutorProviderContext {
  readonly provider_id: string
  readonly enabled: true
  readonly rollback_provider_id?: string
}

/** Platform cancellation metadata projected by the DSH adapter. */
export interface NexusExecutionCancellation {
  readonly requested: true
  readonly reason?: string
}

/** Platform execution context required before DSH may run executor work. */
export interface NexusExecutionRequest {
  readonly execution_id: string
  readonly trace_id?: string
  readonly policy: NexusExecutionPolicy
  readonly provider: NexusExecutorProviderContext
  readonly cancel?: NexusExecutionCancellation
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

/** P2 provider-scoped event used by platform adapter and smoke tests. */
export interface NexusProviderExecutionEvent {
  readonly schema_version: typeof NEXUS_DSH_EXECUTION_EVENT_P2_SCHEMA_VERSION
  readonly execution_id: string
  readonly trace_id?: string
  readonly provider_id: string
  readonly event_type:
    | 'execution.accepted'
    | 'execution.blocked'
    | 'execution.cancelled'
    | 'tool.blocked'
    | 'tool.result'
  readonly status: 'accepted' | 'blocked' | 'cancelled' | 'completed' | 'failed'
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

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new NexusDshExecutorOnlyError(
      NEXUS_DSH_EXECUTION_CONTEXT_REQUIRED,
      `NexusAgent executor request ${field} must be a non-empty string when present`,
    )
  }
  return value
}

function readBooleanFlag(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') {
    throw new NexusDshExecutorOnlyError(
      NEXUS_DSH_EXECUTION_CONTEXT_REQUIRED,
      `NexusAgent executor request ${field} must be a boolean flag`,
    )
  }
  const normalized = value.trim().toLowerCase()
  if (TRUTHY.has(normalized)) return true
  if (FALSY.has(normalized)) return false
  throw new NexusDshExecutorOnlyError(
    NEXUS_DSH_EXECUTION_CONTEXT_REQUIRED,
    `NexusAgent executor request ${field} must be a boolean flag`,
  )
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

/** Validate provider metadata for the current DSH executor provider. */
export function validateNexusExecutorProvider(value: unknown): NexusExecutorProviderContext {
  const provider = value === undefined ? {} : value
  if (!isRecord(provider)) {
    throw new NexusDshExecutorOnlyError(
      NEXUS_DSH_PROVIDER_INVALID,
      'NexusAgent executor provider context must be an object',
    )
  }
  const providerId = typeof provider.provider_id === 'string' && provider.provider_id.trim().length > 0
    ? provider.provider_id
    : NEXUS_DSH_DEFAULT_PROVIDER_ID
  if (!PROVIDER_ID_PATTERN.test(providerId)) {
    throw new NexusDshExecutorOnlyError(
      NEXUS_DSH_PROVIDER_INVALID,
      'NexusAgent executor provider_id is invalid',
    )
  }
  const enabled = readBooleanFlag(provider.enabled, 'provider.enabled') ?? true
  if (!enabled) {
    throw new NexusDshExecutorOnlyError(
      NEXUS_DSH_PROVIDER_DISABLED,
      `NexusAgent executor provider is disabled: ${providerId}`,
    )
  }
  const rollbackProviderId = optionalString(provider.rollback_provider_id, 'provider.rollback_provider_id')
  if (rollbackProviderId !== undefined && !PROVIDER_ID_PATTERN.test(rollbackProviderId)) {
    throw new NexusDshExecutorOnlyError(
      NEXUS_DSH_PROVIDER_INVALID,
      'NexusAgent executor rollback_provider_id is invalid',
    )
  }
  if (rollbackProviderId === providerId) {
    throw new NexusDshExecutorOnlyError(
      NEXUS_DSH_PROVIDER_INVALID,
      'NexusAgent executor rollback provider must differ from active provider',
    )
  }
  return {
    provider_id: providerId,
    enabled: true,
    ...rollbackProviderId === undefined ? {} : { rollback_provider_id: rollbackProviderId },
  }
}

/** Validate cancellation metadata before native tool scheduling begins. */
export function validateNexusExecutionCancellation(value: unknown): NexusExecutionCancellation | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) {
    throw new NexusDshExecutorOnlyError(
      NEXUS_DSH_EXECUTION_CONTEXT_REQUIRED,
      'NexusAgent executor cancellation context must be an object',
    )
  }
  const requested = readBooleanFlag(value.requested, 'cancel.requested')
  if (requested !== true) return undefined
  const reason = optionalString(value.reason, 'cancel.reason')
  return {
    requested: true,
    ...reason === undefined ? {} : { reason },
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
  const cancel = validateNexusExecutionCancellation(value.cancel)
  return {
    execution_id: value.execution_id,
    ...value.trace_id === undefined ? {} : { trace_id: value.trace_id },
    policy: validateNexusExecutionPolicy(value.policy),
    provider: validateNexusExecutorProvider(value.provider),
    ...cancel === undefined ? {} : { cancel },
  }
}

/** Read the P0 platform execution request projection from process env. */
export function readNexusExecutionRequestFromEnv(): NexusExecutionRequest | undefined {
  const executionId = envValue(NEXUS_DSH_EXECUTION_ID_ENV)
  const traceId = envValue(NEXUS_DSH_TRACE_ID_ENV)
  const rawPolicy = envValue(NEXUS_DSH_EXECUTION_POLICY_ENV)
  const providerId = envValue(NEXUS_DSH_PROVIDER_ID_ENV)
  const providerEnabled = envValue(NEXUS_DSH_PROVIDER_ENABLED_ENV)
  const rollbackProviderId = envValue(NEXUS_DSH_ROLLBACK_PROVIDER_ID_ENV)
  const cancelRequested = envValue(NEXUS_DSH_CANCEL_REQUESTED_ENV)
  const cancelReason = envValue(NEXUS_DSH_CANCEL_REASON_ENV)
  if (executionId === undefined && rawPolicy === undefined && providerId === undefined
    && cancelRequested === undefined && cancelReason === undefined) return undefined
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
  return validateNexusExecutionRequest({
    execution_id: executionId,
    ...traceId === undefined ? {} : { trace_id: traceId },
    policy: parsedPolicy,
    provider: {
      ...providerId === undefined ? {} : { provider_id: providerId },
      ...providerEnabled === undefined ? {} : { enabled: providerEnabled },
      ...rollbackProviderId === undefined ? {} : { rollback_provider_id: rollbackProviderId },
    },
    ...cancelRequested === undefined && cancelReason === undefined ? {} : {
      cancel: {
        ...cancelRequested === undefined ? {} : { requested: cancelRequested },
        ...cancelReason === undefined ? {} : { reason: cancelReason },
      },
    },
  })
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

/** Throw before scheduling executor work when the platform has cancelled it. */
export function assertNexusExecutionNotCancelled(request: NexusExecutionRequest): void {
  if (request.cancel?.requested !== true) return
  throw new NexusDshExecutorOnlyError(
    NEXUS_DSH_EXECUTION_CANCELLED,
    `NexusAgent executor request was cancelled before dispatch: ${request.cancel.reason ?? 'cancelled'}`,
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

/** Build one P2 provider event without exposing native DSH errors or paths. */
export function buildNexusProviderExecutionEvent(
  request: NexusExecutionRequest,
  eventType: NexusProviderExecutionEvent['event_type'],
  status: NexusProviderExecutionEvent['status'],
  payload: Record<string, unknown> = {},
): NexusProviderExecutionEvent {
  return {
    schema_version: NEXUS_DSH_EXECUTION_EVENT_P2_SCHEMA_VERSION,
    execution_id: request.execution_id,
    ...request.trace_id === undefined ? {} : { trace_id: request.trace_id },
    provider_id: request.provider.provider_id,
    event_type: eventType,
    status,
    payload,
  }
}
