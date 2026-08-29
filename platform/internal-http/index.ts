import http from "node:http";
import { URL } from "node:url";
import {
  invokeLifecycleAdapter,
  type AdapterHealth,
  type LifecycleAdapterPort,
} from "../adapters/index.ts";
import {
  DshExecutorAdapter,
  DshProviderRegistry,
} from "../adapters/dsh/index.ts";
import {
  HermesExecutionPlanAdapter,
  HermesMemoryGatewayAdapter,
  HermesProviderRegistry,
} from "../adapters/hermes/index.ts";
import {
  OpenClawGatewayAdapter,
  OpenClawProviderRegistry,
} from "../adapters/openclaw/index.ts";
import { LocalArtifactStore } from "../artifact-store/index.ts";
import { LocalAuditLog } from "../audit/index.ts";
import { SystemClock, type PlatformClock } from "../clock/index.ts";
import { LocalCredentialCenter } from "../credentials/index.ts";
import {
  InMemoryEventBus,
  type EventBus,
  type PlatformEventEnvelope,
} from "../event-bus/index.ts";
import {
  LocalMemoryGateway,
  type MemoryConflictDecisionInput,
  type MemoryDeleteInput,
  type MemoryRetentionPolicyUpdateInput,
  type MemoryRetentionSweepInput,
  type PlannerMemorySnapshotInput,
  type QueryMemoryInput,
  type WriteMemoryInput,
} from "../memory-gateway/index.ts";
import {
  LocalObservability,
  type HealthStatus,
  type MetricPoint,
  type StructuredLogRecord,
  type TraceContext,
} from "../observability/index.ts";
import type {
  CoordinatorAdapterInvocation,
  CoordinatorAdapterPort,
  CoordinatorAdapterResult,
} from "../coordinator/index.ts";
import { PolicyGate } from "../policy-gate/index.ts";
import { sanitizePublicDetails } from "../public-surface/index.ts";

export const INTERNAL_SERVICE_SCHEMA_VERSION = "nexus.internal_service.p8.v1";
export const INTERNAL_SERVICE_TOKEN_ENV = "NEXUS_INTERNAL_SERVICE_TOKEN";

export type InternalServiceName =
  | "openclaw-adapter"
  | "hermes-adapter"
  | "dsh-adapter"
  | "memory-gateway"
  | "artifact-store"
  | "event-bus"
  | "credential-center"
  | "observability";

export interface InternalServiceOptions {
  serviceName: InternalServiceName;
  port?: number;
  host?: string;
  token?: string;
  clock?: PlatformClock;
}

export interface InternalRuntimeOptions {
  serviceUrls?: Partial<Record<InternalServiceName, string>>;
  token?: string;
  fetchImpl?: typeof fetch;
}

export class InternalServiceError extends Error {
  readonly code:
    | "PLATFORM_INVALID_REQUEST"
    | "PLATFORM_UNAUTHENTICATED"
    | "PLATFORM_FORBIDDEN"
    | "PLATFORM_NOT_FOUND"
    | "PLATFORM_CONFLICT"
    | "PLATFORM_SERVICE_UNHEALTHY"
    | "PLATFORM_INTERNAL_ERROR";
  readonly details: Record<string, unknown>;

  constructor(
    code: InternalServiceError["code"],
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "InternalServiceError";
    this.code = code;
    this.details = sanitizePublicDetails(details);
  }
}

interface InternalRequest {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  body: Record<string, unknown>;
}

interface InternalServiceState {
  serviceName: InternalServiceName;
  clock: PlatformClock;
  eventBus: InMemoryEventBus;
  policyGate: PolicyGate;
  observability: LocalObservability;
  audit: LocalAuditLog;
  memory: LocalMemoryGateway;
  artifactStore: LocalArtifactStore;
  credentials: LocalCredentialCenter;
  adapters: Map<string, LifecycleAdapterPort>;
}

export function createInternalServiceServer(options: InternalServiceOptions): http.Server {
  const state = createServiceState(options);
  const token = options.token ?? process.env[INTERNAL_SERVICE_TOKEN_ENV] ?? "nexus-dev-internal-token";
  const server = http.createServer(async (request, response) => {
    try {
      const input = await parseRequest(request);
      const body = await handleInternalRequest(state, token, input);
      sendJson(response, 200, body);
    } catch (error) {
      const code = errorCode(error);
      const status = statusForCode(code);
      sendJson(response, status, {
        code,
        message: error instanceof Error ? error.message : "Internal service request failed",
        trace_id: traceFromHeaders(request.headers),
        details: errorDetails(error),
      });
    }
  });
  server.listen(options.port ?? Number(process.env.PORT ?? "8080"), options.host ?? "0.0.0.0");
  return server;
}

export function createServiceState(options: InternalServiceOptions): InternalServiceState {
  const clock = options.clock ?? new SystemClock();
  const eventBus = new InMemoryEventBus();
  const observability = new LocalObservability({
    clock,
    service: options.serviceName,
    version: "p8-dev",
  });
  const state: InternalServiceState = {
    serviceName: options.serviceName,
    clock,
    eventBus,
    policyGate: new PolicyGate(),
    observability,
    audit: new LocalAuditLog({ clock, eventBus }),
    memory: new LocalMemoryGateway({ clock, eventBus, observability }),
    artifactStore: new LocalArtifactStore({ clock, eventBus }),
    credentials: new LocalCredentialCenter({ clock, eventBus }),
    adapters: new Map(),
  };

  if (options.serviceName === "openclaw-adapter") {
    const adapter = new OpenClawGatewayAdapter({
      registry: new OpenClawProviderRegistry(),
      eventBus,
    });
    adapter.start();
    state.adapters.set(adapter.name, adapter);
  }
  if (options.serviceName === "hermes-adapter") {
    const registry = new HermesProviderRegistry();
    const planner = new HermesExecutionPlanAdapter({ registry });
    const memory = new HermesMemoryGatewayAdapter({
      registry,
      memoryGateway: state.memory,
      eventBus,
      clock,
    });
    planner.start();
    memory.start();
    state.adapters.set(planner.name, planner);
    state.adapters.set(memory.name, memory);
  }
  if (options.serviceName === "dsh-adapter") {
    const adapter = new DshExecutorAdapter({
      registry: new DshProviderRegistry(),
      artifactStore: state.artifactStore,
      eventBus,
    });
    adapter.start();
    state.adapters.set(adapter.name, adapter);
  }
  return state;
}

async function handleInternalRequest(
  state: InternalServiceState,
  token: string,
  request: InternalRequest,
): Promise<unknown> {
  if (request.path === "/health" || request.path === "/ready" || request.path === "/internal/v1/health" || request.path === "/internal/v1/ready") {
    return serviceHealth(state);
  }
  if (request.path === "/version" || request.path === "/internal/v1/version") {
    return {
      schema_version: INTERNAL_SERVICE_SCHEMA_VERSION,
      service: state.serviceName,
      version: "p8-dev",
      runtime_mode: "platform-governed",
    };
  }
  assertInternalAuth(request, token);

  if (request.path === "/internal/v1/invoke" && request.method === "POST") {
    return invokeAdapter(state, request.body);
  }
  if (state.serviceName === "memory-gateway") return memoryRoute(state, request);
  if (state.serviceName === "artifact-store") return artifactRoute(state, request);
  if (state.serviceName === "event-bus") return eventRoute(state, request);
  if (state.serviceName === "credential-center") return credentialRoute(state, request);
  if (state.serviceName === "observability") return observabilityRoute(state, request);

  throw new InternalServiceError("PLATFORM_NOT_FOUND", "Internal service route not found");
}

function serviceHealth(state: InternalServiceState): HealthStatus & { service_role: string; ready: boolean } {
  const health = state.observability.health([
    "service.local",
    `runtime.${state.serviceName}`,
    ...([...state.adapters.values()].map((adapter) => `adapter.${adapter.health().status}`)),
  ]);
  return {
    ...health,
    service_role: roleForService(state.serviceName),
    ready: health.status === "ok",
  };
}

async function invokeAdapter(state: InternalServiceState, body: Record<string, unknown>): Promise<CoordinatorAdapterResult> {
  const adapterName = requiredString(body.adapter_name, "adapter_name");
  const adapter = state.adapters.get(adapterName);
  if (!adapter) throw new InternalServiceError("PLATFORM_NOT_FOUND", "Adapter is not registered");
  const invocation = normalizeInvocation(body);
  const decision = state.policyGate.evaluate({
    action: "adapter.invoke",
    tenant_id: invocation.tenant_id,
    task_id: invocation.task_id,
    attempt_id: invocation.attempt_id,
    execution_id: invocation.execution_id,
    conversation_id: invocation.conversation_id,
    trace_id: invocation.trace_id,
    monotonic_ms: invocation.monotonic_ms,
    requested_at_utc: requiredString(body.requested_at_utc, "requested_at_utc"),
    principal: {
      tenant_id: invocation.tenant_id,
      user_id: invocation.user_id ?? "user_internal_service",
      roles: ["internal-service"],
      permissions: ["adapter:invoke"],
    },
    route: {
      adapter_kind: adapter.kind,
      adapter_name: adapter.name,
    },
  });
  return invokeLifecycleAdapter(state.policyGate, adapter, {
    ...invocation,
    policy_decision: decision,
  });
}

function memoryRoute(state: InternalServiceState, request: InternalRequest): unknown {
  const body = request.body;
  if (request.path === "/internal/v1/memory/query") return state.memory.query(body as unknown as QueryMemoryInput);
  if (request.path === "/internal/v1/memory/write") return state.memory.write(body as unknown as WriteMemoryInput);
  if (request.path === "/internal/v1/memory/snapshot") return state.memory.plannerSnapshot(body as unknown as PlannerMemorySnapshotInput);
  if (request.path === "/internal/v1/memory/retention" && request.method === "GET") {
    return state.memory.getRetentionPolicy(requiredString(body.tenant_id, "tenant_id"), requiredString(body.trace_id, "trace_id"));
  }
  if (request.path === "/internal/v1/memory/retention" && request.method === "PATCH") return state.memory.updateRetentionPolicy(body as unknown as MemoryRetentionPolicyUpdateInput);
  if (request.path === "/internal/v1/memory/retention/sweep") return state.memory.sweepRetention(body as unknown as MemoryRetentionSweepInput);
  if (request.path === "/internal/v1/memory/conflicts" && request.method === "GET") {
    return state.memory.listConflicts(requiredString(body.tenant_id, "tenant_id"), requiredString(body.trace_id, "trace_id"), body.status as never);
  }
  if (request.path === "/internal/v1/memory/conflicts/get") {
    return state.memory.getConflict(requiredString(body.tenant_id, "tenant_id"), requiredString(body.conflict_id, "conflict_id"));
  }
  if (request.path === "/internal/v1/memory/conflicts/decision") return state.memory.decideConflict(body as unknown as MemoryConflictDecisionInput);
  if (request.path === "/internal/v1/memory/delete") return state.memory.softDeleteMemory(body as unknown as MemoryDeleteInput);
  throw new InternalServiceError("PLATFORM_NOT_FOUND", "Memory service route not found");
}

function artifactRoute(state: InternalServiceState, request: InternalRequest): unknown {
  const body = request.body;
  if (request.path === "/internal/v1/artifacts/upload") return state.artifactStore.upload(body as never);
  if (request.path === "/internal/v1/artifacts/read") {
    const result = state.artifactStore.read(body as never);
    return {
      reference: result.reference,
      data_base64: Buffer.from(result.data).toString("base64"),
    };
  }
  if (request.path === "/internal/v1/artifacts/expire") return state.artifactStore.expire(body as never);
  if (request.path.startsWith("/internal/v1/artifacts/") && request.path.endsWith("/reference")) {
    return state.artifactStore.reference(request.path.split("/")[4]) ?? null;
  }
  throw new InternalServiceError("PLATFORM_NOT_FOUND", "Artifact service route not found");
}

function eventRoute(state: InternalServiceState, request: InternalRequest): unknown {
  const body = request.body;
  if (request.path === "/internal/v1/events/publish") return state.eventBus.publish(body.event as PlatformEventEnvelope);
  if (request.path === "/internal/v1/events/subscribe") return state.eventBus.subscribe(body as never);
  if (request.path === "/internal/v1/events/pull") return state.eventBus.pull(requiredString(body.subscription_id, "subscription_id"));
  if (request.path === "/internal/v1/events/ack") return state.eventBus.ack(requiredString(body.subscription_id, "subscription_id"), requiredString(body.event_id, "event_id"));
  if (request.path === "/internal/v1/events/dead-letter") return state.eventBus.deadLetter(requiredString(body.subscription_id, "subscription_id"), requiredString(body.event_id, "event_id"), requiredString(body.reason, "reason"));
  if (request.path === "/internal/v1/events/history") return state.eventBus.history();
  if (request.path === "/internal/v1/events/deliveries") return state.eventBus.deliveries(requiredString(body.subscription_id, "subscription_id"));
  throw new InternalServiceError("PLATFORM_NOT_FOUND", "Event service route not found");
}

function credentialRoute(state: InternalServiceState, request: InternalRequest): unknown {
  if (request.path === "/internal/v1/credentials/register") return state.credentials.register(request.body as never);
  if (request.path === "/internal/v1/credentials/resolve") {
    return state.credentials.resolveReference(
      requiredString(request.body.tenant_id, "tenant_id"),
      requiredString(request.body.credential_ref, "credential_ref"),
      requiredString(request.body.trace_id, "trace_id"),
    );
  }
  if (request.path === "/internal/v1/credentials/audit") return state.credentials.auditLog();
  throw new InternalServiceError("PLATFORM_NOT_FOUND", "Credential service route not found");
}

function observabilityRoute(state: InternalServiceState, request: InternalRequest): unknown {
  if (request.path === "/internal/v1/observability/metric") return state.observability.incrementMetric(request.body as never);
  if (request.path === "/internal/v1/observability/log") return state.observability.recordLog(request.body as never);
  if (request.path === "/internal/v1/observability/metrics") return state.observability.metrics(request.body as never);
  if (request.path === "/internal/v1/observability/logs") return state.observability.logs(request.body as never);
  if (request.path === "/internal/v1/observability/timeline") return state.observability.timeline(request.body as never);
  throw new InternalServiceError("PLATFORM_NOT_FOUND", "Observability service route not found");
}

export interface DistributedPlatformRuntime {
  eventBus: EventBus;
  observability: DistributedObservability;
  audit: DistributedAuditLog;
  memory: DistributedMemoryGateway;
  credentials: DistributedCredentialCenter;
  adapters: readonly CoordinatorAdapterPort[];
}

export interface DistributedObservability {
  health(checks?: readonly string[]): Promise<HealthStatus>;
  incrementMetric(input: TraceContext & { name: string; value?: number; labels?: Record<string, string>; monotonic_ms?: number; recorded_at_utc?: string }): void;
  recordLog(input: TraceContext & { level: StructuredLogRecord["level"]; message: string; component: string; fields?: Record<string, unknown>; monotonic_ms?: number; recorded_at_utc?: string }): void;
  metrics(filter?: Partial<TraceContext>): Promise<readonly MetricPoint[]>;
  logs(filter?: Partial<TraceContext>): Promise<readonly StructuredLogRecord[]>;
  timeline(filter?: Partial<TraceContext>): Promise<readonly Record<string, unknown>[]>;
}

export interface DistributedAuditLog {
  append(input: Record<string, unknown>): void;
  query(filter?: Record<string, unknown>): Promise<readonly Record<string, unknown>[]>;
  assertChainValid(records?: readonly Record<string, unknown>[]): Promise<void>;
}

export interface DistributedMemoryGateway {
  query(input: QueryMemoryInput): Promise<readonly Record<string, unknown>[]>;
  write(input: WriteMemoryInput): Promise<Record<string, unknown>>;
  plannerSnapshot(input: PlannerMemorySnapshotInput): Promise<Record<string, unknown>>;
  getRetentionPolicy(tenantId: string, traceId: string): Promise<Record<string, unknown>>;
  updateRetentionPolicy(input: MemoryRetentionPolicyUpdateInput): Promise<Record<string, unknown>>;
  sweepRetention(input: MemoryRetentionSweepInput): Promise<Record<string, unknown>>;
  listConflicts(tenantId: string, traceId: string, status?: string): Promise<readonly Record<string, unknown>[]>;
  getConflict(tenantId: string, conflictId: string): Promise<Record<string, unknown>>;
  decideConflict(input: MemoryConflictDecisionInput): Promise<Record<string, unknown>>;
  softDeleteMemory(input: MemoryDeleteInput): Promise<Record<string, unknown>>;
}

export interface DistributedCredentialCenter {
  register(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  resolveReference(tenantId: string, credentialRef: string, traceId: string): Promise<Record<string, unknown>>;
  auditLog(): Promise<readonly Record<string, unknown>[]>;
}

export function createDistributedPlatformRuntime(options: InternalRuntimeOptions = {}): DistributedPlatformRuntime {
  const transport = new InternalHttpTransport(options);
  return {
    eventBus: new RemoteEventBus(transport),
    observability: new RemoteObservability(transport),
    audit: new RemoteAuditLog(transport),
    memory: new RemoteMemoryGateway(transport),
    credentials: new RemoteCredentialCenter(transport),
    adapters: [
      new RemoteAdapterProxy("openclaw-gateway", "channel", transport, "openclaw-adapter"),
      new RemoteAdapterProxy("hermes-execution-plan", "planner", transport, "hermes-adapter"),
      new RemoteAdapterProxy("hermes-memory-gateway", "memory", transport, "hermes-adapter"),
      new RemoteAdapterProxy("dsh-executor", "executor", transport, "dsh-adapter"),
    ],
  };
}

class InternalHttpTransport {
  readonly #urls: Partial<Record<InternalServiceName, string>>;
  readonly #token: string;
  readonly #fetch: typeof fetch;

  constructor(options: InternalRuntimeOptions) {
    this.#urls = options.serviceUrls ?? defaultServiceUrls();
    this.#token = options.token ?? process.env[INTERNAL_SERVICE_TOKEN_ENV] ?? "nexus-dev-internal-token";
    this.#fetch = options.fetchImpl ?? fetch;
  }

  async request<T>(service: InternalServiceName, method: string, path: string, body: Record<string, unknown> = {}): Promise<T> {
    const baseUrl = this.#urls[service];
    if (!baseUrl) throw new InternalServiceError("PLATFORM_SERVICE_UNHEALTHY", "Internal service address is not configured");
    const target = new URL(`${baseUrl.replace(/\/+$/, "")}${path}`);
    if (method === "GET") {
      for (const [key, value] of Object.entries(body)) {
        if (value !== undefined) target.searchParams.set(key, String(value));
      }
    }
    let response: Response;
    try {
      response = await this.#fetch(target, {
        method,
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          authorization: `Bearer ${this.#token}`,
          "x-nexus-caller-service": "platform-api",
        },
        body: method === "GET" ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new InternalServiceError("PLATFORM_SERVICE_UNHEALTHY", "Internal platform service is unavailable");
    }
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      throw new InternalServiceError(
        typeof payload.code === "string" ? payload.code as InternalServiceError["code"] : "PLATFORM_INTERNAL_ERROR",
        typeof payload.message === "string" ? payload.message : "Internal platform service request failed",
        payload.details && typeof payload.details === "object" ? payload.details as Record<string, unknown> : {},
      );
    }
    return payload as T;
  }
}

class RemoteAdapterProxy implements CoordinatorAdapterPort {
  readonly name: string;
  readonly kind: CoordinatorAdapterPort["kind"];
  readonly #transport: InternalHttpTransport;
  readonly #service: InternalServiceName;

  constructor(
    name: string,
    kind: CoordinatorAdapterPort["kind"],
    transport: InternalHttpTransport,
    service: InternalServiceName,
  ) {
    this.name = name;
    this.kind = kind;
    this.#transport = transport;
    this.#service = service;
  }

  async invoke(invocation: CoordinatorAdapterInvocation): Promise<CoordinatorAdapterResult> {
    return this.#transport.request<CoordinatorAdapterResult>(this.#service, "POST", "/internal/v1/invoke", {
      adapter_name: this.name,
      requested_at_utc: new SystemClock().now().utc_timestamp,
      ...invocation,
      policy_decision: undefined,
      principal: {
        tenant_id: invocation.tenant_id,
        user_id: "user_internal_service",
        roles: ["platform-api"],
        permissions: ["adapter:invoke"],
      },
    });
  }
}

class RemoteMemoryGateway implements DistributedMemoryGateway {
  readonly #transport: InternalHttpTransport;

  constructor(transport: InternalHttpTransport) {
    this.#transport = transport;
  }

  query(input: QueryMemoryInput) { return this.#transport.request<readonly Record<string, unknown>[]>("memory-gateway", "POST", "/internal/v1/memory/query", input as never); }
  write(input: WriteMemoryInput) { return this.#transport.request<Record<string, unknown>>("memory-gateway", "POST", "/internal/v1/memory/write", input as never); }
  plannerSnapshot(input: PlannerMemorySnapshotInput) { return this.#transport.request<Record<string, unknown>>("memory-gateway", "POST", "/internal/v1/memory/snapshot", input as never); }
  getRetentionPolicy(tenantId: string, traceId: string) { return this.#transport.request<Record<string, unknown>>("memory-gateway", "GET", "/internal/v1/memory/retention", { tenant_id: tenantId, trace_id: traceId }); }
  updateRetentionPolicy(input: MemoryRetentionPolicyUpdateInput) { return this.#transport.request<Record<string, unknown>>("memory-gateway", "PATCH", "/internal/v1/memory/retention", input as never); }
  sweepRetention(input: MemoryRetentionSweepInput) { return this.#transport.request<Record<string, unknown>>("memory-gateway", "POST", "/internal/v1/memory/retention/sweep", input as never); }
  listConflicts(tenantId: string, traceId: string, status?: string) { return this.#transport.request<readonly Record<string, unknown>[]>("memory-gateway", "GET", "/internal/v1/memory/conflicts", { tenant_id: tenantId, trace_id: traceId, status }); }
  getConflict(tenantId: string, conflictId: string) { return this.#transport.request<Record<string, unknown>>("memory-gateway", "POST", "/internal/v1/memory/conflicts/get", { tenant_id: tenantId, conflict_id: conflictId }); }
  decideConflict(input: MemoryConflictDecisionInput) { return this.#transport.request<Record<string, unknown>>("memory-gateway", "POST", "/internal/v1/memory/conflicts/decision", input as never); }
  softDeleteMemory(input: MemoryDeleteInput) { return this.#transport.request<Record<string, unknown>>("memory-gateway", "POST", "/internal/v1/memory/delete", input as never); }
}

class RemoteEventBus implements EventBus {
  readonly #transport: InternalHttpTransport;

  constructor(transport: InternalHttpTransport) {
    this.#transport = transport;
  }

  publish(event: PlatformEventEnvelope) {
    void this.#transport.request("event-bus", "POST", "/internal/v1/events/publish", { event }).catch(() => undefined);
    return { sequence: 0, duplicate: false, event };
  }
  subscribe(input: Parameters<EventBus["subscribe"]>[0]) {
    void this.#transport.request("event-bus", "POST", "/internal/v1/events/subscribe", input as never).catch(() => undefined);
    return { subscription_id: input.subscription_id ?? `sub_remote_${input.subscriber}`, subscriber: input.subscriber, filter: input.filter };
  }
  pull(subscriptionId: string) { return [] as never; }
  ack(subscriptionId: string, eventId: string) { void this.#transport.request("event-bus", "POST", "/internal/v1/events/ack", { subscription_id: subscriptionId, event_id: eventId }).catch(() => undefined); return true; }
  deadLetter(subscriptionId: string, eventId: string, reason: string) { void this.#transport.request("event-bus", "POST", "/internal/v1/events/dead-letter", { subscription_id: subscriptionId, event_id: eventId, reason }).catch(() => undefined); return true; }
}

class RemoteObservability implements DistributedObservability {
  readonly #transport: InternalHttpTransport;

  constructor(transport: InternalHttpTransport) {
    this.#transport = transport;
  }

  async health(checks: readonly string[] = ["service.local"]) {
    return this.#transport.request<HealthStatus>("observability", "GET", "/internal/v1/health", { checks });
  }
  incrementMetric(input: TraceContext & { name: string; value?: number; labels?: Record<string, string>; monotonic_ms?: number; recorded_at_utc?: string }): void {
    void this.#transport.request("observability", "POST", "/internal/v1/observability/metric", input as never).catch(() => undefined);
  }
  recordLog(input: TraceContext & { level: StructuredLogRecord["level"]; message: string; component: string; fields?: Record<string, unknown>; monotonic_ms?: number; recorded_at_utc?: string }): void {
    void this.#transport.request("observability", "POST", "/internal/v1/observability/log", input as never).catch(() => undefined);
  }
  metrics(filter: Partial<TraceContext> = {}) { return this.#transport.request<readonly MetricPoint[]>("observability", "GET", "/internal/v1/observability/metrics", filter as never); }
  logs(filter: Partial<TraceContext> = {}) { return this.#transport.request<readonly StructuredLogRecord[]>("observability", "GET", "/internal/v1/observability/logs", filter as never); }
  timeline(filter: Partial<TraceContext> = {}) { return this.#transport.request<readonly Record<string, unknown>[]>("observability", "GET", "/internal/v1/observability/timeline", filter as never); }
}

class RemoteAuditLog implements DistributedAuditLog {
  readonly #transport: InternalHttpTransport;

  constructor(transport: InternalHttpTransport) {
    this.#transport = transport;
  }
  append(input: Record<string, unknown>): void {
    const tenantId = String(input.tenant_id ?? "tenant_internal01");
    const traceId = String(input.trace_id ?? "trace_internal_audit");
    const auditId = typeof input.resource === "object" && input.resource !== null && "id" in input.resource
      ? String((input.resource as { id?: unknown }).id ?? "audit_internal")
      : "audit_internal";
    const event: PlatformEventEnvelope = {
      schema_version: "nexus.event_envelope.v1",
      event_id: `event_audit_${traceId.replace(/^trace_/, "")}_${auditId.replace(/[^A-Za-z0-9_-]/g, "_")}`,
      event_type: "audit.recorded",
      tenant_id: tenantId,
      trace_id: traceId,
      occurred_at_utc: String(input.occurred_at_utc ?? new SystemClock().now().utc_timestamp),
      monotonic_ms: Number(input.monotonic_ms ?? new SystemClock().now().monotonic_ms),
      producer: { service: "platform-api", component: "distributed-audit-client" },
      subject: { kind: "audit", id: auditId },
      payload: {
        action: input.action,
        outcome: input.outcome,
        resource: input.resource,
      },
      ...(typeof input.user_id === "string" ? { user_id: input.user_id } : {}),
    };
    void this.#transport.request("event-bus", "POST", "/internal/v1/events/publish", { event }).catch(() => undefined);
  }
  query(): Promise<readonly Record<string, unknown>[]> { return Promise.resolve([]); }
  assertChainValid(): Promise<void> { return Promise.resolve(); }
}

class RemoteCredentialCenter implements DistributedCredentialCenter {
  readonly #transport: InternalHttpTransport;

  constructor(transport: InternalHttpTransport) {
    this.#transport = transport;
  }
  register(input: Record<string, unknown>) { return this.#transport.request<Record<string, unknown>>("credential-center", "POST", "/internal/v1/credentials/register", input); }
  resolveReference(tenantId: string, credentialRef: string, traceId: string) { return this.#transport.request<Record<string, unknown>>("credential-center", "POST", "/internal/v1/credentials/resolve", { tenant_id: tenantId, credential_ref: credentialRef, trace_id: traceId }); }
  auditLog() { return this.#transport.request<readonly Record<string, unknown>[]>("credential-center", "GET", "/internal/v1/credentials/audit"); }
}

function normalizeInvocation(body: Record<string, unknown>): CoordinatorAdapterInvocation & { user_id?: string; requested_at_utc?: string } {
  const invocation = body as unknown as CoordinatorAdapterInvocation & { user_id?: string; requested_at_utc?: string };
  if (!invocation.tenant_id || !invocation.task_id || !invocation.attempt_id || !invocation.execution_id || !invocation.trace_id || !invocation.payload) {
    throw new InternalServiceError("PLATFORM_INVALID_REQUEST", "Adapter invocation context is incomplete");
  }
  return invocation;
}

function assertInternalAuth(request: InternalRequest, token: string): void {
  const authorization = request.headers.authorization;
  if (authorization !== `Bearer ${token}`) {
    throw new InternalServiceError("PLATFORM_UNAUTHENTICATED", "Internal service authentication failed");
  }
  const caller = request.headers["x-nexus-caller-service"];
  if (!caller || caller !== "platform-api") {
    throw new InternalServiceError("PLATFORM_FORBIDDEN", "Internal caller identity is invalid");
  }
}

async function parseRequest(request: http.IncomingMessage): Promise<InternalRequest> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  const parsed = new URL(request.url ?? "/", "http://127.0.0.1");
  let body: Record<string, unknown> = {};
  if (raw.trim()) {
    const candidate = JSON.parse(raw) as unknown;
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new InternalServiceError("PLATFORM_INVALID_REQUEST", "Internal request body must be an object");
    }
    body = candidate as Record<string, unknown>;
  }
  const parsedBody = Object.fromEntries(parsed.searchParams.entries());
  body = { ...parsedBody, ...body };
  const headers: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(request.headers)) headers[key.toLowerCase()] = Array.isArray(value) ? value.join(",") : value;
  return { method: (request.method ?? "GET").toUpperCase(), path: parsed.pathname, headers, body };
}

function sendJson(response: http.ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(body)}\n`);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new InternalServiceError("PLATFORM_INVALID_REQUEST", `${field} is required`);
  return value;
}

function traceFromHeaders(headers: http.IncomingHttpHeaders): string {
  const value = headers["x-trace-id"];
  return typeof value === "string" && value.trim() ? value : "trace_internal_service";
}

function errorCode(error: unknown): InternalServiceError["code"] {
  if (error instanceof InternalServiceError) return error.code;
  if (error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string") {
    return (error as { code: string }).code as InternalServiceError["code"];
  }
  return "PLATFORM_INTERNAL_ERROR";
}

function errorDetails(error: unknown): Record<string, unknown> {
  if (error && typeof error === "object" && "details" in error && typeof (error as { details?: unknown }).details === "object") {
    return sanitizePublicDetails((error as { details: Record<string, unknown> }).details);
  }
  return {};
}

function statusForCode(code: InternalServiceError["code"]): number {
  if (code === "PLATFORM_UNAUTHENTICATED") return 401;
  if (code === "PLATFORM_FORBIDDEN") return 403;
  if (code === "PLATFORM_NOT_FOUND") return 404;
  if (code === "PLATFORM_CONFLICT") return 409;
  if (code === "PLATFORM_SERVICE_UNHEALTHY") return 503;
  if (code === "PLATFORM_INVALID_REQUEST") return 400;
  return 500;
}

function roleForService(service: InternalServiceName): string {
  if (service === "openclaw-adapter") return "gateway-only";
  if (service === "hermes-adapter") return "planner-only";
  if (service === "dsh-adapter") return "executor-only";
  return service;
}

function defaultServiceUrls(): Partial<Record<InternalServiceName, string>> {
  return {
    "openclaw-adapter": process.env.NEXUS_OPENCLAW_ADAPTER_URL ?? "http://openclaw-adapter:8080",
    "hermes-adapter": process.env.NEXUS_HERMES_ADAPTER_URL ?? "http://hermes-adapter:8080",
    "dsh-adapter": process.env.NEXUS_DSH_ADAPTER_URL ?? "http://dsh-adapter:8080",
    "memory-gateway": process.env.NEXUS_MEMORY_GATEWAY_URL ?? "http://memory-gateway:8080",
    "artifact-store": process.env.NEXUS_ARTIFACT_STORE_URL ?? "http://artifact-store:8080",
    "event-bus": process.env.NEXUS_EVENT_BUS_URL ?? "http://event-bus:8080",
    "credential-center": process.env.NEXUS_CREDENTIAL_CENTER_URL ?? "http://credential-center:8080",
    observability: process.env.NEXUS_OBSERVABILITY_URL ?? "http://observability:8080",
  };
}
