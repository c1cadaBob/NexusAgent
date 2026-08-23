import { assertPlatformId } from "../task-state/index.ts";
import { type PlatformClock, SystemClock } from "../clock/index.ts";
import { type EventBus, type PlatformEventEnvelope } from "../event-bus/index.ts";

export const MEMORY_LAYERS = ["session", "user", "agent_skill", "organization", "audit_snapshot"] as const;
export type MemoryLayer = (typeof MEMORY_LAYERS)[number];

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
}

export interface QueryMemoryInput {
  scope: MemoryScope;
  layer?: MemoryLayer;
  query?: string;
  trace_id: string;
}

export class MemoryGatewayError extends Error {
  readonly code: "PLATFORM_INVALID_REQUEST" | "PLATFORM_FORBIDDEN" | "PLATFORM_NOT_FOUND";
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

function cloneMemory(record: MemoryRecord): MemoryRecord {
  return JSON.parse(JSON.stringify(record)) as MemoryRecord;
}
