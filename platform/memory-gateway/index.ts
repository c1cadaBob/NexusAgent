import { assertPlatformId } from "../task-state/index.ts";
import { type PlatformClock, SystemClock } from "../clock/index.ts";
import { type EventBus, type PlatformEventEnvelope } from "../event-bus/index.ts";

export const MEMORY_LAYERS = ["session", "user", "agent_skill", "organization", "audit_snapshot"] as const;
export type MemoryLayer = (typeof MEMORY_LAYERS)[number];
export const PLANNER_MEMORY_LAYERS = ["session", "user", "agent_skill"] as const;
export type PlannerMemoryLayer = (typeof PLANNER_MEMORY_LAYERS)[number];
export const MEMORY_SNAPSHOT_SCHEMA_VERSION = "nexus.memory_snapshot.p3.v1";
export const MEMORY_RETENTION_SCHEMA_VERSION = "nexus.memory_retention.p7.v1";
export const MEMORY_RETENTION_DEFAULT_ENABLED = true;
export const MEMORY_RETENTION_POLICY_MODE = "conservative";
export const MEMORY_CONFLICT_SCHEMA_VERSION = "nexus.memory_conflict.p7.v1";
export const MEMORY_CONFLICT_DEFAULT_ENABLED = true;
export const MEMORY_CONFLICT_RESOLUTION_MODE = "admin_resolve_queue";

export type MemoryLifecycleStatus = "active" | "deleted" | "expired";
export type MemoryRetentionAction = "retain" | "soft_delete";

export interface MemoryScope {
  tenant_id: string;
  user_id?: string;
  agent_id?: string;
  conversation_id?: string;
}

export interface MemoryRecord {
  memory_id: string;
  tenant_id: string;
  layer: MemoryLayer;
  text: string;
  status: MemoryLifecycleStatus;
  version: number;
  source: string;
  created_at_utc: string;
  monotonic_ms: number;
  trace_id: string;
  user_id?: string;
  agent_id?: string;
  conversation_id?: string;
  deleted_at_utc?: string;
  deleted_monotonic_ms?: number;
  deleted_trace_id?: string;
  deletion_reason_code?: "MEMORY_MANUAL_DELETE" | "MEMORY_RETENTION_EXPIRED";
}

export interface MemoryRetentionRule {
  layer: MemoryLayer;
  enabled: boolean;
  ttl_days: number | null;
  action: MemoryRetentionAction;
  immutable: boolean;
}

export interface MemoryRetentionPolicy {
  schema_version: typeof MEMORY_RETENTION_SCHEMA_VERSION;
  tenant_id: string;
  policy_id: string;
  enabled: boolean;
  mode: typeof MEMORY_RETENTION_POLICY_MODE;
  rules: readonly MemoryRetentionRule[];
  resource_budget: {
    evaluation_mode: "manual_sweep";
    max_sweep_records: number;
    max_policy_rules: number;
  };
  updated_at_utc: string;
  monotonic_ms: number;
  trace_id: string;
}

export interface MemoryRetentionPolicyUpdateInput {
  tenant_id: string;
  trace_id: string;
  enabled?: boolean;
  rules?: readonly Partial<MemoryRetentionRule>[];
  max_sweep_records?: number;
}

export interface MemoryDeleteInput {
  tenant_id: string;
  memory_id: string;
  trace_id: string;
  reason: string;
  requested_by_user_id?: string;
  delete_kind?: "manual" | "retention_expired";
}

export interface MemoryDeleteResult {
  schema_version: typeof MEMORY_RETENTION_SCHEMA_VERSION;
  tenant_id: string;
  memory_id: string;
  layer: MemoryLayer;
  status: "deleted" | "expired";
  reason_code: "MEMORY_MANUAL_DELETE" | "MEMORY_RETENTION_EXPIRED";
  version: number;
  deleted_at_utc: string;
  monotonic_ms: number;
  trace_id: string;
}

export interface MemoryRetentionSweepInput {
  tenant_id: string;
  trace_id: string;
  requested_by_user_id?: string;
  max_records?: number;
}

export interface MemoryRetentionSweepResult {
  schema_version: typeof MEMORY_RETENTION_SCHEMA_VERSION;
  tenant_id: string;
  policy_id: string;
  scanned_count: number;
  deleted_count: number;
  skipped_count: number;
  items: readonly MemoryDeleteResult[];
  resource_budget: {
    evaluation_mode: "manual_sweep";
    max_sweep_records: number;
    evaluated_records: number;
  };
  swept_at_utc: string;
  monotonic_ms: number;
  trace_id: string;
}

export type MemoryConflictStatus = "open" | "resolved" | "ignored";
export type MemoryConflictDecision = "resolve" | "ignore";
export type MemoryConflictReasonCode = "MEMORY_EXPECTED_VERSION_CONFLICT" | "MEMORY_CONFLICT_RESOLVED" | "MEMORY_CONFLICT_IGNORED";

export interface MemoryConflictRecord {
  schema_version: typeof MEMORY_CONFLICT_SCHEMA_VERSION;
  conflict_id: string;
  tenant_id: string;
  scope: MemoryScope;
  layer: MemoryLayer;
  expected_version: number;
  current_version: number;
  status: MemoryConflictStatus;
  reason_codes: readonly MemoryConflictReasonCode[];
  created_at_utc: string;
  updated_at_utc: string;
  monotonic_ms: number;
  trace_id: string;
  decided_by_user_id?: string;
  decided_at_utc?: string;
}

export interface MemoryConflictDecisionInput {
  tenant_id: string;
  conflict_id: string;
  decision: MemoryConflictDecision;
  reason: string;
  trace_id: string;
  decided_by_user_id?: string;
}

export interface MemoryRetentionObservability {
  incrementMetric(input: {
    tenant_id: string;
    trace_id: string;
    user_id?: string;
    agent_id?: string;
    conversation_id?: string;
    name: string;
    value?: number;
    labels?: Record<string, string>;
    monotonic_ms?: number;
    recorded_at_utc?: string;
  }): unknown;
  recordLog(input: {
    tenant_id: string;
    trace_id: string;
    user_id?: string;
    agent_id?: string;
    conversation_id?: string;
    level: "debug" | "info" | "warn" | "error";
    message: string;
    component: string;
    fields?: Record<string, unknown>;
    monotonic_ms?: number;
    recorded_at_utc?: string;
  }): unknown;
}

export interface WriteMemoryInput {
  scope: MemoryScope;
  layer: MemoryLayer;
  text: string;
  source: string;
  trace_id: string;
  expected_version?: number;
}

export interface QueryMemoryInput {
  scope: MemoryScope;
  layer?: MemoryLayer;
  query?: string;
  trace_id: string;
}

export interface PlannerMemorySnapshotInput {
  scope: MemoryScope;
  trace_id: string;
  layers?: readonly PlannerMemoryLayer[];
  query?: string;
  max_records?: number;
}

export interface SanitizedMemoryRecord extends Omit<MemoryRecord, "text"> {
  text: string;
  sanitized: boolean;
}

export interface PlannerMemorySnapshot {
  schema_version: typeof MEMORY_SNAPSHOT_SCHEMA_VERSION;
  scope: MemoryScope;
  trace_id: string;
  version: number;
  records: readonly SanitizedMemoryRecord[];
  rendered: {
    session: string;
    user: string;
    agent_skill: string;
  };
}

export type MemoryProxyTarget = "memory" | "user" | "session";
export type MemoryProxyWriteAction = "add" | "replace" | "remove" | "batch";

export interface MemoryProxyWriteInput {
  scope: MemoryScope;
  target: MemoryProxyTarget;
  action: MemoryProxyWriteAction;
  trace_id: string;
  content?: string;
  old_text?: string;
  operations?: readonly Record<string, unknown>[];
  expected_version?: number;
  source?: string;
}

export class MemoryGatewayError extends Error {
  readonly code: "PLATFORM_INVALID_REQUEST" | "PLATFORM_FORBIDDEN" | "PLATFORM_NOT_FOUND" | "PLATFORM_CONFLICT";
  readonly details: Record<string, unknown>;

  constructor(code: MemoryGatewayError["code"], message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "MemoryGatewayError";
    this.code = code;
    this.details = details;
  }
}

export class LocalMemoryGateway {
  readonly #clock: PlatformClock;
  readonly #eventBus?: EventBus;
  readonly #observability?: MemoryRetentionObservability;
  readonly #records = new Map<string, MemoryRecord>();
  readonly #conflicts = new Map<string, MemoryConflictRecord>();
  readonly #tenantVersions = new Map<string, number>();
  readonly #retentionPolicies = new Map<string, MemoryRetentionPolicy>();
  #sequence = 0;

  constructor(options: { clock?: PlatformClock; eventBus?: EventBus; observability?: MemoryRetentionObservability } = {}) {
    this.#clock = options.clock ?? new SystemClock();
    this.#eventBus = options.eventBus;
    this.#observability = options.observability;
  }

  write(input: WriteMemoryInput): MemoryRecord {
    assertScope(input.scope);
    assertPlatformId("trace_id", input.trace_id);
    if (!(MEMORY_LAYERS as readonly string[]).includes(input.layer)) {
      throw new MemoryGatewayError("PLATFORM_INVALID_REQUEST", "Unsupported memory layer", { layer: input.layer });
    }
    if (!input.text.trim()) {
      throw new MemoryGatewayError("PLATFORM_INVALID_REQUEST", "Memory text is required");
    }
    if (!input.source.trim()) {
      throw new MemoryGatewayError("PLATFORM_INVALID_REQUEST", "Memory source is required");
    }
    if (input.expected_version !== undefined) {
      assertNonNegativeInteger(input.expected_version, "expected_version");
      const currentVersion = this.currentVersion(input.scope.tenant_id);
      if (input.expected_version !== currentVersion) {
        this.#createConflict(input, currentVersion);
        throw new MemoryGatewayError("PLATFORM_CONFLICT", "Memory expected_version does not match current tenant version", {
          expected_version: input.expected_version,
          current_version: currentVersion,
        });
      }
    }

    const reading = this.#clock.now();
    const version = (this.#tenantVersions.get(input.scope.tenant_id) ?? 0) + 1;
    this.#tenantVersions.set(input.scope.tenant_id, version);
    const memory_id = this.#nextMemoryId(input.scope.tenant_id);
    const record: MemoryRecord = {
      memory_id,
      tenant_id: input.scope.tenant_id,
      user_id: input.scope.user_id,
      agent_id: input.scope.agent_id,
      conversation_id: input.scope.conversation_id,
      layer: input.layer,
      text: input.text,
      status: "active",
      version,
      source: input.source,
      created_at_utc: reading.utc_timestamp,
      monotonic_ms: reading.monotonic_ms,
      trace_id: input.trace_id,
    };
    this.#records.set(memory_id, record);
    this.#publishMemoryEvent(record);
    return cloneMemory(record);
  }

  query(input: QueryMemoryInput): readonly MemoryRecord[] {
    assertScope(input.scope);
    assertPlatformId("trace_id", input.trace_id);
    const query = input.query?.toLowerCase();
    return [...this.#records.values()]
      .filter((record) => record.tenant_id === input.scope.tenant_id)
      .filter((record) => record.status === "active")
      .filter((record) => input.scope.user_id === undefined || record.user_id === input.scope.user_id)
      .filter((record) => input.scope.agent_id === undefined || record.agent_id === input.scope.agent_id)
      .filter((record) => input.scope.conversation_id === undefined || record.conversation_id === input.scope.conversation_id)
      .filter((record) => input.layer === undefined || record.layer === input.layer)
      .filter((record) => query === undefined || record.text.toLowerCase().includes(query))
      .sort((left, right) => left.monotonic_ms - right.monotonic_ms)
      .map(cloneMemory);
  }

  currentVersion(tenant_id: string): number {
    assertPlatformId("tenant_id", tenant_id);
    return this.#tenantVersions.get(tenant_id) ?? 0;
  }

  listConflicts(tenant_id: string, trace_id: string, status?: MemoryConflictStatus): readonly MemoryConflictRecord[] {
    assertPlatformId("tenant_id", tenant_id);
    assertPlatformId("trace_id", trace_id);
    if (status !== undefined && !["open", "resolved", "ignored"].includes(status)) {
      throw new MemoryGatewayError("PLATFORM_INVALID_REQUEST", "Unsupported memory conflict status", { status });
    }
    return [...this.#conflicts.values()]
      .filter((conflict) => conflict.tenant_id === tenant_id)
      .filter((conflict) => status === undefined || conflict.status === status)
      .sort((left, right) => left.monotonic_ms - right.monotonic_ms)
      .map(cloneConflict);
  }

  getConflict(tenant_id: string, conflict_id: string): MemoryConflictRecord {
    assertPlatformId("tenant_id", tenant_id);
    const conflict = this.#conflicts.get(requireConflictId(conflict_id));
    if (!conflict) throw new MemoryGatewayError("PLATFORM_NOT_FOUND", "Memory conflict not found", { conflict_id });
    if (conflict.tenant_id !== tenant_id) throw new MemoryGatewayError("PLATFORM_FORBIDDEN", "Memory conflict tenant mismatch", { conflict_id });
    return cloneConflict(conflict);
  }

  decideConflict(input: MemoryConflictDecisionInput): MemoryConflictRecord {
    assertPlatformId("tenant_id", input.tenant_id);
    assertPlatformId("trace_id", input.trace_id);
    if (input.decided_by_user_id !== undefined) assertPlatformId("user_id", input.decided_by_user_id);
    requireConflictId(input.conflict_id);
    if (!["resolve", "ignore"].includes(input.decision)) {
      throw new MemoryGatewayError("PLATFORM_INVALID_REQUEST", "Unsupported memory conflict decision", { decision: input.decision });
    }
    if (!input.reason.trim()) throw new MemoryGatewayError("PLATFORM_INVALID_REQUEST", "Memory conflict decision reason is required");
    assertNoNativeMemoryPayload(input);
    const current = this.#conflicts.get(input.conflict_id);
    if (!current) throw new MemoryGatewayError("PLATFORM_NOT_FOUND", "Memory conflict not found", { conflict_id: input.conflict_id });
    if (current.tenant_id !== input.tenant_id) throw new MemoryGatewayError("PLATFORM_FORBIDDEN", "Memory conflict tenant mismatch", { conflict_id: input.conflict_id });
    if (current.status !== "open") throw new MemoryGatewayError("PLATFORM_CONFLICT", "Memory conflict is already decided", { conflict_id: input.conflict_id, status: current.status });
    const reading = this.#clock.now();
    const status: MemoryConflictStatus = input.decision === "resolve" ? "resolved" : "ignored";
    const decided: MemoryConflictRecord = {
      ...current,
      status,
      reason_codes: [status === "resolved" ? "MEMORY_CONFLICT_RESOLVED" : "MEMORY_CONFLICT_IGNORED"],
      updated_at_utc: reading.utc_timestamp,
      monotonic_ms: reading.monotonic_ms,
      trace_id: input.trace_id,
      decided_by_user_id: input.decided_by_user_id,
      decided_at_utc: reading.utc_timestamp,
    };
    this.#conflicts.set(input.conflict_id, cloneConflict(decided));
    this.#publishConflictEvent(decided, "memory.conflict_decided");
    this.#recordRetentionObservability("memory_conflict.decided", input.tenant_id, input.trace_id, reading, {
      conflict_id: decided.conflict_id,
      status: decided.status,
      reason_codes: decided.reason_codes,
    });
    return cloneConflict(decided);
  }

  getRetentionPolicy(tenant_id: string, trace_id: string): MemoryRetentionPolicy {
    assertPlatformId("tenant_id", tenant_id);
    assertPlatformId("trace_id", trace_id);
    return clonePolicy(this.#policyForTenant(tenant_id, trace_id));
  }

  updateRetentionPolicy(input: MemoryRetentionPolicyUpdateInput): MemoryRetentionPolicy {
    assertPlatformId("tenant_id", input.tenant_id);
    assertPlatformId("trace_id", input.trace_id);
    assertNoNativeMemoryPayload(input);
    const current = this.#policyForTenant(input.tenant_id, input.trace_id);
    const reading = this.#clock.now();
    const rules = mergeRetentionRules(current.rules, input.rules);
    const policy: MemoryRetentionPolicy = {
      ...current,
      enabled: input.enabled ?? current.enabled,
      rules,
      resource_budget: {
        evaluation_mode: "manual_sweep",
        max_sweep_records: input.max_sweep_records === undefined ? current.resource_budget.max_sweep_records : assertPositiveInteger(input.max_sweep_records, "max_sweep_records"),
        max_policy_rules: MEMORY_LAYERS.length,
      },
      updated_at_utc: reading.utc_timestamp,
      monotonic_ms: reading.monotonic_ms,
      trace_id: input.trace_id,
    };
    this.#retentionPolicies.set(input.tenant_id, clonePolicy(policy));
    this.#recordRetentionObservability("memory_retention.policy_updated", input.tenant_id, input.trace_id, reading, {
      policy_id: policy.policy_id,
      enabled: policy.enabled,
      max_sweep_records: policy.resource_budget.max_sweep_records,
    });
    return clonePolicy(policy);
  }

  softDeleteMemory(input: MemoryDeleteInput): MemoryDeleteResult {
    assertPlatformId("tenant_id", input.tenant_id);
    assertPlatformId("trace_id", input.trace_id);
    if (input.requested_by_user_id !== undefined) assertPlatformId("user_id", input.requested_by_user_id);
    requireMemoryId(input.memory_id);
    if (!input.reason.trim()) throw new MemoryGatewayError("PLATFORM_INVALID_REQUEST", "Memory delete reason is required");
    assertNoNativeMemoryPayload(input);
    const record = this.#records.get(input.memory_id);
    if (!record) throw new MemoryGatewayError("PLATFORM_NOT_FOUND", "Memory record not found", { memory_id: input.memory_id });
    if (record.tenant_id !== input.tenant_id) throw new MemoryGatewayError("PLATFORM_FORBIDDEN", "Memory tenant mismatch", { memory_id: input.memory_id });
    if (record.layer === "audit_snapshot") throw new MemoryGatewayError("PLATFORM_FORBIDDEN", "Audit snapshot memory is immutable", { memory_id: input.memory_id });
    if (record.status !== "active") throw new MemoryGatewayError("PLATFORM_NOT_FOUND", "Memory record not found", { memory_id: input.memory_id });
    const reading = this.#clock.now();
    const version = (this.#tenantVersions.get(input.tenant_id) ?? 0) + 1;
    this.#tenantVersions.set(input.tenant_id, version);
    const status = input.delete_kind === "retention_expired" ? "expired" : "deleted";
    const reason_code = status === "expired" ? "MEMORY_RETENTION_EXPIRED" : "MEMORY_MANUAL_DELETE";
    const deleted: MemoryRecord = {
      ...record,
      text: "",
      status,
      version,
      deleted_at_utc: reading.utc_timestamp,
      deleted_monotonic_ms: reading.monotonic_ms,
      deleted_trace_id: input.trace_id,
      deletion_reason_code: reason_code,
    };
    this.#records.set(input.memory_id, deleted);
    const result: MemoryDeleteResult = {
      schema_version: MEMORY_RETENTION_SCHEMA_VERSION,
      tenant_id: deleted.tenant_id,
      memory_id: deleted.memory_id,
      layer: deleted.layer,
      status,
      reason_code,
      version,
      deleted_at_utc: reading.utc_timestamp,
      monotonic_ms: reading.monotonic_ms,
      trace_id: input.trace_id,
    };
    this.#publishRetentionEvent(result, deleted, input.requested_by_user_id);
    this.#recordRetentionMetric(status === "expired" ? "memory_retention.expired_count" : "memory_retention.deleted_count", result, 1);
    this.#recordRetentionObservability(status === "expired" ? "memory_retention.expired" : "memory_retention.deleted", result.tenant_id, result.trace_id, reading, {
      memory_id: result.memory_id,
      layer: result.layer,
      status: result.status,
      reason_code: result.reason_code,
      version: result.version,
    });
    return cloneDeleteResult(result);
  }

  sweepRetention(input: MemoryRetentionSweepInput): MemoryRetentionSweepResult {
    assertPlatformId("tenant_id", input.tenant_id);
    assertPlatformId("trace_id", input.trace_id);
    if (input.requested_by_user_id !== undefined) assertPlatformId("user_id", input.requested_by_user_id);
    assertNoNativeMemoryPayload(input);
    const policy = this.#policyForTenant(input.tenant_id, input.trace_id);
    const reading = this.#clock.now();
    const maxRecords = input.max_records === undefined ? policy.resource_budget.max_sweep_records : assertPositiveInteger(input.max_records, "max_records");
    const activeRecords = [...this.#records.values()]
      .filter((record) => record.tenant_id === input.tenant_id && record.status === "active")
      .sort((left, right) => left.monotonic_ms - right.monotonic_ms)
      .slice(0, maxRecords);
    const results: MemoryDeleteResult[] = [];
    if (policy.enabled) {
      for (const record of activeRecords) {
        if (shouldExpireRecord(record, policy, reading.utc_timestamp)) {
          results.push(this.softDeleteMemory({
            tenant_id: input.tenant_id,
            memory_id: record.memory_id,
            trace_id: input.trace_id,
            reason: "retention policy expired memory record",
            requested_by_user_id: input.requested_by_user_id,
            delete_kind: "retention_expired",
          }));
        }
      }
    }
    const result: MemoryRetentionSweepResult = {
      schema_version: MEMORY_RETENTION_SCHEMA_VERSION,
      tenant_id: input.tenant_id,
      policy_id: policy.policy_id,
      scanned_count: activeRecords.length,
      deleted_count: results.length,
      skipped_count: activeRecords.length - results.length,
      items: results,
      resource_budget: {
        evaluation_mode: "manual_sweep",
        max_sweep_records: maxRecords,
        evaluated_records: activeRecords.length,
      },
      swept_at_utc: reading.utc_timestamp,
      monotonic_ms: reading.monotonic_ms,
      trace_id: input.trace_id,
    };
    this.#recordRetentionMetric("memory_retention.sweep_deleted_count", result, result.deleted_count);
    this.#recordRetentionObservability("memory_retention.sweep_completed", input.tenant_id, input.trace_id, reading, {
      policy_id: result.policy_id,
      scanned_count: result.scanned_count,
      deleted_count: result.deleted_count,
      skipped_count: result.skipped_count,
      max_sweep_records: maxRecords,
    });
    return cloneSweepResult(result);
  }

  plannerSnapshot(input: PlannerMemorySnapshotInput): PlannerMemorySnapshot {
    assertScope(input.scope);
    assertPlatformId("trace_id", input.trace_id);
    const layers = validatePlannerLayers(input.layers);
    const maxRecords = input.max_records === undefined ? 20 : assertPositiveInteger(input.max_records, "max_records");
    const records = layers
      .flatMap((layer) => this.query({ scope: input.scope, layer, query: input.query, trace_id: input.trace_id }))
      .sort((left, right) => left.monotonic_ms - right.monotonic_ms)
      .slice(0, Math.min(maxRecords, 50))
      .map(sanitizePlannerMemoryRecord);
    return {
      schema_version: MEMORY_SNAPSHOT_SCHEMA_VERSION,
      scope: cloneScope(input.scope),
      trace_id: input.trace_id,
      version: this.currentVersion(input.scope.tenant_id),
      records,
      rendered: renderPlannerMemorySnapshot(records),
    };
  }

  writeFromMemoryProxy(input: MemoryProxyWriteInput): MemoryRecord {
    assertScope(input.scope);
    assertPlatformId("trace_id", input.trace_id);
    const layer = layerForMemoryProxyTarget(input.target);
    const text = textForMemoryProxyWrite(input);
    assertNoNativeMemoryPayload({ ...input, text });
    return this.write({
      scope: input.scope,
      layer,
      text,
      source: input.source ?? `planner-memory-proxy:${input.action}`,
      trace_id: input.trace_id,
      expected_version: input.expected_version,
    });
  }

  get(tenant_id: string, memory_id: string): MemoryRecord {
    assertPlatformId("tenant_id", tenant_id);
    const record = this.#records.get(memory_id);
    if (!record) {
      throw new MemoryGatewayError("PLATFORM_NOT_FOUND", "Memory record not found", { memory_id });
    }
    if (record.tenant_id !== tenant_id) {
      throw new MemoryGatewayError("PLATFORM_FORBIDDEN", "Memory tenant mismatch", { memory_id });
    }
    if (record.status !== "active") {
      throw new MemoryGatewayError("PLATFORM_NOT_FOUND", "Memory record not found", { memory_id });
    }
    return cloneMemory(record);
  }

  #policyForTenant(tenantId: string, traceId: string): MemoryRetentionPolicy {
    const existing = this.#retentionPolicies.get(tenantId);
    if (existing) return existing;
    const reading = this.#clock.now();
    const policy = defaultRetentionPolicy(tenantId, traceId, reading.utc_timestamp, reading.monotonic_ms);
    this.#retentionPolicies.set(tenantId, clonePolicy(policy));
    return policy;
  }

  #nextMemoryId(tenantId: string): string {
    this.#sequence += 1;
    return `memory_${tenantId.replace(/^tenant_/, "")}_${String(this.#sequence).padStart(4, "0")}`;
  }

  #nextConflictId(tenantId: string): string {
    this.#sequence += 1;
    return `conflict_${tenantId.replace(/^tenant_/, "memory_")}_${String(this.#sequence).padStart(4, "0")}`;
  }

  #createConflict(input: WriteMemoryInput, currentVersion: number): MemoryConflictRecord | undefined {
    if (!MEMORY_CONFLICT_DEFAULT_ENABLED || input.expected_version === undefined) return undefined;
    const reading = this.#clock.now();
    const conflict: MemoryConflictRecord = {
      schema_version: MEMORY_CONFLICT_SCHEMA_VERSION,
      conflict_id: this.#nextConflictId(input.scope.tenant_id),
      tenant_id: input.scope.tenant_id,
      scope: cloneScope(input.scope),
      layer: input.layer,
      expected_version: input.expected_version,
      current_version: currentVersion,
      status: "open",
      reason_codes: ["MEMORY_EXPECTED_VERSION_CONFLICT"],
      created_at_utc: reading.utc_timestamp,
      updated_at_utc: reading.utc_timestamp,
      monotonic_ms: reading.monotonic_ms,
      trace_id: input.trace_id,
    };
    this.#conflicts.set(conflict.conflict_id, cloneConflict(conflict));
    this.#publishConflictEvent(conflict, "memory.conflict_detected");
    this.#recordRetentionMetric("memory_conflict.open_count", {
      tenant_id: conflict.tenant_id,
      trace_id: conflict.trace_id,
      monotonic_ms: conflict.monotonic_ms,
    }, 1);
    this.#recordRetentionObservability("memory_conflict.detected", conflict.tenant_id, conflict.trace_id, reading, {
      conflict_id: conflict.conflict_id,
      layer: conflict.layer,
      expected_version: conflict.expected_version,
      current_version: conflict.current_version,
      reason_codes: conflict.reason_codes,
    });
    return cloneConflict(conflict);
  }

  #publishMemoryEvent(record: MemoryRecord): void {
    this.#eventBus?.publish({
      schema_version: "nexus.event_envelope.v1",
      event_id: `event_${record.memory_id.replace(/^memory_/, "memory_")}`,
      event_type: "audit.recorded",
      tenant_id: record.tenant_id,
      user_id: record.user_id,
      agent_id: record.agent_id,
      conversation_id: record.conversation_id,
      trace_id: record.trace_id,
      occurred_at_utc: record.created_at_utc,
      monotonic_ms: record.monotonic_ms,
      producer: { service: "memory-gateway", component: "local-memory-gateway" },
      subject: { kind: "audit", id: record.memory_id },
      payload: {
        memory_id: record.memory_id,
        layer: record.layer,
        version: record.version,
        source: record.source,
      },
    } satisfies PlatformEventEnvelope);
  }

  #publishRetentionEvent(result: MemoryDeleteResult, record: MemoryRecord, requestedByUserId: string | undefined): void {
    this.#eventBus?.publish({
      schema_version: "nexus.event_envelope.v1",
      event_id: `event_${result.memory_id.replace(/^memory_/, "memory_")}_${result.status}`,
      event_type: "audit.recorded",
      tenant_id: result.tenant_id,
      user_id: requestedByUserId ?? record.user_id,
      agent_id: record.agent_id,
      conversation_id: record.conversation_id,
      trace_id: result.trace_id,
      occurred_at_utc: result.deleted_at_utc,
      monotonic_ms: result.monotonic_ms,
      producer: { service: "memory-gateway", component: "memory-retention" },
      subject: { kind: "audit", id: result.memory_id },
      payload: {
        schema_version: result.schema_version,
        memory_id: result.memory_id,
        layer: result.layer,
        status: result.status,
        reason_code: result.reason_code,
        version: result.version,
      },
    } satisfies PlatformEventEnvelope);
  }

  #publishConflictEvent(conflict: MemoryConflictRecord, eventType: "memory.conflict_detected" | "memory.conflict_decided"): void {
    this.#eventBus?.publish({
      schema_version: "nexus.event_envelope.v1",
      event_id: `event_${conflict.conflict_id.replace(/^conflict_/, "memory_conflict_")}_${conflict.status}`,
      event_type: eventType,
      tenant_id: conflict.tenant_id,
      user_id: conflict.scope.user_id ?? conflict.decided_by_user_id,
      agent_id: conflict.scope.agent_id,
      conversation_id: conflict.scope.conversation_id,
      trace_id: conflict.trace_id,
      occurred_at_utc: conflict.updated_at_utc,
      monotonic_ms: conflict.monotonic_ms,
      producer: { service: "memory-gateway", component: "memory-conflict" },
      subject: { kind: "audit", id: conflict.conflict_id },
      payload: {
        schema_version: conflict.schema_version,
        conflict_id: conflict.conflict_id,
        layer: conflict.layer,
        status: conflict.status,
        expected_version: conflict.expected_version,
        current_version: conflict.current_version,
        reason_codes: conflict.reason_codes,
      },
    } satisfies PlatformEventEnvelope);
  }

  #recordRetentionMetric(name: string, result: Pick<MemoryDeleteResult | MemoryRetentionSweepResult, "tenant_id" | "trace_id" | "monotonic_ms">, value: number): void {
    try {
      this.#observability?.incrementMetric({
        tenant_id: result.tenant_id,
        trace_id: result.trace_id,
        name,
        value,
        labels: { schema_version: MEMORY_RETENTION_SCHEMA_VERSION },
        monotonic_ms: result.monotonic_ms,
      });
    } catch {
      // Retention observability is internal and must never alter memory semantics.
    }
  }

  #recordRetentionObservability(message: string, tenantId: string, traceId: string, reading: { utc_timestamp: string; monotonic_ms: number }, fields: Record<string, unknown>): void {
    try {
      this.#observability?.recordLog({
        tenant_id: tenantId,
        trace_id: traceId,
        level: "info",
        component: "memory-retention",
        message,
        fields: sanitizeRetentionFields(fields),
        recorded_at_utc: reading.utc_timestamp,
        monotonic_ms: reading.monotonic_ms,
      });
    } catch {
      // Retention observability is internal and must never alter memory semantics.
    }
  }
}

function assertScope(scope: MemoryScope): void {
  assertPlatformId("tenant_id", scope.tenant_id);
  if (scope.user_id !== undefined) assertPlatformId("user_id", scope.user_id);
  if (scope.agent_id !== undefined) assertPlatformId("agent_id", scope.agent_id);
  if (scope.conversation_id !== undefined) assertPlatformId("conversation_id", scope.conversation_id);
}

function assertNonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new MemoryGatewayError("PLATFORM_INVALID_REQUEST", `Invalid ${field}`, { field, value });
  }
  return Number(value);
}

function assertPositiveInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new MemoryGatewayError("PLATFORM_INVALID_REQUEST", `Invalid ${field}`, { field, value });
  }
  return Number(value);
}

function requireMemoryId(value: unknown): string {
  if (typeof value !== "string" || !/^memory_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/.test(value)) {
    throw new MemoryGatewayError("PLATFORM_INVALID_REQUEST", "Invalid memory_id", { field: "memory_id" });
  }
  return value;
}

function requireConflictId(value: unknown): string {
  if (typeof value !== "string" || !/^conflict_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/.test(value)) {
    throw new MemoryGatewayError("PLATFORM_INVALID_REQUEST", "Invalid conflict_id", { field: "conflict_id" });
  }
  return value;
}

function defaultRetentionPolicy(tenantId: string, traceId: string, utc: string, monotonic: number): MemoryRetentionPolicy {
  return {
    schema_version: MEMORY_RETENTION_SCHEMA_VERSION,
    tenant_id: tenantId,
    policy_id: `memory_retention_${tenantId.replace(/^tenant_/, "")}`,
    enabled: MEMORY_RETENTION_DEFAULT_ENABLED,
    mode: MEMORY_RETENTION_POLICY_MODE,
    rules: [
      { layer: "session", enabled: true, ttl_days: 7, action: "soft_delete", immutable: false },
      { layer: "user", enabled: false, ttl_days: null, action: "retain", immutable: false },
      { layer: "agent_skill", enabled: false, ttl_days: null, action: "retain", immutable: false },
      { layer: "organization", enabled: false, ttl_days: null, action: "retain", immutable: false },
      { layer: "audit_snapshot", enabled: false, ttl_days: null, action: "retain", immutable: true },
    ],
    resource_budget: {
      evaluation_mode: "manual_sweep",
      max_sweep_records: 100,
      max_policy_rules: MEMORY_LAYERS.length,
    },
    updated_at_utc: utc,
    monotonic_ms: monotonic,
    trace_id: traceId,
  };
}

function mergeRetentionRules(current: readonly MemoryRetentionRule[], updates: readonly Partial<MemoryRetentionRule>[] | undefined): readonly MemoryRetentionRule[] {
  if (updates === undefined) return current.map(cloneRule);
  if (!Array.isArray(updates) || updates.length === 0 || updates.length > MEMORY_LAYERS.length) {
    throw new MemoryGatewayError("PLATFORM_INVALID_REQUEST", "Retention policy rules are invalid", { field: "rules" });
  }
  const merged = new Map(current.map((rule) => [rule.layer, cloneRule(rule)]));
  for (const update of updates) {
    if (!update || typeof update !== "object") throw new MemoryGatewayError("PLATFORM_INVALID_REQUEST", "Retention policy rule must be an object");
    const layer = update.layer;
    if (typeof layer !== "string" || !(MEMORY_LAYERS as readonly string[]).includes(layer)) {
      throw new MemoryGatewayError("PLATFORM_INVALID_REQUEST", "Unsupported retention policy layer", { layer });
    }
    const base = merged.get(layer as MemoryLayer) ?? defaultRule(layer as MemoryLayer);
    const next: MemoryRetentionRule = {
      layer: layer as MemoryLayer,
      enabled: update.enabled ?? base.enabled,
      ttl_days: update.ttl_days === undefined ? base.ttl_days : normalizeTtlDays(update.ttl_days),
      action: update.action ?? base.action,
      immutable: layer === "audit_snapshot" ? true : update.immutable ?? base.immutable,
    };
    validateRetentionRule(next);
    merged.set(next.layer, next);
  }
  return MEMORY_LAYERS.map((layer) => merged.get(layer) ?? defaultRule(layer));
}

function defaultRule(layer: MemoryLayer): MemoryRetentionRule {
  return defaultRetentionPolicy("tenant_alpha01", "trace_alpha01", "2026-08-26T00:00:00.000Z", 0).rules.find((rule) => rule.layer === layer) ?? { layer, enabled: false, ttl_days: null, action: "retain", immutable: false };
}

function validateRetentionRule(rule: MemoryRetentionRule): void {
  if (!(MEMORY_LAYERS as readonly string[]).includes(rule.layer)) {
    throw new MemoryGatewayError("PLATFORM_INVALID_REQUEST", "Unsupported retention policy layer", { layer: rule.layer });
  }
  if (!/[a-z_]+/.test(rule.action) || !["retain", "soft_delete"].includes(rule.action)) {
    throw new MemoryGatewayError("PLATFORM_INVALID_REQUEST", "Unsupported retention action", { action: rule.action });
  }
  if (rule.layer === "audit_snapshot" && (rule.enabled || rule.ttl_days !== null || rule.action !== "retain")) {
    throw new MemoryGatewayError("PLATFORM_FORBIDDEN", "Audit snapshot memory is immutable");
  }
  if (rule.enabled && rule.action === "soft_delete" && rule.ttl_days === null) {
    throw new MemoryGatewayError("PLATFORM_INVALID_REQUEST", "Soft delete retention requires ttl_days", { layer: rule.layer });
  }
}

function normalizeTtlDays(value: unknown): number | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 3650) {
    throw new MemoryGatewayError("PLATFORM_INVALID_REQUEST", "Invalid retention ttl_days", { ttl_days: value });
  }
  return Number(value);
}

function shouldExpireRecord(record: MemoryRecord, policy: MemoryRetentionPolicy, nowUtc: string): boolean {
  const rule = policy.rules.find((item) => item.layer === record.layer);
  if (!rule || !rule.enabled || rule.action !== "soft_delete" || rule.ttl_days === null || rule.immutable) return false;
  const created = Date.parse(record.created_at_utc);
  const now = Date.parse(nowUtc);
  if (!Number.isFinite(created) || !Number.isFinite(now)) {
    throw new MemoryGatewayError("PLATFORM_INVALID_REQUEST", "Invalid retention timestamp");
  }
  return now - created >= rule.ttl_days * 24 * 60 * 60 * 1000;
}

function cloneRule(rule: MemoryRetentionRule): MemoryRetentionRule {
  return { ...rule };
}

function clonePolicy(policy: MemoryRetentionPolicy): MemoryRetentionPolicy {
  return JSON.parse(JSON.stringify(policy)) as MemoryRetentionPolicy;
}

function cloneDeleteResult(result: MemoryDeleteResult): MemoryDeleteResult {
  return JSON.parse(JSON.stringify(result)) as MemoryDeleteResult;
}

function cloneSweepResult(result: MemoryRetentionSweepResult): MemoryRetentionSweepResult {
  return JSON.parse(JSON.stringify(result)) as MemoryRetentionSweepResult;
}

function cloneConflict(conflict: MemoryConflictRecord): MemoryConflictRecord {
  return JSON.parse(JSON.stringify(conflict)) as MemoryConflictRecord;
}

function validatePlannerLayers(value: readonly PlannerMemoryLayer[] | undefined): readonly PlannerMemoryLayer[] {
  const layers = value ?? PLANNER_MEMORY_LAYERS;
  if (!Array.isArray(layers) || layers.length === 0) {
    throw new MemoryGatewayError("PLATFORM_INVALID_REQUEST", "Planner memory layers are required");
  }
  for (const layer of layers) {
    if (!(PLANNER_MEMORY_LAYERS as readonly string[]).includes(layer)) {
      throw new MemoryGatewayError("PLATFORM_FORBIDDEN", "Planner memory snapshot only supports P3 session user and agent_skill layers", { layer });
    }
  }
  return [...new Set(layers)];
}

function layerForMemoryProxyTarget(target: MemoryProxyTarget): PlannerMemoryLayer {
  if (target === "memory") return "agent_skill";
  if (target === "user") return "user";
  if (target === "session") return "session";
  throw new MemoryGatewayError("PLATFORM_INVALID_REQUEST", "Unsupported planner memory target", { target });
}

function textForMemoryProxyWrite(input: MemoryProxyWriteInput): string {
  if (!["add", "replace", "remove", "batch"].includes(input.action)) {
    throw new MemoryGatewayError("PLATFORM_INVALID_REQUEST", "Unsupported planner memory write action", { action: input.action });
  }
  if (input.action === "batch") {
    if (!Array.isArray(input.operations) || input.operations.length === 0) {
      throw new MemoryGatewayError("PLATFORM_INVALID_REQUEST", "Planner memory batch requires operations");
    }
    return JSON.stringify(input.operations.map((operation) => sanitizeWriteOperation(operation)));
  }
  const content = String(input.content ?? "").trim();
  const oldText = String(input.old_text ?? "").trim();
  if (input.action === "add") return content;
  if (input.action === "replace") {
    if (!oldText || !content) throw new MemoryGatewayError("PLATFORM_INVALID_REQUEST", "Planner memory replace requires old_text and content");
    return `replace:${oldText}\n${content}`;
  }
  if (input.action === "remove") {
    if (!oldText) throw new MemoryGatewayError("PLATFORM_INVALID_REQUEST", "Planner memory remove requires old_text");
    return `remove:${oldText}`;
  }
  return content;
}

function sanitizeWriteOperation(operation: Record<string, unknown>): Record<string, unknown> {
  const allowed = new Set(["action", "content", "old_text", "new_text"]);
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(operation)) {
    if (!allowed.has(key)) {
      throw new MemoryGatewayError("PLATFORM_INVALID_REQUEST", "Planner memory batch operation contains unsupported field", { field: key });
    }
    safe[key] = typeof value === "string" ? value : value;
  }
  return safe;
}

function assertNoNativeMemoryPayload(value: unknown): void {
  const text = JSON.stringify(value ?? {});
  if (/(?:"(?:path|file_path|native_path|native_session_id|native_error|url|provider_runtime|provider_binding|raw_credential|credential_material|memory_rejected_text|stale_payload)"\s*:|https?:\/\/|\/(?:opt|tmp|var|etc|home|usr)\/|raw_credential|credential_material|memory_rejected_text|stale_payload|native_(?:url|path|session|error)|provider_(?:runtime|binding))/i.test(text)) {
    throw new MemoryGatewayError("PLATFORM_INVALID_REQUEST", "Planner memory proxy payload contains non-platform fields");
  }
}

function sanitizeRetentionFields(fields: Record<string, unknown>): Record<string, unknown> {
  assertNoNativeMemoryPayload(fields);
  return JSON.parse(JSON.stringify(fields)) as Record<string, unknown>;
}

function sanitizePlannerMemoryRecord(record: MemoryRecord): SanitizedMemoryRecord {
  const sanitized = sanitizePlannerMemoryText(record.text);
  return {
    ...cloneMemory(record),
    text: sanitized.text,
    sanitized: sanitized.sanitized,
  };
}

export function sanitizePlannerMemoryText(text: string): { text: string; sanitized: boolean } {
  if (containsUnsafePlannerMemory(text)) {
    return {
      text: "[BLOCKED: memory entry contained unsafe or non-platform content. Removed from planner snapshot.]",
      sanitized: true,
    };
  }
  return { text, sanitized: false };
}

function containsUnsafePlannerMemory(text: string): boolean {
  return /MEMORY\.md|USER\.md|https?:\/\/|\/(?:tmp|var|workspace|opt)\/|native_session|native_error|credential_material|raw_credential|api[_-]?key|password|secret-token|secret_value|BEGIN (?:RSA|OPENSSH|PRIVATE) KEY/i.test(text);
}

function renderPlannerMemorySnapshot(records: readonly SanitizedMemoryRecord[]): PlannerMemorySnapshot["rendered"] {
  return {
    session: renderLayer(records, "session"),
    user: renderLayer(records, "user"),
    agent_skill: renderLayer(records, "agent_skill"),
  };
}

function renderLayer(records: readonly SanitizedMemoryRecord[], layer: PlannerMemoryLayer): string {
  return records.filter((record) => record.layer === layer).map((record) => record.text).join("\n§\n");
}

function cloneScope(scope: MemoryScope): MemoryScope {
  return JSON.parse(JSON.stringify(scope)) as MemoryScope;
}

function cloneMemory(record: MemoryRecord): MemoryRecord {
  return JSON.parse(JSON.stringify(record)) as MemoryRecord;
}
