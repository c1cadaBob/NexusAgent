import {
  assertTrustedAdapterInvocation,
  type AdapterHealth,
  type AdapterLifecycleStatus,
  type LifecycleAdapterPort,
} from "../index.ts";
import type { CoordinatorAdapterInvocation, CoordinatorAdapterResult } from "../../coordinator/index.ts";
import {
  assertMonotonicMs,
  assertPlatformId,
  assertUtcTimestamp,
} from "../../task-state/index.ts";
import { runDsh011Rc2ProviderFixture } from "./providers/dsh-0.1.1-rc.2/index.ts";

export const DSH_BASELINE_PROVIDER_ID = "dsh-0.1.1-rc.2";
export const DSH_PROVIDER_CONTRACT_VERSION = "nexus.dsh_provider.p2.v1";
export const DSH_EXECUTION_REQUEST_SCHEMA_VERSION = "nexus.execution_request.p2.v1";
export const DSH_EXECUTION_RESULT_SCHEMA_VERSION = "nexus.execution_result.p2.v1";
export const DSH_EXECUTION_EVENT_SCHEMA_VERSION = "nexus.execution_event.p2.v1";

export type DshProviderRole = "executor-only";
export type DshProviderStatus = "enabled" | "disabled";

export interface DshProviderMetadata {
  provider_id: string;
  version: string;
  role: DshProviderRole;
  status: DshProviderStatus;
  contract_version: typeof DSH_PROVIDER_CONTRACT_VERSION;
  vendor_path: string;
  source: "vendor-snapshot" | "test-fixture";
  capabilities: readonly string[];
  disabled_reason?: string;
}

export interface DshProviderStatusView {
  provider_id: string;
  role: DshProviderRole;
  status: DshProviderStatus;
  contract_version: typeof DSH_PROVIDER_CONTRACT_VERSION;
  is_default: boolean;
  capabilities: readonly string[];
  rollback_provider_id?: string;
}

export class DshProviderRegistryError extends Error {
  readonly code:
    | "PLATFORM_INVALID_REQUEST"
    | "PLATFORM_NOT_FOUND"
    | "PLATFORM_CONFLICT"
    | "PLATFORM_SERVICE_UNHEALTHY";
  readonly details: Record<string, unknown>;

  constructor(code: DshProviderRegistryError["code"], message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "DshProviderRegistryError";
    this.code = code;
    this.details = details;
  }
}

export type DshExecutionResultStatus = "accepted" | "completed" | "failed" | "blocked" | "cancelled";
export type DshCoordinatorResultStatus = CoordinatorAdapterResult["status"];
export type DshNetworkPolicy = "deny_by_default" | "approved_destinations_only" | "host_sidecar_only";
export type DshSandboxPolicyMode = "required" | "host_managed";
export type DshSandboxFileSystem = "deny_by_default" | "workspace_readonly";

export interface DshExecutionRequest {
  schema_version: typeof DSH_EXECUTION_REQUEST_SCHEMA_VERSION;
  tenant_id: string;
  user_id?: string;
  agent_id?: string;
  task_id: string;
  attempt_id: string;
  execution_id: string;
  conversation_id?: string;
  trace_id: string;
  requested_at_utc: string;
  monotonic_ms: number;
  provider_id?: string;
  tool: {
    name: string;
    input: Record<string, unknown>;
  };
  policy: {
    mode: "executor-only";
    allow_native_agent_loop: false;
    require_policy_gate: true;
    require_artifact_store: true;
    allowed_tools: readonly string[];
  };
  sandbox_policy: {
    mode: DshSandboxPolicyMode;
    file_system: DshSandboxFileSystem;
  };
  network_policy: DshNetworkPolicy;
  artifact_policy: {
    mode: "reference_only";
    store: "artifact_store";
  };
  credential_refs: readonly {
    credential_ref: string;
    purpose: "executor_tool";
  }[];
  cancel?: {
    requested: boolean;
    reason?: string;
  };
}

export interface DshPlatformError {
  code:
    | "PLATFORM_INVALID_REQUEST"
    | "PLATFORM_NOT_FOUND"
    | "PLATFORM_CONFLICT"
    | "PLATFORM_POLICY_DENIED"
    | "PLATFORM_SCHEMA_VALIDATION_FAILED"
    | "PLATFORM_SERVICE_UNHEALTHY"
    | "PLATFORM_PROVIDER_UNAVAILABLE"
    | "PLATFORM_TIMEOUT"
    | "PLATFORM_INTERNAL_ERROR";
  message: string;
  trace_id: string;
  details?: Record<string, unknown>;
}

export interface DshProviderExecutionEvent {
  schema_version: typeof DSH_EXECUTION_EVENT_SCHEMA_VERSION;
  execution_id: string;
  trace_id: string;
  provider_id: string;
  event_type: "execution.accepted" | "execution.blocked" | "execution.cancelled" | "tool.blocked" | "tool.result";
  status: "accepted" | "blocked" | "cancelled" | "completed" | "failed";
  payload: Record<string, unknown>;
}

export interface DshExecutionResult {
  schema_version: typeof DSH_EXECUTION_RESULT_SCHEMA_VERSION;
  tenant_id: string;
  task_id: string;
  attempt_id: string;
  execution_id: string;
  trace_id: string;
  provider_id: string;
  execution_outcome: DshExecutionResultStatus;
  monotonic_ms: number;
  completed_monotonic_ms: number;
  events: readonly DshProviderExecutionEvent[];
  artifacts: readonly Record<string, unknown>[];
  output: Record<string, unknown>;
  error?: DshPlatformError;
}

export class DshAdapterError extends Error {
  readonly code: DshPlatformError["code"];
  readonly details: Record<string, unknown>;

  constructor(code: DshAdapterError["code"], message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "DshAdapterError";
    this.code = code;
    this.details = sanitizeDetails(details);
  }
}

export type DshProviderRunner = (
  request: DshExecutionRequest,
  provider: DshProviderMetadata,
) => DshExecutionResult | Promise<DshExecutionResult>;

export interface DshExecutorAdapterOptions {
  name?: string;
  registry?: DshProviderRegistry;
  providerRunner?: DshProviderRunner;
}

export function baselineDshProviderMetadata(overrides: Partial<DshProviderMetadata> = {}): DshProviderMetadata {
  return normalizeProviderMetadata({
    provider_id: DSH_BASELINE_PROVIDER_ID,
    version: "0.1.1-rc.2",
    role: "executor-only",
    status: "enabled",
    contract_version: DSH_PROVIDER_CONTRACT_VERSION,
    vendor_path: "vendor/deepseek-harness-master",
    source: "vendor-snapshot",
    capabilities: ["tool-execution", "cancellation", "provider-disable", "provider-rollback"],
    ...overrides,
  });
}

export class DshProviderRegistry {
  readonly #providers = new Map<string, DshProviderMetadata>();
  #defaultProviderId: string;
  #rollbackProviderId: string | undefined;

  constructor(providers: readonly DshProviderMetadata[] = [baselineDshProviderMetadata()]) {
    if (providers.length === 0) {
      throw new DshProviderRegistryError("PLATFORM_INVALID_REQUEST", "At least one executor provider is required");
    }
    for (const provider of providers) this.register(provider);
    this.#defaultProviderId = providers[0].provider_id;
  }

  register(provider: DshProviderMetadata): void {
    const normalized = normalizeProviderMetadata(provider);
    if (this.#providers.has(normalized.provider_id)) {
      throw new DshProviderRegistryError("PLATFORM_CONFLICT", "Executor provider is already registered", {
        provider_id: normalized.provider_id,
      });
    }
    this.#providers.set(normalized.provider_id, normalized);
  }

  list(): readonly DshProviderStatusView[] {
    return [...this.#providers.values()].map((provider) => this.#view(provider));
  }

  get(provider_id: string): DshProviderMetadata {
    const provider = this.#providers.get(provider_id);
    if (!provider) {
      throw new DshProviderRegistryError("PLATFORM_NOT_FOUND", "Executor provider is not registered", { provider_id });
    }
    return { ...provider, capabilities: [...provider.capabilities] };
  }

  requireEnabledProvider(provider_id: string): DshProviderMetadata {
    const provider = this.#requireEnabled(provider_id);
    return { ...provider, capabilities: [...provider.capabilities] };
  }

  defaultProvider(): DshProviderStatusView {
    return this.#view(this.#requireEnabled(this.#defaultProviderId));
  }

  selectDefault(provider_id: string): DshProviderStatusView {
    const provider = this.#requireEnabled(provider_id);
    if (provider.provider_id !== this.#defaultProviderId) {
      this.#rollbackProviderId = this.#defaultProviderId;
      this.#defaultProviderId = provider.provider_id;
    }
    return this.#view(provider);
  }

  disable(provider_id: string, reason = "provider disabled by platform configuration"): DshProviderStatusView {
    const provider = this.#providers.get(provider_id);
    if (!provider) {
      throw new DshProviderRegistryError("PLATFORM_NOT_FOUND", "Executor provider is not registered", { provider_id });
    }
    const disabled = normalizeProviderMetadata({ ...provider, status: "disabled", disabled_reason: reason });
    this.#providers.set(provider_id, disabled);
    return this.#view(disabled);
  }

  enable(provider_id: string): DshProviderStatusView {
    const provider = this.#providers.get(provider_id);
    if (!provider) {
      throw new DshProviderRegistryError("PLATFORM_NOT_FOUND", "Executor provider is not registered", { provider_id });
    }
    const enabled = normalizeProviderMetadata({ ...provider, status: "enabled", disabled_reason: undefined });
    this.#providers.set(provider_id, enabled);
    return this.#view(enabled);
  }

  rollbackDefault(): DshProviderStatusView {
    if (this.#rollbackProviderId === undefined) {
      throw new DshProviderRegistryError("PLATFORM_NOT_FOUND", "No rollback executor provider has been selected");
    }
    const rollback = this.#requireEnabled(this.#rollbackProviderId);
    const previous = this.#defaultProviderId;
    this.#defaultProviderId = rollback.provider_id;
    this.#rollbackProviderId = previous;
    return this.#view(rollback);
  }

  #requireEnabled(provider_id: string): DshProviderMetadata {
    const provider = this.#providers.get(provider_id);
    if (!provider) {
      throw new DshProviderRegistryError("PLATFORM_NOT_FOUND", "Executor provider is not registered", { provider_id });
    }
    if (provider.status !== "enabled") {
      throw new DshProviderRegistryError("PLATFORM_SERVICE_UNHEALTHY", "Executor provider is disabled", {
        provider_id,
        reason: provider.disabled_reason,
      });
    }
    return provider;
  }

  #view(provider: DshProviderMetadata): DshProviderStatusView {
    return {
      provider_id: provider.provider_id,
      role: provider.role,
      status: provider.status,
      contract_version: provider.contract_version,
      is_default: provider.provider_id === this.#defaultProviderId,
      capabilities: [...provider.capabilities],
      ...this.#rollbackProviderId === undefined ? {} : { rollback_provider_id: this.#rollbackProviderId },
    };
  }
}

export class DshExecutorAdapter implements LifecycleAdapterPort {
  readonly name: string;
  readonly kind = "executor" as const;
  readonly #registry: DshProviderRegistry;
  readonly #providerRunner: DshProviderRunner;
  #status: AdapterLifecycleStatus = "created";

  constructor(options: DshExecutorAdapterOptions = {}) {
    this.name = options.name ?? "dsh-executor";
    this.#registry = options.registry ?? new DshProviderRegistry();
    this.#providerRunner = options.providerRunner ?? runDsh011Rc2ProviderFixture;
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
      "execution_request.p2",
      "execution_result.p2",
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
      throw new DshAdapterError("PLATFORM_SERVICE_UNHEALTHY", "Executor adapter must be started before invocation", {
        adapter_name: this.name,
        status: this.#status,
      });
    }
    assertPolicyDecisionShape(invocation);

    const request = validateDshExecutionRequest(invocation.payload);
    assertRequestMatchesInvocation(request, invocation);
    const provider = this.#registry.requireEnabledProvider(request.provider_id ?? this.#registry.defaultProvider().provider_id);

    try {
      const rawResult = await this.#providerRunner(request, provider);
      const result = sanitizeDshExecutionResult(rawResult, request, provider);
      return {
        tenant_id: request.tenant_id,
        task_id: request.task_id,
        attempt_id: request.attempt_id,
        execution_id: request.execution_id,
        trace_id: request.trace_id,
        status: coordinatorStatusFor(result.execution_outcome),
        payload: {
          schema_version: DSH_EXECUTION_RESULT_SCHEMA_VERSION,
          provider_id: result.provider_id,
          execution_outcome: result.execution_outcome,
          execution_result: result,
          events: result.events,
        },
      };
    } catch (error) {
      if (error instanceof DshAdapterError) throw error;
      throw new DshAdapterError("PLATFORM_INTERNAL_ERROR", "Executor provider failed", {
        provider_id: provider.provider_id,
        trace_id: request.trace_id,
      });
    }
  }
}

export function buildDshExecutionRequestFixture(
  overrides: Partial<DshExecutionRequest> = {},
): DshExecutionRequest {
  return validateDshExecutionRequest({
    schema_version: DSH_EXECUTION_REQUEST_SCHEMA_VERSION,
    tenant_id: "tenant_alpha01",
    user_id: "user_alpha01",
    agent_id: "agent_alpha01",
    task_id: "task_alpha01",
    attempt_id: "attempt_alpha01",
    execution_id: "exec_alpha01",
    conversation_id: "conv_alpha01",
    trace_id: "trace_alpha01",
    requested_at_utc: "2026-08-24T00:00:00Z",
    monotonic_ms: 100,
    provider_id: DSH_BASELINE_PROVIDER_ID,
    tool: { name: "bash", input: { command_ref: "artifact_alpha01" } },
    policy: {
      mode: "executor-only",
      allow_native_agent_loop: false,
      require_policy_gate: true,
      require_artifact_store: true,
      allowed_tools: ["bash"],
    },
    sandbox_policy: { mode: "required", file_system: "deny_by_default" },
    network_policy: "deny_by_default",
    artifact_policy: { mode: "reference_only", store: "artifact_store" },
    credential_refs: [{ credential_ref: "cred_alpha01_001", purpose: "executor_tool" }],
    ...overrides,
  });
}

export function buildDshProviderContractFixtures(): readonly {
  provider: DshProviderMetadata;
  request: DshExecutionRequest;
}[] {
  const baseline = baselineDshProviderMetadata();
  const candidate = baselineDshProviderMetadata({
    provider_id: "dsh-0.1.1-rc.2-fixture",
    source: "test-fixture",
  });
  return [baseline, candidate].map((provider) => ({
    provider,
    request: buildDshExecutionRequestFixture({ provider_id: provider.provider_id }),
  }));
}

export function validateDshExecutionRequest(value: unknown): DshExecutionRequest {
  assertNoNativeRequestFields(value);
  const request = requireRecord(value, "ExecutionRequest");
  if (request.schema_version !== DSH_EXECUTION_REQUEST_SCHEMA_VERSION) {
    throw new DshAdapterError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Unsupported ExecutionRequest schema version", {
      schema_version: request.schema_version,
    });
  }
  const tool = requireRecord(request.tool, "ExecutionRequest.tool");
  const policy = requireRecord(request.policy, "ExecutionRequest.policy");
  const sandboxPolicy = requireRecord(request.sandbox_policy, "ExecutionRequest.sandbox_policy");
  const artifactPolicy = requireRecord(request.artifact_policy, "ExecutionRequest.artifact_policy");
  const credentialRefs = validateCredentialRefs(request.credential_refs);

  if (typeof tool.name !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(tool.name)) {
    throw new DshAdapterError("PLATFORM_INVALID_REQUEST", "ExecutionRequest tool name is invalid", { tool_name: tool.name });
  }
  const toolInput = requireRecord(tool.input, "ExecutionRequest.tool.input");

  if (policy.mode !== "executor-only" || policy.allow_native_agent_loop !== false
    || policy.require_policy_gate !== true || policy.require_artifact_store !== true) {
    throw new DshAdapterError("PLATFORM_POLICY_DENIED", "ExecutionRequest must require executor-only platform policy");
  }
  if (!Array.isArray(policy.allowed_tools) || policy.allowed_tools.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new DshAdapterError("PLATFORM_INVALID_REQUEST", "ExecutionRequest policy allowed_tools must be strings");
  }
  if (sandboxPolicy.mode !== "required" && sandboxPolicy.mode !== "host_managed") {
    throw new DshAdapterError("PLATFORM_INVALID_REQUEST", "ExecutionRequest sandbox_policy mode is invalid", {
      sandbox_policy: sandboxPolicy.mode,
    });
  }
  if (sandboxPolicy.file_system !== "deny_by_default" && sandboxPolicy.file_system !== "workspace_readonly") {
    throw new DshAdapterError("PLATFORM_INVALID_REQUEST", "ExecutionRequest sandbox file_system policy is invalid", {
      file_system: sandboxPolicy.file_system,
    });
  }
  if (!["deny_by_default", "approved_destinations_only", "host_sidecar_only"].includes(String(request.network_policy))) {
    throw new DshAdapterError("PLATFORM_INVALID_REQUEST", "ExecutionRequest network_policy is invalid", {
      network_policy: request.network_policy,
    });
  }
  if (artifactPolicy.mode !== "reference_only" || artifactPolicy.store !== "artifact_store") {
    throw new DshAdapterError("PLATFORM_INVALID_REQUEST", "ExecutionRequest artifact_policy must require platform artifact references");
  }

  return {
    schema_version: DSH_EXECUTION_REQUEST_SCHEMA_VERSION,
    tenant_id: assertPlatformId("tenant_id", request.tenant_id),
    ...request.user_id === undefined ? {} : { user_id: assertPlatformId("user_id", request.user_id) },
    ...request.agent_id === undefined ? {} : { agent_id: assertPlatformId("agent_id", request.agent_id) },
    task_id: assertPlatformId("task_id", request.task_id),
    attempt_id: assertPlatformId("attempt_id", request.attempt_id),
    execution_id: assertPlatformId("execution_id", request.execution_id),
    ...request.conversation_id === undefined ? {} : { conversation_id: assertPlatformId("conversation_id", request.conversation_id) },
    trace_id: assertPlatformId("trace_id", request.trace_id),
    requested_at_utc: assertUtcTimestamp(request.requested_at_utc, "ExecutionRequest.requested_at_utc"),
    monotonic_ms: assertMonotonicMs(request.monotonic_ms, "ExecutionRequest.monotonic_ms"),
    ...request.provider_id === undefined ? {} : { provider_id: validateProviderId(request.provider_id) },
    tool: { name: tool.name, input: cloneRecord(toolInput) },
    policy: {
      mode: "executor-only",
      allow_native_agent_loop: false,
      require_policy_gate: true,
      require_artifact_store: true,
      allowed_tools: [...new Set(policy.allowed_tools as string[])].sort(),
    },
    sandbox_policy: {
      mode: sandboxPolicy.mode as DshSandboxPolicyMode,
      file_system: sandboxPolicy.file_system as DshSandboxFileSystem,
    },
    network_policy: request.network_policy as DshNetworkPolicy,
    artifact_policy: { mode: "reference_only", store: "artifact_store" },
    credential_refs: credentialRefs,
    ...request.cancel === undefined ? {} : { cancel: validateCancel(request.cancel) },
  };
}

export function sanitizeDshExecutionResult(
  value: unknown,
  request: DshExecutionRequest,
  provider: DshProviderMetadata,
): DshExecutionResult {
  const result = requireRecord(value, "ExecutionResult");
  if (result.schema_version !== DSH_EXECUTION_RESULT_SCHEMA_VERSION) {
    throw new DshAdapterError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Unsupported ExecutionResult schema version", {
      provider_id: provider.provider_id,
    });
  }
  const executionOutcome = validateExecutionOutcome(result.execution_outcome);
  const sanitized: DshExecutionResult = {
    schema_version: DSH_EXECUTION_RESULT_SCHEMA_VERSION,
    tenant_id: assertPlatformId("tenant_id", result.tenant_id),
    task_id: assertPlatformId("task_id", result.task_id),
    attempt_id: assertPlatformId("attempt_id", result.attempt_id),
    execution_id: assertPlatformId("execution_id", result.execution_id),
    trace_id: assertPlatformId("trace_id", result.trace_id),
    provider_id: validateProviderId(result.provider_id),
    execution_outcome: executionOutcome,
    monotonic_ms: assertMonotonicMs(result.monotonic_ms, "ExecutionResult.monotonic_ms"),
    completed_monotonic_ms: assertMonotonicMs(result.completed_monotonic_ms, "ExecutionResult.completed_monotonic_ms"),
    events: validateProviderEvents(result.events, request, provider),
    artifacts: Array.isArray(result.artifacts) ? result.artifacts.map((artifact) => sanitizeDetails(requireRecord(artifact, "artifact"))) : [],
    output: sanitizeDetails(requireRecord(result.output ?? {}, "ExecutionResult.output")),
    ...result.error === undefined ? {} : { error: sanitizePlatformError(result.error, request.trace_id) },
  };
  assertResultMatchesRequest(sanitized, request, provider);
  return sanitized;
}

function normalizeProviderMetadata(provider: DshProviderMetadata): DshProviderMetadata {
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(provider.provider_id)) {
    throw new DshProviderRegistryError("PLATFORM_INVALID_REQUEST", "Invalid executor provider_id", {
      provider_id: provider.provider_id,
    });
  }
  if (provider.role !== "executor-only") {
    throw new DshProviderRegistryError("PLATFORM_INVALID_REQUEST", "Executor provider must be executor-only", {
      provider_id: provider.provider_id,
      role: provider.role,
    });
  }
  if (provider.status !== "enabled" && provider.status !== "disabled") {
    throw new DshProviderRegistryError("PLATFORM_INVALID_REQUEST", "Invalid executor provider status", {
      provider_id: provider.provider_id,
      status: provider.status,
    });
  }
  if (provider.contract_version !== DSH_PROVIDER_CONTRACT_VERSION) {
    throw new DshProviderRegistryError("PLATFORM_INVALID_REQUEST", "Executor provider contract version drift", {
      provider_id: provider.provider_id,
      contract_version: provider.contract_version,
    });
  }
  if (!Array.isArray(provider.capabilities) || provider.capabilities.some((capability) => typeof capability !== "string" || capability.length === 0)) {
    throw new DshProviderRegistryError("PLATFORM_INVALID_REQUEST", "Executor provider capabilities must be non-empty strings", {
      provider_id: provider.provider_id,
    });
  }
  return {
    ...provider,
    capabilities: [...new Set(provider.capabilities)].sort(),
    ...provider.disabled_reason === undefined ? {} : { disabled_reason: provider.disabled_reason },
  };
}

function coordinatorStatusFor(executionOutcome: DshExecutionResultStatus): DshCoordinatorResultStatus {
  if (executionOutcome === "accepted") return "accepted";
  if (executionOutcome === "completed") return "completed";
  return "failed";
}

function assertPolicyDecisionShape(invocation: CoordinatorAdapterInvocation): void {
  if (invocation.policy_decision?.action !== "adapter.invoke" || invocation.policy_decision.allow !== true) {
    throw new DshAdapterError("PLATFORM_POLICY_DENIED", "Executor adapter invocation requires an allowed Policy-Gate decision", {
      execution_id: invocation.execution_id,
      trace_id: invocation.trace_id,
    });
  }
  if (invocation.policy_decision.route?.adapter_kind !== "executor") {
    throw new DshAdapterError("PLATFORM_POLICY_DENIED", "Executor adapter invocation must be routed as executor", {
      route: invocation.policy_decision.route,
    });
  }
}

function assertRequestMatchesInvocation(request: DshExecutionRequest, invocation: CoordinatorAdapterInvocation): void {
  const mismatches = [
    ["tenant_id", invocation.tenant_id, request.tenant_id],
    ["task_id", invocation.task_id, request.task_id],
    ["attempt_id", invocation.attempt_id, request.attempt_id],
    ["execution_id", invocation.execution_id, request.execution_id],
    ["conversation_id", invocation.conversation_id, request.conversation_id],
    ["trace_id", invocation.trace_id, request.trace_id],
  ].filter(([, expected, actual]) => expected !== undefined && actual !== undefined && expected !== actual);
  if (mismatches.length > 0) {
    throw new DshAdapterError("PLATFORM_POLICY_DENIED", "ExecutionRequest identity does not match Coordinator invocation", {
      mismatches,
    });
  }
}

function assertResultMatchesRequest(
  result: DshExecutionResult,
  request: DshExecutionRequest,
  provider: DshProviderMetadata,
): void {
  const mismatches = [
    ["tenant_id", request.tenant_id, result.tenant_id],
    ["task_id", request.task_id, result.task_id],
    ["attempt_id", request.attempt_id, result.attempt_id],
    ["execution_id", request.execution_id, result.execution_id],
    ["trace_id", request.trace_id, result.trace_id],
    ["provider_id", provider.provider_id, result.provider_id],
  ].filter(([, expected, actual]) => expected !== actual);
  if (mismatches.length > 0) {
    throw new DshAdapterError("PLATFORM_POLICY_DENIED", "ExecutionResult changed platform identity fields", {
      mismatches,
    });
  }
}

function validateProviderEvents(
  value: unknown,
  request: DshExecutionRequest,
  provider: DshProviderMetadata,
): readonly DshProviderExecutionEvent[] {
  if (!Array.isArray(value)) {
    throw new DshAdapterError("PLATFORM_SCHEMA_VALIDATION_FAILED", "ExecutionResult events must be an array");
  }
  return value.map((event) => {
    const record = requireRecord(event, "ExecutionEvent");
    const sanitized: DshProviderExecutionEvent = {
      schema_version: DSH_EXECUTION_EVENT_SCHEMA_VERSION,
      execution_id: assertPlatformId("execution_id", record.execution_id),
      trace_id: assertPlatformId("trace_id", record.trace_id),
      provider_id: validateProviderId(record.provider_id),
      event_type: validateProviderEventType(record.event_type),
      status: validateProviderEventStatus(record.status),
      payload: sanitizeDetails(requireRecord(record.payload ?? {}, "ExecutionEvent.payload")),
    };
    if (sanitized.execution_id !== request.execution_id || sanitized.trace_id !== request.trace_id
      || sanitized.provider_id !== provider.provider_id) {
      throw new DshAdapterError("PLATFORM_POLICY_DENIED", "ExecutionEvent identity does not match platform request", {
        provider_id: provider.provider_id,
      });
    }
    return sanitized;
  });
}

function validateProviderEventType(value: unknown): DshProviderExecutionEvent["event_type"] {
  if (["execution.accepted", "execution.blocked", "execution.cancelled", "tool.blocked", "tool.result"].includes(String(value))) {
    return value as DshProviderExecutionEvent["event_type"];
  }
  throw new DshAdapterError("PLATFORM_SCHEMA_VALIDATION_FAILED", "ExecutionEvent event_type is invalid", {
    event_type: value,
  });
}

function validateProviderEventStatus(value: unknown): DshProviderExecutionEvent["status"] {
  if (["accepted", "blocked", "cancelled", "completed", "failed"].includes(String(value))) {
    return value as DshProviderExecutionEvent["status"];
  }
  throw new DshAdapterError("PLATFORM_SCHEMA_VALIDATION_FAILED", "ExecutionEvent status is invalid", { status: value });
}

function validateExecutionOutcome(value: unknown): DshExecutionResultStatus {
  if (["accepted", "completed", "failed", "blocked", "cancelled"].includes(String(value))) {
    return value as DshExecutionResultStatus;
  }
  throw new DshAdapterError("PLATFORM_SCHEMA_VALIDATION_FAILED", "ExecutionResult execution_outcome is invalid", {
    execution_outcome: value,
  });
}

function sanitizePlatformError(value: unknown, fallbackTraceId: string): DshPlatformError {
  const error = requireRecord(value, "PlatformError");
  const code = isPlatformErrorCode(error.code) ? error.code : "PLATFORM_INTERNAL_ERROR";
  const message = typeof error.message === "string" && !containsNativeLeak(error.message)
    ? error.message
    : "Executor provider returned a platform error";
  return {
    code,
    message,
    trace_id: typeof error.trace_id === "string" ? assertPlatformId("trace_id", error.trace_id) : fallbackTraceId,
    ...error.details === undefined ? {} : { details: sanitizeDetails(requireRecord(error.details, "PlatformError.details")) },
  };
}

function isPlatformErrorCode(value: unknown): value is DshPlatformError["code"] {
  return typeof value === "string" && [
    "PLATFORM_INVALID_REQUEST",
    "PLATFORM_NOT_FOUND",
    "PLATFORM_CONFLICT",
    "PLATFORM_POLICY_DENIED",
    "PLATFORM_SCHEMA_VALIDATION_FAILED",
    "PLATFORM_SERVICE_UNHEALTHY",
    "PLATFORM_PROVIDER_UNAVAILABLE",
    "PLATFORM_TIMEOUT",
    "PLATFORM_INTERNAL_ERROR",
  ].includes(value);
}

function validateCredentialRefs(value: unknown): DshExecutionRequest["credential_refs"] {
  if (!Array.isArray(value)) {
    throw new DshAdapterError("PLATFORM_INVALID_REQUEST", "ExecutionRequest credential_refs must be an array");
  }
  return value.map((item) => {
    const record = requireRecord(item, "ExecutionRequest.credential_refs[]");
    if (typeof record.credential_ref !== "string" || !/^cred_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/.test(record.credential_ref)) {
      throw new DshAdapterError("PLATFORM_INVALID_REQUEST", "ExecutionRequest credential_ref is invalid", {
        credential_ref: record.credential_ref,
      });
    }
    if (record.purpose !== "executor_tool") {
      throw new DshAdapterError("PLATFORM_POLICY_DENIED", "ExecutionRequest credential purpose must be executor_tool", {
        purpose: record.purpose,
      });
    }
    return { credential_ref: record.credential_ref, purpose: "executor_tool" as const };
  });
}

function validateCancel(value: unknown): DshExecutionRequest["cancel"] {
  const cancel = requireRecord(value, "ExecutionRequest.cancel");
  if (typeof cancel.requested !== "boolean") {
    throw new DshAdapterError("PLATFORM_INVALID_REQUEST", "ExecutionRequest cancel.requested must be boolean");
  }
  return {
    requested: cancel.requested,
    ...cancel.reason === undefined ? {} : { reason: requireNonEmptyString(cancel.reason, "cancel.reason") },
  };
}

function validateProviderId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(value)) {
    throw new DshAdapterError("PLATFORM_INVALID_REQUEST", "Invalid executor provider_id", { provider_id: value });
  }
  return value;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new DshAdapterError("PLATFORM_INVALID_REQUEST", `${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new DshAdapterError("PLATFORM_INVALID_REQUEST", `${field} must be a non-empty string`, { field });
  }
  return value;
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function sanitizeDetails(value: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (isForbiddenNativeField(key) || containsNativeLeak(item)) continue;
    if (typeof item === "object" && item !== null && !Array.isArray(item)) {
      sanitized[key] = sanitizeDetails(item as Record<string, unknown>);
    } else if (Array.isArray(item)) {
      sanitized[key] = item
        .filter((entry) => !containsNativeLeak(entry))
        .map((entry) => typeof entry === "object" && entry !== null && !Array.isArray(entry)
          ? sanitizeDetails(entry as Record<string, unknown>)
          : entry);
    } else {
      sanitized[key] = item;
    }
  }
  return sanitized;
}

function assertNoNativeRequestFields(value: unknown): void {
  if (hasForbiddenNativeField(value)) {
    throw new DshAdapterError("PLATFORM_INVALID_REQUEST", "ExecutionRequest contains non-platform native fields");
  }
}

function hasForbiddenNativeField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => hasForbiddenNativeField(item));
  if (typeof value !== "object" || value === null) return false;
  return Object.entries(value as Record<string, unknown>).some(([key, item]) => (
    isForbiddenNativeField(key) || hasForbiddenNativeField(item)
  ));
}

function isForbiddenNativeField(key: string): boolean {
  return [
    "native_session_id",
    "native_url",
    "native_error",
    "native_error_code",
    "upstream_error_code",
    "vendor_path",
    "native_path",
    "session_id",
    "secret_value",
    "plaintext",
  ].includes(key);
}

function containsNativeLeak(value: unknown): boolean {
  if (typeof value === "string") {
    return /https?:\/\/|\/tmp\/|\/workspace\/|native[_ -]?error|session[_ -]?id|secret[_ -]?value|plaintext/i.test(value);
  }
  if (Array.isArray(value)) return value.some((item) => containsNativeLeak(item));
  if (typeof value === "object" && value !== null) {
    return Object.entries(value as Record<string, unknown>).some(([key, item]) => (
      isForbiddenNativeField(key) || containsNativeLeak(item)
    ));
  }
  return false;
}
