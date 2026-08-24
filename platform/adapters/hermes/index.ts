import {
  assertTrustedAdapterInvocation,
  type AdapterHealth,
  type AdapterLifecycleStatus,
  type LifecycleAdapterPort,
} from "../index.ts";
import type { CoordinatorAdapterInvocation, CoordinatorAdapterResult } from "../../coordinator/index.ts";
import { type EventBus, type PlatformEventEnvelope } from "../../event-bus/index.ts";
import { type PlatformClock, SystemClock } from "../../clock/index.ts";
import { assertPlatformId } from "../../task-state/index.ts";
import {
  LocalMemoryGateway,
  MEMORY_SNAPSHOT_SCHEMA_VERSION,
  MemoryGatewayError,
  PLANNER_MEMORY_LAYERS,
  sanitizePlannerMemoryText,
  type MemoryProxyWriteInput,
  type MemoryScope,
  type PlannerMemoryLayer,
} from "../../memory-gateway/index.ts";

export const HERMES_BASELINE_PROVIDER_ID = "hermes-0.20.5";
export const HERMES_PROVIDER_CONTRACT_VERSION = "nexus.hermes_provider.p3.v1";
export const HERMES_EXECUTION_PLAN_SCHEMA_VERSION = "nexus.execution_plan.p0.v1";
export const HERMES_MEMORY_PROXY_SCHEMA_VERSION = "nexus.hermes_memory_proxy.p3.v1";
export const HERMES_MEMORY_SNAPSHOT_SCHEMA_VERSION = MEMORY_SNAPSHOT_SCHEMA_VERSION;

export type HermesProviderRole = "planner-only";
export type HermesProviderStatus = "enabled" | "disabled";

export interface HermesProviderMetadata {
  provider_id: string;
  version: string;
  role: HermesProviderRole;
  status: HermesProviderStatus;
  contract_version: typeof HERMES_PROVIDER_CONTRACT_VERSION;
  vendor_path: string;
  source: "vendor-snapshot" | "test-fixture";
  capabilities: readonly string[];
  schema_versions: readonly string[];
  disabled_reason?: string;
}

export interface HermesProviderStatusView {
  provider_id: string;
  role: HermesProviderRole;
  status: HermesProviderStatus;
  contract_version: typeof HERMES_PROVIDER_CONTRACT_VERSION;
  is_default: boolean;
  capabilities: readonly string[];
  schema_versions: readonly string[];
  rollback_provider_id?: string;
}

export class HermesProviderRegistryError extends Error {
  readonly code:
    | "PLATFORM_INVALID_REQUEST"
    | "PLATFORM_NOT_FOUND"
    | "PLATFORM_CONFLICT"
    | "PLATFORM_SERVICE_UNHEALTHY";
  readonly details: Record<string, unknown>;

  constructor(code: HermesProviderRegistryError["code"], message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "HermesProviderRegistryError";
    this.code = code;
    this.details = sanitizeDetails(details);
  }
}

export class HermesMemoryGatewayAdapterError extends Error {
  readonly code:
    | "PLATFORM_INVALID_REQUEST"
    | "PLATFORM_FORBIDDEN"
    | "PLATFORM_POLICY_DENIED"
    | "PLATFORM_SERVICE_UNHEALTHY"
    | "PLATFORM_CONFLICT";
  readonly details: Record<string, unknown>;

  constructor(code: HermesMemoryGatewayAdapterError["code"], message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "HermesMemoryGatewayAdapterError";
    this.code = code;
    this.details = sanitizeDetails(details);
  }
}

export type HermesMemoryProxyOperation = "snapshot" | "query" | "write";

export interface HermesMemoryProxyRequest {
  schema_version: typeof HERMES_MEMORY_PROXY_SCHEMA_VERSION;
  operation: HermesMemoryProxyOperation;
  scope: MemoryScope;
  trace_id: string;
  provider_id?: string;
  requested_at_utc?: string;
  layers?: readonly PlannerMemoryLayer[];
  query?: string;
  max_records?: number;
  target?: MemoryProxyWriteInput["target"];
  action?: MemoryProxyWriteInput["action"];
  content?: string;
  old_text?: string;
  operations?: readonly Record<string, unknown>[];
  expected_version?: number;
}

export interface HermesMemoryGatewayAdapterOptions {
  name?: string;
  registry?: HermesProviderRegistry;
  memoryGateway?: LocalMemoryGateway;
  eventBus?: EventBus;
  clock?: PlatformClock;
}

export class HermesMemoryGatewayAdapter implements LifecycleAdapterPort {
  readonly name: string;
  readonly kind = "memory" as const;
  readonly #registry: HermesProviderRegistry;
  readonly #memoryGateway: LocalMemoryGateway;
  readonly #eventBus?: EventBus;
  readonly #clock: PlatformClock;
  #status: AdapterLifecycleStatus = "created";
  #eventSequence = 0;

  constructor(options: HermesMemoryGatewayAdapterOptions = {}) {
    this.name = options.name ?? "hermes-memory-gateway";
    this.#registry = options.registry ?? new HermesProviderRegistry();
    this.#eventBus = options.eventBus;
    this.#clock = options.clock ?? new SystemClock();
    this.#memoryGateway = options.memoryGateway ?? new LocalMemoryGateway({ eventBus: options.eventBus, clock: this.#clock });
  }

  start(): void {
    this.#status = "started";
  }

  stop(): void {
    this.#status = "stopped";
  }

  health(): AdapterHealth {
    const checks = [
      this.#status === "started" ? "lifecycle.started" : "lifecycle.not_started",
      HERMES_MEMORY_PROXY_SCHEMA_VERSION,
      HERMES_MEMORY_SNAPSHOT_SCHEMA_VERSION,
      "provider.registry",
      "memory-gateway.proxy",
    ];
    try {
      const provider = this.#registry.defaultProvider();
      checks.push(`provider.default.${provider.status}`);
    } catch {
      checks.push("provider.default.unavailable");
    }
    return {
      name: this.name,
      kind: this.kind,
      status: this.#status,
      checks,
    };
  }

  async invoke(invocation: CoordinatorAdapterInvocation): Promise<CoordinatorAdapterResult> {
    assertTrustedAdapterInvocation(invocation);
    if (this.#status !== "started") {
      throw new HermesMemoryGatewayAdapterError("PLATFORM_SERVICE_UNHEALTHY", "Memory adapter must be started before invocation", {
        adapter_name: this.name,
        status: this.#status,
      });
    }
    assertMemoryPolicyDecisionShape(invocation);

    const request = validateHermesMemoryProxyRequest(invocation.payload);
    assertHermesMemoryRequestMatchesInvocation(request, invocation);
    const provider = this.#registry.requireEnabledProvider(request.provider_id ?? this.#registry.defaultProvider().provider_id);

    try {
      const payload = this.#executeProxyRequest(request, provider.provider_id);
      this.#publishAudit(request, provider.provider_id, payload.operation);
      return {
        tenant_id: invocation.tenant_id,
        task_id: invocation.task_id,
        attempt_id: invocation.attempt_id,
        execution_id: invocation.execution_id,
        trace_id: invocation.trace_id,
        status: "completed",
        payload,
      };
    } catch (error) {
      if (error instanceof HermesMemoryGatewayAdapterError) throw error;
      if (error instanceof MemoryGatewayError) {
        throw new HermesMemoryGatewayAdapterError(memoryGatewayErrorCode(error), error.message, error.details);
      }
      throw new HermesMemoryGatewayAdapterError("PLATFORM_SERVICE_UNHEALTHY", "Memory Gateway proxy failed", {
        provider_id: provider.provider_id,
        trace_id: request.trace_id,
      });
    }
  }

  #executeProxyRequest(request: HermesMemoryProxyRequest, providerId: string): Record<string, unknown> & { operation: HermesMemoryProxyOperation } {
    if (request.operation === "snapshot" || request.operation === "query") {
      const snapshot = this.#memoryGateway.plannerSnapshot({
        scope: request.scope,
        trace_id: request.trace_id,
        layers: request.layers,
        query: request.query,
        max_records: request.max_records,
      });
      return {
        schema_version: request.operation === "snapshot" ? HERMES_MEMORY_SNAPSHOT_SCHEMA_VERSION : HERMES_MEMORY_PROXY_SCHEMA_VERSION,
        proxy_schema_version: HERMES_MEMORY_PROXY_SCHEMA_VERSION,
        operation: request.operation,
        provider_id: providerId,
        scope: snapshot.scope,
        trace_id: snapshot.trace_id,
        version: snapshot.version,
        records: snapshot.records,
        rendered: request.operation === "snapshot" ? snapshot.rendered : undefined,
      };
    }

    const record = this.#memoryGateway.writeFromMemoryProxy({
      scope: request.scope,
      target: request.target ?? "memory",
      action: request.action ?? "add",
      trace_id: request.trace_id,
      content: request.content,
      old_text: request.old_text,
      operations: request.operations,
      expected_version: request.expected_version,
      source: `hermes-memory-proxy:${providerId}`,
    });
    const sanitized = sanitizePlannerMemoryText(record.text);
    return {
      schema_version: HERMES_MEMORY_PROXY_SCHEMA_VERSION,
      operation: "write",
      provider_id: providerId,
      scope: request.scope,
      trace_id: request.trace_id,
      memory_ref: {
        memory_id: record.memory_id,
        layer: record.layer,
        version: record.version,
        sanitized: sanitized.sanitized,
      },
    };
  }

  #publishAudit(request: HermesMemoryProxyRequest, providerId: string, operation: HermesMemoryProxyOperation): void {
    if (!this.#eventBus) return;
    this.#eventSequence += 1;
    const reading = this.#clock.now();
    this.#eventBus.publish({
      schema_version: "nexus.event_envelope.v1",
      event_id: `event_${request.trace_id.replace(/^trace_/, "")}_memory_${String(this.#eventSequence).padStart(4, "0")}`,
      event_type: "audit.recorded",
      tenant_id: request.scope.tenant_id,
      user_id: request.scope.user_id,
      agent_id: request.scope.agent_id,
      conversation_id: request.scope.conversation_id,
      trace_id: request.trace_id,
      occurred_at_utc: reading.utc_timestamp,
      monotonic_ms: Math.max(reading.monotonic_ms, this.#eventSequence),
      producer: {
        service: "memory-gateway",
        component: "hermes-memory-proxy",
        provider_binding_id: providerId,
      },
      subject: { kind: "audit", id: `${request.scope.tenant_id}_${operation}` },
      payload: sanitizeDetails({
        operation,
        provider_id: providerId,
        schema_version: HERMES_MEMORY_PROXY_SCHEMA_VERSION,
        layers: request.layers ?? PLANNER_MEMORY_LAYERS,
      }),
    } satisfies PlatformEventEnvelope);
  }
}

export function baselineHermesProviderMetadata(overrides: Partial<HermesProviderMetadata> = {}): HermesProviderMetadata {
  return normalizeProviderMetadata({
    provider_id: HERMES_BASELINE_PROVIDER_ID,
    version: "0.20.5",
    role: "planner-only",
    status: "enabled",
    contract_version: HERMES_PROVIDER_CONTRACT_VERSION,
    vendor_path: "vendor/hermes-agent-main",
    source: "vendor-snapshot",
    schema_versions: [HERMES_EXECUTION_PLAN_SCHEMA_VERSION],
    capabilities: [
      "execution-plan",
      "memory-gateway-required",
      "native-gateway-block",
      "native-loop-block",
      "native-tool-block",
      "provider-disable",
      "provider-rollback",
    ],
    ...overrides,
  });
}

export class HermesProviderRegistry {
  readonly #providers = new Map<string, HermesProviderMetadata>();
  #defaultProviderId: string;
  #rollbackProviderId: string | undefined;

  constructor(providers: readonly HermesProviderMetadata[] = [baselineHermesProviderMetadata()]) {
    if (providers.length === 0) {
      throw new HermesProviderRegistryError("PLATFORM_INVALID_REQUEST", "At least one planner provider is required");
    }
    for (const provider of providers) this.register(provider);
    this.#defaultProviderId = providers[0].provider_id;
  }

  register(provider: HermesProviderMetadata): void {
    const normalized = normalizeProviderMetadata(provider);
    if (this.#providers.has(normalized.provider_id)) {
      throw new HermesProviderRegistryError("PLATFORM_CONFLICT", "Planner provider is already registered", {
        provider_id: normalized.provider_id,
      });
    }
    this.#providers.set(normalized.provider_id, normalized);
  }

  list(): readonly HermesProviderStatusView[] {
    return [...this.#providers.values()].map((provider) => this.#view(provider));
  }

  get(provider_id: string): HermesProviderMetadata {
    const provider = this.#providers.get(provider_id);
    if (!provider) {
      throw new HermesProviderRegistryError("PLATFORM_NOT_FOUND", "Planner provider is not registered", { provider_id });
    }
    return cloneProvider(provider);
  }

  requireEnabledProvider(provider_id: string): HermesProviderMetadata {
    return cloneProvider(this.#requireEnabled(provider_id));
  }

  defaultProvider(): HermesProviderStatusView {
    return this.#view(this.#requireEnabled(this.#defaultProviderId));
  }

  selectDefault(provider_id: string): HermesProviderStatusView {
    const provider = this.#requireEnabled(provider_id);
    if (provider.provider_id !== this.#defaultProviderId) {
      this.#rollbackProviderId = this.#defaultProviderId;
      this.#defaultProviderId = provider.provider_id;
    }
    return this.#view(provider);
  }

  disable(provider_id: string, reason = "provider disabled by platform configuration"): HermesProviderStatusView {
    const provider = this.#providers.get(provider_id);
    if (!provider) {
      throw new HermesProviderRegistryError("PLATFORM_NOT_FOUND", "Planner provider is not registered", { provider_id });
    }
    const disabled = normalizeProviderMetadata({ ...provider, status: "disabled", disabled_reason: reason });
    this.#providers.set(provider_id, disabled);
    return this.#view(disabled);
  }

  enable(provider_id: string): HermesProviderStatusView {
    const provider = this.#providers.get(provider_id);
    if (!provider) {
      throw new HermesProviderRegistryError("PLATFORM_NOT_FOUND", "Planner provider is not registered", { provider_id });
    }
    const enabled = normalizeProviderMetadata({ ...provider, status: "enabled", disabled_reason: undefined });
    this.#providers.set(provider_id, enabled);
    return this.#view(enabled);
  }

  rollbackDefault(): HermesProviderStatusView {
    if (this.#rollbackProviderId === undefined) {
      throw new HermesProviderRegistryError("PLATFORM_NOT_FOUND", "No rollback planner provider has been selected");
    }
    const rollback = this.#requireEnabled(this.#rollbackProviderId);
    const previous = this.#defaultProviderId;
    this.#defaultProviderId = rollback.provider_id;
    this.#rollbackProviderId = previous;
    return this.#view(rollback);
  }

  #requireEnabled(provider_id: string): HermesProviderMetadata {
    const provider = this.#providers.get(provider_id);
    if (!provider) {
      throw new HermesProviderRegistryError("PLATFORM_NOT_FOUND", "Planner provider is not registered", { provider_id });
    }
    if (provider.status !== "enabled") {
      throw new HermesProviderRegistryError("PLATFORM_SERVICE_UNHEALTHY", "Planner provider is disabled", {
        provider_id,
        reason: provider.disabled_reason,
      });
    }
    return provider;
  }

  #view(provider: HermesProviderMetadata): HermesProviderStatusView {
    return {
      provider_id: provider.provider_id,
      role: provider.role,
      status: provider.status,
      contract_version: provider.contract_version,
      is_default: provider.provider_id === this.#defaultProviderId,
      capabilities: [...provider.capabilities],
      schema_versions: [...provider.schema_versions],
      ...this.#rollbackProviderId === undefined ? {} : { rollback_provider_id: this.#rollbackProviderId },
    };
  }
}

function normalizeProviderMetadata(provider: HermesProviderMetadata): HermesProviderMetadata {
  if (!/^hermes-[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/.test(provider.provider_id)) {
    throw new HermesProviderRegistryError("PLATFORM_INVALID_REQUEST", "Planner provider_id is invalid", {
      provider_id: provider.provider_id,
    });
  }
  if (provider.role !== "planner-only") {
    throw new HermesProviderRegistryError("PLATFORM_INVALID_REQUEST", "Hermes provider role must be planner-only", {
      role: provider.role,
    });
  }
  if (provider.status !== "enabled" && provider.status !== "disabled") {
    throw new HermesProviderRegistryError("PLATFORM_INVALID_REQUEST", "Planner provider status is invalid", {
      status: provider.status,
    });
  }
  if (provider.contract_version !== HERMES_PROVIDER_CONTRACT_VERSION) {
    throw new HermesProviderRegistryError("PLATFORM_INVALID_REQUEST", "Planner provider contract version is invalid", {
      contract_version: provider.contract_version,
    });
  }
  if (provider.source !== "vendor-snapshot" && provider.source !== "test-fixture") {
    throw new HermesProviderRegistryError("PLATFORM_INVALID_REQUEST", "Planner provider source is invalid", {
      source: provider.source,
    });
  }
  if (!provider.vendor_path.startsWith("vendor/hermes-agent-main")) {
    throw new HermesProviderRegistryError("PLATFORM_INVALID_REQUEST", "Planner provider vendor path is outside NexusAgent vendor snapshot");
  }
  const capabilities = [...new Set(provider.capabilities)].sort();
  if (!capabilities.includes("execution-plan") || !capabilities.includes("memory-gateway-required")) {
    throw new HermesProviderRegistryError("PLATFORM_INVALID_REQUEST", "Planner provider capabilities are incomplete", {
      capabilities,
    });
  }
  const schemaVersions = [...new Set(provider.schema_versions)].sort();
  if (!schemaVersions.includes(HERMES_EXECUTION_PLAN_SCHEMA_VERSION)) {
    throw new HermesProviderRegistryError("PLATFORM_INVALID_REQUEST", "Planner provider schema versions are incomplete", {
      schema_versions: schemaVersions,
    });
  }
  return {
    provider_id: provider.provider_id,
    version: provider.version,
    role: "planner-only",
    status: provider.status,
    contract_version: HERMES_PROVIDER_CONTRACT_VERSION,
    vendor_path: provider.vendor_path,
    source: provider.source,
    capabilities,
    schema_versions: schemaVersions,
    ...provider.disabled_reason === undefined ? {} : { disabled_reason: String(provider.disabled_reason) },
  };
}

function cloneProvider(provider: HermesProviderMetadata): HermesProviderMetadata {
  return {
    ...provider,
    capabilities: [...provider.capabilities],
    schema_versions: [...provider.schema_versions],
  };
}

function validateHermesMemoryProxyRequest(payload: Record<string, unknown>): HermesMemoryProxyRequest {
  assertNoNativeMemoryProxyPayload(payload);
  if (payload.schema_version !== HERMES_MEMORY_PROXY_SCHEMA_VERSION) {
    throw new HermesMemoryGatewayAdapterError("PLATFORM_INVALID_REQUEST", "Unsupported Hermes memory proxy schema version", {
      schema_version: payload.schema_version,
    });
  }
  if (payload.operation !== "snapshot" && payload.operation !== "query" && payload.operation !== "write") {
    throw new HermesMemoryGatewayAdapterError("PLATFORM_INVALID_REQUEST", "Unsupported Hermes memory proxy operation", {
      operation: payload.operation,
    });
  }
  const scope = requireHermesMemoryScope(payload.scope);
  assertPlatformId("trace_id", payload.trace_id);
  const request: HermesMemoryProxyRequest = {
    schema_version: HERMES_MEMORY_PROXY_SCHEMA_VERSION,
    operation: payload.operation,
    scope,
    trace_id: payload.trace_id,
  };
  if (typeof payload.provider_id === "string") request.provider_id = payload.provider_id;
  if (typeof payload.requested_at_utc === "string") request.requested_at_utc = payload.requested_at_utc;
  if (payload.layers !== undefined) request.layers = validateHermesMemoryLayers(payload.layers);
  if (typeof payload.query === "string") request.query = payload.query;
  if (payload.max_records !== undefined) request.max_records = assertPositiveInteger(payload.max_records, "max_records");

  if (payload.operation === "write") {
    if (payload.target !== "memory" && payload.target !== "user" && payload.target !== "session") {
      throw new HermesMemoryGatewayAdapterError("PLATFORM_INVALID_REQUEST", "Hermes memory proxy write target is invalid", {
        target: payload.target,
      });
    }
    if (payload.action !== "add" && payload.action !== "replace" && payload.action !== "remove" && payload.action !== "batch") {
      throw new HermesMemoryGatewayAdapterError("PLATFORM_INVALID_REQUEST", "Hermes memory proxy write action is invalid", {
        action: payload.action,
      });
    }
    request.target = payload.target;
    request.action = payload.action;
    if (typeof payload.content === "string") request.content = payload.content;
    if (typeof payload.old_text === "string") request.old_text = payload.old_text;
    if (payload.operations !== undefined) request.operations = validateHermesMemoryOperations(payload.operations);
    if (payload.expected_version !== undefined) request.expected_version = assertNonNegativeInteger(payload.expected_version, "expected_version");
  }
  return request;
}

function requireHermesMemoryScope(value: unknown): MemoryScope {
  const scope = requireRecord(value, "scope");
  assertPlatformId("tenant_id", scope.tenant_id);
  assertPlatformId("user_id", scope.user_id);
  assertPlatformId("agent_id", scope.agent_id);
  assertPlatformId("conversation_id", scope.conversation_id);
  return {
    tenant_id: scope.tenant_id,
    user_id: scope.user_id,
    agent_id: scope.agent_id,
    conversation_id: scope.conversation_id,
  };
}

function validateHermesMemoryLayers(value: unknown): readonly PlannerMemoryLayer[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HermesMemoryGatewayAdapterError("PLATFORM_INVALID_REQUEST", "Hermes memory proxy layers are required");
  }
  const layers = value.map((layer) => String(layer));
  for (const layer of layers) {
    if (!(PLANNER_MEMORY_LAYERS as readonly string[]).includes(layer)) {
      throw new HermesMemoryGatewayAdapterError("PLATFORM_FORBIDDEN", "Hermes memory proxy only supports P3 planner layers", { layer });
    }
  }
  return [...new Set(layers)] as PlannerMemoryLayer[];
}

function validateHermesMemoryOperations(value: unknown): readonly Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HermesMemoryGatewayAdapterError("PLATFORM_INVALID_REQUEST", "Hermes memory proxy batch operations are required");
  }
  return value.map((item, index) => {
    const operation = requireRecord(item, `operations.${index}`);
    const allowed = new Set(["action", "content", "old_text", "new_text"]);
    for (const key of Object.keys(operation)) {
      if (!allowed.has(key)) {
        throw new HermesMemoryGatewayAdapterError("PLATFORM_INVALID_REQUEST", "Hermes memory proxy batch operation contains unsupported field", {
          field: key,
        });
      }
    }
    return { ...operation };
  });
}

function assertHermesMemoryRequestMatchesInvocation(request: HermesMemoryProxyRequest, invocation: CoordinatorAdapterInvocation): void {
  const mismatches = [
    ["tenant_id", invocation.tenant_id, request.scope.tenant_id],
    ["conversation_id", invocation.conversation_id, request.scope.conversation_id],
    ["trace_id", invocation.trace_id, request.trace_id],
  ].filter(([, expected, actual]) => expected !== undefined && expected !== actual);
  if (mismatches.length > 0) {
    throw new HermesMemoryGatewayAdapterError("PLATFORM_POLICY_DENIED", "Hermes memory proxy identity does not match Coordinator invocation", {
      mismatches,
    });
  }
}

function assertMemoryPolicyDecisionShape(invocation: CoordinatorAdapterInvocation): void {
  if (invocation.policy_decision?.action !== "adapter.invoke" || invocation.policy_decision.allow !== true) {
    throw new HermesMemoryGatewayAdapterError("PLATFORM_POLICY_DENIED", "Hermes memory proxy requires an allowed Policy-Gate decision", {
      execution_id: invocation.execution_id,
      trace_id: invocation.trace_id,
    });
  }
  if (invocation.policy_decision.route?.adapter_kind !== "memory") {
    throw new HermesMemoryGatewayAdapterError("PLATFORM_POLICY_DENIED", "Hermes memory proxy must be routed as memory", {
      route: invocation.policy_decision.route,
    });
  }
}

function assertNoNativeMemoryProxyPayload(value: unknown): void {
  const forbiddenKeys = /^(?:credential_material|raw_credential|api_key|password|token|native_session_id|native_error|native_path|file_path|path|url|session_id)$/i;
  const forbiddenStrings = /MEMORY\.md|USER\.md|https?:\/\/|\b(?:native_session|native_error)\b|\/(?:tmp|var|workspace|opt)\//i;
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item);
      return;
    }
    if (candidate && typeof candidate === "object") {
      for (const [key, item] of Object.entries(candidate)) {
        if (forbiddenKeys.test(key)) {
          throw new HermesMemoryGatewayAdapterError("PLATFORM_INVALID_REQUEST", "Hermes memory proxy payload contains non-platform field", { field: key });
        }
        visit(item);
      }
      return;
    }
    if (typeof candidate === "string" && forbiddenStrings.test(candidate) && !candidate.startsWith("[BLOCKED:")) {
      throw new HermesMemoryGatewayAdapterError("PLATFORM_INVALID_REQUEST", "Hermes memory proxy payload contains non-platform marker");
    }
  };
  visit(value);
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HermesMemoryGatewayAdapterError("PLATFORM_INVALID_REQUEST", `Hermes memory proxy ${field} must be an object`, { field });
  }
  return value as Record<string, unknown>;
}

function assertPositiveInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new HermesMemoryGatewayAdapterError("PLATFORM_INVALID_REQUEST", `Invalid Hermes memory proxy ${field}`, { field, value });
  }
  return Number(value);
}

function assertNonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new HermesMemoryGatewayAdapterError("PLATFORM_INVALID_REQUEST", `Invalid Hermes memory proxy ${field}`, { field, value });
  }
  return Number(value);
}

function memoryGatewayErrorCode(error: MemoryGatewayError): HermesMemoryGatewayAdapterError["code"] {
  if (error.code === "PLATFORM_CONFLICT") return "PLATFORM_CONFLICT";
  if (error.code === "PLATFORM_FORBIDDEN") return "PLATFORM_FORBIDDEN";
  return "PLATFORM_INVALID_REQUEST";
}

function sanitizeDetails(value: Record<string, unknown>): Record<string, unknown> {
  const raw = JSON.stringify(value, (_key, item) => {
    if (typeof item === "string") {
      return item
        .replace(/https?:\/\/\S+/gi, "[redacted-url]")
        .replace(/\b(?:session|native_session|native_session_id)_[A-Za-z0-9._-]+\b/gi, "[redacted-session]")
        .replace(/\/(?:tmp|var|workspace|opt)\/[^\s"']+/gi, "[redacted-path]");
    }
    return item;
  });
  return JSON.parse(raw) as Record<string, unknown>;
}
