import { createHash } from "node:crypto";
import { type PlatformClock, SystemClock } from "../clock/index.ts";
import { type EventBus, type PlatformEventEnvelope } from "../event-bus/index.ts";
import { assertMonotonicMs, assertPlatformId, assertUtcTimestamp } from "../task-state/index.ts";

export type AuditOutcome = "allowed" | "denied" | "failed" | "recorded";

export interface AuditResourceRef {
  kind: "tenant" | "user" | "task" | "attempt" | "execution" | "artifact" | "credential" | "memory" | "policy" | "audit" | "trace";
  id: string;
  tenant_id?: string;
}

export interface AuditRecordInput {
  tenant_id: string;
  user_id: string;
  trace_id: string;
  action: string;
  outcome: AuditOutcome;
  resource: AuditResourceRef;
  monotonic_ms?: number;
  occurred_at_utc?: string;
  task_id?: string;
  attempt_id?: string;
  execution_id?: string;
  conversation_id?: string;
  policy_decision_id?: string;
  details?: Record<string, unknown>;
}

export interface AuditRecord extends Required<Pick<AuditRecordInput, "tenant_id" | "user_id" | "trace_id" | "action" | "outcome" | "resource">> {
  schema_version: "nexus.audit_record.v1";
  audit_id: string;
  occurred_at_utc: string;
  monotonic_ms: number;
  task_id?: string;
  attempt_id?: string;
  execution_id?: string;
  conversation_id?: string;
  policy_decision_id?: string;
  details?: Record<string, unknown>;
  previous_hash: string;
  current_hash: string;
}

export interface AuditQuery {
  tenant_id?: string;
  trace_id?: string;
  task_id?: string;
  action?: string;
  outcome?: AuditOutcome;
}

export class AuditLogError extends Error {
  readonly code: "PLATFORM_INVALID_REQUEST" | "PLATFORM_FORBIDDEN" | "PLATFORM_CROSS_TENANT_ID" | "PLATFORM_AUDIT_CHAIN_BROKEN";
  readonly details: Record<string, unknown>;

  constructor(code: AuditLogError["code"], message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "AuditLogError";
    this.code = code;
    this.details = details;
  }
}

export class LocalAuditLog {
  readonly #clock: PlatformClock;
  readonly #eventBus?: EventBus;
  readonly #records: AuditRecord[] = [];
  #sequence = 0;

  constructor(options: { clock?: PlatformClock; eventBus?: EventBus } = {}) {
    this.#clock = options.clock ?? new SystemClock();
    this.#eventBus = options.eventBus;
  }

  append(input: AuditRecordInput): AuditRecord {
    this.#assertInput(input);
    const reading = this.#clock.now();
    const occurred_at_utc = input.occurred_at_utc ?? reading.utc_timestamp;
    const monotonic_ms = input.monotonic_ms ?? reading.monotonic_ms;
    assertUtcTimestamp(occurred_at_utc, "audit.occurred_at_utc");
    assertMonotonicMs(monotonic_ms, "audit.monotonic_ms");

    this.#sequence += 1;
    const audit_id = `audit_${input.trace_id.replace(/^trace_/, "")}_${String(this.#sequence).padStart(4, "0")}`;
    const previous_hash = this.#records.at(-1)?.current_hash ?? "GENESIS";
    const recordWithoutHash = {
      schema_version: "nexus.audit_record.v1" as const,
      audit_id,
      tenant_id: input.tenant_id,
      user_id: input.user_id,
      trace_id: input.trace_id,
      action: input.action,
      outcome: input.outcome,
      resource: { ...input.resource },
      occurred_at_utc,
      monotonic_ms,
      task_id: input.task_id,
      attempt_id: input.attempt_id,
      execution_id: input.execution_id,
      conversation_id: input.conversation_id,
      policy_decision_id: input.policy_decision_id,
      details: input.details ? cloneObject(input.details) : undefined,
      previous_hash,
    };
    const record: AuditRecord = {
      ...recordWithoutHash,
      current_hash: hashAuditRecord(recordWithoutHash),
    };
    this.#records.push(record);
    this.#publishAuditEvent(record);
    return cloneRecord(record);
  }

  query(filter: AuditQuery = {}): readonly AuditRecord[] {
    if (filter.tenant_id !== undefined) assertPlatformId("tenant_id", filter.tenant_id);
    if (filter.trace_id !== undefined) assertPlatformId("trace_id", filter.trace_id);
    if (filter.task_id !== undefined) assertPlatformId("task_id", filter.task_id);
    return this.#records
      .filter((record) => filter.tenant_id === undefined || record.tenant_id === filter.tenant_id)
      .filter((record) => filter.trace_id === undefined || record.trace_id === filter.trace_id)
      .filter((record) => filter.task_id === undefined || record.task_id === filter.task_id)
      .filter((record) => filter.action === undefined || record.action === filter.action)
      .filter((record) => filter.outcome === undefined || record.outcome === filter.outcome)
      .map(cloneRecord);
  }

  verifyChain(records: readonly AuditRecord[] = this.#records): boolean {
    let previous_hash = "GENESIS";
    for (const record of records) {
      if (record.previous_hash !== previous_hash) return false;
      const { current_hash, ...withoutCurrentHash } = record;
      if (current_hash !== hashAuditRecord(withoutCurrentHash)) return false;
      previous_hash = current_hash;
    }
    return true;
  }

  assertChainValid(records: readonly AuditRecord[] = this.#records): void {
    if (!this.verifyChain(records)) {
      throw new AuditLogError("PLATFORM_AUDIT_CHAIN_BROKEN", "Audit hash chain verification failed");
    }
  }

  #assertInput(input: AuditRecordInput): void {
    assertPlatformId("tenant_id", input.tenant_id);
    assertPlatformId("user_id", input.user_id);
    assertPlatformId("trace_id", input.trace_id);
    if (!input.action.trim()) {
      throw new AuditLogError("PLATFORM_INVALID_REQUEST", "Audit action is required");
    }
    if (!input.resource?.kind || !input.resource?.id?.trim()) {
      throw new AuditLogError("PLATFORM_INVALID_REQUEST", "Audit resource kind and id are required");
    }
    if (input.resource.tenant_id !== undefined) {
      assertPlatformId("tenant_id", input.resource.tenant_id);
      if (input.resource.tenant_id !== input.tenant_id) {
        throw new AuditLogError("PLATFORM_CROSS_TENANT_ID", "Audit record cannot claim a resource from another tenant", {
          tenant_id: input.tenant_id,
          resource_tenant_id: input.resource.tenant_id,
        });
      }
    }
    if (input.task_id !== undefined) assertPlatformId("task_id", input.task_id);
    if (input.attempt_id !== undefined) assertPlatformId("attempt_id", input.attempt_id);
    if (input.execution_id !== undefined) assertPlatformId("execution_id", input.execution_id);
    if (input.conversation_id !== undefined) assertPlatformId("conversation_id", input.conversation_id);
  }

  #publishAuditEvent(record: AuditRecord): void {
    this.#eventBus?.publish({
      schema_version: "nexus.event_envelope.v1",
      event_id: `event_${record.audit_id}`,
      event_type: "audit.recorded",
      tenant_id: record.tenant_id,
      user_id: record.user_id,
      task_id: record.task_id,
      attempt_id: record.attempt_id,
      execution_id: record.execution_id,
      conversation_id: record.conversation_id,
      trace_id: record.trace_id,
      occurred_at_utc: record.occurred_at_utc,
      monotonic_ms: record.monotonic_ms,
      producer: { service: "audit", component: "local-audit-log" },
      subject: { kind: "audit", id: record.audit_id },
      payload: {
        audit_id: record.audit_id,
        action: record.action,
        outcome: record.outcome,
        resource: record.resource,
        current_hash: record.current_hash,
      },
    } satisfies PlatformEventEnvelope);
  }
}

function hashAuditRecord(record: Omit<AuditRecord, "current_hash">): string {
  return createHash("sha256").update(JSON.stringify(record)).digest("hex");
}

function cloneRecord(record: AuditRecord): AuditRecord {
  return JSON.parse(JSON.stringify(record)) as AuditRecord;
}

function cloneObject(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
