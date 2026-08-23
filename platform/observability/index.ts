import { type PlatformClock, SystemClock } from "../clock/index.ts";
import { assertMonotonicMs, assertPlatformId, assertUtcTimestamp } from "../task-state/index.ts";

export interface TraceContext {
  tenant_id: string;
  trace_id: string;
  user_id?: string;
  agent_id?: string;
  task_id?: string;
  attempt_id?: string;
  execution_id?: string;
  conversation_id?: string;
}

export interface HealthStatus {
  service: string;
  version: string;
  status: "ok" | "degraded";
  checked_at_utc: string;
  monotonic_ms: number;
  checks: readonly string[];
}

export interface MetricPoint extends TraceContext {
  name: string;
  value: number;
  labels?: Record<string, string>;
  recorded_at_utc: string;
  monotonic_ms: number;
}

export interface StructuredLogRecord extends TraceContext {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  component: string;
  fields?: Record<string, unknown>;
  recorded_at_utc: string;
  monotonic_ms: number;
}

export interface TraceTimelineEntry extends TraceContext {
  kind: "metric" | "log";
  name: string;
  recorded_at_utc: string;
  monotonic_ms: number;
  summary: string;
}

export class ObservabilityError extends Error {
  readonly code: "PLATFORM_INVALID_REQUEST";
  readonly details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "ObservabilityError";
    this.code = "PLATFORM_INVALID_REQUEST";
    this.details = details;
  }
}

export class LocalObservability {
  readonly #clock: PlatformClock;
  readonly #service: string;
  readonly #version: string;
  readonly #metrics: MetricPoint[] = [];
  readonly #logs: StructuredLogRecord[] = [];

  constructor(options: { clock?: PlatformClock; service?: string; version?: string } = {}) {
    this.#clock = options.clock ?? new SystemClock();
    this.#service = options.service ?? "nexus-platform";
    this.#version = options.version ?? "p1-local";
  }

  health(checks: readonly string[] = ["service.local"]): HealthStatus {
    const reading = this.#clock.now();
    return {
      service: this.#service,
      version: this.#version,
      status: checks.some((check) => check.startsWith("fail.")) ? "degraded" : "ok",
      checked_at_utc: reading.utc_timestamp,
      monotonic_ms: reading.monotonic_ms,
      checks: [...checks],
    };
  }

  incrementMetric(input: TraceContext & { name: string; value?: number; labels?: Record<string, string>; monotonic_ms?: number; recorded_at_utc?: string }): MetricPoint {
    assertTraceContext(input);
    if (!/^[a-z][a-z0-9_.-]{1,127}$/.test(input.name)) {
      throw new ObservabilityError("Invalid metric name", { name: input.name });
    }
    const reading = this.#clock.now();
    const point: MetricPoint = {
      ...cloneTraceContext(input),
      name: input.name,
      value: input.value ?? 1,
      labels: input.labels ? { ...input.labels } : undefined,
      recorded_at_utc: input.recorded_at_utc ?? reading.utc_timestamp,
      monotonic_ms: input.monotonic_ms ?? reading.monotonic_ms,
    };
    assertUtcTimestamp(point.recorded_at_utc, "metric.recorded_at_utc");
    assertMonotonicMs(point.monotonic_ms, "metric.monotonic_ms");
    this.#metrics.push(point);
    return cloneMetric(point);
  }

  recordLog(input: TraceContext & { level: StructuredLogRecord["level"]; message: string; component: string; fields?: Record<string, unknown>; monotonic_ms?: number; recorded_at_utc?: string }): StructuredLogRecord {
    assertTraceContext(input);
    if (!input.message.trim()) {
      throw new ObservabilityError("Structured log message is required");
    }
    if (!input.component.trim()) {
      throw new ObservabilityError("Structured log component is required");
    }
    const reading = this.#clock.now();
    const record: StructuredLogRecord = {
      ...cloneTraceContext(input),
      level: input.level,
      message: input.message,
      component: input.component,
      fields: input.fields ? JSON.parse(JSON.stringify(input.fields)) as Record<string, unknown> : undefined,
      recorded_at_utc: input.recorded_at_utc ?? reading.utc_timestamp,
      monotonic_ms: input.monotonic_ms ?? reading.monotonic_ms,
    };
    assertUtcTimestamp(record.recorded_at_utc, "log.recorded_at_utc");
    assertMonotonicMs(record.monotonic_ms, "log.monotonic_ms");
    this.#logs.push(record);
    return cloneLog(record);
  }

  metrics(filter: Partial<TraceContext> = {}): readonly MetricPoint[] {
    return this.#metrics.filter((point) => matchesTraceFilter(point, filter)).map(cloneMetric);
  }

  logs(filter: Partial<TraceContext> = {}): readonly StructuredLogRecord[] {
    return this.#logs.filter((record) => matchesTraceFilter(record, filter)).map(cloneLog);
  }

  timeline(filter: Partial<TraceContext> = {}): readonly TraceTimelineEntry[] {
    const metricEntries = this.#metrics.filter((point) => matchesTraceFilter(point, filter)).map((point): TraceTimelineEntry => ({
      ...cloneTraceContext(point),
      kind: "metric",
      name: point.name,
      recorded_at_utc: point.recorded_at_utc,
      monotonic_ms: point.monotonic_ms,
      summary: `${point.name}=${point.value}`,
    }));
    const logEntries = this.#logs.filter((record) => matchesTraceFilter(record, filter)).map((record): TraceTimelineEntry => ({
      ...cloneTraceContext(record),
      kind: "log",
      name: record.component,
      recorded_at_utc: record.recorded_at_utc,
      monotonic_ms: record.monotonic_ms,
      summary: record.message,
    }));
    return [...metricEntries, ...logEntries].sort((left, right) => left.monotonic_ms - right.monotonic_ms);
  }
}

export function assertTraceContext(context: TraceContext): TraceContext {
  assertPlatformId("tenant_id", context.tenant_id);
  assertPlatformId("trace_id", context.trace_id);
  if (context.user_id !== undefined) assertPlatformId("user_id", context.user_id);
  if (context.agent_id !== undefined) assertPlatformId("agent_id", context.agent_id);
  if (context.task_id !== undefined) assertPlatformId("task_id", context.task_id);
  if (context.attempt_id !== undefined) assertPlatformId("attempt_id", context.attempt_id);
  if (context.execution_id !== undefined) assertPlatformId("execution_id", context.execution_id);
  if (context.conversation_id !== undefined) assertPlatformId("conversation_id", context.conversation_id);
  return context;
}

function matchesTraceFilter(record: TraceContext, filter: Partial<TraceContext>): boolean {
  for (const [key, value] of Object.entries(filter) as [keyof TraceContext, string | undefined][]) {
    if (value !== undefined && record[key] !== value) return false;
  }
  return true;
}

function cloneTraceContext(context: TraceContext): TraceContext {
  return {
    tenant_id: context.tenant_id,
    trace_id: context.trace_id,
    user_id: context.user_id,
    agent_id: context.agent_id,
    task_id: context.task_id,
    attempt_id: context.attempt_id,
    execution_id: context.execution_id,
    conversation_id: context.conversation_id,
  };
}

function cloneMetric(point: MetricPoint): MetricPoint {
  return JSON.parse(JSON.stringify(point)) as MetricPoint;
}

function cloneLog(record: StructuredLogRecord): StructuredLogRecord {
  return JSON.parse(JSON.stringify(record)) as StructuredLogRecord;
}
