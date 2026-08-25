import {
  assertMonotonicMs,
  assertPlatformId,
  assertUtcTimestamp,
  assertTransition,
  buildTaskStateEvent,
  TaskStateTransitionError,
  type TaskSnapshot,
  type TaskState,
} from "../task-state/index.ts";
import { type PlatformClock } from "../clock/index.ts";
import { markTrustedAdapterInvocation } from "../adapters/index.ts";
import { type EventBus, type PlatformEventEnvelope, type PlatformEventType } from "../event-bus/index.ts";
import {
  PolicyGate,
  PolicyGateError,
  type ApprovalCheck,
  type BudgetCheck,
  type PolicyDecision,
  type PolicyPrincipal,
} from "../policy-gate/index.ts";

export type AdapterKind = "channel" | "planner" | "executor" | "memory" | "artifact" | "credential";

export interface CoordinatorTaskRequest {
  schema_version: "nexus.task_request.v1";
  tenant_id: string;
  user_id: string;
  agent_id: string;
  task_id: string;
  attempt_id: string;
  execution_id: string;
  conversation_id: string;
  trace_id: string;
  input: {
    kind: "text" | "command" | "approval_action";
    text: string;
    metadata?: Record<string, unknown>;
  };
  source?: {
    kind: "api" | "channel" | "scheduler" | "system";
    channel?: string;
    provider_binding_id?: string;
    received_at_utc?: string;
    message_id?: string;
    account_ref?: string;
    conversation_ref?: string;
  };
  policy_context?: Record<string, unknown>;
  idempotency_key?: string;
  created_at_utc: string;
  monotonic_ms: number;
}

export type CoordinatorTaskCommand = "continue_attempt" | "redo_attempt" | "cancel_attempt";

export interface CoordinatorTaskCommandRequest {
  schema_version: "nexus.task_command.p4.v1";
  tenant_id: string;
  user_id: string;
  agent_id: string;
  task_id: string;
  attempt_id: string;
  next_attempt_id?: string;
  execution_id: string;
  conversation_id: string;
  trace_id: string;
  command: CoordinatorTaskCommand;
  requested_at_utc: string;
  monotonic_ms: number;
  idempotency_key: string;
  reason: string;
  source: {
    kind: "channel";
    adapter_name: string;
    channel_name: string;
    channel_capability_id: string;
    message_id: string;
    account_ref: string;
    conversation_ref: string;
  };
}

export interface CoordinatorAdapterInvocation {
  tenant_id: string;
  task_id: string;
  attempt_id: string;
  execution_id: string;
  conversation_id?: string;
  trace_id: string;
  monotonic_ms: number;
  payload: Record<string, unknown>;
  policy_decision?: PolicyDecision;
}

export interface CoordinatorAdapterResult {
  tenant_id: string;
  task_id: string;
  attempt_id: string;
  execution_id: string;
  trace_id: string;
  status: "accepted" | "completed" | "failed";
  payload: Record<string, unknown>;
}

export interface CoordinatorAdapterPort {
  name: string;
  kind: AdapterKind;
  invoke(invocation: CoordinatorAdapterInvocation): CoordinatorAdapterResult | Promise<CoordinatorAdapterResult>;
}

export interface SubmitTaskOptions {
  principal: PolicyPrincipal;
  budget?: BudgetCheck;
  approval?: ApprovalCheck;
}

export interface SubmitTaskResult {
  accepted: boolean;
  decision: PolicyDecision;
  snapshot: TaskSnapshot;
  event: Record<string, unknown>;
}

export interface SubmitTaskCommandResult {
  accepted: true;
  command: CoordinatorTaskCommand;
  idempotency_key: string;
  decision: PolicyDecision;
  snapshot: TaskSnapshot;
  event: Record<string, unknown>;
}

export interface DispatchOptions {
  adapter_name: string;
  principal: PolicyPrincipal;
  payload: Record<string, unknown>;
  budget?: BudgetCheck;
  approval?: ApprovalCheck;
}

export interface DispatchResult {
  decision: PolicyDecision;
  adapter_result: CoordinatorAdapterResult;
}

export interface CoordinatorOptions {
  policyGate?: PolicyGate;
  clock?: PlatformClock;
  eventBus?: EventBus;
}

export class CoordinatorError extends Error {
  readonly code:
    | "PLATFORM_APPROVAL_REQUIRED"
    | "PLATFORM_CONFLICT"
    | "PLATFORM_CROSS_TENANT_ID"
    | "PLATFORM_FORBIDDEN"
    | "PLATFORM_INVALID_REQUEST"
    | "PLATFORM_INVALID_STATE_TRANSITION"
    | "PLATFORM_NOT_FOUND"
    | "PLATFORM_POLICY_DENIED"
    | "PLATFORM_RATE_LIMITED"
    | "PLATFORM_SCHEMA_VALIDATION_FAILED"
    | "PLATFORM_TASK_NOT_CANCELABLE"
    | "PLATFORM_UNAUTHENTICATED";
  readonly details: Record<string, unknown>;

  constructor(code: CoordinatorError["code"], message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "CoordinatorError";
    this.code = code;
    this.details = details;
  }
}

export class Coordinator {
  readonly policyGate: PolicyGate;
  readonly clock?: PlatformClock;
  readonly eventBus?: EventBus;
  readonly #adapters = new Map<string, CoordinatorAdapterPort>();
  readonly #snapshots = new Map<string, TaskSnapshot>();
  readonly #commandIdempotency = new Map<string, { fingerprint: string; result: SubmitTaskCommandResult }>();
  readonly #events: Record<string, unknown>[] = [];
  #eventSequence = 0;

  constructor(policyGateOrOptions: PolicyGate | CoordinatorOptions = new PolicyGate()) {
    if (policyGateOrOptions instanceof PolicyGate) {
      this.policyGate = policyGateOrOptions;
      return;
    }
    this.policyGate = policyGateOrOptions.policyGate ?? new PolicyGate();
    this.clock = policyGateOrOptions.clock;
    this.eventBus = policyGateOrOptions.eventBus;
  }

  registerAdapter(adapter: CoordinatorAdapterPort): void {
    if (!adapter.name.trim()) {
      throw new CoordinatorError("PLATFORM_INVALID_REQUEST", "Adapter name is required");
    }
    if (this.#adapters.has(adapter.name)) {
      throw new CoordinatorError("PLATFORM_INVALID_REQUEST", "Adapter is already registered", { adapter_name: adapter.name });
    }
    this.#adapters.set(adapter.name, adapter);
  }

  submitTask(request: CoordinatorTaskRequest, options: SubmitTaskOptions): SubmitTaskResult {
    this.#assertTaskRequest(request);
    const reading = this.#clockReading(request.created_at_utc, request.monotonic_ms);

    const decision = this.policyGate.evaluate({
      action: "task.submit",
      tenant_id: request.tenant_id,
      task_id: request.task_id,
      attempt_id: request.attempt_id,
      execution_id: request.execution_id,
      conversation_id: request.conversation_id,
      trace_id: request.trace_id,
      monotonic_ms: reading.monotonic_ms,
      requested_at_utc: reading.utc_timestamp,
      principal: options.principal,
      budget: options.budget,
      approval: options.approval,
    });

    const current = this.#snapshotFromRequest(request, "received", 1, reading.monotonic_ms);
    const nextState: TaskState = decision.allow ? "admitted" : "blocked";
    const next = this.#snapshotFromRequest(request, nextState, 2, reading.monotonic_ms + 1);
    const transition = assertTransition({
      current,
      next,
      reason: decision.allow ? "policy allowed task submission" : decision.reasons.join("; "),
    });
    const event = buildTaskStateEvent(transition, {
      event_id: this.#nextEventId(request.trace_id),
      occurred_at_utc: reading.utc_timestamp,
      monotonic_ms: reading.monotonic_ms + 1,
      producer_service: "coordinator",
      producer_component: "task-intake",
    });

    this.#snapshots.set(request.task_id, next);
    this.#recordEvent(event as PlatformEventEnvelope);
    return {
      accepted: decision.allow,
      decision,
      snapshot: next,
      event,
    };
  }

  submitTaskCommand(request: CoordinatorTaskCommandRequest, options: SubmitTaskOptions): SubmitTaskCommandResult {
    this.#assertTaskCommandRequest(request);
    const fingerprint = stableStringify(request);
    const replay = this.#commandIdempotency.get(request.idempotency_key);
    if (replay) {
      if (replay.fingerprint !== fingerprint) {
        throw new CoordinatorError("PLATFORM_CONFLICT", "Task command idempotency key was reused with different payload", {
          idempotency_key: request.idempotency_key,
          command: request.command,
        });
      }
      return cloneJson(replay.result) as SubmitTaskCommandResult;
    }

    const current = this.#snapshots.get(request.task_id);
    if (!current) {
      throw new CoordinatorError("PLATFORM_NOT_FOUND", "Task snapshot not found for command", { task_id: request.task_id });
    }
    this.#assertTaskCommandMatchesSnapshot(request, current);

    const reading = this.#clockReading(request.requested_at_utc, request.monotonic_ms);
    const action = request.command === "cancel_attempt" ? "task.cancel" : "task.submit";
    const decision = this.policyGate.evaluate({
      action,
      tenant_id: request.tenant_id,
      task_id: request.task_id,
      attempt_id: request.attempt_id,
      execution_id: request.execution_id,
      conversation_id: request.conversation_id,
      trace_id: request.trace_id,
      monotonic_ms: reading.monotonic_ms,
      requested_at_utc: reading.utc_timestamp,
      principal: options.principal,
      budget: options.budget,
      approval: options.approval,
    });
    if (!decision.allow) {
      throw new CoordinatorError(decision.code ?? "PLATFORM_POLICY_DENIED", "Task command denied by Policy-Gate", {
        command: request.command,
        reasons: decision.reasons,
      });
    }

    const result = request.command === "continue_attempt"
      ? this.#continueTaskCommand(request, decision, current, reading)
      : this.#transitionTaskCommand(request, decision, current, reading);
    this.#commandIdempotency.set(request.idempotency_key, { fingerprint, result: cloneJson(result) as SubmitTaskCommandResult });
    return cloneJson(result) as SubmitTaskCommandResult;
  }

  async dispatchToAdapter(task_id: string, options: DispatchOptions): Promise<DispatchResult> {
    const snapshot = this.#snapshots.get(task_id);
    if (!snapshot) {
      throw new CoordinatorError("PLATFORM_NOT_FOUND", "Task snapshot not found", { task_id });
    }

    const adapter = this.#adapters.get(options.adapter_name);
    if (!adapter) {
      throw new CoordinatorError("PLATFORM_NOT_FOUND", "Adapter not registered", { adapter_name: options.adapter_name });
    }
    const reading = this.#clockReading(
      typeof options.payload.requested_at_utc === "string" ? options.payload.requested_at_utc : undefined,
      (snapshot.monotonic_ms ?? 0) + 1,
    );

    const decision = this.policyGate.evaluate({
      action: "adapter.invoke",
      tenant_id: snapshot.tenant_id,
      task_id: snapshot.task_id,
      attempt_id: snapshot.attempt_id,
      execution_id: snapshot.execution_id ?? "",
      conversation_id: snapshot.conversation_id,
      trace_id: snapshot.trace_id,
      monotonic_ms: reading.monotonic_ms,
      requested_at_utc: reading.utc_timestamp,
      principal: options.principal,
      budget: options.budget,
      approval: options.approval,
      route: {
        adapter_kind: adapter.kind,
        adapter_name: adapter.name,
      },
    });

    this.policyGate.assertAllowedDecision(decision, {
      action: "adapter.invoke",
      tenant_id: snapshot.tenant_id,
      execution_id: snapshot.execution_id ?? "",
      trace_id: snapshot.trace_id,
    });

    this.#recordEvent(this.#adapterLifecycleEvent(adapter.kind, "started", snapshot, reading));

    const adapterResult = await invokeSecuredAdapter(this.policyGate, adapter, {
      tenant_id: snapshot.tenant_id,
      task_id: snapshot.task_id,
      attempt_id: snapshot.attempt_id,
      execution_id: snapshot.execution_id ?? "",
      conversation_id: snapshot.conversation_id,
      trace_id: snapshot.trace_id,
      monotonic_ms: reading.monotonic_ms + 1,
      payload: options.payload,
      policy_decision: decision,
    });

    this.#assertAdapterResultMatchesSnapshot(adapterResult, snapshot);
    this.#recordEvent(this.#adapterLifecycleEvent(adapter.kind, adapterResult.status, snapshot, {
      utc_timestamp: reading.utc_timestamp,
      monotonic_ms: reading.monotonic_ms + 2,
    }));
    return {
      decision,
      adapter_result: adapterResult,
    };
  }

  snapshot(task_id: string): TaskSnapshot | undefined {
    const snapshot = this.#snapshots.get(task_id);
    return snapshot ? { ...snapshot } : undefined;
  }

  events(): readonly Record<string, unknown>[] {
    return this.#events.map((event) => JSON.parse(JSON.stringify(event)) as Record<string, unknown>);
  }

  #assertTaskRequest(request: CoordinatorTaskRequest): void {
    if (request.schema_version !== "nexus.task_request.v1") {
      throw new CoordinatorError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Unsupported TaskRequest schema version", {
        schema_version: request.schema_version,
      });
    }
    assertPlatformId("tenant_id", request.tenant_id);
    assertPlatformId("user_id", request.user_id);
    assertPlatformId("agent_id", request.agent_id);
    assertPlatformId("task_id", request.task_id);
    assertPlatformId("attempt_id", request.attempt_id);
    assertPlatformId("execution_id", request.execution_id);
    assertPlatformId("conversation_id", request.conversation_id);
    assertPlatformId("trace_id", request.trace_id);
    if (!request.input.text.trim()) {
      throw new CoordinatorError("PLATFORM_INVALID_REQUEST", "TaskRequest input text is required");
    }
    assertNoNativeCoordinatorPayload(request);
  }

  #assertTaskCommandRequest(request: CoordinatorTaskCommandRequest): void {
    assertNoNativeCoordinatorPayload(request);
    const allowedTopLevel = new Set([
      "schema_version",
      "tenant_id",
      "user_id",
      "agent_id",
      "task_id",
      "attempt_id",
      "next_attempt_id",
      "execution_id",
      "conversation_id",
      "trace_id",
      "command",
      "requested_at_utc",
      "monotonic_ms",
      "idempotency_key",
      "reason",
      "source",
    ]);
    for (const key of Object.keys(request as unknown as Record<string, unknown>)) {
      if (!allowedTopLevel.has(key)) {
        throw new CoordinatorError("PLATFORM_INVALID_REQUEST", "Task command contains unsupported field", { field: key });
      }
    }
    if (request.schema_version !== "nexus.task_command.p4.v1") {
      throw new CoordinatorError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Unsupported TaskCommand schema version", {
        schema_version: request.schema_version,
      });
    }
    assertPlatformId("tenant_id", request.tenant_id);
    assertPlatformId("user_id", request.user_id);
    assertPlatformId("agent_id", request.agent_id);
    assertPlatformId("task_id", request.task_id);
    assertPlatformId("attempt_id", request.attempt_id);
    assertPlatformId("execution_id", request.execution_id);
    assertPlatformId("conversation_id", request.conversation_id);
    assertPlatformId("trace_id", request.trace_id);
    if (request.next_attempt_id !== undefined) assertPlatformId("attempt_id", request.next_attempt_id);
    assertUtcTimestamp(request.requested_at_utc, "task_command.requested_at_utc");
    assertMonotonicMs(request.monotonic_ms, "task_command.monotonic_ms");
    if (!["continue_attempt", "redo_attempt", "cancel_attempt"].includes(request.command)) {
      throw new CoordinatorError("PLATFORM_INVALID_REQUEST", "Task command is unsupported", { command: request.command });
    }
    if (request.command === "redo_attempt" && request.next_attempt_id === undefined) {
      throw new CoordinatorError("PLATFORM_INVALID_REQUEST", "Redo task command requires next_attempt_id");
    }
    if (request.command !== "redo_attempt" && request.next_attempt_id !== undefined) {
      throw new CoordinatorError("PLATFORM_INVALID_REQUEST", "Only redo task command may provide next_attempt_id", {
        command: request.command,
      });
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{2,191}$/.test(request.idempotency_key)) {
      throw new CoordinatorError("PLATFORM_INVALID_REQUEST", "Task command idempotency_key is invalid", {
        idempotency_key: request.idempotency_key,
      });
    }
    if (!request.reason.trim()) {
      throw new CoordinatorError("PLATFORM_INVALID_REQUEST", "Task command requires an audit reason");
    }
    this.#assertTaskCommandSource(request.source);
  }

  #assertTaskCommandSource(source: CoordinatorTaskCommandRequest["source"]): void {
    const allowedSourceKeys = new Set([
      "kind",
      "adapter_name",
      "channel_name",
      "channel_capability_id",
      "message_id",
      "account_ref",
      "conversation_ref",
    ]);
    if (!source || typeof source !== "object") {
      throw new CoordinatorError("PLATFORM_INVALID_REQUEST", "Task command source is required");
    }
    for (const key of Object.keys(source as Record<string, unknown>)) {
      if (!allowedSourceKeys.has(key)) {
        throw new CoordinatorError("PLATFORM_INVALID_REQUEST", "Task command source contains unsupported field", { field: key });
      }
    }
    if (source.kind !== "channel") {
      throw new CoordinatorError("PLATFORM_INVALID_REQUEST", "Task command source must be channel", { kind: source.kind });
    }
    requireCoordinatorString(source.adapter_name, "source.adapter_name", /^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/);
    requireCoordinatorString(source.channel_name, "source.channel_name", /^[A-Za-z][A-Za-z0-9_-]{2,63}$/);
    requireCoordinatorString(source.channel_capability_id, "source.channel_capability_id", /^cap_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/);
    requireCoordinatorString(source.message_id, "source.message_id", /^msg_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/);
    requireCoordinatorString(source.account_ref, "source.account_ref", /^channel_account_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/);
    requireCoordinatorString(source.conversation_ref, "source.conversation_ref", /^channel_conversation_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/);
  }

  #assertTaskCommandMatchesSnapshot(request: CoordinatorTaskCommandRequest, snapshot: TaskSnapshot): void {
    const mismatches = [
      ["tenant_id", snapshot.tenant_id, request.tenant_id],
      ["task_id", snapshot.task_id, request.task_id],
      ["attempt_id", snapshot.attempt_id, request.attempt_id],
      ["execution_id", snapshot.execution_id, request.execution_id],
      ["conversation_id", snapshot.conversation_id, request.conversation_id],
      ["trace_id", snapshot.trace_id, request.trace_id],
    ].filter(([, expected, actual]) => expected !== actual);
    if (mismatches.length > 0) {
      throw new CoordinatorError("PLATFORM_POLICY_DENIED", "Task command identity does not match current task snapshot", { mismatches });
    }
  }

  #continueTaskCommand(
    request: CoordinatorTaskCommandRequest,
    decision: PolicyDecision,
    current: TaskSnapshot,
    reading: { utc_timestamp: string; monotonic_ms: number },
  ): SubmitTaskCommandResult {
    const event = this.#taskCommandAuditEvent(request, current, reading, "continued");
    this.#recordEvent(event);
    return {
      accepted: true,
      command: request.command,
      idempotency_key: request.idempotency_key,
      decision,
      snapshot: { ...current },
      event,
    };
  }

  #transitionTaskCommand(
    request: CoordinatorTaskCommandRequest,
    decision: PolicyDecision,
    current: TaskSnapshot,
    reading: { utc_timestamp: string; monotonic_ms: number },
  ): SubmitTaskCommandResult {
    const next: TaskSnapshot = request.command === "cancel_attempt"
      ? {
        ...current,
        state: "cancelled",
        version: (current.version ?? 1) + 1,
        monotonic_ms: reading.monotonic_ms + 1,
      }
      : {
        ...current,
        attempt_id: request.next_attempt_id ?? request.attempt_id,
        state: "admitted",
        version: (current.version ?? 1) + 1,
        monotonic_ms: reading.monotonic_ms + 1,
      };
    try {
      const transition = assertTransition({
        current,
        next,
        reason: request.reason,
      });
      const event = buildTaskStateEvent(transition, {
        event_id: this.#nextEventId(request.trace_id),
        occurred_at_utc: reading.utc_timestamp,
        monotonic_ms: reading.monotonic_ms + 1,
        producer_service: "coordinator",
        producer_component: "task-command",
      }) as PlatformEventEnvelope;
      event.payload = {
        ...event.payload,
        command: request.command,
        idempotency_key: request.idempotency_key,
        source: request.source,
        native_agent_runtime: "blocked",
        native_tool_runtime: "blocked",
        native_memory_runtime: "blocked",
      };
      this.#snapshots.set(request.task_id, next);
      this.#recordEvent(event);
      return {
        accepted: true,
        command: request.command,
        idempotency_key: request.idempotency_key,
        decision,
        snapshot: { ...next },
        event,
      };
    } catch (error) {
      if (error instanceof TaskStateTransitionError) {
        const code = request.command === "cancel_attempt" && error.code === "PLATFORM_INVALID_STATE_TRANSITION"
          ? "PLATFORM_TASK_NOT_CANCELABLE"
          : error.code;
        throw new CoordinatorError(code, error.message, error.details);
      }
      throw error;
    }
  }

  #snapshotFromRequest(request: CoordinatorTaskRequest, state: TaskState, version: number, monotonic_ms: number): TaskSnapshot {
    return {
      tenant_id: request.tenant_id,
      task_id: request.task_id,
      attempt_id: request.attempt_id,
      execution_id: request.execution_id,
      conversation_id: request.conversation_id,
      trace_id: request.trace_id,
      state,
      version,
      monotonic_ms,
    };
  }

  #nextEventId(traceId: string): string {
    this.#eventSequence += 1;
    return `event_${traceId.replace(/^trace_/, "")}_${String(this.#eventSequence).padStart(4, "0")}`;
  }

  #clockReading(fallbackUtc: string | undefined, fallbackMonotonic: number): { utc_timestamp: string; monotonic_ms: number } {
    if (this.clock) {
      return this.clock.now();
    }
    return {
      utc_timestamp: fallbackUtc ?? "",
      monotonic_ms: fallbackMonotonic,
    };
  }

  #recordEvent(event: PlatformEventEnvelope): void {
    this.#events.push(event);
    this.eventBus?.publish(event);
  }

  #taskCommandAuditEvent(
    request: CoordinatorTaskCommandRequest,
    snapshot: TaskSnapshot,
    reading: { utc_timestamp: string; monotonic_ms: number },
    outcome: "continued",
  ): PlatformEventEnvelope {
    return {
      schema_version: "nexus.event_envelope.v1",
      event_id: this.#nextEventId(request.trace_id),
      event_type: "audit.recorded",
      tenant_id: request.tenant_id,
      user_id: request.user_id,
      agent_id: request.agent_id,
      task_id: request.task_id,
      attempt_id: request.attempt_id,
      execution_id: request.execution_id,
      conversation_id: request.conversation_id,
      trace_id: request.trace_id,
      occurred_at_utc: reading.utc_timestamp,
      monotonic_ms: reading.monotonic_ms,
      producer: {
        service: "coordinator",
        component: "task-command",
      },
      subject: {
        kind: "attempt",
        id: snapshot.attempt_id,
      },
      payload: {
        audit_action: "task.command.continue",
        command: request.command,
        outcome,
        state: snapshot.state,
        idempotency_key: request.idempotency_key,
        source: request.source,
        native_agent_runtime: "blocked",
        native_tool_runtime: "blocked",
        native_memory_runtime: "blocked",
      },
    };
  }

  #adapterLifecycleEvent(
    adapterKind: AdapterKind,
    status: CoordinatorAdapterResult["status"] | "started",
    snapshot: TaskSnapshot,
    reading: { utc_timestamp: string; monotonic_ms: number },
  ): PlatformEventEnvelope {
    const eventType = adapterKind === "planner"
      ? (status === "started" ? "planning.started" : "planning.completed")
      : adapterKind === "executor"
        ? (status === "failed" ? "execution.failed" : status === "started" ? "execution.started" : "execution.completed")
        : "task.received";

    return {
      schema_version: "nexus.event_envelope.v1",
      event_id: this.#nextEventId(snapshot.trace_id),
      event_type: eventType as PlatformEventType,
      tenant_id: snapshot.tenant_id,
      task_id: snapshot.task_id,
      attempt_id: snapshot.attempt_id,
      execution_id: snapshot.execution_id,
      conversation_id: snapshot.conversation_id,
      trace_id: snapshot.trace_id,
      occurred_at_utc: reading.utc_timestamp,
      monotonic_ms: reading.monotonic_ms,
      producer: {
        service: "coordinator",
        component: "adapter-dispatch",
      },
      subject: {
        kind: adapterKind === "executor" ? "execution" : "task",
        id: adapterKind === "executor" ? snapshot.execution_id ?? snapshot.task_id : snapshot.task_id,
      },
      payload: {
        adapter_kind: adapterKind,
        status,
      },
    };
  }

  #assertAdapterResultMatchesSnapshot(result: CoordinatorAdapterResult, snapshot: TaskSnapshot): void {
    const mismatches = [
      ["tenant_id", snapshot.tenant_id, result.tenant_id],
      ["task_id", snapshot.task_id, result.task_id],
      ["attempt_id", snapshot.attempt_id, result.attempt_id],
      ["execution_id", snapshot.execution_id, result.execution_id],
      ["trace_id", snapshot.trace_id, result.trace_id],
    ].filter(([, expected, actual]) => expected !== actual);

    if (mismatches.length > 0) {
      throw new CoordinatorError("PLATFORM_POLICY_DENIED", "Adapter result changed platform identity fields", { mismatches });
    }
  }
}

export async function invokeSecuredAdapter(
  policyGate: PolicyGate,
  adapter: CoordinatorAdapterPort,
  invocation: CoordinatorAdapterInvocation,
): Promise<CoordinatorAdapterResult> {
  policyGate.assertAllowedDecision(invocation.policy_decision, {
    action: "adapter.invoke",
    tenant_id: invocation.tenant_id,
    execution_id: invocation.execution_id,
    trace_id: invocation.trace_id,
  });

  const result = await adapter.invoke(markTrustedAdapterInvocation({ ...invocation }));
  if (!result.execution_id || !result.trace_id) {
    throw new PolicyGateError("PLATFORM_POLICY_DENIED", "Adapter result must include execution_id and trace_id");
  }
  return result;
}

function requireCoordinatorString(value: unknown, field: string, pattern: RegExp): string {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new CoordinatorError("PLATFORM_INVALID_REQUEST", "Coordinator command field is invalid", { field });
  }
  return value;
}

function assertNoNativeCoordinatorPayload(value: unknown): void {
  const forbiddenKeys = /^(?:credential_material|raw_credential|api_key|password|token|secret|env|environment|native_session_id|native_error|native_error_code|native_path|native_url|base_url|endpoint|file_path|path|url|session_id|memory_path|tool_name|agent_command|plugin_subagent|native_agent|native_tool|native_memory|raw_manifest|native_manifest|manifest|provider_agent|provider_task|provider_cancel)$/i;
  const forbiddenStrings = /MEMORY\.md|USER\.md|SKILL\.md|(?:https?|wss?|ftp):\/\/|\.\.\/|\/(?:tmp|var|workspace|opt|etc|home|usr)\/|\b(?:native_session[A-Za-z0-9_-]*|native_error[A-Za-z0-9_-]*|raw_credential|credential_material|api[_-]?key|password|secret[-_ ]?token|bearer\s+[A-Za-z0-9._-]+|provider[_-]?(?:agent|task|cancel))\b/i;
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item);
      return;
    }
    if (candidate && typeof candidate === "object") {
      for (const [key, item] of Object.entries(candidate)) {
        if (forbiddenKeys.test(key)) {
          throw new CoordinatorError("PLATFORM_INVALID_REQUEST", "Coordinator payload contains non-platform field", { field: key });
        }
        visit(item);
      }
      return;
    }
    if (typeof candidate === "string" && forbiddenStrings.test(candidate)) {
      throw new CoordinatorError("PLATFORM_INVALID_REQUEST", "Coordinator payload contains non-platform marker");
    }
  };
  visit(value);
}

function cloneJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
