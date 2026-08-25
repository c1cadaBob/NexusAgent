import { assertPlatformId } from "../../task-state/index.ts";

export const OPENCLAW_PLUGIN_BRIDGE_SCHEMA_VERSION = "nexus.openclaw_plugin_bridge.p4.v1";
const OPENCLAW_PLUGIN_BRIDGE_DEFAULT_PROVIDER_ID = "openclaw-2026.8.1";

export type OpenClawPluginCapabilityType = "channel" | "message_transform" | "mcp_server";
export type OpenClawPluginAllowlistStatus = "pending_scan" | "pending_review" | "approved" | "disabled" | "rejected";
export type OpenClawPluginRiskLevel = "low" | "medium" | "high" | "critical";
export type OpenClawPluginSourceType = "clawhub" | "npm" | "git" | "local_snapshot" | "mcp_manifest";

export interface OpenClawPluginTenantVisibility {
  mode: "platform_admin_only" | "approved_tenants" | "all_tenants";
  tenant_ids?: readonly string[];
}

export interface OpenClawPluginCapabilityCandidate {
  capability_id: string;
  capability_type: OpenClawPluginCapabilityType | "native_agent" | "native_tool" | "direct_memory" | "tool";
  display_name: string;
  channel_name?: "dingtalk" | "feishu" | "telegram";
  required_credentials?: readonly string[];
  required_permissions?: readonly string[];
  tenant_visibility: OpenClawPluginTenantVisibility;
  declared_runtime?: "gateway_only" | "message_transform_only" | "native_agent" | "native_tool" | "direct_memory";
  config?: Record<string, unknown>;
}

export interface OpenClawPluginAdmissionPolicy {
  policy_id: string;
  allowed_sources: readonly OpenClawPluginSourceType[];
  allowed_capability_types: readonly OpenClawPluginCapabilityType[];
  credential_policy: "credential_ref_only" | "no_credentials" | "blocked";
  network_policy: "deny_by_default" | "channel_provider_only";
  sandbox_policy: "host_managed" | "not_applicable";
  tenant_scope: "platform_admin_only" | "approved_tenants" | "all_tenants";
  approval_state: "draft" | "pending_review" | "approved" | "disabled" | "rejected";
}

export interface OpenClawPluginInventoryCandidate {
  schema_version?: typeof OPENCLAW_PLUGIN_BRIDGE_SCHEMA_VERSION;
  plugin_id: string;
  source_type: OpenClawPluginSourceType;
  source_ref: string;
  version: string;
  sha256: string;
  host_binding: "gateway_sidecar";
  license: string;
  risk_level: OpenClawPluginRiskLevel;
  allowlist_status: OpenClawPluginAllowlistStatus;
  reviewer?: string;
  trace_id: string;
  admission_policy: OpenClawPluginAdmissionPolicy;
  capabilities: readonly OpenClawPluginCapabilityCandidate[];
}

export interface OpenClawCapabilityDescriptor {
  capability_id: string;
  capability_type: OpenClawPluginCapabilityType;
  display_name: string;
  channel_name?: "dingtalk" | "feishu" | "telegram";
  plugin_id: string;
  provider_binding: "gateway_provider_default";
  gateway_runtime: "gateway_only";
  agent_runtime: "blocked";
  tool_runtime: "blocked";
  memory_runtime: "blocked";
  required_credentials: readonly string[];
  required_permissions: readonly string[];
  tenant_visibility: OpenClawPluginTenantVisibility;
}

export interface OpenClawGatewayPluginHint {
  schema_version: typeof OPENCLAW_PLUGIN_BRIDGE_SCHEMA_VERSION;
  capability_id: string;
  capability_type: OpenClawPluginCapabilityType;
  display_name: string;
  channel_name?: "dingtalk" | "feishu" | "telegram";
  plugin_id: string;
  provider_binding: "gateway_provider_default";
  gateway_runtime: "gateway_only";
  coordinator_runtime: "required";
  policy_gate_runtime: "required";
  credential_refs: readonly string[];
}

export interface OpenClawPluginDiscoveryResult {
  schema_version: typeof OPENCLAW_PLUGIN_BRIDGE_SCHEMA_VERSION;
  provider_id: string;
  trace_id: string;
  capabilities: readonly OpenClawCapabilityDescriptor[];
  gateway_hints: readonly OpenClawGatewayPluginHint[];
}

export interface OpenClawPluginDiscoveryOptions {
  tenant_id: string;
  provider_id?: string;
  trace_id?: string;
}

export class OpenClawPluginBridgeError extends Error {
  readonly code: "PLATFORM_INVALID_REQUEST" | "PLATFORM_POLICY_DENIED" | "PLATFORM_FORBIDDEN";
  readonly details: Record<string, unknown>;

  constructor(code: OpenClawPluginBridgeError["code"], message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "OpenClawPluginBridgeError";
    this.code = code;
    this.details = sanitizePluginBridgeDetails(details);
  }
}

export function buildOpenClawPluginBridgeFixtures(): readonly OpenClawPluginInventoryCandidate[] {
  return [
    channelPluginFixture("dingtalk", "plugin_channel_dingtalk", "cap_channel_dingtalk", "cred_channel_dingtalk_ref"),
    channelPluginFixture("feishu", "plugin_channel_feishu", "cap_channel_feishu", "cred_channel_feishu_ref"),
    channelPluginFixture("telegram", "plugin_channel_telegram", "cap_channel_telegram", "cred_channel_telegram_ref"),
    {
      schema_version: OPENCLAW_PLUGIN_BRIDGE_SCHEMA_VERSION,
      plugin_id: "plugin_message_normalize_alpha",
      source_type: "local_snapshot",
      source_ref: "snapshot:message.normalize.alpha",
      version: "2026.8.1-p4",
      sha256: "sha256:aaaabbbbccccddddeeeeffff0000111122223333444455556666777788889999",
      host_binding: "gateway_sidecar",
      license: "MIT",
      risk_level: "low",
      allowlist_status: "approved",
      reviewer: "platform-admin",
      trace_id: "trace_plugin01",
      admission_policy: approvedGatewayAdmissionPolicy("policy_message_normalize", ["local_snapshot"]),
      capabilities: [
        {
          capability_id: "cap_message_normalize_alpha",
          capability_type: "message_transform",
          display_name: "Message Normalize Transform",
          required_credentials: [],
          required_permissions: ["adapter:invoke"],
          tenant_visibility: { mode: "approved_tenants", tenant_ids: ["tenant_alpha01"] },
          declared_runtime: "message_transform_only",
        },
      ],
    },
  ];
}

export function discoverOpenClawGatewayCapabilities(
  candidates: readonly OpenClawPluginInventoryCandidate[],
  options: OpenClawPluginDiscoveryOptions,
): OpenClawPluginDiscoveryResult {
  assertPlatformId("tenant_id", options.tenant_id);
  if (options.trace_id !== undefined) assertPlatformId("trace_id", options.trace_id);

  const capabilities: OpenClawCapabilityDescriptor[] = [];
  const gatewayHints: OpenClawGatewayPluginHint[] = [];

  for (const candidate of candidates) {
    const normalized = validateOpenClawPluginInventory(candidate, options.tenant_id);
    for (const capability of normalized.capabilities) {
      const descriptor: OpenClawCapabilityDescriptor = {
        capability_id: capability.capability_id,
        capability_type: capability.capability_type,
        display_name: capability.display_name,
        ...(capability.channel_name === undefined ? {} : { channel_name: capability.channel_name }),
        plugin_id: normalized.plugin_id,
        provider_binding: "gateway_provider_default",
        gateway_runtime: "gateway_only",
        agent_runtime: "blocked",
        tool_runtime: "blocked",
        memory_runtime: "blocked",
        required_credentials: [...(capability.required_credentials ?? [])],
        required_permissions: [...(capability.required_permissions ?? [])],
        tenant_visibility: cloneTenantVisibility(capability.tenant_visibility),
      };
      capabilities.push(descriptor);
      gatewayHints.push({
        schema_version: OPENCLAW_PLUGIN_BRIDGE_SCHEMA_VERSION,
        capability_id: descriptor.capability_id,
        capability_type: descriptor.capability_type,
        display_name: descriptor.display_name,
        ...(descriptor.channel_name === undefined ? {} : { channel_name: descriptor.channel_name }),
        plugin_id: descriptor.plugin_id,
        provider_binding: "gateway_provider_default",
        gateway_runtime: "gateway_only",
        coordinator_runtime: "required",
        policy_gate_runtime: "required",
        credential_refs: descriptor.required_credentials,
      });
    }
  }

  return {
    schema_version: OPENCLAW_PLUGIN_BRIDGE_SCHEMA_VERSION,
    provider_id: options.provider_id ?? OPENCLAW_PLUGIN_BRIDGE_DEFAULT_PROVIDER_ID,
    trace_id: options.trace_id ?? "trace_plugin01",
    capabilities: capabilities.map(sanitizeCapabilityDescriptor),
    gateway_hints: gatewayHints.map(sanitizeGatewayHint),
  };
}

function channelPluginFixture(
  channelName: "dingtalk" | "feishu" | "telegram",
  pluginId: string,
  capabilityId: string,
  credentialRef: string,
): OpenClawPluginInventoryCandidate {
  return {
    schema_version: OPENCLAW_PLUGIN_BRIDGE_SCHEMA_VERSION,
    plugin_id: pluginId,
    source_type: channelName === "telegram" ? "npm" : "clawhub",
    source_ref: `${channelName}:channel.adapter`,
    version: "2026.8.1-p4",
    sha256: `sha256:${channelName.padEnd(64, "0").slice(0, 64)}`,
    host_binding: "gateway_sidecar",
    license: "MIT",
    risk_level: channelName === "telegram" ? "medium" : "low",
    allowlist_status: "approved",
    reviewer: "platform-admin",
    trace_id: "trace_plugin01",
    admission_policy: approvedGatewayAdmissionPolicy(`policy_channel_${channelName}`, [channelName === "telegram" ? "npm" : "clawhub"]),
    capabilities: [
      {
        capability_id: capabilityId,
        capability_type: "channel",
        display_name: `${channelName} Channel Gateway`,
        channel_name: channelName,
        required_credentials: [credentialRef],
        required_permissions: ["adapter:invoke"],
        tenant_visibility: { mode: "approved_tenants", tenant_ids: ["tenant_alpha01"] },
        declared_runtime: "gateway_only",
        config: { credential_ref: credentialRef },
      },
    ],
  };
}

function approvedGatewayAdmissionPolicy(
  policyId: string,
  sources: readonly OpenClawPluginSourceType[],
): OpenClawPluginAdmissionPolicy {
  return {
    policy_id: policyId,
    allowed_sources: sources,
    allowed_capability_types: ["channel", "message_transform", "mcp_server"],
    credential_policy: "credential_ref_only",
    network_policy: "deny_by_default",
    sandbox_policy: "host_managed",
    tenant_scope: "approved_tenants",
    approval_state: "approved",
  };
}

function validateOpenClawPluginInventory(
  candidate: OpenClawPluginInventoryCandidate,
  tenantId: string,
): OpenClawPluginInventoryCandidate {
  assertNoNativePluginBridgePayload(candidate);
  if (candidate.schema_version !== undefined && candidate.schema_version !== OPENCLAW_PLUGIN_BRIDGE_SCHEMA_VERSION) {
    throw new OpenClawPluginBridgeError("PLATFORM_INVALID_REQUEST", "Unsupported gateway plugin bridge schema version", {
      schema_version: candidate.schema_version,
    });
  }
  requirePattern(candidate.plugin_id, "plugin_id", /^plugin_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/);
  requirePattern(candidate.trace_id, "trace_id", /^trace_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/);
  if (candidate.host_binding !== "gateway_sidecar") {
    throw new OpenClawPluginBridgeError("PLATFORM_POLICY_DENIED", "Gateway plugin must target the gateway sidecar binding", {
      plugin_id: candidate.plugin_id,
    });
  }
  if (candidate.allowlist_status !== "approved") {
    throw new OpenClawPluginBridgeError("PLATFORM_POLICY_DENIED", "Gateway plugin is not approved by the platform allowlist", {
      plugin_id: candidate.plugin_id,
      status: candidate.allowlist_status,
    });
  }
  if (!["clawhub", "npm", "git", "local_snapshot", "mcp_manifest"].includes(candidate.source_type)) {
    throw new OpenClawPluginBridgeError("PLATFORM_INVALID_REQUEST", "Gateway plugin source type is unsupported", {
      source_type: candidate.source_type,
    });
  }
  if (!candidate.admission_policy.allowed_sources.includes(candidate.source_type)) {
    throw new OpenClawPluginBridgeError("PLATFORM_POLICY_DENIED", "Gateway plugin source is not allowed by admission policy", {
      plugin_id: candidate.plugin_id,
    });
  }
  if (candidate.admission_policy.approval_state !== "approved") {
    throw new OpenClawPluginBridgeError("PLATFORM_POLICY_DENIED", "Gateway plugin admission policy is not approved", {
      plugin_id: candidate.plugin_id,
      approval_state: candidate.admission_policy.approval_state,
    });
  }
  if (candidate.admission_policy.credential_policy === "blocked") {
    throw new OpenClawPluginBridgeError("PLATFORM_POLICY_DENIED", "Gateway plugin credential policy blocks discovery", {
      plugin_id: candidate.plugin_id,
    });
  }
  if (candidate.capabilities.length === 0) {
    throw new OpenClawPluginBridgeError("PLATFORM_INVALID_REQUEST", "Gateway plugin must declare at least one capability", {
      plugin_id: candidate.plugin_id,
    });
  }
  return {
    ...candidate,
    capabilities: candidate.capabilities.map((capability) => validateOpenClawPluginCapability(candidate, capability, tenantId)),
  };
}

function validateOpenClawPluginCapability(
  plugin: OpenClawPluginInventoryCandidate,
  capability: OpenClawPluginCapabilityCandidate,
  tenantId: string,
): OpenClawPluginCapabilityCandidate {
  requirePattern(capability.capability_id, "capability_id", /^cap_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/);
  if (!["channel", "message_transform", "mcp_server"].includes(capability.capability_type)) {
    throw new OpenClawPluginBridgeError("PLATFORM_POLICY_DENIED", "Gateway plugin capability cannot start native agents tools or memory", {
      plugin_id: plugin.plugin_id,
      capability_id: capability.capability_id,
      capability_type: capability.capability_type,
    });
  }
  if (!plugin.admission_policy.allowed_capability_types.includes(capability.capability_type)) {
    throw new OpenClawPluginBridgeError("PLATFORM_POLICY_DENIED", "Gateway plugin capability type is not allowed by admission policy", {
      plugin_id: plugin.plugin_id,
      capability_id: capability.capability_id,
    });
  }
  if (
    capability.declared_runtime !== undefined &&
    capability.declared_runtime !== "gateway_only" &&
    capability.declared_runtime !== "message_transform_only"
  ) {
    throw new OpenClawPluginBridgeError("PLATFORM_POLICY_DENIED", "Gateway plugin capability runtime must be gateway-only", {
      plugin_id: plugin.plugin_id,
      capability_id: capability.capability_id,
    });
  }
  if (capability.capability_type === "channel" && !["dingtalk", "feishu", "telegram"].includes(capability.channel_name ?? "")) {
    throw new OpenClawPluginBridgeError("PLATFORM_POLICY_DENIED", "Gateway channel capability is not in the P4 allowlist", {
      plugin_id: plugin.plugin_id,
      capability_id: capability.capability_id,
      channel_name: capability.channel_name,
    });
  }
  if (!isTenantVisible(capability.tenant_visibility, tenantId)) {
    throw new OpenClawPluginBridgeError("PLATFORM_FORBIDDEN", "Gateway plugin capability is not visible to tenant", {
      plugin_id: plugin.plugin_id,
      capability_id: capability.capability_id,
    });
  }
  for (const credential of capability.required_credentials ?? []) {
    requirePattern(credential, "credential_ref", /^cred_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/);
  }
  return {
    ...capability,
    required_credentials: [...(capability.required_credentials ?? [])],
    required_permissions: [...(capability.required_permissions ?? [])],
    tenant_visibility: cloneTenantVisibility(capability.tenant_visibility),
  };
}

function isTenantVisible(visibility: OpenClawPluginTenantVisibility, tenantId: string): boolean {
  if (visibility.mode === "all_tenants") return true;
  if (visibility.mode === "platform_admin_only") return false;
  return (visibility.tenant_ids ?? []).includes(tenantId);
}

function sanitizeCapabilityDescriptor(descriptor: OpenClawCapabilityDescriptor): OpenClawCapabilityDescriptor {
  assertNoNativePluginBridgePayload(descriptor);
  return {
    capability_id: descriptor.capability_id,
    capability_type: descriptor.capability_type,
    display_name: descriptor.display_name,
    ...(descriptor.channel_name === undefined ? {} : { channel_name: descriptor.channel_name }),
    plugin_id: descriptor.plugin_id,
    provider_binding: "gateway_provider_default",
    gateway_runtime: "gateway_only",
    agent_runtime: "blocked",
    tool_runtime: "blocked",
    memory_runtime: "blocked",
    required_credentials: [...descriptor.required_credentials],
    required_permissions: [...descriptor.required_permissions],
    tenant_visibility: cloneTenantVisibility(descriptor.tenant_visibility),
  };
}

function sanitizeGatewayHint(hint: OpenClawGatewayPluginHint): OpenClawGatewayPluginHint {
  assertNoNativePluginBridgePayload(hint);
  return {
    schema_version: OPENCLAW_PLUGIN_BRIDGE_SCHEMA_VERSION,
    capability_id: hint.capability_id,
    capability_type: hint.capability_type,
    display_name: hint.display_name,
    ...(hint.channel_name === undefined ? {} : { channel_name: hint.channel_name }),
    plugin_id: hint.plugin_id,
    provider_binding: "gateway_provider_default",
    gateway_runtime: "gateway_only",
    coordinator_runtime: "required",
    policy_gate_runtime: "required",
    credential_refs: [...hint.credential_refs],
  };
}

function cloneTenantVisibility(visibility: OpenClawPluginTenantVisibility): OpenClawPluginTenantVisibility {
  return {
    mode: visibility.mode,
    ...(visibility.tenant_ids === undefined ? {} : { tenant_ids: [...visibility.tenant_ids] }),
  };
}

function requirePattern(value: unknown, field: string, pattern: RegExp): string {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new OpenClawPluginBridgeError("PLATFORM_INVALID_REQUEST", "Gateway plugin field is invalid", { field });
  }
  return value;
}

function assertNoNativePluginBridgePayload(value: unknown): void {
  const forbiddenKeys = /^(?:credential_material|raw_credential|api_key|password|token|secret|env|environment|native_session_id|native_error|native_path|native_url|base_url|endpoint|file_path|path|url|session_id|tool_name|memory_path|agent_command)$/i;
  const forbiddenStrings = /MEMORY\.md|USER\.md|SKILL\.md|https?:\/\/|vendor\/|\.\.\/|\/(?:tmp|var|workspace|opt)\/|\b(?:native_session[A-Za-z0-9_-]*|native_error[A-Za-z0-9_-]*|raw_credential|credential_material|api_key|password|secret[-_ ]?token|bearer\s+[A-Za-z0-9._-]+)\b/i;
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item);
      return;
    }
    if (candidate && typeof candidate === "object") {
      for (const [key, item] of Object.entries(candidate)) {
        if (forbiddenKeys.test(key)) {
          throw new OpenClawPluginBridgeError("PLATFORM_INVALID_REQUEST", "Gateway plugin payload contains non-platform field", { field: key });
        }
        visit(item);
      }
      return;
    }
    if (typeof candidate === "string" && forbiddenStrings.test(candidate)) {
      throw new OpenClawPluginBridgeError("PLATFORM_INVALID_REQUEST", "Gateway plugin payload contains non-platform marker");
    }
  };
  visit(value);
}

function sanitizePluginBridgeDetails(value: Record<string, unknown>): Record<string, unknown> {
  const raw = JSON.stringify(value, (_key, item) => {
    if (typeof item === "string") {
      return item
        .replace(/https?:\/\/\S+/gi, "[redacted-url]")
        .replace(/\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+/gi, "[redacted-path]")
        .replace(/MEMORY\.md|USER\.md|SKILL\.md/gi, "[redacted-native-file]")
        .replace(/\b(?:native_session_id|native_session|native_error|native_path|native_url|credential_material|raw_credential|api_key|password|token|session_id|file_path|path|url)\b/gi, "[redacted-field]");
    }
    return item;
  });
  return JSON.parse(raw) as Record<string, unknown>;
}

