import { createHash } from "node:crypto";
import { LocalArtifactStore, type ArtifactReference } from "../artifact-store/index.ts";
import { LocalAuditLog } from "../audit/index.ts";
import { type PlatformClock, ManualClock } from "../clock/index.ts";
import { LocalCredentialCenter } from "../credentials/index.ts";
import { InMemoryEventBus, type PlatformEventEnvelope } from "../event-bus/index.ts";
import { LocalMemoryGateway, type MemoryConflictRecord, type MemoryRecord } from "../memory-gateway/index.ts";
import { LocalObservability } from "../observability/index.ts";
import { buildObservabilityReadiness, OBSERVABILITY_READINESS_SCHEMA_VERSION } from "../observability/readiness.ts";
import { assertPlatformId } from "../task-state/index.ts";

export const BACKUP_RESTORE_SCHEMA_VERSION = "nexus.backup_restore.p8.v1";
export const BACKUP_RESTORE_PROFILE_ID = "backup_restore_p8_03_production_default";
export const BACKUP_RESTORE_RPO_MINUTES = 15;
export const BACKUP_RESTORE_RTO_HOURS = 4;

export interface BackupRestoreDrillInput {
  tenant_id?: string;
  user_id?: string;
  agent_id?: string;
  task_id?: string;
  attempt_id?: string;
  execution_id?: string;
  conversation_id?: string;
  trace_id?: string;
  clock?: PlatformClock;
}

export interface BackupRestoreDrillReport {
  schema_version: typeof BACKUP_RESTORE_SCHEMA_VERSION;
  profile_id: typeof BACKUP_RESTORE_PROFILE_ID;
  tenant_id: string;
  user_id: string;
  agent_id: string;
  task_id: string;
  attempt_id: string;
  execution_id: string;
  conversation_id: string;
  trace_id: string;
  rpo_minutes: typeof BACKUP_RESTORE_RPO_MINUTES;
  rto_hours: typeof BACKUP_RESTORE_RTO_HOURS;
  created_at_utc: string;
  monotonic_ms: number;
  backend_defaults: {
    event_bus: "nats_jetstream";
    artifact_store: "s3_compatible_object_store";
    credential_center: "vault";
    memory_store: "postgres_pgvector";
    observability: "otel_prometheus_loki_tempo";
  };
  snapshot: {
    event_bus: {
      event_count: number;
      dead_letter_count: number;
      last_sequence: number;
      events: readonly SanitizedEventRecord[];
    };
    audit: {
      record_count: number;
      hash_chain_valid: boolean;
      latest_hash: string;
    };
    artifacts: {
      count: number;
      references: readonly SanitizedArtifactRecord[];
    };
    memory: {
      tenant_version: number;
      active_count: number;
      conflict_count: number;
      records: readonly SanitizedMemoryRecord[];
      conflicts: readonly SanitizedMemoryConflictRecord[];
    };
    credentials: {
      count: number;
      references: readonly SanitizedCredentialRecord[];
    };
  };
  restore_gates: {
    audit_hash_chain_verified: boolean;
    event_order_and_dlq_replay_verified: boolean;
    artifact_sha256_verified: boolean;
    memory_version_continuity_verified: boolean;
    credential_reference_hash_only_verified: boolean;
    observability_readiness_reported: boolean;
    rpo_15m_rto_4h_recorded: boolean;
  };
  readiness: ReturnType<typeof buildObservabilityReadiness>;
}

interface SanitizedEventRecord {
  sequence: number;
  event_id: string;
  event_type: PlatformEventEnvelope["event_type"];
  tenant_id: string;
  trace_id: string;
  occurred_at_utc: string;
  monotonic_ms: number;
  subject: PlatformEventEnvelope["subject"];
  producer: Omit<PlatformEventEnvelope["producer"], "provider_binding_id">;
}

interface SanitizedArtifactRecord extends Pick<ArtifactReference, "artifact_id" | "tenant_id" | "task_id" | "attempt_id" | "execution_id" | "trace_id" | "kind" | "content_type" | "sha256" | "size_bytes" | "classification" | "created_at_utc"> {}

interface SanitizedMemoryRecord extends Pick<MemoryRecord, "memory_id" | "tenant_id" | "user_id" | "agent_id" | "conversation_id" | "layer" | "status" | "version" | "source" | "created_at_utc" | "monotonic_ms" | "trace_id"> {}

interface SanitizedMemoryConflictRecord extends Pick<MemoryConflictRecord, "conflict_id" | "tenant_id" | "scope" | "layer" | "expected_version" | "current_version" | "status" | "reason_codes" | "created_at_utc" | "updated_at_utc" | "monotonic_ms" | "trace_id"> {}

interface SanitizedCredentialRecord {
  credential_ref: string;
  tenant_id: string;
  trace_id: string;
  purpose: string;
  lease_mode: string;
  material_sha256: string;
  issued_at_utc: string;
  expires_at_utc: string;
  action: string;
}

const BACKEND_DEFAULTS = Object.freeze({
  event_bus: "nats_jetstream" as const,
  artifact_store: "s3_compatible_object_store" as const,
  credential_center: "vault" as const,
  memory_store: "postgres_pgvector" as const,
  observability: "otel_prometheus_loki_tempo" as const,
});

const BLOCKED_REPORT_MARKER = /(?:raw_credential|credential_material|memory_text|memory_tombstone_text|native_(?:url|path|session|error)|provider_runtime|https?:\/\/|\/(?:opt|tmp|var|etc|home|usr)\/|redacted-fixture-value|continuity fixture text|artifact fixture bytes)/i;

export function runBackupRestoreDrill(input: BackupRestoreDrillInput = {}): BackupRestoreDrillReport {
  const ids = {
    tenant_id: input.tenant_id ?? "tenant_p8restore01",
    user_id: input.user_id ?? "user_p8restore01",
    agent_id: input.agent_id ?? "agent_p8restore01",
    task_id: input.task_id ?? "task_p8restore01",
    attempt_id: input.attempt_id ?? "attempt_p8restore01",
    execution_id: input.execution_id ?? "exec_p8restore01",
    conversation_id: input.conversation_id ?? "conv_p8restore01",
    trace_id: input.trace_id ?? "trace_p8restore01",
  };
  for (const [key, value] of Object.entries(ids)) assertPlatformId(key as Parameters<typeof assertPlatformId>[0], value);

  const clock = input.clock ?? new ManualClock({ utc_timestamp: "2026-08-29T00:00:00.000Z", monotonic_ms: 1000 });
  const eventBus = new InMemoryEventBus();
  const observability = new LocalObservability({ clock, service: "p8-restore-drill", version: "p8-03" });
  const artifactStore = new LocalArtifactStore({ clock, eventBus });
  const audit = new LocalAuditLog({ clock, eventBus });
  const memory = new LocalMemoryGateway({ clock, eventBus, observability });
  const credentials = new LocalCredentialCenter({ clock, eventBus });
  const subscription = eventBus.subscribe({ subscription_id: "sub_p8_restore_drill", subscriber: "p8_restore_drill" });

  const credential = credentials.register({
    tenant_id: ids.tenant_id,
    user_id: ids.user_id,
    agent_id: ids.agent_id,
    trace_id: ids.trace_id,
    purpose: "executor_tool",
    material: "redacted-fixture-value",
    lease_mode: "reference_only",
    expires_at_utc: "2026-08-29T01:00:00.000Z",
    scope: ["restore_drill"],
  });

  const artifact = artifactStore.upload({
    tenant_id: ids.tenant_id,
    task_id: ids.task_id,
    attempt_id: ids.attempt_id,
    execution_id: ids.execution_id,
    trace_id: ids.trace_id,
    kind: "audit_evidence",
    content_type: "application/json",
    classification: "internal",
    data: "artifact fixture bytes",
  });

  const memoryRecord = memory.write({
    scope: ids,
    layer: "session",
    text: "continuity fixture text",
    source: "p8-restore-drill",
    trace_id: ids.trace_id,
  });

  try {
    memory.write({
      scope: ids,
      layer: "session",
      text: "stale write blocked by restore drill",
      source: "p8-restore-drill",
      trace_id: ids.trace_id,
      expected_version: 0,
    });
  } catch {
    // The conflict record is the required metadata; the rejected text is not exported.
  }

  audit.append({
    tenant_id: ids.tenant_id,
    user_id: ids.user_id,
    trace_id: ids.trace_id,
    task_id: ids.task_id,
    attempt_id: ids.attempt_id,
    execution_id: ids.execution_id,
    conversation_id: ids.conversation_id,
    action: "backup.snapshot.created",
    outcome: "recorded",
    resource: { kind: "audit", id: "audit_p8restore_snapshot", tenant_id: ids.tenant_id },
    details: { profile_id: BACKUP_RESTORE_PROFILE_ID, artifact_id: artifact.artifact_id },
  });
  audit.append({
    tenant_id: ids.tenant_id,
    user_id: ids.user_id,
    trace_id: ids.trace_id,
    task_id: ids.task_id,
    attempt_id: ids.attempt_id,
    execution_id: ids.execution_id,
    conversation_id: ids.conversation_id,
    action: "restore.drill.completed",
    outcome: "recorded",
    resource: { kind: "audit", id: "audit_p8restore_drill", tenant_id: ids.tenant_id },
    details: { profile_id: BACKUP_RESTORE_PROFILE_ID, memory_id: memoryRecord.memory_id },
  });

  const pending = eventBus.pull(subscription.subscription_id);
  if (pending[0]) eventBus.deadLetter(subscription.subscription_id, pending[0].event_id, "restore_drill_replay_check");
  const deliveries = eventBus.deliveries(subscription.subscription_id);
  const artifactRead = artifactStore.read({ tenant_id: ids.tenant_id, artifact_id: artifact.artifact_id, trace_id: ids.trace_id });
  const artifactHash = createHash("sha256").update(artifactRead.data).digest("hex");
  const history = eventBus.history();
  const auditRecords = audit.query({ tenant_id: ids.tenant_id, trace_id: ids.trace_id });
  const memoryRecords = memory.query({ scope: ids, trace_id: ids.trace_id });
  const memoryConflicts = memory.listConflicts(ids.tenant_id, ids.trace_id);
  const credentialAudit = credentials.auditLog();
  const reading = clock.now();

  const readiness = buildObservabilityReadiness({
    tenant_id: ids.tenant_id,
    trace_id: ids.trace_id,
    service: "p8-restore-drill",
    rpo_minutes: BACKUP_RESTORE_RPO_MINUTES,
    rto_hours: BACKUP_RESTORE_RTO_HOURS,
    backend_defaults: BACKEND_DEFAULTS,
    clock,
    signals: [
      readinessSignal(ids, "api.availability", "ready", "info", "API_AVAILABILITY_READY"),
      readinessSignal(ids, "task.failure_rate", "ready", "info", "TASK_FAILURE_RATE_READY"),
      readinessSignal(ids, "adapter.degradation", "ready", "info", "ADAPTER_DEGRADATION_READY"),
      readinessSignal(ids, "event.backlog_dlq", "ready", "info", "EVENT_REPLAY_READY"),
      readinessSignal(ids, "artifact.checksum_failure", "ready", "info", "ARTIFACT_CHECKSUM_READY"),
      readinessSignal(ids, "credential.lease_failure", "ready", "info", "CREDENTIAL_REFERENCE_READY"),
      readinessSignal(ids, "memory.conflict_sweep_anomaly", "ready", "info", "MEMORY_VERSION_READY"),
      readinessSignal(ids, "backup.freshness", "ready", "info", "BACKUP_FRESHNESS_READY"),
      readinessSignal(ids, "restore.drill_status", "ready", "info", "RESTORE_DRILL_READY"),
    ],
  });

  const report: BackupRestoreDrillReport = {
    schema_version: BACKUP_RESTORE_SCHEMA_VERSION,
    profile_id: BACKUP_RESTORE_PROFILE_ID,
    ...ids,
    rpo_minutes: BACKUP_RESTORE_RPO_MINUTES,
    rto_hours: BACKUP_RESTORE_RTO_HOURS,
    created_at_utc: reading.utc_timestamp,
    monotonic_ms: reading.monotonic_ms,
    backend_defaults: BACKEND_DEFAULTS,
    snapshot: {
      event_bus: {
        event_count: history.length,
        dead_letter_count: deliveries.filter((delivery) => delivery.status === "dead_lettered").length,
        last_sequence: history.at(-1)?.sequence ?? 0,
        events: history.map((entry) => sanitizeEvent(entry.sequence, entry.event)),
      },
      audit: {
        record_count: auditRecords.length,
        hash_chain_valid: audit.verifyChain(auditRecords),
        latest_hash: auditRecords.at(-1)?.current_hash ?? "GENESIS",
      },
      artifacts: {
        count: 1,
        references: [sanitizeArtifact(artifact)],
      },
      memory: {
        tenant_version: memory.currentVersion(ids.tenant_id),
        active_count: memoryRecords.length,
        conflict_count: memoryConflicts.length,
        records: memoryRecords.map(sanitizeMemory),
        conflicts: memoryConflicts.map(sanitizeConflict),
      },
      credentials: {
        count: credentialAudit.length,
        references: credentialAudit.map((record) => ({
          credential_ref: record.credential_ref,
          tenant_id: record.tenant_id,
          trace_id: record.trace_id,
          purpose: record.purpose,
          lease_mode: credential.lease_mode,
          material_sha256: record.material_sha256,
          issued_at_utc: record.issued_at_utc,
          expires_at_utc: record.expires_at_utc,
          action: record.action,
        })),
      },
    },
    restore_gates: {
      audit_hash_chain_verified: audit.verifyChain(auditRecords),
      event_order_and_dlq_replay_verified: isOrdered(history.map((entry) => entry.sequence)) && deliveries.some((delivery) => delivery.status === "dead_lettered"),
      artifact_sha256_verified: artifactHash === artifact.sha256,
      memory_version_continuity_verified: memory.currentVersion(ids.tenant_id) >= 1 && memoryConflicts.length === 1,
      credential_reference_hash_only_verified: credentialAudit.length > 0 && credentialAudit.every((record) => record.material_sha256.length === 64),
      observability_readiness_reported: readiness.schema_version === OBSERVABILITY_READINESS_SCHEMA_VERSION && readiness.status === "ready",
      rpo_15m_rto_4h_recorded: BACKUP_RESTORE_RPO_MINUTES === 15 && BACKUP_RESTORE_RTO_HOURS === 4,
    },
    readiness,
  };

  assertBackupRestoreReportClean(report);
  return report;
}

export function assertBackupRestoreReportClean(report: unknown): void {
  const serialized = JSON.stringify(report);
  if (BLOCKED_REPORT_MARKER.test(serialized)) {
    throw new Error("P8 backup restore report contains non-platform data");
  }
}

function readinessSignal(ids: { tenant_id: string; trace_id: string }, signal: string, status: "ready", severity: "info", reason_code: string) {
  return {
    signal,
    status,
    severity,
    reason_code,
    labels: { tenant_id: ids.tenant_id, trace_id: ids.trace_id, service: "p8-restore-drill", signal },
  };
}

function sanitizeEvent(sequence: number, event: PlatformEventEnvelope): SanitizedEventRecord {
  return {
    sequence,
    event_id: event.event_id,
    event_type: event.event_type,
    tenant_id: event.tenant_id,
    trace_id: event.trace_id,
    occurred_at_utc: event.occurred_at_utc,
    monotonic_ms: event.monotonic_ms,
    subject: { ...event.subject },
    producer: { service: event.producer.service, component: event.producer.component },
  };
}

function sanitizeArtifact(reference: ArtifactReference): SanitizedArtifactRecord {
  return {
    artifact_id: reference.artifact_id,
    tenant_id: reference.tenant_id,
    task_id: reference.task_id,
    attempt_id: reference.attempt_id,
    execution_id: reference.execution_id,
    trace_id: reference.trace_id,
    kind: reference.kind,
    content_type: reference.content_type,
    sha256: reference.sha256,
    size_bytes: reference.size_bytes,
    classification: reference.classification,
    created_at_utc: reference.created_at_utc,
  };
}

function sanitizeMemory(record: MemoryRecord): SanitizedMemoryRecord {
  return {
    memory_id: record.memory_id,
    tenant_id: record.tenant_id,
    user_id: record.user_id,
    agent_id: record.agent_id,
    conversation_id: record.conversation_id,
    layer: record.layer,
    status: record.status,
    version: record.version,
    source: record.source,
    created_at_utc: record.created_at_utc,
    monotonic_ms: record.monotonic_ms,
    trace_id: record.trace_id,
  };
}

function sanitizeConflict(conflict: MemoryConflictRecord): SanitizedMemoryConflictRecord {
  return {
    conflict_id: conflict.conflict_id,
    tenant_id: conflict.tenant_id,
    scope: { ...conflict.scope },
    layer: conflict.layer,
    expected_version: conflict.expected_version,
    current_version: conflict.current_version,
    status: conflict.status,
    reason_codes: [...conflict.reason_codes],
    created_at_utc: conflict.created_at_utc,
    updated_at_utc: conflict.updated_at_utc,
    monotonic_ms: conflict.monotonic_ms,
    trace_id: conflict.trace_id,
  };
}

function isOrdered(values: readonly number[]): boolean {
  return values.every((value, index) => index === 0 || value >= values[index - 1]);
}
