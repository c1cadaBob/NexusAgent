import {
  assertMonotonicMs,
  assertPlatformId,
  assertUtcTimestamp,
  type PlatformIdKey,
} from "../task-state/index.ts";

const TRUSTED_POLICY_DECISION = Symbol("nexus.trusted-policy-decision");

export const POLICY_ACTIONS = [
  "task.submit",
  "task.cancel",
  "planner.request",
  "executor.start",
  "adapter.invoke",
  "artifact.write",
  "artifact.read",
  "credential.resolve",
] as const;

export type PolicyAction = (typeof POLICY_ACTIONS)[number];

export type PolicyOutcome = "allow" | "deny" | "approval_required";

export type PolicyErrorCode =
  | "PLATFORM_INVALID_REQUEST"
  | "PLATFORM_UNAUTHENTICATED"
  | "PLATFORM_FORBIDDEN"
  | "PLATFORM_POLICY_DENIED"
  | "PLATFORM_APPROVAL_REQUIRED"
  | "PLATFORM_RATE_LIMITED"
  | "PLATFORM_CROSS_TENANT_ID";

export interface PolicyPrincipal {
  tenant_id: string;
  user_id: string;
  roles: readonly string[];
  permissions: readonly string[];
}

export interface BudgetCheck {
  requested_units: number;
  remaining_units: number;
  max_units_per_attempt?: number;
}

export interface ApprovalCheck {
  required: boolean;
  status: "not_required" | "pending" | "approved" | "rejected";
}

export interface CredentialUseCheck {
  credential_ref: string;
  purpose: "channel_delivery" | "planner_context" | "executor_tool" | "artifact_access" | "admin_operation";
}

export interface PolicyGateRequest {
  action: PolicyAction;
  tenant_id: string;
  task_id?: string;
  attempt_id?: string;
  execution_id: string;
  conversation_id?: string;
  trace_id: string;
  monotonic_ms: number;
  requested_at_utc: string;
  principal: PolicyPrincipal;
  required_permissions?: readonly string[];
  budget?: BudgetCheck;
  approval?: ApprovalCheck;
  credential_refs?: readonly CredentialUseCheck[];
  route?: {
    adapter_kind: "channel" | "planner" | "executor" | "memory" | "artifact" | "credential";
    adapter_name: string;
  };
}

export interface PolicyDecision {
  schema_version: "nexus.policy_decision.v1";
  decision_id: string;
  action: PolicyAction;
  outcome: PolicyOutcome;
  allow: boolean;
  code?: PolicyErrorCode;
  reasons: readonly string[];
  required_permissions: readonly string[];
  granted_permissions: readonly string[];
  tenant_id: string;
  user_id: string;
  task_id?: string;
  attempt_id?: string;
  execution_id: string;
  conversation_id?: string;
  trace_id: string;
  monotonic_ms: number;
  requested_at_utc: string;
  route?: PolicyGateRequest["route"];
}

export interface ExpectedPolicyDecision {
  action: PolicyAction;
  tenant_id: string;
  execution_id: string;
  trace_id: string;
}

export class PolicyGateError extends Error {
  readonly code: PolicyErrorCode;
  readonly details: Record<string, unknown>;

  constructor(code: PolicyErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "PolicyGateError";
    this.code = code;
    this.details = details;
  }
}

const ACTION_PERMISSION: Record<PolicyAction, string> = Object.freeze({
  "task.submit": "task:submit",
  "task.cancel": "task:cancel",
  "planner.request": "planner:invoke",
  "executor.start": "executor:invoke",
  "adapter.invoke": "adapter:invoke",
  "artifact.write": "artifact:write",
  "artifact.read": "artifact:read",
  "credential.resolve": "credential:resolve",
});

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function assertKnownAction(action: unknown): asserts action is PolicyAction {
  if (typeof action !== "string" || !(POLICY_ACTIONS as readonly string[]).includes(action)) {
    throw new PolicyGateError("PLATFORM_INVALID_REQUEST", "Unknown policy action", { action });
  }
}

function assertOptionalPlatformId(key: PlatformIdKey, value: unknown): void {
  if (value !== undefined) {
    assertPlatformId(key, value);
  }
}

function assertCredentialRef(value: unknown): void {
  if (typeof value !== "string" || !/^cred_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/.test(value)) {
    throw new PolicyGateError("PLATFORM_INVALID_REQUEST", "Invalid credential_ref", { credential_ref: value });
  }
}

function assertNonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new PolicyGateError("PLATFORM_INVALID_REQUEST", `Invalid ${field}`, { field, value });
  }
  return Number(value);
}

export class PolicyGate {
  readonly #trustToken = Symbol("policy-gate-instance");
  #sequence = 0;
  readonly #decisionLog: PolicyDecision[] = [];

  evaluate(request: PolicyGateRequest): PolicyDecision {
    this.#assertRequestShape(request);

    const requiredPermissions = unique([ACTION_PERMISSION[request.action], ...(request.required_permissions ?? [])]);
    const grantedPermissions = unique(request.principal.permissions);
    const reasons: string[] = [];

    let outcome: PolicyOutcome = "allow";
    let code: PolicyErrorCode | undefined;

    if (request.principal.tenant_id !== request.tenant_id) {
      outcome = "deny";
      code = "PLATFORM_CROSS_TENANT_ID";
      reasons.push("principal tenant does not match request tenant");
    }

    const missingPermissions = requiredPermissions.filter((permission) => !grantedPermissions.includes(permission));
    if (missingPermissions.length > 0) {
      outcome = "deny";
      code ??= "PLATFORM_FORBIDDEN";
      reasons.push(`missing permissions: ${missingPermissions.join(",")}`);
    }

    if (request.budget) {
      if (request.budget.requested_units > request.budget.remaining_units) {
        outcome = "deny";
        code ??= "PLATFORM_RATE_LIMITED";
        reasons.push("budget remaining_units is below requested_units");
      }
      if (
        request.budget.max_units_per_attempt !== undefined &&
        request.budget.requested_units > request.budget.max_units_per_attempt
      ) {
        outcome = "deny";
        code ??= "PLATFORM_RATE_LIMITED";
        reasons.push("budget requested_units exceeds max_units_per_attempt");
      }
    }

    if (request.approval?.required && request.approval.status !== "approved") {
      outcome = "approval_required";
      code = "PLATFORM_APPROVAL_REQUIRED";
      reasons.push(`approval is required and currently ${request.approval.status}`);
    }

    if (reasons.length === 0) {
      reasons.push("policy checks passed");
    }

    const decision: PolicyDecision = {
      schema_version: "nexus.policy_decision.v1",
      decision_id: this.#nextDecisionId(request.trace_id),
      action: request.action,
      outcome,
      allow: outcome === "allow",
      code,
      reasons,
      required_permissions: requiredPermissions,
      granted_permissions: grantedPermissions,
      tenant_id: request.tenant_id,
      user_id: request.principal.user_id,
      task_id: request.task_id,
      attempt_id: request.attempt_id,
      execution_id: request.execution_id,
      conversation_id: request.conversation_id,
      trace_id: request.trace_id,
      monotonic_ms: request.monotonic_ms,
      requested_at_utc: request.requested_at_utc,
      route: request.route,
    };

    Object.defineProperty(decision, TRUSTED_POLICY_DECISION, {
      enumerable: false,
      value: this.#trustToken,
    });

    this.#decisionLog.push(this.#sanitizeDecision(decision));
    return decision;
  }

  assertAllowedDecision(decision: unknown, expected: ExpectedPolicyDecision): asserts decision is PolicyDecision {
    const candidate = decision as Partial<PolicyDecision> & { [TRUSTED_POLICY_DECISION]?: symbol };

    if (!candidate || candidate[TRUSTED_POLICY_DECISION] !== this.#trustToken) {
      throw new PolicyGateError("PLATFORM_POLICY_DENIED", "Policy decision is missing or not issued by this Policy-Gate instance");
    }
    if (!candidate.allow) {
      throw new PolicyGateError(candidate.code ?? "PLATFORM_POLICY_DENIED", "Policy decision does not allow this call", {
        decision_id: candidate.decision_id,
        reasons: candidate.reasons,
      });
    }
    if (candidate.action !== expected.action) {
      throw new PolicyGateError("PLATFORM_POLICY_DENIED", "Policy decision action does not match guarded call", {
        expected: expected.action,
        actual: candidate.action,
      });
    }
    if (candidate.tenant_id !== expected.tenant_id) {
      throw new PolicyGateError("PLATFORM_CROSS_TENANT_ID", "Policy decision tenant does not match guarded call", {
        expected: expected.tenant_id,
        actual: candidate.tenant_id,
      });
    }
    if (candidate.execution_id !== expected.execution_id || candidate.trace_id !== expected.trace_id) {
      throw new PolicyGateError("PLATFORM_POLICY_DENIED", "Policy decision trace or execution id does not match guarded call", {
        expected_execution_id: expected.execution_id,
        actual_execution_id: candidate.execution_id,
        expected_trace_id: expected.trace_id,
        actual_trace_id: candidate.trace_id,
      });
    }
  }

  decisionLog(): readonly PolicyDecision[] {
    return this.#decisionLog.map((decision) => ({ ...decision }));
  }

  #assertRequestShape(request: PolicyGateRequest): void {
    assertKnownAction(request.action);
    assertPlatformId("tenant_id", request.tenant_id);
    assertPlatformId("execution_id", request.execution_id);
    assertPlatformId("trace_id", request.trace_id);
    assertOptionalPlatformId("task_id", request.task_id);
    assertOptionalPlatformId("attempt_id", request.attempt_id);
    assertOptionalPlatformId("conversation_id", request.conversation_id);
    assertMonotonicMs(request.monotonic_ms, "policy.monotonic_ms");
    assertUtcTimestamp(request.requested_at_utc, "policy.requested_at_utc");

    assertPlatformId("tenant_id", request.principal.tenant_id);
    assertPlatformId("user_id", request.principal.user_id);

    if (!Array.isArray(request.principal.roles) || !Array.isArray(request.principal.permissions)) {
      throw new PolicyGateError("PLATFORM_INVALID_REQUEST", "Principal roles and permissions must be arrays");
    }

    if (request.budget) {
      assertNonNegativeInteger(request.budget.requested_units, "budget.requested_units");
      assertNonNegativeInteger(request.budget.remaining_units, "budget.remaining_units");
      if (request.budget.max_units_per_attempt !== undefined) {
        assertNonNegativeInteger(request.budget.max_units_per_attempt, "budget.max_units_per_attempt");
      }
    }

    for (const credential of request.credential_refs ?? []) {
      assertCredentialRef(credential.credential_ref);
    }
  }

  #nextDecisionId(traceId: string): string {
    this.#sequence += 1;
    return `decision_${traceId.replace(/^trace_/, "")}_${String(this.#sequence).padStart(4, "0")}`;
  }

  #sanitizeDecision(decision: PolicyDecision): PolicyDecision {
    return JSON.parse(JSON.stringify(decision)) as PolicyDecision;
  }
}

export async function withPolicyGate<T>(
  policyGate: PolicyGate,
  request: PolicyGateRequest,
  invoke: (decision: PolicyDecision) => T | Promise<T>,
): Promise<T> {
  const decision = policyGate.evaluate(request);
  policyGate.assertAllowedDecision(decision, {
    action: request.action,
    tenant_id: request.tenant_id,
    execution_id: request.execution_id,
    trace_id: request.trace_id,
  });
  return invoke(decision);
}
