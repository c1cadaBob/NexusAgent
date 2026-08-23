import {
  assertPlatformId,
  assertTransition,
  buildTaskStateEvent,
  type TaskSnapshot,
  type TaskState,
} from "../task-state/index.ts";
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
  };
  created_at_utc: string;
  monotonic_ms: number;
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

export class CoordinatorError extends Error {
  readonly code:
    | "PLATFORM_INVALID_REQUEST"
    | "PLATFORM_NOT_FOUND"
    | "PLATFORM_POLICY_DENIED"
    | "PLATFORM_SCHEMA_VALIDATION_FAILED";
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
  readonly #adapters = new Map<string, CoordinatorAdapterPort>();
  readonly #snapshots = new Map<string, TaskSnapshot>();
  readonly #events: Record<string, unknown>[] = [];
  #eventSequence = 0;

  constructor(policyGate = new PolicyGate()) {
    this.policyGate = policyGate;
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

    const decision = this.policyGate.evaluate({
      action: "task.submit",
      tenant_id: request.tenant_id,
      task_id: request.task_id,
      attempt_id: request.attempt_id,
      execution_id: request.execution_id,
      conversation_id: request.conversation_id,
      trace_id: request.trace_id,
      monotonic_ms: request.monotonic_ms,
      requested_at_utc: request.created_at_utc,
      principal: options.principal,
      budget: options.budget,
      approval: options.approval,
    });

    const current = this.#snapshotFromRequest(request, "received", 1, request.monotonic_ms);
    const nextState: TaskState = decision.allow ? "admitted" : "blocked";
    const next = this.#snapshotFromRequest(request, nextState, 2, request.monotonic_ms + 1);
    const transition = assertTransition({
      current,
      next,
      reason: decision.allow ? "policy allowed task submission" : decision.reasons.join("; "),
    });
    const event = buildTaskStateEvent(transition, {
      event_id: this.#nextEventId(request.trace_id),
      occurred_at_utc: request.created_at_utc,
      monotonic_ms: request.monotonic_ms + 1,
      producer_service: "coordinator",
      producer_component: "task-intake",
    });

    this.#snapshots.set(request.task_id, next);
    this.#events.push(event);
    return {
      accepted: decision.allow,
      decision,
      snapshot: next,
      event,
    };
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

    const decision = this.policyGate.evaluate({
      action: "adapter.invoke",
      tenant_id: snapshot.tenant_id,
      task_id: snapshot.task_id,
      attempt_id: snapshot.attempt_id,
      execution_id: snapshot.execution_id ?? "",
      conversation_id: snapshot.conversation_id,
      trace_id: snapshot.trace_id,
      monotonic_ms: (snapshot.monotonic_ms ?? 0) + 1,
      requested_at_utc: options.payload.requested_at_utc as string,
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

    const adapterResult = await invokeSecuredAdapter(this.policyGate, adapter, {
      tenant_id: snapshot.tenant_id,
      task_id: snapshot.task_id,
      attempt_id: snapshot.attempt_id,
      execution_id: snapshot.execution_id ?? "",
      conversation_id: snapshot.conversation_id,
      trace_id: snapshot.trace_id,
      monotonic_ms: (snapshot.monotonic_ms ?? 0) + 2,
      payload: options.payload,
      policy_decision: decision,
    });

    this.#assertAdapterResultMatchesSnapshot(adapterResult, snapshot);
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

  const result = await adapter.invoke(invocation);
  if (!result.execution_id || !result.trace_id) {
    throw new PolicyGateError("PLATFORM_POLICY_DENIED", "Adapter result must include execution_id and trace_id");
  }
  return result;
}
