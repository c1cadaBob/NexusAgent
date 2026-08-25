import {
  assertTrustedAdapterInvocation,
  type AdapterHealth,
  type AdapterLifecycleStatus,
  type LifecycleAdapterPort,
} from "../index.ts";
import type { CoordinatorAdapterInvocation, CoordinatorAdapterResult, CoordinatorTaskRequest } from "../../coordinator/index.ts";
import { type EventBus, type PlatformEventEnvelope } from "../../event-bus/index.ts";
import {
  assertMonotonicMs,
  assertPlatformId,
  assertUtcTimestamp,
} from "../../task-state/index.ts";
import {
  buildOpenClawCommandIdempotencyKey,
  buildOpenClawCommandMapping,
  OPENCLAW_COMMAND_MAPPING_SCHEMA_VERSION,
} from "./command-mapping.ts";

export {
  buildOpenClawCommandIdempotencyKey,
  buildOpenClawCommandMapping,
  normalizeOpenClawCommandText,
  OPENCLAW_COMMAND_MAPPING_SCHEMA_VERSION,
  OpenClawCommandMappingError,
  parseOpenClawCommandText,
  type OpenClawCommandMapping,
} from "./command-mapping.ts";

export const OPENCLAW_BASELINE_PROVIDER_ID = "openclaw-2026.8.1";
export const OPENCLAW_PROVIDER_CONTRACT_VERSION = "nexus.openclaw_provider.p4.v1";
export const OPENCLAW_GATEWAY_EVENT_SCHEMA_VERSION = "nexus.openclaw_gateway_event.p4.v1";
export const OPENCLAW_CHANNEL_INBOUND_SCHEMA_VERSION = "nexus.openclaw_channel_inbound.p4.v1";
export const OPENCLAW_CHANNEL_OUTBOUND_SCHEMA_VERSION = "nexus.openclaw_channel_outbound.p4.v1";

export const OPENCLAW_DEFAULT_CHANNELS = ["dingtalk", "feishu", "telegram"] as const;

export type OpenClawProviderRole = "gateway-only";
export type OpenClawProviderStatus = "enabled" | "disabled";
export type OpenClawGatewayChannelName = (typeof OPENCLAW_DEFAULT_CHANNELS)[number];
export type OpenClawGatewayEventType = "channel.message" | "gateway.handoff";
export type OpenClawGatewayMessageKind = "text" | "command" | "event";
export type OpenClawChannelOperation = "inbound" | "outbound";
export type OpenClawChannelOutboundStatus = "completed" | "failed" | "blocked" | "cancelled";

export interface OpenClawProviderMetadata {
  provider_id: string;
  version: string;
  role: OpenClawProviderRole;
  status: OpenClawProviderStatus;
  contract_version: typeof OPENCLAW_PROVIDER_CONTRACT_VERSION;
  vendor_path: string;
  source: "vendor-snapshot" | "test-fixture";
  capabilities: readonly string[];
  disabled_reason?: string;
}

export interface OpenClawProviderStatusView {
  provider_id: string;
  role: OpenClawProviderRole;
  status: OpenClawProviderStatus;
  contract_version: typeof OPENCLAW_PROVIDER_CONTRACT_VERSION;
  is_default: boolean;
  capabilities: readonly string[];
  rollback_provider_id?: string;
}

export interface OpenClawGatewayEvent {
  schema_version: typeof OPENCLAW_GATEWAY_EVENT_SCHEMA_VERSION;
  tenant_id: string;
  user_id: string;
  agent_id: string;
  task_id: string;
  attempt_id: string;
  execution_id: string;
  conversation_id: string;
  trace_id: string;
  requested_at_utc: string;
  monotonic_ms: number;
  provider_id?: string;
  event_type: OpenClawGatewayEventType;
  channel: {
    capability_id: string;
    name: OpenClawGatewayChannelName;
    direction: "inbound";
    account_ref: string;
    conversation_ref: string;
    message_id: string;
    credential_ref?: string;
  };
  message: {
    kind: OpenClawGatewayMessageKind;
    text: string;
    normalized_text?: string;
  };
  handoff: {
    mode: "task_request";
    adapter_kind: "channel";
    coordinator_required: true;
    policy_gate_required: true;
    native_agent_runtime: "blocked";
    native_tool_runtime: "blocked";
    native_memory_runtime: "blocked";
    plugin_runtime: "plugin_bridge_allowlist_required";
  };
}

interface OpenClawGatewayChannelBinding {
  capability_id: string;
  name: OpenClawGatewayChannelName;
  direction: "inbound" | "outbound";
  account_ref: string;
  conversation_ref: string;
  message_id: string;
  credential_ref?: string;
}

export interface OpenClawChannelInboundMessage {
  operation: "inbound";
  schema_version: typeof OPENCLAW_CHANNEL_INBOUND_SCHEMA_VERSION;
  tenant_id: string;
  user_id: string;
  agent_id: string;
  task_id: string;
  attempt_id: string;
  execution_id: string;
  conversation_id: string;
  trace_id: string;
  requested_at_utc: string;
  monotonic_ms: number;
  provider_id?: string;
  event_type: OpenClawGatewayEventType;
  channel: OpenClawGatewayChannelBinding & { direction: "inbound" };
  message: {
    kind: OpenClawGatewayMessageKind;
    text: string;
    normalized_text?: string;
  };
  handoff: OpenClawGatewayEvent["handoff"];
}

export interface OpenClawChannelOutboundResult {
  operation: "outbound";
  schema_version: typeof OPENCLAW_CHANNEL_OUTBOUND_SCHEMA_VERSION;
  tenant_id: string;
  user_id: string;
  agent_id: string;
  task_id: string;
  attempt_id: string;
  execution_id: string;
  conversation_id: string;
  trace_id: string;
  requested_at_utc: string;
  monotonic_ms: number;
  provider_id?: string;
  channel: OpenClawGatewayChannelBinding & { direction: "outbound" };
  result: {
    result_id: string;
    status: OpenClawChannelOutboundStatus;
    text: string;
    artifact_refs?: readonly string[];
    error_code?: string;
  };
  delivery: {
    mode: "final_result";
    streaming: false;
    coordinator_required: true;
    policy_gate_required: true;
    native_agent_runtime: "blocked";
    native_tool_runtime: "blocked";
    native_memory_runtime: "blocked";
  };
}

export interface OpenClawChannelSendIntent {
  schema_version: typeof OPENCLAW_CHANNEL_OUTBOUND_SCHEMA_VERSION;
  delivery_outcome: "queued";
  mode: "final_result";
  tenant_id: string;
  user_id: string;
  agent_id: string;
  task_id: string;
  attempt_id: string;
  execution_id: string;
  conversation_id: string;
  trace_id: string;
  requested_at_utc: string;
  monotonic_ms: number;
  channel: OpenClawGatewayChannelBinding & { direction: "outbound" };
  result: {
    result_id: string;
    status: OpenClawChannelOutboundStatus;
    text: string;
    artifact_refs: readonly string[];
    error_code?: string;
  };
  native_agent_runtime: "blocked";
  native_tool_runtime: "blocked";
  native_memory_runtime: "blocked";
}

export class OpenClawProviderRegistryError extends Error {
  readonly code:
    | "PLATFORM_INVALID_REQUEST"
    | "PLATFORM_NOT_FOUND"
    | "PLATFORM_CONFLICT"
    | "PLATFORM_SERVICE_UNHEALTHY";
  readonly details: Record<string, unknown>;

  constructor(code: OpenClawProviderRegistryError["code"], message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "OpenClawProviderRegistryError";
    this.code = code;
    this.details = sanitizeDetails(details);
  }
}

export class OpenClawGatewayAdapterError extends Error {
  readonly code:
    | "PLATFORM_INVALID_REQUEST"
    | "PLATFORM_FORBIDDEN"
    | "PLATFORM_POLICY_DENIED"
    | "PLATFORM_SCHEMA_VALIDATION_FAILED"
    | "PLATFORM_SERVICE_UNHEALTHY"
    | "PLATFORM_PROVIDER_UNAVAILABLE";
  readonly details: Record<string, unknown>;

  constructor(code: OpenClawGatewayAdapterError["code"], message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "OpenClawGatewayAdapterError";
    this.code = code;
    this.details = sanitizeDetails(details);
  }
}

export interface OpenClawGatewayAdapterOptions {
  name?: string;
  registry?: OpenClawProviderRegistry;
  eventBus?: EventBus;
}

export function baselineOpenClawProviderMetadata(
  overrides: Partial<OpenClawProviderMetadata> = {},
): OpenClawProviderMetadata {
  return normalizeProviderMetadata({
    provider_id: OPENCLAW_BASELINE_PROVIDER_ID,
    version: "2026.8.1",
    role: "gateway-only",
    status: "enabled",
    contract_version: OPENCLAW_PROVIDER_CONTRACT_VERSION,
    vendor_path: "vendor/openclaw-main",
    source: "vendor-snapshot",
    capabilities: [
      "channel-ingress",
      "channel-outbound",
      "gateway-handoff",
      "anti-corruption-channel-contract",
      "native-agent-block",
      "native-tool-block",
      "native-memory-block",
      "plugin-inventory-mapping",
      "plugin-bridge-allowlist",
      "command-attempt-semantics",
      "provider-disable",
      "provider-rollback",
    ],
    ...overrides,
  });
}

export class OpenClawProviderRegistry {
  readonly #providers = new Map<string, OpenClawProviderMetadata>();
  #defaultProviderId: string;
  #rollbackProviderId: string | undefined;

  constructor(providers: readonly OpenClawProviderMetadata[] = [baselineOpenClawProviderMetadata()]) {
    if (providers.length === 0) {
      throw new OpenClawProviderRegistryError("PLATFORM_INVALID_REQUEST", "At least one gateway provider is required");
    }
    for (const provider of providers) this.register(provider);
    this.#defaultProviderId = providers[0].provider_id;
  }

  register(provider: OpenClawProviderMetadata): void {
    const normalized = normalizeProviderMetadata(provider);
    if (this.#providers.has(normalized.provider_id)) {
      throw new OpenClawProviderRegistryError("PLATFORM_CONFLICT", "Gateway provider is already registered", {
        provider_id: normalized.provider_id,
      });
    }
    this.#providers.set(normalized.provider_id, normalized);
  }

  list(): readonly OpenClawProviderStatusView[] {
    return [...this.#providers.values()].map((provider) => this.#view(provider));
  }

  get(provider_id: string): OpenClawProviderMetadata {
    const provider = this.#providers.get(provider_id);
    if (!provider) {
      throw new OpenClawProviderRegistryError("PLATFORM_NOT_FOUND", "Gateway provider is not registered", { provider_id });
    }
    return { ...provider, capabilities: [...provider.capabilities] };
  }

  requireEnabledProvider(provider_id: string): OpenClawProviderMetadata {
    const provider = this.#requireEnabled(provider_id);
    return { ...provider, capabilities: [...provider.capabilities] };
  }

  defaultProvider(): OpenClawProviderStatusView {
    return this.#view(this.#requireEnabled(this.#defaultProviderId));
  }

  selectDefault(provider_id: string): OpenClawProviderStatusView {
    const provider = this.#requireEnabled(provider_id);
    if (provider.provider_id !== this.#defaultProviderId) {
      this.#rollbackProviderId = this.#defaultProviderId;
      this.#defaultProviderId = provider.provider_id;
    }
    return this.#view(provider);
  }

  disable(provider_id: string, reason = "provider disabled by platform configuration"): OpenClawProviderStatusView {
    const provider = this.#providers.get(provider_id);
    if (!provider) {
      throw new OpenClawProviderRegistryError("PLATFORM_NOT_FOUND", "Gateway provider is not registered", { provider_id });
    }
    const disabled = normalizeProviderMetadata({ ...provider, status: "disabled", disabled_reason: reason });
    this.#providers.set(provider_id, disabled);
    return this.#view(disabled);
  }

  enable(provider_id: string): OpenClawProviderStatusView {
    const provider = this.#providers.get(provider_id);
    if (!provider) {
      throw new OpenClawProviderRegistryError("PLATFORM_NOT_FOUND", "Gateway provider is not registered", { provider_id });
    }
    const enabled = normalizeProviderMetadata({ ...provider, status: "enabled", disabled_reason: undefined });
    this.#providers.set(provider_id, enabled);
    return this.#view(enabled);
  }

  rollbackDefault(): OpenClawProviderStatusView {
    if (!this.#rollbackProviderId) {
      throw new OpenClawProviderRegistryError("PLATFORM_CONFLICT", "No rollback gateway provider is available");
    }
    const rollbackProvider = this.#requireEnabled(this.#rollbackProviderId);
    const previousDefault = this.#defaultProviderId;
    this.#defaultProviderId = rollbackProvider.provider_id;
    this.#rollbackProviderId = previousDefault;
    return this.#view(rollbackProvider);
  }

  #requireEnabled(provider_id: string): OpenClawProviderMetadata {
    const provider = this.#providers.get(provider_id);
    if (!provider) {
      throw new OpenClawProviderRegistryError("PLATFORM_NOT_FOUND", "Gateway provider is not registered", { provider_id });
    }
    if (provider.status !== "enabled") {
      throw new OpenClawProviderRegistryError("PLATFORM_SERVICE_UNHEALTHY", "Gateway provider is disabled", {
        provider_id,
        reason: provider.disabled_reason ?? "disabled",
      });
    }
    return provider;
  }

  #view(provider: OpenClawProviderMetadata): OpenClawProviderStatusView {
    return {
      provider_id: provider.provider_id,
      role: provider.role,
      status: provider.status,
      contract_version: provider.contract_version,
      is_default: provider.provider_id === this.#defaultProviderId,
      capabilities: [...provider.capabilities],
      ...(this.#rollbackProviderId ? { rollback_provider_id: this.#rollbackProviderId } : {}),
    };
  }
}

export class OpenClawGatewayAdapter implements LifecycleAdapterPort {
  readonly name: string;
  readonly kind = "channel" as const;
  readonly #registry: OpenClawProviderRegistry;
  readonly #eventBus?: EventBus;
  #status: AdapterLifecycleStatus = "created";
  #eventSequence = 0;

  constructor(options: OpenClawGatewayAdapterOptions = {}) {
    this.name = options.name ?? "openclaw-gateway";
    this.#registry = options.registry ?? new OpenClawProviderRegistry();
    this.#eventBus = options.eventBus;
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
      OPENCLAW_GATEWAY_EVENT_SCHEMA_VERSION,
      OPENCLAW_CHANNEL_INBOUND_SCHEMA_VERSION,
      OPENCLAW_CHANNEL_OUTBOUND_SCHEMA_VERSION,
      OPENCLAW_COMMAND_MAPPING_SCHEMA_VERSION,
      "gateway-only",
      "channel-anti-corruption",
      "platform-final-result-outbound",
      "command-attempt-semantics",
      "native-agent-blocked",
      "native-tool-blocked",
      "native-memory-blocked",
      "plugin-bridge-allowlist",
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
      throw new OpenClawGatewayAdapterError("PLATFORM_SERVICE_UNHEALTHY", "Gateway adapter must be started before invocation", {
        adapter_name: this.name,
        status: this.#status,
      });
    }
    assertGatewayPolicyDecisionShape(invocation, this.name);
    const provider = this.#registry.requireEnabledProvider(
      typeof invocation.payload.provider_id === "string" ? invocation.payload.provider_id : OPENCLAW_BASELINE_PROVIDER_ID,
    );
    if (isOutboundOperation(invocation.payload)) {
      const outbound = validateOpenClawChannelOutbound(invocation.payload, invocation);
      const sendIntent = buildOpenClawChannelSendIntent(outbound);
      this.#publishOutboundEvent(sendIntent, provider.provider_id);
      return {
        tenant_id: invocation.tenant_id,
        task_id: invocation.task_id,
        attempt_id: invocation.attempt_id,
        execution_id: invocation.execution_id,
        trace_id: invocation.trace_id,
        status: "completed",
        payload: {
          schema_version: OPENCLAW_CHANNEL_OUTBOUND_SCHEMA_VERSION,
          gateway_outcome: "channel_send_intent",
          provider_id: provider.provider_id,
          provider_status: provider.status,
          provider_binding: "gateway_provider_default",
          channel_send_intent: sendIntent,
          native_agent_runtime: "blocked",
          native_tool_runtime: "blocked",
          native_memory_runtime: "blocked",
        },
      };
    }

    const inbound = validateOpenClawChannelInbound(invocation.payload, invocation);
    const taskHandoff = buildOpenClawTaskRequest(inbound);
    const commandMapping = buildOpenClawCommandMapping(inbound);
    this.#publishInboundEvent(inbound, provider.provider_id);
    return {
      tenant_id: invocation.tenant_id,
      task_id: invocation.task_id,
      attempt_id: invocation.attempt_id,
      execution_id: invocation.execution_id,
      trace_id: invocation.trace_id,
      status: "completed",
      payload: {
        schema_version: OPENCLAW_CHANNEL_INBOUND_SCHEMA_VERSION,
        legacy_gateway_event_schema_version: OPENCLAW_GATEWAY_EVENT_SCHEMA_VERSION,
        gateway_outcome: commandMapping ? "command_mapping" : "handoff",
        provider_id: provider.provider_id,
        provider_status: provider.status,
        provider_binding: "gateway_provider_default",
        channel_event: sanitizeChannelInbound(inbound),
        task_handoff: taskHandoff,
        ...(commandMapping ? {
          command_mapping_schema_version: OPENCLAW_COMMAND_MAPPING_SCHEMA_VERSION,
          command_mapping: commandMapping,
          task_command: commandMapping.task_command,
        } : {}),
        native_agent_runtime: "blocked",
        native_tool_runtime: "blocked",
        native_memory_runtime: "blocked",
        plugin_runtime: "plugin_bridge_allowlist_required",
      },
    };
  }

  #publishInboundEvent(inbound: OpenClawChannelInboundMessage, providerId: string): void {
    if (!this.#eventBus) return;
    this.#eventSequence += 1;
    const event: PlatformEventEnvelope = {
      schema_version: "nexus.event_envelope.v1",
      event_id: `event_${inbound.trace_id.replace(/^trace_/, "")}_openclaw_${String(this.#eventSequence).padStart(4, "0")}`,
      event_type: "task.received",
      tenant_id: inbound.tenant_id,
      user_id: inbound.user_id,
      agent_id: inbound.agent_id,
      task_id: inbound.task_id,
      attempt_id: inbound.attempt_id,
      execution_id: inbound.execution_id,
      conversation_id: inbound.conversation_id,
      trace_id: inbound.trace_id,
      occurred_at_utc: inbound.requested_at_utc,
      monotonic_ms: inbound.monotonic_ms,
      producer: {
        service: "openclaw-adapter",
        component: "channel-inbound-anti-corruption",
        provider_binding_id: providerId,
      },
      subject: {
        kind: "task",
        id: inbound.task_id,
      },
      payload: {
        schema_version: OPENCLAW_CHANNEL_INBOUND_SCHEMA_VERSION,
        gateway_event_type: inbound.event_type,
        channel_capability_id: inbound.channel.capability_id,
        channel_name: inbound.channel.name,
        message_id: inbound.channel.message_id,
        task_request_schema_version: "nexus.task_request.v1",
        native_agent_runtime: "blocked",
        native_tool_runtime: "blocked",
        native_memory_runtime: "blocked",
      },
    };
    this.#eventBus.publish(event);
  }

  #publishOutboundEvent(sendIntent: OpenClawChannelSendIntent, providerId: string): void {
    if (!this.#eventBus) return;
    this.#eventSequence += 1;
    const event: PlatformEventEnvelope = {
      schema_version: "nexus.event_envelope.v1",
      event_id: `event_${sendIntent.trace_id.replace(/^trace_/, "")}_openclaw_out_${String(this.#eventSequence).padStart(4, "0")}`,
      event_type: "audit.recorded",
      tenant_id: sendIntent.tenant_id,
      user_id: sendIntent.user_id,
      agent_id: sendIntent.agent_id,
      task_id: sendIntent.task_id,
      attempt_id: sendIntent.attempt_id,
      execution_id: sendIntent.execution_id,
      conversation_id: sendIntent.conversation_id,
      trace_id: sendIntent.trace_id,
      occurred_at_utc: sendIntent.requested_at_utc,
      monotonic_ms: sendIntent.monotonic_ms,
      producer: {
        service: "openclaw-adapter",
        component: "channel-outbound-anti-corruption",
        provider_binding_id: providerId,
      },
      subject: {
        kind: "task",
        id: sendIntent.task_id,
      },
      payload: {
        schema_version: OPENCLAW_CHANNEL_OUTBOUND_SCHEMA_VERSION,
        audit_action: "channel.send_intent.queued",
        delivery_outcome: sendIntent.delivery_outcome,
        channel_capability_id: sendIntent.channel.capability_id,
        channel_name: sendIntent.channel.name,
        message_id: sendIntent.channel.message_id,
        result_id: sendIntent.result.result_id,
        result_status: sendIntent.result.status,
        native_agent_runtime: "blocked",
        native_tool_runtime: "blocked",
        native_memory_runtime: "blocked",
      },
    };
    this.#eventBus.publish(event);
  }
}

export function buildOpenClawGatewayEventFixture(
  overrides: Partial<OpenClawGatewayEvent> = {},
): OpenClawGatewayEvent {
  const base: OpenClawGatewayEvent = {
    schema_version: OPENCLAW_GATEWAY_EVENT_SCHEMA_VERSION,
    tenant_id: "tenant_alpha01",
    user_id: "user_alpha01",
    agent_id: "agent_alpha01",
    task_id: "task_alpha01",
    attempt_id: "attempt_alpha01",
    execution_id: "exec_alpha01",
    conversation_id: "conv_alpha01",
    trace_id: "trace_alpha01",
    requested_at_utc: "2026-08-25T00:00:00Z",
    monotonic_ms: 100,
    event_type: "channel.message",
    channel: {
      capability_id: "cap_channel_dingtalk",
      name: "dingtalk",
      direction: "inbound",
      account_ref: "channel_account_dingtalk_alpha",
      conversation_ref: "channel_conversation_alpha",
      message_id: "msg_alpha01",
      credential_ref: "cred_channel_dingtalk_ref",
    },
    message: {
      kind: "text",
      text: "hello from approved channel",
      normalized_text: "hello from approved channel",
    },
    handoff: {
      mode: "task_request",
      adapter_kind: "channel",
      coordinator_required: true,
      policy_gate_required: true,
      native_agent_runtime: "blocked",
      native_tool_runtime: "blocked",
      native_memory_runtime: "blocked",
      plugin_runtime: "plugin_bridge_allowlist_required",
    },
  };
  return {
    ...base,
    ...overrides,
    channel: { ...base.channel, ...(overrides.channel ?? {}) },
    message: { ...base.message, ...(overrides.message ?? {}) },
    handoff: { ...base.handoff, ...(overrides.handoff ?? {}) },
  };
}

export function buildOpenClawChannelInboundFixture(
  overrides: Partial<OpenClawChannelInboundMessage> = {},
): OpenClawChannelInboundMessage {
  const base = channelInboundFromGatewayEvent(buildOpenClawGatewayEventFixture());
  return {
    ...base,
    ...overrides,
    channel: { ...base.channel, ...(overrides.channel ?? {}) },
    message: { ...base.message, ...(overrides.message ?? {}) },
    handoff: { ...base.handoff, ...(overrides.handoff ?? {}) },
  };
}

export function buildOpenClawChannelOutboundFixture(
  overrides: Partial<OpenClawChannelOutboundResult> = {},
): OpenClawChannelOutboundResult {
  const base: OpenClawChannelOutboundResult = {
    operation: "outbound",
    schema_version: OPENCLAW_CHANNEL_OUTBOUND_SCHEMA_VERSION,
    tenant_id: "tenant_alpha01",
    user_id: "user_alpha01",
    agent_id: "agent_alpha01",
    task_id: "task_alpha01",
    attempt_id: "attempt_alpha01",
    execution_id: "exec_alpha01",
    conversation_id: "conv_alpha01",
    trace_id: "trace_alpha01",
    requested_at_utc: "2026-08-25T00:00:02Z",
    monotonic_ms: 102,
    channel: {
      capability_id: "cap_channel_dingtalk",
      name: "dingtalk",
      direction: "outbound",
      account_ref: "channel_account_dingtalk_alpha",
      conversation_ref: "channel_conversation_alpha",
      message_id: "msg_alpha_out01",
      credential_ref: "cred_channel_dingtalk_ref",
    },
    result: {
      result_id: "result_alpha01",
      status: "completed",
      text: "platform final result",
      artifact_refs: ["artifact_alpha01"],
    },
    delivery: {
      mode: "final_result",
      streaming: false,
      coordinator_required: true,
      policy_gate_required: true,
      native_agent_runtime: "blocked",
      native_tool_runtime: "blocked",
      native_memory_runtime: "blocked",
    },
  };
  return {
    ...base,
    ...overrides,
    channel: { ...base.channel, ...(overrides.channel ?? {}) },
    result: { ...base.result, ...(overrides.result ?? {}) },
    delivery: { ...base.delivery, ...(overrides.delivery ?? {}) },
  };
}

export function validateOpenClawGatewayEvent(
  payload: Record<string, unknown>,
  invocation?: CoordinatorAdapterInvocation,
): OpenClawGatewayEvent {
  assertNoNativeGatewayPayload(payload);
  if (payload.schema_version !== OPENCLAW_GATEWAY_EVENT_SCHEMA_VERSION) {
    throw new OpenClawGatewayAdapterError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Unsupported gateway event schema version", {
      schema_version: payload.schema_version,
    });
  }
  const candidate = payload as unknown as OpenClawGatewayEvent;
  for (const key of [
    "tenant_id",
    "user_id",
    "agent_id",
    "task_id",
    "attempt_id",
    "execution_id",
    "conversation_id",
    "trace_id",
  ] as const) {
    assertPlatformId(key, candidate[key]);
  }
  assertUtcTimestamp(candidate.requested_at_utc, "gateway_event.requested_at_utc");
  assertMonotonicMs(candidate.monotonic_ms, "gateway_event.monotonic_ms");
  if (invocation) assertGatewayEventMatchesInvocation(candidate, invocation);
  if (candidate.event_type !== "channel.message" && candidate.event_type !== "gateway.handoff") {
    throw new OpenClawGatewayAdapterError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Gateway event type is invalid", {
      event_type: candidate.event_type,
    });
  }
  validateGatewayChannel(candidate.channel);
  validateGatewayMessage(candidate.message);
  validateGatewayHandoff(candidate.handoff);
  return cloneGatewayEvent(candidate);
}

export function validateOpenClawChannelInbound(
  payload: Record<string, unknown>,
  invocation?: CoordinatorAdapterInvocation,
): OpenClawChannelInboundMessage {
  if (payload.schema_version === OPENCLAW_GATEWAY_EVENT_SCHEMA_VERSION) {
    return channelInboundFromGatewayEvent(validateOpenClawGatewayEvent(payload, invocation));
  }
  assertNoNativeGatewayPayload(payload);
  if (payload.operation !== undefined && payload.operation !== "inbound") {
    throw new OpenClawGatewayAdapterError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Gateway channel operation must be inbound", {
      operation: payload.operation,
    });
  }
  if (payload.schema_version !== OPENCLAW_CHANNEL_INBOUND_SCHEMA_VERSION) {
    throw new OpenClawGatewayAdapterError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Unsupported channel inbound schema version", {
      schema_version: payload.schema_version,
    });
  }
  const candidate = payload as unknown as OpenClawChannelInboundMessage;
  assertCommonChannelIdentity(candidate, "channel_inbound");
  if (invocation) assertChannelPayloadMatchesInvocation(candidate, invocation, "Gateway inbound identity does not match Coordinator invocation");
  if (candidate.event_type !== "channel.message" && candidate.event_type !== "gateway.handoff") {
    throw new OpenClawGatewayAdapterError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Gateway inbound event type is invalid", {
      event_type: candidate.event_type,
    });
  }
  validateChannelBinding(candidate.channel, "inbound");
  validateGatewayMessage(candidate.message);
  validateGatewayHandoff(candidate.handoff);
  return cloneChannelInbound(candidate);
}

export function validateOpenClawChannelOutbound(
  payload: Record<string, unknown>,
  invocation?: CoordinatorAdapterInvocation,
): OpenClawChannelOutboundResult {
  assertNoNativeGatewayPayload(payload);
  if (payload.operation !== undefined && payload.operation !== "outbound") {
    throw new OpenClawGatewayAdapterError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Gateway channel operation must be outbound", {
      operation: payload.operation,
    });
  }
  if (payload.schema_version !== OPENCLAW_CHANNEL_OUTBOUND_SCHEMA_VERSION) {
    throw new OpenClawGatewayAdapterError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Unsupported channel outbound schema version", {
      schema_version: payload.schema_version,
    });
  }
  const candidate = payload as unknown as OpenClawChannelOutboundResult;
  assertCommonChannelIdentity(candidate, "channel_outbound");
  if (invocation) assertChannelPayloadMatchesInvocation(candidate, invocation, "Gateway outbound identity does not match Coordinator invocation");
  validateChannelBinding(candidate.channel, "outbound");
  validateOutboundResult(candidate.result);
  validateOutboundDelivery(candidate.delivery);
  return cloneChannelOutbound(candidate);
}

export function buildOpenClawTaskRequest(inbound: OpenClawChannelInboundMessage): CoordinatorTaskRequest {
  const normalized = validateOpenClawChannelInbound(inbound as unknown as Record<string, unknown>);
  return {
    schema_version: "nexus.task_request.v1",
    tenant_id: normalized.tenant_id,
    user_id: normalized.user_id,
    agent_id: normalized.agent_id,
    task_id: normalized.task_id,
    attempt_id: normalized.attempt_id,
    execution_id: normalized.execution_id,
    conversation_id: normalized.conversation_id,
    trace_id: normalized.trace_id,
    input: {
      kind: normalized.message.kind === "command" ? "command" : "text",
      text: normalized.message.normalized_text ?? normalized.message.text,
      metadata: {
        channel_message_id: normalized.channel.message_id,
        channel_capability_id: normalized.channel.capability_id,
        command_mapping_schema_version: OPENCLAW_COMMAND_MAPPING_SCHEMA_VERSION,
      },
    },
    source: {
      kind: "channel",
      channel: normalized.channel.name,
      provider_binding_id: normalized.provider_id ?? OPENCLAW_BASELINE_PROVIDER_ID,
      received_at_utc: normalized.requested_at_utc,
      message_id: normalized.channel.message_id,
      account_ref: normalized.channel.account_ref,
      conversation_ref: normalized.channel.conversation_ref,
    },
    policy_context: {
      rbac_subject: normalized.user_id,
      tenant_scope: "single_tenant",
      approval_mode: "not_required",
    },
    idempotency_key: buildOpenClawCommandIdempotencyKey(normalized, "continue_attempt").replace("continue", "message"),
    created_at_utc: normalized.requested_at_utc,
    monotonic_ms: normalized.monotonic_ms,
  };
}

export function buildOpenClawChannelSendIntent(outbound: OpenClawChannelOutboundResult): OpenClawChannelSendIntent {
  const normalized = validateOpenClawChannelOutbound(outbound as unknown as Record<string, unknown>);
  const sendIntent: OpenClawChannelSendIntent = {
    schema_version: OPENCLAW_CHANNEL_OUTBOUND_SCHEMA_VERSION,
    delivery_outcome: "queued",
    mode: "final_result",
    tenant_id: normalized.tenant_id,
    user_id: normalized.user_id,
    agent_id: normalized.agent_id,
    task_id: normalized.task_id,
    attempt_id: normalized.attempt_id,
    execution_id: normalized.execution_id,
    conversation_id: normalized.conversation_id,
    trace_id: normalized.trace_id,
    requested_at_utc: normalized.requested_at_utc,
    monotonic_ms: normalized.monotonic_ms,
    channel: cloneChannelBinding(normalized.channel) as OpenClawChannelSendIntent["channel"],
    result: {
      result_id: normalized.result.result_id,
      status: normalized.result.status,
      text: normalized.result.text,
      artifact_refs: [...(normalized.result.artifact_refs ?? [])],
      ...(normalized.result.error_code === undefined ? {} : { error_code: normalized.result.error_code }),
    },
    native_agent_runtime: "blocked",
    native_tool_runtime: "blocked",
    native_memory_runtime: "blocked",
  };
  assertNoNativeGatewayPayload(sendIntent);
  return sendIntent;
}

function normalizeProviderMetadata(provider: OpenClawProviderMetadata): OpenClawProviderMetadata {
  if (!/^openclaw-[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/.test(provider.provider_id)) {
    throw new OpenClawProviderRegistryError("PLATFORM_INVALID_REQUEST", "Invalid gateway provider_id", {
      provider_id: provider.provider_id,
    });
  }
  if (provider.role !== "gateway-only") {
    throw new OpenClawProviderRegistryError("PLATFORM_INVALID_REQUEST", "Gateway provider role must be gateway-only", {
      role: provider.role,
    });
  }
  if (provider.status !== "enabled" && provider.status !== "disabled") {
    throw new OpenClawProviderRegistryError("PLATFORM_INVALID_REQUEST", "Gateway provider status is invalid", {
      status: provider.status,
    });
  }
  if (provider.contract_version !== OPENCLAW_PROVIDER_CONTRACT_VERSION) {
    throw new OpenClawProviderRegistryError("PLATFORM_INVALID_REQUEST", "Gateway provider contract version is invalid", {
      contract_version: provider.contract_version,
    });
  }
  if (!provider.capabilities.includes("channel-ingress") || !provider.capabilities.includes("native-agent-block")) {
    throw new OpenClawProviderRegistryError("PLATFORM_INVALID_REQUEST", "Gateway provider capabilities are incomplete", {
      provider_id: provider.provider_id,
    });
  }
  assertNoNativeGatewayPayload({ capabilities: provider.capabilities, disabled_reason: provider.disabled_reason });
  return {
    ...provider,
    capabilities: [...new Set(provider.capabilities)].sort(),
  };
}

function assertGatewayPolicyDecisionShape(invocation: CoordinatorAdapterInvocation, adapterName: string): void {
  const decision = invocation.policy_decision;
  if (!decision || decision.action !== "adapter.invoke" || decision.allow !== true) {
    throw new OpenClawGatewayAdapterError("PLATFORM_POLICY_DENIED", "Gateway adapter invocation requires an allowed Policy-Gate decision");
  }
  if (decision.route?.adapter_kind !== "channel" || decision.route.adapter_name !== adapterName) {
    throw new OpenClawGatewayAdapterError("PLATFORM_POLICY_DENIED", "Gateway adapter invocation must target the channel adapter route", {
      adapter_name: adapterName,
    });
  }
  for (const [field, expected, actual] of [
    ["tenant_id", invocation.tenant_id, decision.tenant_id],
    ["task_id", invocation.task_id, decision.task_id],
    ["attempt_id", invocation.attempt_id, decision.attempt_id],
    ["execution_id", invocation.execution_id, decision.execution_id],
    ["trace_id", invocation.trace_id, decision.trace_id],
  ] as const) {
    if (expected !== actual) {
      throw new OpenClawGatewayAdapterError("PLATFORM_POLICY_DENIED", "Gateway adapter Policy-Gate decision identity mismatch", {
        field,
      });
    }
  }
}

function assertGatewayEventMatchesInvocation(event: OpenClawGatewayEvent, invocation: CoordinatorAdapterInvocation): void {
  assertChannelPayloadMatchesInvocation(event, invocation, "Gateway event identity does not match Coordinator invocation");
}

function assertChannelPayloadMatchesInvocation(
  payload: Pick<OpenClawChannelInboundMessage, "tenant_id" | "task_id" | "attempt_id" | "execution_id" | "conversation_id" | "trace_id">,
  invocation: CoordinatorAdapterInvocation,
  message: string,
): void {
  for (const [field, expected, actual] of [
    ["tenant_id", invocation.tenant_id, payload.tenant_id],
    ["task_id", invocation.task_id, payload.task_id],
    ["attempt_id", invocation.attempt_id, payload.attempt_id],
    ["execution_id", invocation.execution_id, payload.execution_id],
    ["conversation_id", invocation.conversation_id, payload.conversation_id],
    ["trace_id", invocation.trace_id, payload.trace_id],
  ] as const) {
    if (expected !== undefined && expected !== actual) {
      throw new OpenClawGatewayAdapterError("PLATFORM_POLICY_DENIED", message, {
        field,
      });
    }
  }
}

function assertCommonChannelIdentity(
  payload: Pick<OpenClawChannelInboundMessage, "tenant_id" | "user_id" | "agent_id" | "task_id" | "attempt_id" | "execution_id" | "conversation_id" | "trace_id" | "requested_at_utc" | "monotonic_ms">,
  label: string,
): void {
  for (const key of [
    "tenant_id",
    "user_id",
    "agent_id",
    "task_id",
    "attempt_id",
    "execution_id",
    "conversation_id",
    "trace_id",
  ] as const) {
    try {
      assertPlatformId(key, payload[key]);
    } catch {
      throw new OpenClawGatewayAdapterError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Gateway channel platform identity is invalid", {
        field: key,
      });
    }
  }
  try {
    assertUtcTimestamp(payload.requested_at_utc, `${label}.requested_at_utc`);
    assertMonotonicMs(payload.monotonic_ms, `${label}.monotonic_ms`);
  } catch {
    throw new OpenClawGatewayAdapterError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Gateway channel time metadata is invalid", {
      field: label,
    });
  }
}

function validateGatewayChannel(channel: OpenClawGatewayEvent["channel"]): void {
  validateChannelBinding(channel, "inbound");
}

function validateChannelBinding(channel: OpenClawGatewayChannelBinding, expectedDirection: "inbound" | "outbound"): void {
  if (!channel || typeof channel !== "object") {
    throw new OpenClawGatewayAdapterError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Gateway channel payload is required");
  }
  requirePattern(channel.capability_id, "channel.capability_id", /^cap_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/);
  if (!(OPENCLAW_DEFAULT_CHANNELS as readonly string[]).includes(channel.name)) {
    throw new OpenClawGatewayAdapterError("PLATFORM_POLICY_DENIED", "Gateway channel is not approved by the platform allowlist", {
      channel: channel.name,
    });
  }
  if (channel.direction !== expectedDirection) {
    throw new OpenClawGatewayAdapterError("PLATFORM_SCHEMA_VALIDATION_FAILED", `Gateway channel direction must be ${expectedDirection}`, {
      direction: channel.direction,
    });
  }
  requirePattern(channel.account_ref, "channel.account_ref", /^channel_account_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/);
  requirePattern(channel.conversation_ref, "channel.conversation_ref", /^channel_conversation_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/);
  requirePattern(channel.message_id, "channel.message_id", /^msg_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/);
  if (channel.credential_ref !== undefined) {
    requirePattern(channel.credential_ref, "channel.credential_ref", /^cred_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/);
  }
}

function validateOutboundResult(result: OpenClawChannelOutboundResult["result"]): void {
  if (!result || typeof result !== "object") {
    throw new OpenClawGatewayAdapterError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Gateway outbound result payload is required");
  }
  assertNoStreamingMarkers(result);
  requirePattern(result.result_id, "result.result_id", /^result_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/);
  if (!["completed", "failed", "blocked", "cancelled"].includes(result.status)) {
    throw new OpenClawGatewayAdapterError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Gateway outbound result status is invalid", {
      status: result.status,
    });
  }
  requireText(result.text, "result.text");
  if (result.error_code !== undefined) {
    requirePattern(result.error_code, "result.error_code", /^PLATFORM_[A-Z0-9_]{3,96}$/);
  }
  if (result.artifact_refs !== undefined) {
    if (!Array.isArray(result.artifact_refs)) {
      throw new OpenClawGatewayAdapterError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Gateway outbound artifact_refs must be an array");
    }
    for (const artifactRef of result.artifact_refs) {
      requirePattern(artifactRef, "result.artifact_refs", /^artifact_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/);
    }
  }
}

function validateOutboundDelivery(delivery: OpenClawChannelOutboundResult["delivery"]): void {
  if (!delivery || typeof delivery !== "object") {
    throw new OpenClawGatewayAdapterError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Gateway outbound delivery payload is required");
  }
  const expected: OpenClawChannelOutboundResult["delivery"] = {
    mode: "final_result",
    streaming: false,
    coordinator_required: true,
    policy_gate_required: true,
    native_agent_runtime: "blocked",
    native_tool_runtime: "blocked",
    native_memory_runtime: "blocked",
  };
  for (const [key, expectedValue] of Object.entries(expected)) {
    if ((delivery as Record<string, unknown>)[key] !== expectedValue) {
      throw new OpenClawGatewayAdapterError("PLATFORM_POLICY_DENIED", "Gateway outbound delivery must remain final-result platform controlled", {
        field: key,
      });
    }
  }
}

function validateGatewayMessage(message: OpenClawGatewayEvent["message"]): void {
  if (!message || typeof message !== "object") {
    throw new OpenClawGatewayAdapterError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Gateway message payload is required");
  }
  if (message.kind !== "text" && message.kind !== "command" && message.kind !== "event") {
    throw new OpenClawGatewayAdapterError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Gateway message kind is invalid", { kind: message.kind });
  }
  requireText(message.text, "message.text");
  if (message.normalized_text !== undefined) requireText(message.normalized_text, "message.normalized_text");
}

function validateGatewayHandoff(handoff: OpenClawGatewayEvent["handoff"]): void {
  if (!handoff || typeof handoff !== "object") {
    throw new OpenClawGatewayAdapterError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Gateway handoff payload is required");
  }
  const expected: OpenClawGatewayEvent["handoff"] = {
    mode: "task_request",
    adapter_kind: "channel",
    coordinator_required: true,
    policy_gate_required: true,
    native_agent_runtime: "blocked",
    native_tool_runtime: "blocked",
    native_memory_runtime: "blocked",
    plugin_runtime: "plugin_bridge_allowlist_required",
  };
  for (const [key, expectedValue] of Object.entries(expected)) {
    if ((handoff as Record<string, unknown>)[key] !== expectedValue) {
      throw new OpenClawGatewayAdapterError("PLATFORM_POLICY_DENIED", "Gateway handoff must keep native runtime blocked", {
        field: key,
      });
    }
  }
}

function sanitizeGatewayEvent(event: OpenClawGatewayEvent): OpenClawGatewayEvent {
  return cloneGatewayEvent(event);
}

function sanitizeChannelInbound(inbound: OpenClawChannelInboundMessage): OpenClawChannelInboundMessage {
  return cloneChannelInbound(inbound);
}

function cloneGatewayEvent(event: OpenClawGatewayEvent): OpenClawGatewayEvent {
  return JSON.parse(JSON.stringify(event)) as OpenClawGatewayEvent;
}

function cloneChannelInbound(inbound: OpenClawChannelInboundMessage): OpenClawChannelInboundMessage {
  return JSON.parse(JSON.stringify(inbound)) as OpenClawChannelInboundMessage;
}

function cloneChannelOutbound(outbound: OpenClawChannelOutboundResult): OpenClawChannelOutboundResult {
  return JSON.parse(JSON.stringify(outbound)) as OpenClawChannelOutboundResult;
}

function cloneChannelBinding(channel: OpenClawGatewayChannelBinding): OpenClawGatewayChannelBinding {
  return JSON.parse(JSON.stringify(channel)) as OpenClawGatewayChannelBinding;
}

function channelInboundFromGatewayEvent(event: OpenClawGatewayEvent): OpenClawChannelInboundMessage {
  return {
    operation: "inbound",
    schema_version: OPENCLAW_CHANNEL_INBOUND_SCHEMA_VERSION,
    tenant_id: event.tenant_id,
    user_id: event.user_id,
    agent_id: event.agent_id,
    task_id: event.task_id,
    attempt_id: event.attempt_id,
    execution_id: event.execution_id,
    conversation_id: event.conversation_id,
    trace_id: event.trace_id,
    requested_at_utc: event.requested_at_utc,
    monotonic_ms: event.monotonic_ms,
    ...(event.provider_id === undefined ? {} : { provider_id: event.provider_id }),
    event_type: event.event_type,
    channel: cloneChannelBinding(event.channel) as OpenClawChannelInboundMessage["channel"],
    message: { ...event.message },
    handoff: { ...event.handoff },
  };
}

function isOutboundOperation(payload: Record<string, unknown>): boolean {
  return payload.operation === "outbound" || payload.schema_version === OPENCLAW_CHANNEL_OUTBOUND_SCHEMA_VERSION;
}

function assertNoStreamingMarkers(value: Record<string, unknown>): void {
  for (const key of Object.keys(value)) {
    if (/^(?:chunk|chunks|chunk_index|delta|partial|stream|streaming|event_stream)$/i.test(key)) {
      throw new OpenClawGatewayAdapterError("PLATFORM_POLICY_DENIED", "Gateway outbound streaming fields are not enabled in P4-02", {
        field: key,
      });
    }
  }
}

function requirePattern(value: unknown, field: string, pattern: RegExp): string {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new OpenClawGatewayAdapterError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Gateway event field is invalid", { field });
  }
  return value;
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 20000) {
    throw new OpenClawGatewayAdapterError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Gateway message text is invalid", { field });
  }
  assertNoNativeGatewayPayload({ [field]: value });
  return value;
}

function assertNoNativeGatewayPayload(value: unknown): void {
  const forbiddenKeys = /^(?:credential_material|raw_credential|api_key|password|token|secret|env|environment|native_session_id|native_error|native_error_code|native_path|native_url|base_url|endpoint|file_path|path|url|session_id|memory_path|tool_name|agent_command|plugin_subagent|native_agent|native_tool|native_memory|raw_manifest|native_manifest|manifest)$/i;
  const forbiddenStrings = /MEMORY\.md|USER\.md|SKILL\.md|(?:https?|wss?|ftp):\/\/|\.\.\/|\/(?:tmp|var|workspace|opt|etc|home|usr)\/|\b(?:native_session[A-Za-z0-9_-]*|native_error[A-Za-z0-9_-]*|raw_credential|credential_material|api[_-]?key|password|secret[-_ ]?token|bearer\s+[A-Za-z0-9._-]+)\b/i;
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item);
      return;
    }
    if (candidate && typeof candidate === "object") {
      for (const [key, item] of Object.entries(candidate)) {
        if (forbiddenKeys.test(key)) {
          throw new OpenClawGatewayAdapterError("PLATFORM_INVALID_REQUEST", "Gateway payload contains non-platform field", { field: key });
        }
        visit(item);
      }
      return;
    }
    if (typeof candidate === "string" && forbiddenStrings.test(candidate)) {
      throw new OpenClawGatewayAdapterError("PLATFORM_INVALID_REQUEST", "Gateway payload contains non-platform marker");
    }
  };
  visit(value);
}

function sanitizeDetails(value: Record<string, unknown>): Record<string, unknown> {
  const raw = JSON.stringify(value, (_key, item) => {
    if (typeof item === "string") {
      return item
        .replace(/(?:https?|wss?|ftp):\/\/\S+/gi, "[redacted-url]")
        .replace(/\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+/gi, "[redacted-path]")
        .replace(/MEMORY\.md|USER\.md|SKILL\.md/gi, "[redacted-native-file]")
        .replace(/\b(?:native_session_id|native_session|native_error|native_path|native_url|credential_material|raw_credential|api_key|password|token|session_id|file_path|path|url|raw_manifest|native_manifest)\b/gi, "[redacted-field]");
    }
    return item;
  });
  return JSON.parse(raw) as Record<string, unknown>;
}
