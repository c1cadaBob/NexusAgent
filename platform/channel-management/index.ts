import {
  buildOpenClawChannelOutboundFixture,
  OpenClawGatewayAdapter,
  OpenClawProviderRegistry,
} from "../adapters/openclaw/index.ts";
import type { PlatformClock } from "../clock/index.ts";
import type { Coordinator } from "../coordinator/index.ts";
import type { InMemoryEventBus } from "../event-bus/index.ts";
import type { PolicyPrincipal } from "../policy-gate/index.ts";
import { assertPlatformId } from "../task-state/index.ts";

export const CHANNEL_MANAGEMENT_SCHEMA_VERSION = "nexus.channel_management.p5.v1";
export const CHANNEL_MANAGEMENT_ALLOWED_CHANNELS = ["dingtalk", "feishu", "telegram"] as const;

export type ChannelName = (typeof CHANNEL_MANAGEMENT_ALLOWED_CHANNELS)[number];
export type ChannelConfigStatus = "enabled" | "disabled";
export type ChannelCredentialStatus = "reference_configured" | "missing_reference";
export type ChannelTestStatus = "passed" | "failed";

export interface ChannelManagementOptions {
  clock: PlatformClock;
  coordinator: Coordinator;
  eventBus: InMemoryEventBus;
}

export interface ChannelConfigCreateInput {
  tenant_id: string;
  channel_name: ChannelName;
  display_name: string;
  account_ref: string;
  conversation_ref: string;
  credential_ref?: string;
  trace_id: string;
}

export interface ChannelConfigUpdateInput {
  display_name?: string;
  account_ref?: string;
  conversation_ref?: string;
  credential_ref?: string;
  trace_id: string;
}

export interface ChannelConfigStatusInput {
  status: ChannelConfigStatus;
  reason: string;
  trace_id: string;
}

export interface ChannelConfigTestInput {
  trace_id: string;
}

interface StoredChannelConfig {
  schema_version: typeof CHANNEL_MANAGEMENT_SCHEMA_VERSION;
  channel_config_id: string;
  tenant_id: string;
  channel_name: ChannelName;
  display_name: string;
  status: ChannelConfigStatus;
  capability_id: string;
  account_ref: string;
  conversation_ref: string;
  credential_ref?: string;
  created_at: string;
  updated_at: string;
  trace_id: string;
  last_test?: ChannelConnectionTestResult;
}

export interface ChannelConfigView {
  schema_version: typeof CHANNEL_MANAGEMENT_SCHEMA_VERSION;
  channel_config_id: string;
  tenant_id: string;
  channel_name: ChannelName;
  display_name: string;
  status: ChannelConfigStatus;
  capability_id: string;
  account_ref: string;
  conversation_ref: string;
  credential_status: ChannelCredentialStatus;
  created_at: string;
  updated_at: string;
  trace_id: string;
  last_test?: ChannelConnectionTestResult;
}

export interface ChannelConnectionTestResult {
  schema_version: typeof CHANNEL_MANAGEMENT_SCHEMA_VERSION;
  channel_config_id: string;
  tenant_id: string;
  channel_name: ChannelName;
  test_status: ChannelTestStatus;
  policy_gate_status: "allowed" | "denied";
  delivery_outcome: "queued" | "not_queued";
  checked_at: string;
  trace_id: string;
}

export class ChannelManagementError extends Error {
  readonly code:
    | "PLATFORM_INVALID_REQUEST"
    | "PLATFORM_NOT_FOUND"
    | "PLATFORM_CONFLICT"
    | "PLATFORM_POLICY_DENIED"
    | "PLATFORM_SCHEMA_VALIDATION_FAILED";
  readonly details: Record<string, unknown>;

  constructor(code: ChannelManagementError["code"], message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "ChannelManagementError";
    this.code = code;
    this.details = sanitizeDetails(details);
  }
}

export class LocalChannelManagement {
  readonly clock: PlatformClock;
  readonly coordinator: Coordinator;
  readonly eventBus: InMemoryEventBus;
  readonly #configs = new Map<string, StoredChannelConfig>();
  #sequence = 0;

  constructor(options: ChannelManagementOptions) {
    this.clock = options.clock;
    this.coordinator = options.coordinator;
    this.eventBus = options.eventBus;
    const registry = new OpenClawProviderRegistry();
    const adapter = new OpenClawGatewayAdapter({ registry, eventBus: this.eventBus });
    adapter.start();
    this.coordinator.registerAdapter(adapter);
  }

  list(input: { tenant_id: string }): readonly ChannelConfigView[] {
    assertPlatformId("tenant_id", input.tenant_id);
    return [...this.#configs.values()]
      .filter((config) => config.tenant_id === input.tenant_id)
      .sort((left, right) => left.channel_config_id.localeCompare(right.channel_config_id))
      .map(projectChannelConfig);
  }

  get(channel_config_id: string): ChannelConfigView {
    return projectChannelConfig(this.#get(channel_config_id));
  }

  create(input: ChannelConfigCreateInput): ChannelConfigView {
    const normalized = normalizeCreateInput(input);
    const duplicate = [...this.#configs.values()].find((config) => (
      config.tenant_id === normalized.tenant_id
      && config.channel_name === normalized.channel_name
      && config.account_ref === normalized.account_ref
      && config.conversation_ref === normalized.conversation_ref
    ));
    if (duplicate) {
      throw new ChannelManagementError("PLATFORM_CONFLICT", "Channel configuration already exists", {
        channel_config_id: duplicate.channel_config_id,
      });
    }

    const reading = this.clock.now();
    const channel_config_id = this.#nextChannelConfigId(normalized.channel_name, normalized.trace_id);
    const config: StoredChannelConfig = {
      schema_version: CHANNEL_MANAGEMENT_SCHEMA_VERSION,
      channel_config_id,
      tenant_id: normalized.tenant_id,
      channel_name: normalized.channel_name,
      display_name: normalized.display_name,
      status: "disabled",
      capability_id: `cap_channel_${normalized.channel_name}`,
      account_ref: normalized.account_ref,
      conversation_ref: normalized.conversation_ref,
      ...(normalized.credential_ref === undefined ? {} : { credential_ref: normalized.credential_ref }),
      created_at: reading.utc_timestamp,
      updated_at: reading.utc_timestamp,
      trace_id: normalized.trace_id,
    };
    this.#configs.set(channel_config_id, config);
    return projectChannelConfig(config);
  }

  update(channel_config_id: string, input: ChannelConfigUpdateInput): ChannelConfigView {
    const config = this.#get(channel_config_id);
    const normalized = normalizeUpdateInput(input);
    if (normalized.display_name !== undefined) config.display_name = normalized.display_name;
    if (normalized.account_ref !== undefined) config.account_ref = normalized.account_ref;
    if (normalized.conversation_ref !== undefined) config.conversation_ref = normalized.conversation_ref;
    if (normalized.credential_ref !== undefined) config.credential_ref = normalized.credential_ref;
    config.trace_id = normalized.trace_id;
    config.updated_at = this.clock.now().utc_timestamp;
    return projectChannelConfig(config);
  }

  setStatus(channel_config_id: string, input: ChannelConfigStatusInput): ChannelConfigView {
    const config = this.#get(channel_config_id);
    const normalized = normalizeStatusInput(input);
    config.status = normalized.status;
    config.trace_id = normalized.trace_id;
    config.updated_at = this.clock.now().utc_timestamp;
    return projectChannelConfig(config);
  }

  async testConnection(channel_config_id: string, input: ChannelConfigTestInput, principal: PolicyPrincipal): Promise<ChannelConnectionTestResult> {
    const config = this.#get(channel_config_id);
    const trace_id = assertPlatformId("trace_id", input.trace_id);
    if (config.status !== "enabled") {
      throw new ChannelManagementError("PLATFORM_CONFLICT", "Channel configuration must be enabled before testing", { channel_config_id });
    }
    if (config.credential_ref === undefined) {
      throw new ChannelManagementError("PLATFORM_INVALID_REQUEST", "Channel credential reference is required before testing", { channel_config_id });
    }

    const reading = this.clock.now();
    const suffix = `${trace_id.replace(/^trace_/, "")}_${String(++this.#sequence).padStart(4, "0")}`;
    const task_id = `task_channel_${suffix}`;
    const attempt_id = `attempt_channel_${suffix}`;
    const execution_id = `exec_channel_${suffix}`;
    const conversation_id = `conv_channel_${suffix}`;
    this.coordinator.submitTask({
      schema_version: "nexus.task_request.v1",
      tenant_id: config.tenant_id,
      user_id: principal.user_id,
      agent_id: "agent_channel_management",
      task_id,
      attempt_id,
      execution_id,
      conversation_id,
      trace_id,
      input: { kind: "text", text: "channel connection dry run" },
      source: { kind: "api" },
      policy_context: { tenant_scope: "single_tenant", approval_mode: "not_required" },
      idempotency_key: `channel-test:${channel_config_id}:${trace_id}`,
      created_at_utc: reading.utc_timestamp,
      monotonic_ms: reading.monotonic_ms,
    }, { principal });

    const dispatch = await this.coordinator.dispatchToAdapter(task_id, {
      adapter_name: "openclaw-gateway",
      principal,
      payload: buildOpenClawChannelOutboundFixture({
        tenant_id: config.tenant_id,
        user_id: principal.user_id,
        agent_id: "agent_channel_management",
        task_id,
        attempt_id,
        execution_id,
        conversation_id,
        trace_id,
        requested_at_utc: reading.utc_timestamp,
        monotonic_ms: reading.monotonic_ms,
        channel: {
          capability_id: config.capability_id,
          name: config.channel_name,
          direction: "outbound",
          account_ref: config.account_ref,
          conversation_ref: config.conversation_ref,
          message_id: `msg_channel_${suffix}`,
          credential_ref: config.credential_ref,
        },
        result: {
          result_id: `result_channel_${suffix}`,
          status: "completed",
          text: "channel connection dry run",
          artifact_refs: [],
        },
      }),
    });

    const delivery_outcome = dispatch.adapter_result.payload.gateway_outcome === "channel_send_intent" ? "queued" : "not_queued";
    const result: ChannelConnectionTestResult = {
      schema_version: CHANNEL_MANAGEMENT_SCHEMA_VERSION,
      channel_config_id: config.channel_config_id,
      tenant_id: config.tenant_id,
      channel_name: config.channel_name,
      test_status: dispatch.decision.allow && delivery_outcome === "queued" ? "passed" : "failed",
      policy_gate_status: dispatch.decision.allow ? "allowed" : "denied",
      delivery_outcome,
      checked_at: reading.utc_timestamp,
      trace_id,
    };
    config.last_test = result;
    config.trace_id = trace_id;
    config.updated_at = reading.utc_timestamp;
    return clonePublic(result);
  }

  #get(channel_config_id: string): StoredChannelConfig {
    assertChannelConfigId(channel_config_id);
    const config = this.#configs.get(channel_config_id);
    if (!config) throw new ChannelManagementError("PLATFORM_NOT_FOUND", "Channel configuration not found", { channel_config_id });
    return config;
  }

  #nextChannelConfigId(channel_name: ChannelName, trace_id: string): string {
    this.#sequence += 1;
    return `channel_config_${channel_name}_${trace_id.replace(/^trace_/, "")}_${String(this.#sequence).padStart(4, "0")}`;
  }
}

export function assertChannelConfigId(value: unknown): string {
  if (typeof value !== "string" || !/^channel_config_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/.test(value)) {
    throw new ChannelManagementError("PLATFORM_INVALID_REQUEST", "Channel configuration identifier is invalid");
  }
  return value;
}

function normalizeCreateInput(input: ChannelConfigCreateInput): ChannelConfigCreateInput {
  const normalized: ChannelConfigCreateInput = {
    tenant_id: assertPlatformId("tenant_id", input.tenant_id),
    channel_name: requireChannelName(input.channel_name),
    display_name: requireText(input.display_name, "display_name"),
    account_ref: requireChannelRef(input.account_ref, "account_ref", /^channel_account_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/),
    conversation_ref: requireChannelRef(input.conversation_ref, "conversation_ref", /^channel_conversation_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/),
    trace_id: assertPlatformId("trace_id", input.trace_id),
    ...(input.credential_ref === undefined ? {} : { credential_ref: requireCredentialRef(input.credential_ref) }),
  };
  return normalized;
}

function normalizeUpdateInput(input: ChannelConfigUpdateInput): ChannelConfigUpdateInput {
  return {
    ...(input.display_name === undefined ? {} : { display_name: requireText(input.display_name, "display_name") }),
    ...(input.account_ref === undefined ? {} : { account_ref: requireChannelRef(input.account_ref, "account_ref", /^channel_account_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/) }),
    ...(input.conversation_ref === undefined ? {} : { conversation_ref: requireChannelRef(input.conversation_ref, "conversation_ref", /^channel_conversation_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/) }),
    ...(input.credential_ref === undefined ? {} : { credential_ref: requireCredentialRef(input.credential_ref) }),
    trace_id: assertPlatformId("trace_id", input.trace_id),
  };
}

function normalizeStatusInput(input: ChannelConfigStatusInput): ChannelConfigStatusInput {
  if (input.status !== "enabled" && input.status !== "disabled") {
    throw new ChannelManagementError("PLATFORM_INVALID_REQUEST", "Channel status is unsupported", { status: input.status });
  }
  return {
    status: input.status,
    reason: requireText(input.reason, "reason"),
    trace_id: assertPlatformId("trace_id", input.trace_id),
  };
}

function requireChannelName(value: unknown): ChannelName {
  if (!(CHANNEL_MANAGEMENT_ALLOWED_CHANNELS as readonly string[]).includes(String(value))) {
    throw new ChannelManagementError("PLATFORM_POLICY_DENIED", "Channel is not approved by the platform allowlist", { channel_name: value });
  }
  return value as ChannelName;
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new ChannelManagementError("PLATFORM_INVALID_REQUEST", "Text field is required", { field });
  return value.trim();
}

function requireChannelRef(value: unknown, field: string, pattern: RegExp): string {
  if (typeof value !== "string" || !pattern.test(value)) throw new ChannelManagementError("PLATFORM_INVALID_REQUEST", "Channel reference is invalid", { field });
  return value;
}

function requireCredentialRef(value: unknown): string {
  if (typeof value !== "string" || !/^cred_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/.test(value)) {
    throw new ChannelManagementError("PLATFORM_INVALID_REQUEST", "Credential reference is invalid", { field: "credential_ref" });
  }
  return value;
}

function projectChannelConfig(config: StoredChannelConfig): ChannelConfigView {
  return clonePublic({
    schema_version: CHANNEL_MANAGEMENT_SCHEMA_VERSION,
    channel_config_id: config.channel_config_id,
    tenant_id: config.tenant_id,
    channel_name: config.channel_name,
    display_name: config.display_name,
    status: config.status,
    capability_id: config.capability_id,
    account_ref: config.account_ref,
    conversation_ref: config.conversation_ref,
    credential_status: config.credential_ref ? "reference_configured" : "missing_reference",
    created_at: config.created_at,
    updated_at: config.updated_at,
    trace_id: config.trace_id,
    ...(config.last_test === undefined ? {} : { last_test: config.last_test }),
  });
}

function clonePublic<T>(value: T): T {
  const text = JSON.stringify(value);
  if (/Hermes|OpenClaw|DeepSeek|\bDSH\b|native_|raw_credential|credential_material|credential_ref|provider_(?:agent|task|cancel|binding)|https?:\/\/|\/(?:opt|tmp|var|etc|home|usr)\//i.test(text)) {
    throw new ChannelManagementError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Channel management projection contains a non-platform marker");
  }
  return JSON.parse(text) as T;
}

function sanitizeDetails(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value, (key, item) => {
    if (/credential_ref|raw_credential|credential_material|provider_binding/i.test(key)) return "[redacted]";
    if (typeof item !== "string") return item;
    return item
      .replace(/Hermes|OpenClaw|DeepSeek|\bDSH\b/gi, "[redacted-component]")
      .replace(/(?:https?|wss?|ftp):\/\/\S+/gi, "[redacted-url]")
      .replace(/\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+/gi, "[redacted-path]")
      .replace(/\b(?:credential_ref|raw_credential|credential_material|provider_binding|native_session|native_error|native_path|native_url)\b/gi, "[redacted-field]");
  })) as Record<string, unknown>;
}
