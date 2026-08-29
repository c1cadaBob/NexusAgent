import { type PlatformClock, SystemClock } from "../clock/index.ts";
import { assertMonotonicMs, assertPlatformId, assertUtcTimestamp } from "../task-state/index.ts";

export const OBSERVABILITY_READINESS_SCHEMA_VERSION = "nexus.observability_readiness.p8.v1";

export type P8ReadinessStatus = "ready" | "degraded" | "blocked";
export type P8AlertSeverity = "info" | "warning" | "critical";

export interface ObservabilityReadinessSignal {
  signal: string;
  status: P8ReadinessStatus;
  severity: P8AlertSeverity;
  reason_code: string;
  labels: Record<string, string>;
}

export interface ObservabilityReadinessInput {
  tenant_id: string;
  trace_id: string;
  service: string;
  rpo_minutes: number;
  rto_hours: number;
  backend_defaults: Record<string, string>;
  signals: readonly ObservabilityReadinessSignal[];
  clock?: PlatformClock;
}

export interface ObservabilityReadinessReport {
  schema_version: typeof OBSERVABILITY_READINESS_SCHEMA_VERSION;
  tenant_id: string;
  trace_id: string;
  service: string;
  status: P8ReadinessStatus;
  rpo_minutes: number;
  rto_hours: number;
  backend_defaults: Record<string, string>;
  signals: readonly ObservabilityReadinessSignal[];
  checked_at_utc: string;
  monotonic_ms: number;
}

export class ObservabilityReadinessError extends Error {
  readonly code: "PLATFORM_INVALID_REQUEST";
  readonly details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "ObservabilityReadinessError";
    this.code = "PLATFORM_INVALID_REQUEST";
    this.details = details;
  }
}

const BACKEND_VALUES = new Set([
  "nats_jetstream",
  "s3_compatible_object_store",
  "vault",
  "postgres_pgvector",
  "otel_prometheus_loki_tempo",
]);

const BLOCKED_MARKER = /(?:raw_credential|credential_material|native_(?:url|path|session|error)|provider_runtime|https?:\/\/|\/(?:opt|tmp|var|etc|home|usr)\/)/i;

export function buildObservabilityReadiness(input: ObservabilityReadinessInput): ObservabilityReadinessReport {
  assertPlatformId("tenant_id", input.tenant_id);
  assertPlatformId("trace_id", input.trace_id);
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(input.service)) {
    throw new ObservabilityReadinessError("Invalid service name", { service: input.service });
  }
  assertPositiveInteger(input.rpo_minutes, "rpo_minutes");
  assertPositiveInteger(input.rto_hours, "rto_hours");
  const backend_defaults = sanitizeBackends(input.backend_defaults);
  const signals = input.signals.map((signal) => sanitizeSignal(signal));
  if (signals.length === 0) throw new ObservabilityReadinessError("Readiness signals are required");
  const reading = (input.clock ?? new SystemClock()).now();
  assertUtcTimestamp(reading.utc_timestamp, "observability_readiness.checked_at_utc");
  assertMonotonicMs(reading.monotonic_ms, "observability_readiness.monotonic_ms");
  return {
    schema_version: OBSERVABILITY_READINESS_SCHEMA_VERSION,
    tenant_id: input.tenant_id,
    trace_id: input.trace_id,
    service: input.service,
    status: summarizeStatus(signals),
    rpo_minutes: input.rpo_minutes,
    rto_hours: input.rto_hours,
    backend_defaults,
    signals,
    checked_at_utc: reading.utc_timestamp,
    monotonic_ms: reading.monotonic_ms,
  };
}

function sanitizeBackends(backends: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(backends)) {
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(key)) throw new ObservabilityReadinessError("Invalid backend key", { key });
    if (!BACKEND_VALUES.has(value)) throw new ObservabilityReadinessError("Unsupported backend value", { key, value });
    sanitized[key] = value;
  }
  return sanitized;
}

function sanitizeSignal(signal: ObservabilityReadinessSignal): ObservabilityReadinessSignal {
  if (!/^[a-z][a-z0-9_.-]{1,127}$/.test(signal.signal)) throw new ObservabilityReadinessError("Invalid readiness signal", { signal: signal.signal });
  if (!["ready", "degraded", "blocked"].includes(signal.status)) throw new ObservabilityReadinessError("Invalid readiness status", { status: signal.status });
  if (!["info", "warning", "critical"].includes(signal.severity)) throw new ObservabilityReadinessError("Invalid alert severity", { severity: signal.severity });
  if (!/^[A-Z0-9_]{3,80}$/.test(signal.reason_code)) throw new ObservabilityReadinessError("Invalid readiness reason code", { reason_code: signal.reason_code });
  const labels = sanitizeLabels(signal.labels);
  return { ...signal, labels };
}

function sanitizeLabels(labels: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(labels ?? {})) {
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(key)) throw new ObservabilityReadinessError("Invalid readiness label key", { key });
    if (typeof value !== "string" || !value.trim() || BLOCKED_MARKER.test(value)) {
      throw new ObservabilityReadinessError("Readiness label contains non-platform data", { key });
    }
    sanitized[key] = value;
  }
  return sanitized;
}

function summarizeStatus(signals: readonly ObservabilityReadinessSignal[]): P8ReadinessStatus {
  if (signals.some((signal) => signal.status === "blocked")) return "blocked";
  if (signals.some((signal) => signal.status === "degraded")) return "degraded";
  return "ready";
}

function assertPositiveInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new ObservabilityReadinessError("Positive integer is required", { field, value });
  }
  return Number(value);
}
