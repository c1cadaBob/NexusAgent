export const PLATFORM_ID_KEYS = [
  "tenant_id",
  "user_id",
  "agent_id",
  "task_id",
  "attempt_id",
  "execution_id",
  "conversation_id",
  "artifact_id",
  "trace_id",
] as const;

export type PlatformIdKey = (typeof PLATFORM_ID_KEYS)[number];

export const PLATFORM_ID_PATTERNS: Record<PlatformIdKey, RegExp> = Object.freeze({
  tenant_id: /^tenant_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/,
  user_id: /^user_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/,
  agent_id: /^agent_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/,
  task_id: /^task_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/,
  attempt_id: /^attempt_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/,
  execution_id: /^exec_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/,
  conversation_id: /^conv_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/,
  artifact_id: /^artifact_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/,
  trace_id: /^trace_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/,
});

export const TASK_STATE_LAYERS = [
  "intake",
  "admission",
  "planning",
  "approval",
  "execution",
  "settlement",
  "terminal",
] as const;

export type TaskStateLayer = (typeof TASK_STATE_LAYERS)[number];

export const TASK_STATES = [
  "received",
  "admitted",
  "blocked",
  "planning",
  "approval_required",
  "ready_for_execution",
  "executing",
  "settling",
  "completed",
  "failed",
  "cancelled",
  "archived",
] as const;

export type TaskState = (typeof TASK_STATES)[number];

export const TASK_STATE_LAYER: Record<TaskState, TaskStateLayer> = Object.freeze({
  received: "intake",
  admitted: "admission",
  blocked: "admission",
  planning: "planning",
  approval_required: "approval",
  ready_for_execution: "approval",
  executing: "execution",
  settling: "settlement",
  completed: "terminal",
  failed: "terminal",
  cancelled: "terminal",
  archived: "terminal",
});

export const TERMINAL_TASK_STATES = ["completed", "failed", "cancelled", "archived"] as const;

export const TASK_STATE_TRANSITIONS: Record<TaskState, readonly TaskState[]> = Object.freeze({
  received: ["admitted", "blocked", "cancelled"],
  admitted: ["planning", "blocked", "cancelled"],
  blocked: ["admitted", "archived"],
  planning: ["approval_required", "ready_for_execution", "failed", "cancelled"],
  approval_required: ["ready_for_execution", "blocked", "cancelled"],
  ready_for_execution: ["executing", "cancelled"],
  executing: ["settling", "approval_required", "failed", "cancelled"],
  settling: ["completed", "failed", "cancelled"],
  completed: ["archived"],
  failed: ["archived"],
  cancelled: ["archived"],
  archived: [],
});

export type TaskStateTransitionErrorCode =
  | "PLATFORM_INVALID_REQUEST"
  | "PLATFORM_INVALID_STATE_TRANSITION"
  | "PLATFORM_CROSS_TENANT_ID";

export class TaskStateTransitionError extends Error {
  readonly code: TaskStateTransitionErrorCode;
  readonly details: Record<string, unknown>;

  constructor(code: TaskStateTransitionErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "TaskStateTransitionError";
    this.code = code;
    this.details = details;
  }
}

export interface TaskSnapshot {
  tenant_id: string;
  task_id: string;
  attempt_id: string;
  trace_id: string;
  state: TaskState;
  version?: number;
  execution_id?: string;
  conversation_id?: string;
  monotonic_ms?: number;
}

export interface TransitionEnvelopeInput {
  event_id: string;
  occurred_at_utc: string;
  monotonic_ms: number;
  producer_service?: string;
  producer_component?: string;
}

export interface TaskTransitionRequest {
  current: TaskSnapshot;
  next: TaskSnapshot;
  reason: string;
}

export interface TaskTransitionResult {
  previous_state: TaskState;
  next: TaskSnapshot;
  state_layer: TaskStateLayer;
  outcome: "succeeded" | "failed" | "cancelled" | "blocked" | null;
  reason: string;
}

const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

function fail(code: TaskStateTransitionErrorCode, message: string, details: Record<string, unknown> = {}): never {
  throw new TaskStateTransitionError(code, message, details);
}

export function isTaskState(value: unknown): value is TaskState {
  return typeof value === "string" && (TASK_STATES as readonly string[]).includes(value);
}

export function getTaskStateLayer(state: TaskState): TaskStateLayer {
  return TASK_STATE_LAYER[state];
}

export function isTerminalTaskState(state: TaskState): boolean {
  return (TERMINAL_TASK_STATES as readonly string[]).includes(state);
}

export function assertPlatformId(key: PlatformIdKey, value: unknown): string {
  if (typeof value !== "string" || !PLATFORM_ID_PATTERNS[key].test(value)) {
    fail("PLATFORM_INVALID_REQUEST", `Invalid platform identifier: ${key}`, { key, value });
  }
  return value;
}

export function assertPlatformIds(ids: Partial<Record<PlatformIdKey, unknown>>): void {
  for (const key of PLATFORM_ID_KEYS) {
    if (ids[key] !== undefined) {
      assertPlatformId(key, ids[key]);
    }
  }
}

export function assertUtcTimestamp(value: unknown, field = "occurred_at_utc"): string {
  if (typeof value !== "string" || !UTC_TIMESTAMP_PATTERN.test(value)) {
    fail("PLATFORM_INVALID_REQUEST", `Invalid UTC timestamp: ${field}`, { field, value });
  }
  return value;
}

export function assertMonotonicMs(value: unknown, field = "monotonic_ms"): number {
  if (!Number.isInteger(value) || Number(value) < 0) {
    fail("PLATFORM_INVALID_REQUEST", `Invalid monotonic clock value: ${field}`, { field, value });
  }
  return Number(value);
}

export function assertTaskSnapshot(snapshot: TaskSnapshot, label = "snapshot"): TaskSnapshot {
  assertPlatformIds({
    tenant_id: snapshot.tenant_id,
    task_id: snapshot.task_id,
    attempt_id: snapshot.attempt_id,
    trace_id: snapshot.trace_id,
    execution_id: snapshot.execution_id,
    conversation_id: snapshot.conversation_id,
  });
  if (!isTaskState(snapshot.state)) {
    fail("PLATFORM_INVALID_REQUEST", `Invalid task state in ${label}`, { state: snapshot.state, label });
  }
  if (snapshot.monotonic_ms !== undefined) {
    assertMonotonicMs(snapshot.monotonic_ms, `${label}.monotonic_ms`);
  }
  if (snapshot.version !== undefined && (!Number.isInteger(snapshot.version) || snapshot.version < 1)) {
    fail("PLATFORM_INVALID_REQUEST", `Invalid snapshot version in ${label}`, { version: snapshot.version, label });
  }
  return snapshot;
}

export function isTransitionAllowed(from: TaskState, to: TaskState): boolean {
  return TASK_STATE_TRANSITIONS[from].includes(to);
}

function outcomeFor(state: TaskState): TaskTransitionResult["outcome"] {
  if (state === "completed") return "succeeded";
  if (state === "failed") return "failed";
  if (state === "cancelled") return "cancelled";
  if (state === "blocked") return "blocked";
  return null;
}

function isRetryTransition(current: TaskSnapshot, next: TaskSnapshot): boolean {
  return current.attempt_id !== next.attempt_id && next.state === "admitted" && ["blocked", "failed", "cancelled"].includes(current.state);
}

export function assertTransition(request: TaskTransitionRequest): TaskTransitionResult {
  const current = assertTaskSnapshot(request.current, "current");
  const next = assertTaskSnapshot(request.next, "next");

  if (current.tenant_id !== next.tenant_id) {
    fail("PLATFORM_CROSS_TENANT_ID", "Task transitions cannot cross tenant boundaries", {
      current_tenant_id: current.tenant_id,
      next_tenant_id: next.tenant_id,
    });
  }
  if (current.task_id !== next.task_id) {
    fail("PLATFORM_INVALID_STATE_TRANSITION", "Task transitions cannot change task_id", {
      current_task_id: current.task_id,
      next_task_id: next.task_id,
    });
  }
  if (!request.reason.trim()) {
    fail("PLATFORM_INVALID_REQUEST", "Task transitions require an audit reason");
  }

  if (current.attempt_id !== next.attempt_id) {
    if (!isRetryTransition(current, next)) {
      fail("PLATFORM_INVALID_STATE_TRANSITION", "Changing attempt_id is only allowed when opening a retry from blocked/failed/cancelled", {
        current_state: current.state,
        next_state: next.state,
      });
    }
  } else if (!isTransitionAllowed(current.state, next.state)) {
    fail("PLATFORM_INVALID_STATE_TRANSITION", "Task state transition is not allowed", {
      from: current.state,
      to: next.state,
      allowed: TASK_STATE_TRANSITIONS[current.state],
    });
  }

  if (current.monotonic_ms !== undefined && next.monotonic_ms !== undefined && next.monotonic_ms < current.monotonic_ms) {
    fail("PLATFORM_INVALID_STATE_TRANSITION", "Task monotonic clock cannot move backwards", {
      current_monotonic_ms: current.monotonic_ms,
      next_monotonic_ms: next.monotonic_ms,
    });
  }

  return {
    previous_state: current.state,
    next,
    state_layer: getTaskStateLayer(next.state),
    outcome: outcomeFor(next.state),
    reason: request.reason,
  };
}

export function buildTaskStateEvent(result: TaskTransitionResult, envelope: TransitionEnvelopeInput): Record<string, unknown> {
  assertPlatformId("tenant_id", result.next.tenant_id);
  assertPlatformId("task_id", result.next.task_id);
  assertPlatformId("attempt_id", result.next.attempt_id);
  assertPlatformId("trace_id", result.next.trace_id);
  assertUtcTimestamp(envelope.occurred_at_utc);
  assertMonotonicMs(envelope.monotonic_ms);

  if (!/^event_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/.test(envelope.event_id)) {
    fail("PLATFORM_INVALID_REQUEST", "Invalid platform event_id", { event_id: envelope.event_id });
  }

  return {
    schema_version: "nexus.event_envelope.v1",
    event_id: envelope.event_id,
    event_type: "task.state_changed",
    tenant_id: result.next.tenant_id,
    task_id: result.next.task_id,
    attempt_id: result.next.attempt_id,
    execution_id: result.next.execution_id,
    conversation_id: result.next.conversation_id,
    trace_id: result.next.trace_id,
    occurred_at_utc: envelope.occurred_at_utc,
    monotonic_ms: envelope.monotonic_ms,
    producer: {
      service: envelope.producer_service ?? "coordinator",
      component: envelope.producer_component ?? "task-state",
    },
    subject: {
      kind: "task",
      id: result.next.task_id,
    },
    payload: {
      previous_state: result.previous_state,
      state: result.next.state,
      state_layer: result.state_layer,
      outcome: result.outcome,
      reason: result.reason,
    },
  };
}
