import {
  assertTrustedAdapterInvocation,
  type AdapterHealth,
  type AdapterLifecycleStatus,
  type LifecycleAdapterPort,
} from "../index.ts";
import type { CoordinatorAdapterInvocation, CoordinatorAdapterResult } from "../../coordinator/index.ts";
import { type EventBus, type PlatformEventEnvelope } from "../../event-bus/index.ts";
import { type PlatformClock, SystemClock } from "../../clock/index.ts";
import { assertPlatformId, type PlatformIdKey } from "../../task-state/index.ts";
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
export const HERMES_EXECUTION_PLAN_SCHEMA_VERSION = "nexus.execution_plan.p3.v1";
export const HERMES_LEGACY_EXECUTION_PLAN_SCHEMA_VERSION = "nexus.execution_plan.p0.v1";
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

export class HermesExecutionPlanContractError extends Error {
  readonly code:
    | "PLATFORM_INVALID_REQUEST"
    | "PLATFORM_POLICY_DENIED"
    | "PLATFORM_SCHEMA_VALIDATION_FAILED"
    | "PLATFORM_SERVICE_UNHEALTHY";
  readonly details: Record<string, unknown>;

  constructor(code: HermesExecutionPlanContractError["code"], message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "PlannerExecutionPlanContractError";
    this.code = code;
    this.details = sanitizeDetails(details);
  }
}

export type HermesExecutionPlanStepStatus = "planned" | "blocked";
export type HermesExecutionPlanRiskSeverity = "low" | "medium" | "high" | "critical";

export interface HermesExecutionPlanStep {
  step_id: string;
  title: string;
  intent: string;
  status: HermesExecutionPlanStepStatus;
  depends_on: readonly string[];
  expected_output: string;
}

export interface HermesExecutionPlanToolIntent {
  tool_intent_id: string;
  step_id: string;
  capability: string;
  executor_policy: {
    mode: "platform_executor_required";
    require_policy_gate: true;
    allow_direct_execution: false;
    artifact_store: "required";
  };
  credential_refs: readonly {
    credential_ref: string;
    purpose: "executor_tool";
  }[];
  artifact_expectations: readonly {
    kind: "execution_result" | "structured_output" | "diagnostic";
    store: "artifact_store";
    required: boolean;
  }[];
}

export interface HermesExecutionPlanDependency {
  step_id: string;
  depends_on_step_id: string;
  relation: "after";
}

export interface HermesExecutionPlanRisk {
  risk_id: string;
  severity: HermesExecutionPlanRiskSeverity;
  mitigation: string;
}

export interface HermesExecutionPlan {
  schema_version: typeof HERMES_EXECUTION_PLAN_SCHEMA_VERSION;
  tenant_id: string;
  user_id: string;
  agent_id: string;
  task_id: string;
  attempt_id: string;
  execution_id: string;
  conversation_id: string;
  trace_id: string;
  objective: string;
  steps: readonly HermesExecutionPlanStep[];
  tool_intents: readonly HermesExecutionPlanToolIntent[];
  budget: {
    estimated_units: number;
    max_execution_steps: number;
    requires_approval: boolean;
  };
  dependencies: readonly HermesExecutionPlanDependency[];
  risks: readonly HermesExecutionPlanRisk[];
  memory_context: {
    mode: "memory_gateway_snapshot";
    layers: readonly PlannerMemoryLayer[];
    snapshot_version: number;
    direct_memory_access: "blocked";
  };
  trace: {
    source: "conversation_loop" | "provider_fixture" | "adapter_validation";
    planner_mode: "planner_only";
    provider_binding: "planner_provider_default";
    tool_runtime: "platform_executor_required";
    memory_runtime: "memory_gateway_required";
    gateway_runtime: "blocked";
  };
}

export interface HermesExecutionPlanAdapterOptions {
  name?: string;
  registry?: HermesProviderRegistry;
}

export class HermesExecutionPlanAdapter implements LifecycleAdapterPort {
  readonly name: string;
  readonly kind = "planner" as const;
  readonly #registry: HermesProviderRegistry;
  #status: AdapterLifecycleStatus = "created";

  constructor(options: HermesExecutionPlanAdapterOptions = {}) {
    this.name = options.name ?? "hermes-execution-plan";
    this.#registry = options.registry ?? new HermesProviderRegistry();
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
      HERMES_EXECUTION_PLAN_SCHEMA_VERSION,
      HERMES_LEGACY_EXECUTION_PLAN_SCHEMA_VERSION,
      "execution-plan.validator",
      "provider.registry",
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
      throw new HermesExecutionPlanContractError("PLATFORM_SERVICE_UNHEALTHY", "Planner adapter must be started before invocation", {
        adapter_name: this.name,
        status: this.#status,
      });
    }
    assertExecutionPlanPolicyDecisionShape(invocation);
    const provider = this.#registry.defaultProvider();
    const plan = validateHermesExecutionPlan(invocation.payload);
    assertExecutionPlanMatchesInvocation(plan, invocation);
    return {
      tenant_id: invocation.tenant_id,
      task_id: invocation.task_id,
      attempt_id: invocation.attempt_id,
      execution_id: invocation.execution_id,
      trace_id: invocation.trace_id,
      status: "completed",
      payload: {
        schema_version: HERMES_EXECUTION_PLAN_SCHEMA_VERSION,
        plan_status: "validated",
        provider_binding: "planner_provider_default",
        provider_status: provider.status,
        execution_plan: plan,
      },
    };
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

export function buildHermesExecutionPlanFixture(overrides: Partial<HermesExecutionPlan> = {}): HermesExecutionPlan {
  const plan: HermesExecutionPlan = {
    schema_version: HERMES_EXECUTION_PLAN_SCHEMA_VERSION,
    tenant_id: "tenant_alpha01",
    user_id: "user_alpha01",
    agent_id: "agent_alpha01",
    task_id: "task_alpha01",
    attempt_id: "attempt_alpha01",
    execution_id: "exec_alpha01",
    conversation_id: "conv_alpha01",
    trace_id: "trace_alpha01",
    objective: "Produce a governed platform execution plan",
    steps: [
      {
        step_id: "step_plan_001",
        title: "Normalize platform task request",
        intent: "task.normalize",
        status: "planned",
        depends_on: [],
        expected_output: "Validated task objective and platform identifiers",
      },
      {
        step_id: "step_plan_002",
        title: "Prepare platform tool intent",
        intent: "tool.intent.prepare",
        status: "planned",
        depends_on: ["step_plan_001"],
        expected_output: "Tool intent ready for Policy-Gate and executor routing",
      },
      {
        step_id: "step_plan_003",
        title: "Capture memory gateway context",
        intent: "memory.context.capture",
        status: "planned",
        depends_on: ["step_plan_001"],
        expected_output: "Planner memory context remains gateway scoped",
      },
    ],
    tool_intents: [
      {
        tool_intent_id: "tool_intent_plan_001",
        step_id: "step_plan_002",
        capability: "platform.execution.prepare",
        executor_policy: {
          mode: "platform_executor_required",
          require_policy_gate: true,
          allow_direct_execution: false,
          artifact_store: "required",
        },
        credential_refs: [{ credential_ref: "cred_alpha01_tool", purpose: "executor_tool" }],
        artifact_expectations: [{ kind: "execution_result", store: "artifact_store", required: false }],
      },
    ],
    budget: {
      estimated_units: 3,
      max_execution_steps: 3,
      requires_approval: false,
    },
    dependencies: [
      { step_id: "step_plan_002", depends_on_step_id: "step_plan_001", relation: "after" },
      { step_id: "step_plan_003", depends_on_step_id: "step_plan_001", relation: "after" },
    ],
    risks: [
      {
        risk_id: "risk_policy_boundary",
        severity: "medium",
        mitigation: "Route execution through Policy-Gate and executor adapter",
      },
    ],
    memory_context: {
      mode: "memory_gateway_snapshot",
      layers: ["session", "user", "agent_skill"],
      snapshot_version: 1,
      direct_memory_access: "blocked",
    },
    trace: {
      source: "provider_fixture",
      planner_mode: "planner_only",
      provider_binding: "planner_provider_default",
      tool_runtime: "platform_executor_required",
      memory_runtime: "memory_gateway_required",
      gateway_runtime: "blocked",
    },
    ...overrides,
  };
  return validateHermesExecutionPlan(plan);
}

export function buildHermesExecutionPlanProviderFixtures(): readonly { provider: HermesProviderMetadata; plan: HermesExecutionPlan }[] {
  return [
    { provider: baselineHermesProviderMetadata(), plan: buildHermesExecutionPlanFixture() },
    {
      provider: baselineHermesProviderMetadata({ provider_id: "hermes-0.20.5-canary", source: "test-fixture" }),
      plan: buildHermesExecutionPlanFixture({ trace: { ...buildHermesExecutionPlanFixture().trace, source: "adapter_validation" } }),
    },
  ];
}

export function normalizeHermesExecutionPlan(value: unknown): HermesExecutionPlan {
  return validateHermesExecutionPlan(value);
}

export function validateHermesExecutionPlan(value: unknown): HermesExecutionPlan {
  assertNoForbiddenExecutionPlanContent(value);
  const plan = requirePlanRecord(value, "ExecutionPlan");
  assertAllowedFields(plan, EXECUTION_PLAN_TOP_LEVEL_FIELDS, "ExecutionPlan");
  if (plan.schema_version !== HERMES_EXECUTION_PLAN_SCHEMA_VERSION) {
    throw new HermesExecutionPlanContractError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Unsupported ExecutionPlan schema version", {
      schema_version: plan.schema_version,
      legacy_schema_version: HERMES_LEGACY_EXECUTION_PLAN_SCHEMA_VERSION,
    });
  }

  const ids = Object.fromEntries(EXECUTION_PLAN_PLATFORM_ID_KEYS.map((key) => [key, requireExecutionPlanPlatformId(plan, key)]));
  const objective = requirePlanString(plan.objective, "objective", 1, 1000);
  const steps = validateExecutionPlanSteps(plan.steps);
  const dependencies = validateExecutionPlanDependencies(plan.dependencies, steps);
  const toolIntents = validateExecutionPlanToolIntents(plan.tool_intents, steps);
  const budget = validateExecutionPlanBudget(plan.budget, steps.length);
  const risks = validateExecutionPlanRisks(plan.risks);
  const memoryContext = validateExecutionPlanMemoryContext(plan.memory_context);
  const trace = validateExecutionPlanTrace(plan.trace);

  return {
    schema_version: HERMES_EXECUTION_PLAN_SCHEMA_VERSION,
    tenant_id: ids.tenant_id,
    user_id: ids.user_id,
    agent_id: ids.agent_id,
    task_id: ids.task_id,
    attempt_id: ids.attempt_id,
    execution_id: ids.execution_id,
    conversation_id: ids.conversation_id,
    trace_id: ids.trace_id,
    objective,
    steps,
    tool_intents: toolIntents,
    budget,
    dependencies,
    risks,
    memory_context: memoryContext,
    trace,
  };
}

const EXECUTION_PLAN_PLATFORM_ID_KEYS = [
  "tenant_id",
  "user_id",
  "agent_id",
  "task_id",
  "attempt_id",
  "execution_id",
  "conversation_id",
  "trace_id",
] as const satisfies readonly PlatformIdKey[];

const EXECUTION_PLAN_TOP_LEVEL_FIELDS = new Set([
  "schema_version",
  "tenant_id",
  "user_id",
  "agent_id",
  "task_id",
  "attempt_id",
  "execution_id",
  "conversation_id",
  "trace_id",
  "objective",
  "steps",
  "tool_intents",
  "budget",
  "dependencies",
  "risks",
  "memory_context",
  "trace",
]);

const EXECUTION_PLAN_STEP_FIELDS = new Set(["step_id", "title", "intent", "status", "depends_on", "expected_output"]);
const EXECUTION_PLAN_TOOL_INTENT_FIELDS = new Set(["tool_intent_id", "step_id", "capability", "executor_policy", "credential_refs", "artifact_expectations"]);
const EXECUTION_PLAN_EXECUTOR_POLICY_FIELDS = new Set(["mode", "require_policy_gate", "allow_direct_execution", "artifact_store"]);
const EXECUTION_PLAN_CREDENTIAL_REF_FIELDS = new Set(["credential_ref", "purpose"]);
const EXECUTION_PLAN_ARTIFACT_EXPECTATION_FIELDS = new Set(["kind", "store", "required"]);
const EXECUTION_PLAN_BUDGET_FIELDS = new Set(["estimated_units", "max_execution_steps", "requires_approval"]);
const EXECUTION_PLAN_DEPENDENCY_FIELDS = new Set(["step_id", "depends_on_step_id", "relation"]);
const EXECUTION_PLAN_RISK_FIELDS = new Set(["risk_id", "severity", "mitigation"]);
const EXECUTION_PLAN_MEMORY_CONTEXT_FIELDS = new Set(["mode", "layers", "snapshot_version", "direct_memory_access"]);
const EXECUTION_PLAN_TRACE_FIELDS = new Set(["source", "planner_mode", "provider_binding", "tool_runtime", "memory_runtime", "gateway_runtime"]);

function validateExecutionPlanSteps(value: unknown): readonly HermesExecutionPlanStep[] {
  const rawSteps = requirePlanArray(value, "steps", 1);
  const steps: HermesExecutionPlanStep[] = [];
  const seen = new Set<string>();
  for (const [index, item] of rawSteps.entries()) {
    const step = requirePlanRecord(item, `steps.${index}`);
    assertAllowedFields(step, EXECUTION_PLAN_STEP_FIELDS, `steps.${index}`);
    const step_id = requirePatternString(step.step_id, `steps.${index}.step_id`, /^step_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/);
    if (seen.has(step_id)) {
      throw new HermesExecutionPlanContractError("PLATFORM_SCHEMA_VALIDATION_FAILED", "ExecutionPlan step_id must be unique", { step_id });
    }
    const depends_on = requirePlanArray(step.depends_on, `steps.${index}.depends_on`, 0).map((dependency, dependencyIndex) =>
      requirePatternString(dependency, `steps.${index}.depends_on.${dependencyIndex}`, /^step_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/),
    );
    for (const dependency of depends_on) {
      if (!seen.has(dependency)) {
        throw new HermesExecutionPlanContractError("PLATFORM_SCHEMA_VALIDATION_FAILED", "ExecutionPlan step dependency must reference an earlier step", {
          step_id,
          depends_on_step_id: dependency,
        });
      }
    }
    seen.add(step_id);
    steps.push({
      step_id,
      title: requirePlanString(step.title, `steps.${index}.title`, 1, 160),
      intent: requirePatternString(step.intent, `steps.${index}.intent`, /^[a-z][a-z0-9_.-]{2,127}$/),
      status: requireEnum(step.status, `steps.${index}.status`, ["planned", "blocked"]),
      depends_on,
      expected_output: requirePlanString(step.expected_output, `steps.${index}.expected_output`, 1, 240),
    });
  }
  assertNoExecutionPlanCycles(steps);
  return steps;
}

function validateExecutionPlanDependencies(value: unknown, steps: readonly HermesExecutionPlanStep[]): readonly HermesExecutionPlanDependency[] {
  const stepIds = new Set(steps.map((step) => step.step_id));
  const requiredPairs = new Set(steps.flatMap((step) => step.depends_on.map((dependency) => `${step.step_id}->${dependency}`)));
  const rawDependencies = requirePlanArray(value, "dependencies", 0);
  const dependencies = rawDependencies.map((item, index): HermesExecutionPlanDependency => {
    const dependency = requirePlanRecord(item, `dependencies.${index}`);
    assertAllowedFields(dependency, EXECUTION_PLAN_DEPENDENCY_FIELDS, `dependencies.${index}`);
    const step_id = requirePatternString(dependency.step_id, `dependencies.${index}.step_id`, /^step_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/);
    const depends_on_step_id = requirePatternString(dependency.depends_on_step_id, `dependencies.${index}.depends_on_step_id`, /^step_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/);
    if (!stepIds.has(step_id) || !stepIds.has(depends_on_step_id)) {
      throw new HermesExecutionPlanContractError("PLATFORM_SCHEMA_VALIDATION_FAILED", "ExecutionPlan dependency references an unknown step", {
        step_id,
        depends_on_step_id,
      });
    }
    if (!requiredPairs.has(`${step_id}->${depends_on_step_id}`)) {
      throw new HermesExecutionPlanContractError("PLATFORM_SCHEMA_VALIDATION_FAILED", "ExecutionPlan dependencies must match step depends_on", {
        step_id,
        depends_on_step_id,
      });
    }
    return { step_id, depends_on_step_id, relation: requireEnum(dependency.relation, `dependencies.${index}.relation`, ["after"]) };
  });
  const providedPairs = new Set(dependencies.map((dependency) => `${dependency.step_id}->${dependency.depends_on_step_id}`));
  if (providedPairs.size !== dependencies.length || providedPairs.size !== requiredPairs.size) {
    throw new HermesExecutionPlanContractError("PLATFORM_SCHEMA_VALIDATION_FAILED", "ExecutionPlan dependencies must exactly match step depends_on graph", {
      expected_count: requiredPairs.size,
      actual_count: providedPairs.size,
    });
  }
  for (const pair of requiredPairs) {
    if (!providedPairs.has(pair)) {
      throw new HermesExecutionPlanContractError("PLATFORM_SCHEMA_VALIDATION_FAILED", "ExecutionPlan dependency record is missing", { dependency: pair });
    }
  }
  return dependencies;
}

function validateExecutionPlanToolIntents(value: unknown, steps: readonly HermesExecutionPlanStep[]): readonly HermesExecutionPlanToolIntent[] {
  const stepIds = new Set(steps.map((step) => step.step_id));
  const rawIntents = requirePlanArray(value, "tool_intents", 1);
  const seen = new Set<string>();
  return rawIntents.map((item, index): HermesExecutionPlanToolIntent => {
    const intent = requirePlanRecord(item, `tool_intents.${index}`);
    assertAllowedFields(intent, EXECUTION_PLAN_TOOL_INTENT_FIELDS, `tool_intents.${index}`);
    const tool_intent_id = requirePatternString(intent.tool_intent_id, `tool_intents.${index}.tool_intent_id`, /^tool_intent_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/);
    if (seen.has(tool_intent_id)) {
      throw new HermesExecutionPlanContractError("PLATFORM_SCHEMA_VALIDATION_FAILED", "ExecutionPlan tool_intent_id must be unique", { tool_intent_id });
    }
    seen.add(tool_intent_id);
    const step_id = requirePatternString(intent.step_id, `tool_intents.${index}.step_id`, /^step_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/);
    if (!stepIds.has(step_id)) {
      throw new HermesExecutionPlanContractError("PLATFORM_SCHEMA_VALIDATION_FAILED", "ExecutionPlan tool intent references an unknown step", { step_id });
    }
    return {
      tool_intent_id,
      step_id,
      capability: requirePatternString(intent.capability, `tool_intents.${index}.capability`, /^[a-z][a-z0-9_.-]{2,127}$/),
      executor_policy: validateExecutionPlanExecutorPolicy(intent.executor_policy, index),
      credential_refs: validateExecutionPlanCredentialRefs(intent.credential_refs, index),
      artifact_expectations: validateExecutionPlanArtifactExpectations(intent.artifact_expectations, index),
    };
  });
}

function validateExecutionPlanExecutorPolicy(value: unknown, index: number): HermesExecutionPlanToolIntent["executor_policy"] {
  const policy = requirePlanRecord(value, `tool_intents.${index}.executor_policy`);
  assertAllowedFields(policy, EXECUTION_PLAN_EXECUTOR_POLICY_FIELDS, `tool_intents.${index}.executor_policy`);
  if (policy.mode !== "platform_executor_required" || policy.require_policy_gate !== true || policy.allow_direct_execution !== false || policy.artifact_store !== "required") {
    throw new HermesExecutionPlanContractError("PLATFORM_POLICY_DENIED", "ExecutionPlan tool intent must require platform executor controls", {
      tool_intent_index: index,
    });
  }
  return {
    mode: "platform_executor_required",
    require_policy_gate: true,
    allow_direct_execution: false,
    artifact_store: "required",
  };
}

function validateExecutionPlanCredentialRefs(value: unknown, intentIndex: number): HermesExecutionPlanToolIntent["credential_refs"] {
  return requirePlanArray(value, `tool_intents.${intentIndex}.credential_refs`, 0).map((item, index) => {
    const credential = requirePlanRecord(item, `tool_intents.${intentIndex}.credential_refs.${index}`);
    assertAllowedFields(credential, EXECUTION_PLAN_CREDENTIAL_REF_FIELDS, `tool_intents.${intentIndex}.credential_refs.${index}`);
    return {
      credential_ref: requirePatternString(credential.credential_ref, `tool_intents.${intentIndex}.credential_refs.${index}.credential_ref`, /^cred_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/),
      purpose: requireEnum(credential.purpose, `tool_intents.${intentIndex}.credential_refs.${index}.purpose`, ["executor_tool"]),
    };
  });
}

function validateExecutionPlanArtifactExpectations(value: unknown, intentIndex: number): HermesExecutionPlanToolIntent["artifact_expectations"] {
  return requirePlanArray(value, `tool_intents.${intentIndex}.artifact_expectations`, 1).map((item, index) => {
    const expectation = requirePlanRecord(item, `tool_intents.${intentIndex}.artifact_expectations.${index}`);
    assertAllowedFields(expectation, EXECUTION_PLAN_ARTIFACT_EXPECTATION_FIELDS, `tool_intents.${intentIndex}.artifact_expectations.${index}`);
    return {
      kind: requireEnum(expectation.kind, `tool_intents.${intentIndex}.artifact_expectations.${index}.kind`, ["execution_result", "structured_output", "diagnostic"]),
      store: requireEnum(expectation.store, `tool_intents.${intentIndex}.artifact_expectations.${index}.store`, ["artifact_store"]),
      required: requirePlanBoolean(expectation.required, `tool_intents.${intentIndex}.artifact_expectations.${index}.required`),
    };
  });
}

function validateExecutionPlanBudget(value: unknown, stepCount: number): HermesExecutionPlan["budget"] {
  const budget = requirePlanRecord(value, "budget");
  assertAllowedFields(budget, EXECUTION_PLAN_BUDGET_FIELDS, "budget");
  const estimated_units = requirePositiveInteger(budget.estimated_units, "budget.estimated_units");
  const max_execution_steps = requirePositiveInteger(budget.max_execution_steps, "budget.max_execution_steps");
  if (max_execution_steps < stepCount) {
    throw new HermesExecutionPlanContractError("PLATFORM_POLICY_DENIED", "ExecutionPlan budget cannot be lower than planned step count", {
      max_execution_steps,
      step_count: stepCount,
    });
  }
  return {
    estimated_units,
    max_execution_steps,
    requires_approval: requirePlanBoolean(budget.requires_approval, "budget.requires_approval"),
  };
}

function validateExecutionPlanRisks(value: unknown): readonly HermesExecutionPlanRisk[] {
  return requirePlanArray(value, "risks", 1).map((item, index): HermesExecutionPlanRisk => {
    const risk = requirePlanRecord(item, `risks.${index}`);
    assertAllowedFields(risk, EXECUTION_PLAN_RISK_FIELDS, `risks.${index}`);
    return {
      risk_id: requirePatternString(risk.risk_id, `risks.${index}.risk_id`, /^risk_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/),
      severity: requireEnum(risk.severity, `risks.${index}.severity`, ["low", "medium", "high", "critical"]),
      mitigation: requirePlanString(risk.mitigation, `risks.${index}.mitigation`, 1, 240),
    };
  });
}

function validateExecutionPlanMemoryContext(value: unknown): HermesExecutionPlan["memory_context"] {
  const memory = requirePlanRecord(value, "memory_context");
  assertAllowedFields(memory, EXECUTION_PLAN_MEMORY_CONTEXT_FIELDS, "memory_context");
  if (memory.mode !== "memory_gateway_snapshot" || memory.direct_memory_access !== "blocked") {
    throw new HermesExecutionPlanContractError("PLATFORM_POLICY_DENIED", "ExecutionPlan memory context must use Memory Gateway controls");
  }
  return {
    mode: "memory_gateway_snapshot",
    layers: validateExecutionPlanMemoryLayers(memory.layers),
    snapshot_version: requireNonNegativeInteger(memory.snapshot_version, "memory_context.snapshot_version"),
    direct_memory_access: "blocked",
  };
}

function validateExecutionPlanMemoryLayers(value: unknown): readonly PlannerMemoryLayer[] {
  const layers = requirePlanArray(value, "memory_context.layers", 1).map((layer, index) =>
    requireEnum(layer, `memory_context.layers.${index}`, ["session", "user", "agent_skill"]),
  );
  return [...new Set(layers)];
}

function validateExecutionPlanTrace(value: unknown): HermesExecutionPlan["trace"] {
  const trace = requirePlanRecord(value, "trace");
  assertAllowedFields(trace, EXECUTION_PLAN_TRACE_FIELDS, "trace");
  return {
    source: requireEnum(trace.source, "trace.source", ["conversation_loop", "provider_fixture", "adapter_validation"]),
    planner_mode: requireEnum(trace.planner_mode, "trace.planner_mode", ["planner_only"]),
    provider_binding: requireEnum(trace.provider_binding, "trace.provider_binding", ["planner_provider_default"]),
    tool_runtime: requireEnum(trace.tool_runtime, "trace.tool_runtime", ["platform_executor_required"]),
    memory_runtime: requireEnum(trace.memory_runtime, "trace.memory_runtime", ["memory_gateway_required"]),
    gateway_runtime: requireEnum(trace.gateway_runtime, "trace.gateway_runtime", ["blocked"]),
  };
}

function assertNoExecutionPlanCycles(steps: readonly HermesExecutionPlanStep[]): void {
  const byId = new Map(steps.map((step) => [step.step_id, step]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (stepId: string): void => {
    if (visited.has(stepId)) return;
    if (visiting.has(stepId)) {
      throw new HermesExecutionPlanContractError("PLATFORM_SCHEMA_VALIDATION_FAILED", "ExecutionPlan step dependencies cannot contain cycles", {
        step_id: stepId,
      });
    }
    visiting.add(stepId);
    const step = byId.get(stepId);
    for (const dependency of step?.depends_on ?? []) visit(dependency);
    visiting.delete(stepId);
    visited.add(stepId);
  };
  for (const step of steps) visit(step.step_id);
}

function assertExecutionPlanPolicyDecisionShape(invocation: CoordinatorAdapterInvocation): void {
  if (invocation.policy_decision?.action !== "adapter.invoke" || invocation.policy_decision.allow !== true) {
    throw new HermesExecutionPlanContractError("PLATFORM_POLICY_DENIED", "ExecutionPlan validation requires an allowed Policy-Gate decision", {
      execution_id: invocation.execution_id,
      trace_id: invocation.trace_id,
    });
  }
  if (invocation.policy_decision.route?.adapter_kind !== "planner") {
    throw new HermesExecutionPlanContractError("PLATFORM_POLICY_DENIED", "ExecutionPlan validation must be routed as planner", {
      route: invocation.policy_decision.route,
    });
  }
}

function assertExecutionPlanMatchesInvocation(plan: HermesExecutionPlan, invocation: CoordinatorAdapterInvocation): void {
  const mismatches = [
    ["tenant_id", invocation.tenant_id, plan.tenant_id],
    ["task_id", invocation.task_id, plan.task_id],
    ["attempt_id", invocation.attempt_id, plan.attempt_id],
    ["execution_id", invocation.execution_id, plan.execution_id],
    ["conversation_id", invocation.conversation_id, plan.conversation_id],
    ["trace_id", invocation.trace_id, plan.trace_id],
  ].filter(([, expected, actual]) => expected !== undefined && expected !== actual);
  if (mismatches.length > 0) {
    throw new HermesExecutionPlanContractError("PLATFORM_POLICY_DENIED", "ExecutionPlan identity does not match Coordinator invocation", {
      mismatches,
    });
  }
}

function assertNoForbiddenExecutionPlanContent(value: unknown): void {
  const forbiddenKeys = /^(?:explanation|reasoning|final_response|model_explanation|chain_of_thought|credential_material|raw_credential|api_key|password|token|native_session_id|native_error|native_path|native_url|base_url|file_path|path|url|session_id)$/i;
  const forbiddenStrings = /MEMORY\.md|USER\.md|https?:\/\/|\b(?:native_session|native_error|api_key|raw_credential|credential_material|secret[-_ ]?token)\b|\b(?:Hermes|OpenClaw|DeepSeek|DSH)\b|\/(?:tmp|var|workspace|opt)\//i;
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item);
      return;
    }
    if (candidate && typeof candidate === "object") {
      for (const [key, item] of Object.entries(candidate)) {
        if (forbiddenKeys.test(key)) {
          throw new HermesExecutionPlanContractError("PLATFORM_SCHEMA_VALIDATION_FAILED", "ExecutionPlan contains a non-platform field", { field: key });
        }
        visit(item);
      }
      return;
    }
    if (typeof candidate === "string" && forbiddenStrings.test(candidate)) {
      throw new HermesExecutionPlanContractError("PLATFORM_SCHEMA_VALIDATION_FAILED", "ExecutionPlan contains non-platform content");
    }
  };
  visit(value);
}

function requireExecutionPlanPlatformId(plan: Record<string, unknown>, key: PlatformIdKey): string {
  try {
    return assertPlatformId(key, plan[key]);
  } catch {
    throw new HermesExecutionPlanContractError("PLATFORM_SCHEMA_VALIDATION_FAILED", "ExecutionPlan platform identifier is invalid", { field: key });
  }
}

function assertAllowedFields(record: Record<string, unknown>, allowed: ReadonlySet<string>, label: string): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new HermesExecutionPlanContractError("PLATFORM_SCHEMA_VALIDATION_FAILED", "ExecutionPlan contains an unsupported field", {
        field: `${label}.${key}`,
      });
    }
  }
}

function requirePlanRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HermesExecutionPlanContractError("PLATFORM_SCHEMA_VALIDATION_FAILED", "ExecutionPlan field must be an object", { field });
  }
  return value as Record<string, unknown>;
}

function requirePlanArray(value: unknown, field: string, minItems: number): unknown[] {
  if (!Array.isArray(value) || value.length < minItems) {
    throw new HermesExecutionPlanContractError("PLATFORM_SCHEMA_VALIDATION_FAILED", "ExecutionPlan field must be an array", { field, min_items: minItems });
  }
  return value;
}

function requirePlanString(value: unknown, field: string, minLength: number, maxLength: number): string {
  if (typeof value !== "string") {
    throw new HermesExecutionPlanContractError("PLATFORM_SCHEMA_VALIDATION_FAILED", "ExecutionPlan field must be a string", { field });
  }
  const normalized = value.trim();
  if (normalized.length < minLength || normalized.length > maxLength) {
    throw new HermesExecutionPlanContractError("PLATFORM_SCHEMA_VALIDATION_FAILED", "ExecutionPlan string field length is invalid", {
      field,
      min_length: minLength,
      max_length: maxLength,
    });
  }
  return normalized;
}

function requirePatternString(value: unknown, field: string, pattern: RegExp): string {
  const text = requirePlanString(value, field, 1, 240);
  if (!pattern.test(text)) {
    throw new HermesExecutionPlanContractError("PLATFORM_SCHEMA_VALIDATION_FAILED", "ExecutionPlan string field pattern is invalid", { field });
  }
  return text;
}

function requirePlanBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new HermesExecutionPlanContractError("PLATFORM_SCHEMA_VALIDATION_FAILED", "ExecutionPlan field must be a boolean", { field });
  }
  return value;
}

function requirePositiveInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new HermesExecutionPlanContractError("PLATFORM_SCHEMA_VALIDATION_FAILED", "ExecutionPlan field must be a positive integer", { field });
  }
  return Number(value);
}

function requireNonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new HermesExecutionPlanContractError("PLATFORM_SCHEMA_VALIDATION_FAILED", "ExecutionPlan field must be a non-negative integer", { field });
  }
  return Number(value);
}

function requireEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new HermesExecutionPlanContractError("PLATFORM_SCHEMA_VALIDATION_FAILED", "ExecutionPlan field enum value is invalid", { field });
  }
  return value as T;
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
        .replace(/\/(?:tmp|var|workspace|opt)\/[^\s"']+/gi, "[redacted-path]")
        .replace(/\b(?:native_session_id|native_session|native_error|native_path|native_url|credential_material|raw_credential|api_key|password|token|final_response|base_url|session_id|file_path|path|url)\b/gi, "[redacted-field]")
        .replace(/MEMORY\.md|USER\.md/gi, "[redacted-memory-file]");
    }
    return item;
  });
  return JSON.parse(raw) as Record<string, unknown>;
}
