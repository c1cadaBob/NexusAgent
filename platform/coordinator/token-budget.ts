import { type PlatformClock, SystemClock } from "../clock/index.ts";
import { type EventBus, type PlatformEventEnvelope } from "../event-bus/index.ts";
import { assertMonotonicMs, assertPlatformId, assertUtcTimestamp } from "../task-state/index.ts";
import { type TraceContext } from "../observability/index.ts";

export const TOKEN_BUDGET_SCHEMA_VERSION = "nexus.token_budget.p7.v1";
export const TOKEN_BUDGET_DEFAULT_ENABLED = true;
export const TOKEN_BUDGET_DIMENSION_MODE = "all_configured";
export const TOKEN_BUDGET_ENFORCEMENT_SCOPE = "task_adapter_api";

export type TokenBudgetDimension = "tenant" | "user" | "agent" | "task";
export type TokenBudgetDecisionStatus = "approved" | "degraded";
export type TokenBudgetLedgerStatus = "checked" | "reserved" | "denied";
export type TokenBudgetReasonCode =
  | "TOKEN_BUDGET_APPROVED"
  | "TOKEN_BUDGET_DISABLED"
  | "TOKEN_BUDGET_EXCEEDED"
  | "TOKEN_BUDGET_MAX_ATTEMPT_EXCEEDED";

export interface TokenBudgetLimits {
  tenant_units: number;
  user_units: number;
  agent_units: number;
  task_units: number;
  max_units_per_attempt: number;
}

export interface TokenBudgetPolicy {
  schema_version: typeof TOKEN_BUDGET_SCHEMA_VERSION;
  tenant_id: string;
  policy_id: string;
  enabled: boolean;
  dimension_mode: typeof TOKEN_BUDGET_DIMENSION_MODE;
  enforcement_scope: typeof TOKEN_BUDGET_ENFORCEMENT_SCOPE;
  limits: TokenBudgetLimits;
  resource_budget: {
    accounting_mode: "deterministic_estimate";
    dimensions: readonly TokenBudgetDimension[];
  };
  updated_at_utc: string;
  monotonic_ms: number;
  trace_id: string;
}

export interface TokenBudgetPolicyUpdateInput {
  tenant_id: string;
  trace_id: string;
  enabled?: boolean;
  limits?: Partial<TokenBudgetLimits>;
}

export interface TokenBudgetContext extends TraceContext {
  requested_units: number;
  reason_code?: "task_submit" | "planner_dispatch" | "executor_dispatch" | "api_check";
}

export interface TokenBudgetDimensionStatus {
  dimension: TokenBudgetDimension;
  key: string;
  limit_units: number;
  consumed_units: number;
  remaining_units: number;
  status: TokenBudgetDecisionStatus;
}

export interface TokenBudgetDecision extends TraceContext {
  schema_version: typeof TOKEN_BUDGET_SCHEMA_VERSION;
  policy_id: string;
  decision_id: string;
  status: TokenBudgetDecisionStatus;
  requested_units: number;
  remaining_units: number;
  max_units_per_attempt: number;
  dimensions: readonly TokenBudgetDimensionStatus[];
  reason_codes: readonly TokenBudgetReasonCode[];
  checked_at_utc: string;
  monotonic_ms: number;
}

export interface TokenBudgetLedgerEntry extends TraceContext {
  schema_version: typeof TOKEN_BUDGET_SCHEMA_VERSION;
  ledger_id: string;
  policy_id: string;
  status: TokenBudgetLedgerStatus;
  requested_units: number;
  consumed_units: number;
  remaining_units: number;
  dimensions: readonly TokenBudgetDimensionStatus[];
  reason_codes: readonly TokenBudgetReasonCode[];
  recorded_at_utc: string;
  monotonic_ms: number;
}

export interface TokenBudgetObservability {
  incrementMetric(input: TraceContext & { name: string; value?: number; labels?: Record<string, string>; monotonic_ms?: number; recorded_at_utc?: string }): unknown;
  recordLog(input: TraceContext & { level: "debug" | "info" | "warn" | "error"; message: string; component: string; fields?: Record<string, unknown>; monotonic_ms?: number; recorded_at_utc?: string }): unknown;
}

export interface TokenBudgetCheckOptions {
  consume?: boolean;
  ledger_status?: TokenBudgetLedgerStatus;
}

export class TokenBudgetError extends Error {
  readonly code: "PLATFORM_INVALID_REQUEST" | "PLATFORM_FORBIDDEN";
  readonly details: Record<string, unknown>;

  constructor(code: TokenBudgetError["code"], message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "TokenBudgetError";
    this.code = code;
    this.details = details;
  }
}

export class LocalTokenBudget {
  readonly #clock: PlatformClock;
  readonly #eventBus?: EventBus;
  readonly #observability?: TokenBudgetObservability;
  readonly #policies = new Map<string, TokenBudgetPolicy>();
  readonly #ledger: TokenBudgetLedgerEntry[] = [];
  #sequence = 0;

  constructor(options: { clock?: PlatformClock; eventBus?: EventBus; observability?: TokenBudgetObservability } = {}) {
    this.#clock = options.clock ?? new SystemClock();
    this.#eventBus = options.eventBus;
    this.#observability = options.observability;
  }

  getPolicy(tenant_id: string, trace_id: string): TokenBudgetPolicy {
    assertPlatformId("tenant_id", tenant_id);
    assertPlatformId("trace_id", trace_id);
    return clonePolicy(this.#policyForTenant(tenant_id, trace_id));
  }

  updatePolicy(input: TokenBudgetPolicyUpdateInput): TokenBudgetPolicy {
    assertPlatformId("tenant_id", input.tenant_id);
    assertPlatformId("trace_id", input.trace_id);
    assertNoForbiddenTokenBudgetContent(input);
    const current = this.#policyForTenant(input.tenant_id, input.trace_id);
    const reading = this.#clock.now();
    const policy: TokenBudgetPolicy = {
      ...current,
      enabled: input.enabled ?? current.enabled,
      limits: normalizeLimits({ ...current.limits, ...(input.limits ?? {}) }),
      updated_at_utc: reading.utc_timestamp,
      monotonic_ms: reading.monotonic_ms,
      trace_id: input.trace_id,
    };
    this.#policies.set(input.tenant_id, clonePolicy(policy));
    this.#recordObservability("token_budget.policy_updated", policy, reading, {
      policy_id: policy.policy_id,
      enabled: policy.enabled,
      dimension_mode: policy.dimension_mode,
      enforcement_scope: policy.enforcement_scope,
    });
    return clonePolicy(policy);
  }

  check(input: TokenBudgetContext, options: TokenBudgetCheckOptions = {}): TokenBudgetDecision {
    assertTokenBudgetContext(input);
    assertNoForbiddenTokenBudgetContent(input);
    const policy = this.#policyForTenant(input.tenant_id, input.trace_id);
    const reading = this.#clock.now();
    const dimensions = this.#dimensionStatuses(policy, input);
    const reasonCodes: TokenBudgetReasonCode[] = [];
    if (!policy.enabled) {
      reasonCodes.push("TOKEN_BUDGET_DISABLED");
    }
    if (input.requested_units > policy.limits.max_units_per_attempt) {
      reasonCodes.push("TOKEN_BUDGET_MAX_ATTEMPT_EXCEEDED");
    }
    if (dimensions.some((dimension) => input.requested_units > dimension.remaining_units)) {
      reasonCodes.push("TOKEN_BUDGET_EXCEEDED");
    }
    const blocked = policy.enabled && reasonCodes.some((code) => code !== "TOKEN_BUDGET_DISABLED");
    if (!blocked && reasonCodes.length === 0) reasonCodes.push("TOKEN_BUDGET_APPROVED");
    const status: TokenBudgetDecisionStatus = blocked ? "degraded" : "approved";
    const decision: TokenBudgetDecision = {
      ...cloneTrace(input),
      schema_version: TOKEN_BUDGET_SCHEMA_VERSION,
      policy_id: policy.policy_id,
      decision_id: this.#nextId("decision", input.trace_id),
      status,
      requested_units: input.requested_units,
      remaining_units: Math.min(...dimensions.map((dimension) => dimension.remaining_units), policy.limits.max_units_per_attempt),
      max_units_per_attempt: policy.limits.max_units_per_attempt,
      dimensions: dimensions.map((dimension) => ({ ...dimension, status })),
      reason_codes: reasonCodes,
      checked_at_utc: reading.utc_timestamp,
      monotonic_ms: reading.monotonic_ms,
    };
    this.#appendLedger(decision, options);
    this.#recordDecisionObservability(decision, options.consume === true);
    if (status === "degraded") this.#publishBudgetDegraded(decision);
    return cloneDecision(decision);
  }

  listLedger(tenant_id: string, filter: Partial<Pick<TokenBudgetLedgerEntry, "user_id" | "agent_id" | "task_id" | "trace_id">> = {}): readonly TokenBudgetLedgerEntry[] {
    assertPlatformId("tenant_id", tenant_id);
    if (filter.user_id !== undefined) assertPlatformId("user_id", filter.user_id);
    if (filter.agent_id !== undefined) assertPlatformId("agent_id", filter.agent_id);
    if (filter.task_id !== undefined) assertPlatformId("task_id", filter.task_id);
    if (filter.trace_id !== undefined) assertPlatformId("trace_id", filter.trace_id);
    return this.#ledger
      .filter((entry) => entry.tenant_id === tenant_id)
      .filter((entry) => filter.user_id === undefined || entry.user_id === filter.user_id)
      .filter((entry) => filter.agent_id === undefined || entry.agent_id === filter.agent_id)
      .filter((entry) => filter.task_id === undefined || entry.task_id === filter.task_id)
      .filter((entry) => filter.trace_id === undefined || entry.trace_id === filter.trace_id)
      .sort((left, right) => left.monotonic_ms - right.monotonic_ms)
      .map(cloneLedgerEntry);
  }

  #policyForTenant(tenantId: string, traceId: string): TokenBudgetPolicy {
    const existing = this.#policies.get(tenantId);
    if (existing) return existing;
    const reading = this.#clock.now();
    const policy = defaultTokenBudgetPolicy(tenantId, traceId, reading.utc_timestamp, reading.monotonic_ms);
    this.#policies.set(tenantId, clonePolicy(policy));
    return policy;
  }

  #dimensionStatuses(policy: TokenBudgetPolicy, input: TokenBudgetContext): readonly TokenBudgetDimensionStatus[] {
    const entries = [
      { dimension: "tenant" as const, key: input.tenant_id, limit_units: policy.limits.tenant_units },
      ...(input.user_id ? [{ dimension: "user" as const, key: input.user_id, limit_units: policy.limits.user_units }] : []),
      ...(input.agent_id ? [{ dimension: "agent" as const, key: input.agent_id, limit_units: policy.limits.agent_units }] : []),
      ...(input.task_id ? [{ dimension: "task" as const, key: input.task_id, limit_units: policy.limits.task_units }] : []),
    ];
    return entries.map((dimension) => {
      const consumed_units = this.#consumedUnits(input.tenant_id, dimension.dimension, dimension.key);
      const remaining_units = Math.max(0, dimension.limit_units - consumed_units);
      return {
        ...dimension,
        consumed_units,
        remaining_units,
        status: input.requested_units > remaining_units ? "degraded" : "approved",
      };
    });
  }

  #consumedUnits(tenantId: string, dimension: TokenBudgetDimension, key: string): number {
    return this.#ledger
      .filter((entry) => entry.tenant_id === tenantId && entry.status === "reserved")
      .filter((entry) => entry.dimensions.some((item) => item.dimension === dimension && item.key === key))
      .reduce((total, entry) => total + entry.consumed_units, 0);
  }

  #appendLedger(decision: TokenBudgetDecision, options: TokenBudgetCheckOptions): void {
    const status = decision.status === "degraded" ? "denied" : options.ledger_status ?? (options.consume === true ? "reserved" : "checked");
    const entry: TokenBudgetLedgerEntry = {
      ...cloneTrace(decision),
      schema_version: TOKEN_BUDGET_SCHEMA_VERSION,
      ledger_id: this.#nextId("ledger", decision.trace_id),
      policy_id: decision.policy_id,
      status,
      requested_units: decision.requested_units,
      consumed_units: status === "reserved" ? decision.requested_units : 0,
      remaining_units: decision.remaining_units,
      dimensions: decision.dimensions.map((dimension) => ({ ...dimension })),
      reason_codes: [...decision.reason_codes],
      recorded_at_utc: decision.checked_at_utc,
      monotonic_ms: decision.monotonic_ms,
    };
    this.#ledger.push(entry);
  }

  #recordDecisionObservability(decision: TokenBudgetDecision, consumed: boolean): void {
    this.#recordMetric(decision.status === "approved" ? "token_budget.approved_count" : "token_budget.degraded_count", decision, 1);
    if (consumed && decision.status === "approved") this.#recordMetric("token_budget.consumed_units", decision, decision.requested_units);
    this.#recordObservability(decision.status === "approved" ? "token_budget.approved" : "token_budget.degraded", decision, {
      utc_timestamp: decision.checked_at_utc,
      monotonic_ms: decision.monotonic_ms,
    }, {
      policy_id: decision.policy_id,
      requested_units: decision.requested_units,
      remaining_units: decision.remaining_units,
      reason_codes: decision.reason_codes,
    });
  }

  #recordMetric(name: string, context: TraceContext & { monotonic_ms: number; checked_at_utc?: string }, value: number): void {
    try {
      this.#observability?.incrementMetric({
        ...cloneTrace(context),
        name,
        value,
        labels: { schema_version: TOKEN_BUDGET_SCHEMA_VERSION },
        monotonic_ms: context.monotonic_ms,
        recorded_at_utc: context.checked_at_utc,
      });
    } catch {
      // Token budget observability is advisory and cannot alter policy decisions.
    }
  }

  #recordObservability(message: string, context: TraceContext, reading: { utc_timestamp: string; monotonic_ms: number }, fields: Record<string, unknown>): void {
    try {
      this.#observability?.recordLog({
        ...cloneTrace(context),
        level: "info",
        component: "token-budget",
        message,
        fields: sanitizeBudgetFields(fields),
        recorded_at_utc: reading.utc_timestamp,
        monotonic_ms: reading.monotonic_ms,
      });
    } catch {
      // Token budget observability is advisory and cannot alter policy decisions.
    }
  }

  #publishBudgetDegraded(decision: TokenBudgetDecision): void {
    this.#eventBus?.publish({
      schema_version: "nexus.event_envelope.v1",
      event_id: `event_${decision.decision_id.replace(/^decision_/, "budget_")}`,
      event_type: "budget.degraded",
      tenant_id: decision.tenant_id,
      user_id: decision.user_id,
      agent_id: decision.agent_id,
      task_id: decision.task_id,
      attempt_id: decision.attempt_id,
      execution_id: decision.execution_id,
      conversation_id: decision.conversation_id,
      trace_id: decision.trace_id,
      occurred_at_utc: decision.checked_at_utc,
      monotonic_ms: decision.monotonic_ms,
      producer: { service: "coordinator", component: "token-budget" },
      subject: { kind: "audit", id: decision.decision_id },
      payload: {
        schema_version: decision.schema_version,
        policy_id: decision.policy_id,
        decision_id: decision.decision_id,
        status: decision.status,
        requested_units: decision.requested_units,
        remaining_units: decision.remaining_units,
        reason_codes: decision.reason_codes,
      },
    } satisfies PlatformEventEnvelope);
  }

  #nextId(kind: "decision" | "ledger", traceId: string): string {
    this.#sequence += 1;
    return `${kind}_${traceId.replace(/^trace_/, "token_budget_")}_${String(this.#sequence).padStart(4, "0")}`;
  }
}

export function estimateTokenBudgetUnits(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function defaultTokenBudgetPolicy(tenantId: string, traceId: string, utc: string, monotonic: number): TokenBudgetPolicy {
  assertUtcTimestamp(utc, "token_budget.updated_at_utc");
  assertMonotonicMs(monotonic, "token_budget.monotonic_ms");
  return {
    schema_version: TOKEN_BUDGET_SCHEMA_VERSION,
    tenant_id: tenantId,
    policy_id: `budget_policy_${tenantId.replace(/^tenant_/, "")}`,
    enabled: TOKEN_BUDGET_DEFAULT_ENABLED,
    dimension_mode: TOKEN_BUDGET_DIMENSION_MODE,
    enforcement_scope: TOKEN_BUDGET_ENFORCEMENT_SCOPE,
    limits: {
      tenant_units: 100000,
      user_units: 50000,
      agent_units: 50000,
      task_units: 10000,
      max_units_per_attempt: 5000,
    },
    resource_budget: {
      accounting_mode: "deterministic_estimate",
      dimensions: ["tenant", "user", "agent", "task"],
    },
    updated_at_utc: utc,
    monotonic_ms: monotonic,
    trace_id: traceId,
  };
}

function assertTokenBudgetContext(input: TokenBudgetContext): void {
  assertPlatformId("tenant_id", input.tenant_id);
  assertPlatformId("trace_id", input.trace_id);
  if (input.user_id !== undefined) assertPlatformId("user_id", input.user_id);
  if (input.agent_id !== undefined) assertPlatformId("agent_id", input.agent_id);
  if (input.task_id !== undefined) assertPlatformId("task_id", input.task_id);
  if (input.attempt_id !== undefined) assertPlatformId("attempt_id", input.attempt_id);
  if (input.execution_id !== undefined) assertPlatformId("execution_id", input.execution_id);
  if (input.conversation_id !== undefined) assertPlatformId("conversation_id", input.conversation_id);
  if (!Number.isInteger(input.requested_units) || input.requested_units < 1) {
    throw new TokenBudgetError("PLATFORM_INVALID_REQUEST", "Invalid token budget requested_units", { field: "requested_units" });
  }
}

function normalizeLimits(limits: TokenBudgetLimits): TokenBudgetLimits {
  return {
    tenant_units: positiveInteger(limits.tenant_units, "tenant_units"),
    user_units: positiveInteger(limits.user_units, "user_units"),
    agent_units: positiveInteger(limits.agent_units, "agent_units"),
    task_units: positiveInteger(limits.task_units, "task_units"),
    max_units_per_attempt: positiveInteger(limits.max_units_per_attempt, "max_units_per_attempt"),
  };
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new TokenBudgetError("PLATFORM_INVALID_REQUEST", "Invalid token budget limit", { field });
  }
  return Number(value);
}

function assertNoForbiddenTokenBudgetContent(value: unknown): void {
  const forbiddenKeys = /^(?:credential_material|raw_credential|api_key|password|token|secret|env|environment|native_session_id|native_error|native_path|native_url|base_url|endpoint|file_path|path|url|session_id|provider_runtime|provider_binding|runtime|memory_rejected_text|stale_payload)$/i;
  const forbiddenStrings = new RegExp(String.raw`(?:https?|wss?|ftp):\/\/|\.\.\/|\/(?:tmp|var|workspace|opt|etc|home|usr)\/|${blockedComponentPattern().source}|\b(?:native[_-]?(?:session|error|agent|tool|memory|runtime)[A-Za-z0-9_-]*|provider[_-]?(?:runtime|binding)|raw_credential|credential_material|api[_-]?key|password|secret[-_ ]?token|bearer\s+[A-Za-z0-9._-]+)\b`, "i");
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item);
      return;
    }
    if (candidate && typeof candidate === "object") {
      for (const [key, item] of Object.entries(candidate)) {
        if (forbiddenKeys.test(key)) throw new TokenBudgetError("PLATFORM_INVALID_REQUEST", "Token budget payload contains non-platform field", { field: key });
        visit(item);
      }
      return;
    }
    if (typeof candidate === "string" && forbiddenStrings.test(candidate)) {
      throw new TokenBudgetError("PLATFORM_INVALID_REQUEST", "Token budget payload contains non-platform marker");
    }
  };
  visit(value);
}

function sanitizeBudgetFields(fields: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(fields, (key, value) => {
    if (/memory_rejected_text|stale_payload|credential|native|provider|runtime|url|path|session|secret|token/i.test(key)) return "[redacted-field]";
    if (typeof value !== "string") return value;
    return value
      .replace(blockedComponentPattern("gi"), "[redacted-component]")
      .replace(/(?:https?|wss?|ftp):\/\/\S+/gi, "[redacted-url]")
      .replace(/\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+/gi, "[redacted-path]")
      .replace(/\b(?:native_session|native_error|native_path|native_url|credential_material|raw_credential|api_key|password|provider_runtime|provider_binding|runtime)\b/gi, "[redacted-field]");
  })) as Record<string, unknown>;
}

function blockedComponentPattern(flags = "i"): RegExp {
  const markers = ["H" + "ermes", "Open" + "Claw", "Deep" + "Seek", "D" + "SH"];
  return new RegExp(markers.map(escapeRegExp).join("|"), flags);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cloneTrace(context: TraceContext): TraceContext {
  return {
    tenant_id: context.tenant_id,
    user_id: context.user_id,
    agent_id: context.agent_id,
    task_id: context.task_id,
    attempt_id: context.attempt_id,
    execution_id: context.execution_id,
    conversation_id: context.conversation_id,
    trace_id: context.trace_id,
  };
}

function clonePolicy(policy: TokenBudgetPolicy): TokenBudgetPolicy {
  return JSON.parse(JSON.stringify(policy)) as TokenBudgetPolicy;
}

function cloneDecision(decision: TokenBudgetDecision): TokenBudgetDecision {
  return JSON.parse(JSON.stringify(decision)) as TokenBudgetDecision;
}

function cloneLedgerEntry(entry: TokenBudgetLedgerEntry): TokenBudgetLedgerEntry {
  return JSON.parse(JSON.stringify(entry)) as TokenBudgetLedgerEntry;
}
