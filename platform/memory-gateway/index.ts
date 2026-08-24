import { assertPlatformId } from "../task-state/index.ts";
import { type PlatformClock, SystemClock } from "../clock/index.ts";
import { type EventBus, type PlatformEventEnvelope } from "../event-bus/index.ts";

export const MEMORY_LAYERS = ["session", "user", "agent_skill", "organization", "audit_snapshot"] as const;
export type MemoryLayer = (typeof MEMORY_LAYERS)[number];
export const PLANNER_MEMORY_LAYERS = ["session", "user", "agent_skill"] as const;
export type PlannerMemoryLayer = (typeof PLANNER_MEMORY_LAYERS)[number];
export const MEMORY_SNAPSHOT_SCHEMA_VERSION = "nexus.memory_snapshot.p3.v1";

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
  version: number;
  source: string;
  created_at_utc: string;
  monotonic_ms: number;
  trace_id: string;
  user_id?: string;
  agent_id?: string;
  conversation_id?: string;
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
  readonly #records = new Map<string, MemoryRecord>();
  readonly #tenantVersions = new Map<string, number>();
  #sequence = 0;

  constructor(options: { clock?: PlatformClock; eventBus?: EventBus } = {}) {
    this.#clock = options.clock ?? new SystemClock();
    this.#eventBus = options.eventBus;
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
    return cloneMemory(record);
  }

  #nextMemoryId(tenantId: string): string {
    this.#sequence += 1;
    return `memory_${tenantId.replace(/^tenant_/, "")}_${String(this.#sequence).padStart(4, "0")}`;
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
  if (/"(?:path|file_path|native_path|native_session_id|native_error|url)"\s*:/i.test(text)) {
    throw new MemoryGatewayError("PLATFORM_INVALID_REQUEST", "Planner memory proxy payload contains non-platform fields");
  }
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
