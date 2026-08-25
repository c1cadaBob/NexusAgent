import { assertPlatformId } from "../../task-state/index.ts";

export const HERMES_PLUGIN_BRIDGE_SCHEMA_VERSION = "nexus.hermes_plugin_bridge.p3.v1";
const HERMES_PLUGIN_BRIDGE_DEFAULT_PROVIDER_ID = "hermes-0.20.5";

export type HermesPluginCapabilityType = "skill" | "mcp_server" | "planner_hint";
export type HermesPluginAllowlistStatus = "pending_scan" | "pending_review" | "approved" | "disabled" | "rejected";
export type HermesPluginRiskLevel = "low" | "medium" | "high" | "critical";
export type HermesPluginSourceType = "local_snapshot" | "mcp_manifest";

export interface HermesPluginTenantVisibility {
  mode: "platform_admin_only" | "approved_tenants" | "all_tenants";
  tenant_ids?: readonly string[];
}

export interface HermesPluginCapabilityCandidate {
  capability_id: string;
  capability_type: HermesPluginCapabilityType | "tool" | "native_tool" | "memory_direct";
  display_name: string;
  required_credentials?: readonly string[];
  required_permissions?: readonly string[];
  tenant_visibility: HermesPluginTenantVisibility;
  planner_hint?: string;
  declared_runtime?: "planner_hint" | "tool_execution" | "memory_direct";
  config?: Record<string, unknown>;
}

export interface HermesPluginAdmissionPolicy {
  policy_id: string;
  allowed_sources: readonly HermesPluginSourceType[];
  allowed_capability_types: readonly HermesPluginCapabilityType[];
  credential_policy: "credential_ref_only" | "no_credentials" | "blocked";
  network_policy: "deny_by_default" | "host_sidecar_only";
  sandbox_policy: "host_managed" | "not_applicable";
  tenant_scope: "platform_admin_only" | "approved_tenants" | "all_tenants";
  approval_state: "draft" | "pending_review" | "approved" | "disabled" | "rejected";
}

export interface HermesPluginInventoryCandidate {
  schema_version?: typeof HERMES_PLUGIN_BRIDGE_SCHEMA_VERSION;
  plugin_id: string;
  source_type: HermesPluginSourceType;
  source_ref: string;
  version: string;
  sha256: string;
  native_host: "planner_sidecar";
  license: string;
  risk_level: HermesPluginRiskLevel;
  allowlist_status: HermesPluginAllowlistStatus;
  reviewer?: string;
  trace_id: string;
  admission_policy: HermesPluginAdmissionPolicy;
  capabilities: readonly HermesPluginCapabilityCandidate[];
}

export interface HermesCapabilityDescriptor {
  capability_id: string;
  capability_type: HermesPluginCapabilityType;
  display_name: string;
  native_host: "planner_sidecar";
  plugin_id: string;
  required_credentials: readonly string[];
  required_permissions: readonly string[];
  tenant_visibility: HermesPluginTenantVisibility;
}

export interface HermesPlannerHint {
  schema_version: typeof HERMES_PLUGIN_BRIDGE_SCHEMA_VERSION;
  capability_id: string;
  capability_type: HermesPluginCapabilityType;
  display_name: string;
  plugin_id: string;
  provider_binding: "planner_provider_default";
  planner_runtime: "planner_only";
  memory_runtime: "memory_gateway_required";
  execution_runtime: "tool_intent_only";
  credential_refs: readonly string[];
}

export interface HermesPluginDiscoveryResult {
  schema_version: typeof HERMES_PLUGIN_BRIDGE_SCHEMA_VERSION;
  provider_id: string;
  trace_id: string;
  capabilities: readonly HermesCapabilityDescriptor[];
  planner_hints: readonly HermesPlannerHint[];
}

export interface HermesPluginDiscoveryOptions {
  tenant_id: string;
  provider_id?: string;
  trace_id?: string;
}

export class HermesPluginBridgeError extends Error {
  readonly code: "PLATFORM_INVALID_REQUEST" | "PLATFORM_POLICY_DENIED" | "PLATFORM_FORBIDDEN";
  readonly details: Record<string, unknown>;

  constructor(code: HermesPluginBridgeError["code"], message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "HermesPluginBridgeError";
    this.code = code;
    this.details = sanitizePluginBridgeDetails(details);
  }
}

export function buildHermesPluginBridgeFixtures(): readonly HermesPluginInventoryCandidate[] {
  return [
    {
      schema_version: HERMES_PLUGIN_BRIDGE_SCHEMA_VERSION,
      plugin_id: "plugin_hermes_skill_security_guidance",
      source_type: "local_snapshot",
      source_ref: "snapshot:planner.skill.security_guidance",
      version: "0.20.5-p3",
      sha256: "sha256:111122223333444455556666777788889999aaaabbbbccccddddeeeeffff0000",
      native_host: "planner_sidecar",
      license: "Apache-2.0",
      risk_level: "low",
      allowlist_status: "approved",
      reviewer: "platform-admin",
      trace_id: "trace_plugin01",
      admission_policy: approvedPlannerAdmissionPolicy("policy_plugin_skill_security_guidance", ["local_snapshot"]),
      capabilities: [
        {
          capability_id: "cap_planner_security_guidance",
          capability_type: "skill",
          display_name: "Security Guidance Planner Hint",
          required_credentials: [],
          required_permissions: ["planner:invoke"],
          tenant_visibility: { mode: "approved_tenants", tenant_ids: ["tenant_alpha01"] },
          planner_hint: "Use approved platform security guidance while drafting planner steps.",
          declared_runtime: "planner_hint",
        },
      ],
    },
    {
      schema_version: HERMES_PLUGIN_BRIDGE_SCHEMA_VERSION,
      plugin_id: "plugin_hermes_mcp_research",
      source_type: "mcp_manifest",
      source_ref: "manifest:planner.mcp.research_metadata",
      version: "0.20.5-p3",
      sha256: "sha256:0000ffffeeeeddddccccbbbbaaaa999988887777666655554444333322221111",
      native_host: "planner_sidecar",
      license: "MIT",
      risk_level: "medium",
      allowlist_status: "approved",
      reviewer: "platform-admin",
      trace_id: "trace_plugin01",
      admission_policy: approvedPlannerAdmissionPolicy("policy_plugin_mcp_research", ["mcp_manifest"]),
      capabilities: [
        {
          capability_id: "cap_planner_research_metadata",
          capability_type: "mcp_server",
          display_name: "Research Metadata Planner Hint",
          required_credentials: ["cred_planner_research_ref"],
          required_permissions: ["planner:invoke"],
          tenant_visibility: { mode: "approved_tenants", tenant_ids: ["tenant_alpha01"] },
          planner_hint: "Reference approved research metadata only as planner context.",
          declared_runtime: "planner_hint",
          config: { credential_ref: "cred_planner_research_ref" },
        },
      ],
    },
  ];
}

export function discoverHermesPlannerCapabilities(
  candidates: readonly HermesPluginInventoryCandidate[],
  options: HermesPluginDiscoveryOptions,
): HermesPluginDiscoveryResult {
  assertPlatformId("tenant_id", options.tenant_id);
  if (options.trace_id !== undefined) assertPlatformId("trace_id", options.trace_id);

  const capabilities: HermesCapabilityDescriptor[] = [];
  const plannerHints: HermesPlannerHint[] = [];

  for (const candidate of candidates) {
    const normalized = validateHermesPluginInventory(candidate, options.tenant_id);
    for (const capability of normalized.capabilities) {
      const descriptor: HermesCapabilityDescriptor = {
        capability_id: capability.capability_id,
        capability_type: capability.capability_type,
        display_name: capability.display_name,
        native_host: "planner_sidecar",
        plugin_id: normalized.plugin_id,
        required_credentials: [...(capability.required_credentials ?? [])],
        required_permissions: [...(capability.required_permissions ?? [])],
        tenant_visibility: cloneTenantVisibility(capability.tenant_visibility),
      };
      capabilities.push(descriptor);
      plannerHints.push({
        schema_version: HERMES_PLUGIN_BRIDGE_SCHEMA_VERSION,
        capability_id: descriptor.capability_id,
        capability_type: descriptor.capability_type,
        display_name: descriptor.display_name,
        plugin_id: descriptor.plugin_id,
        provider_binding: "planner_provider_default",
        planner_runtime: "planner_only",
        memory_runtime: "memory_gateway_required",
        execution_runtime: "tool_intent_only",
        credential_refs: descriptor.required_credentials,
      });
    }
  }

  return {
    schema_version: HERMES_PLUGIN_BRIDGE_SCHEMA_VERSION,
    provider_id: options.provider_id ?? HERMES_PLUGIN_BRIDGE_DEFAULT_PROVIDER_ID,
    trace_id: options.trace_id ?? "trace_plugin01",
    capabilities: capabilities.map(sanitizeCapabilityDescriptor),
    planner_hints: plannerHints.map(sanitizePlannerHint),
  };
}

function approvedPlannerAdmissionPolicy(policyId: string, sources: readonly HermesPluginSourceType[]): HermesPluginAdmissionPolicy {
  return {
    policy_id: policyId,
    allowed_sources: sources,
    allowed_capability_types: ["skill", "mcp_server", "planner_hint"],
    credential_policy: "credential_ref_only",
    network_policy: "deny_by_default",
    sandbox_policy: "host_managed",
    tenant_scope: "approved_tenants",
    approval_state: "approved",
  };
}

function validateHermesPluginInventory(candidate: HermesPluginInventoryCandidate, tenantId: string): HermesPluginInventoryCandidate {
  assertNoNativePluginBridgePayload(candidate);
  if (candidate.schema_version !== undefined && candidate.schema_version !== HERMES_PLUGIN_BRIDGE_SCHEMA_VERSION) {
    throw new HermesPluginBridgeError("PLATFORM_INVALID_REQUEST", "Unsupported planner plugin bridge schema version", {
      schema_version: candidate.schema_version,
    });
  }
  requirePattern(candidate.plugin_id, "plugin_id", /^plugin_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/);
  requirePattern(candidate.trace_id, "trace_id", /^trace_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/);
  if (candidate.native_host !== "planner_sidecar") {
    throw new HermesPluginBridgeError("PLATFORM_POLICY_DENIED", "Planner plugin must target the planner sidecar host", { plugin_id: candidate.plugin_id });
  }
  if (candidate.allowlist_status !== "approved") {
    throw new HermesPluginBridgeError("PLATFORM_POLICY_DENIED", "Planner plugin is not approved by the platform allowlist", {
      plugin_id: candidate.plugin_id,
      status: candidate.allowlist_status,
    });
  }
  if (candidate.source_type !== "local_snapshot" && candidate.source_type !== "mcp_manifest") {
    throw new HermesPluginBridgeError("PLATFORM_INVALID_REQUEST", "Planner plugin source type is unsupported", { source_type: candidate.source_type });
  }
  if (!candidate.admission_policy.allowed_sources.includes(candidate.source_type)) {
    throw new HermesPluginBridgeError("PLATFORM_POLICY_DENIED", "Planner plugin source is not allowed by admission policy", {
      plugin_id: candidate.plugin_id,
    });
  }
  if (candidate.admission_policy.approval_state !== "approved") {
    throw new HermesPluginBridgeError("PLATFORM_POLICY_DENIED", "Planner plugin admission policy is not approved", {
      plugin_id: candidate.plugin_id,
      approval_state: candidate.admission_policy.approval_state,
    });
  }
  if (candidate.admission_policy.credential_policy === "blocked") {
    throw new HermesPluginBridgeError("PLATFORM_POLICY_DENIED", "Planner plugin credential policy blocks discovery", { plugin_id: candidate.plugin_id });
  }
  if (candidate.capabilities.length === 0) {
    throw new HermesPluginBridgeError("PLATFORM_INVALID_REQUEST", "Planner plugin must declare at least one capability", { plugin_id: candidate.plugin_id });
  }
  return {
    ...candidate,
    capabilities: candidate.capabilities.map((capability) => validateHermesPluginCapability(candidate, capability, tenantId)),
  };
}

function validateHermesPluginCapability(
  plugin: HermesPluginInventoryCandidate,
  capability: HermesPluginCapabilityCandidate,
  tenantId: string,
): HermesPluginCapabilityCandidate {
  requirePattern(capability.capability_id, "capability_id", /^cap_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/);
  if (capability.capability_type !== "skill" && capability.capability_type !== "mcp_server" && capability.capability_type !== "planner_hint") {
    throw new HermesPluginBridgeError("PLATFORM_POLICY_DENIED", "Planner plugin capability cannot execute native tools or read memory directly", {
      plugin_id: plugin.plugin_id,
      capability_id: capability.capability_id,
      capability_type: capability.capability_type,
    });
  }
  if (!plugin.admission_policy.allowed_capability_types.includes(capability.capability_type)) {
    throw new HermesPluginBridgeError("PLATFORM_POLICY_DENIED", "Planner plugin capability type is not allowed by admission policy", {
      plugin_id: plugin.plugin_id,
      capability_id: capability.capability_id,
    });
  }
  if (capability.declared_runtime !== undefined && capability.declared_runtime !== "planner_hint") {
    throw new HermesPluginBridgeError("PLATFORM_POLICY_DENIED", "Planner plugin capability runtime must be planner hint only", {
      plugin_id: plugin.plugin_id,
      capability_id: capability.capability_id,
    });
  }
  if (!isTenantVisible(capability.tenant_visibility, tenantId)) {
    throw new HermesPluginBridgeError("PLATFORM_FORBIDDEN", "Planner plugin capability is not visible to tenant", {
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

function isTenantVisible(visibility: HermesPluginTenantVisibility, tenantId: string): boolean {
  if (visibility.mode === "all_tenants") return true;
  if (visibility.mode === "platform_admin_only") return false;
  return (visibility.tenant_ids ?? []).includes(tenantId);
}

function sanitizeCapabilityDescriptor(descriptor: HermesCapabilityDescriptor): HermesCapabilityDescriptor {
  assertNoNativePluginBridgePayload(descriptor);
  return {
    capability_id: descriptor.capability_id,
    capability_type: descriptor.capability_type,
    display_name: descriptor.display_name,
    native_host: "planner_sidecar",
    plugin_id: descriptor.plugin_id,
    required_credentials: [...descriptor.required_credentials],
    required_permissions: [...descriptor.required_permissions],
    tenant_visibility: cloneTenantVisibility(descriptor.tenant_visibility),
  };
}

function sanitizePlannerHint(hint: HermesPlannerHint): HermesPlannerHint {
  assertNoNativePluginBridgePayload(hint);
  return {
    schema_version: HERMES_PLUGIN_BRIDGE_SCHEMA_VERSION,
    capability_id: hint.capability_id,
    capability_type: hint.capability_type,
    display_name: hint.display_name,
    plugin_id: hint.plugin_id,
    provider_binding: "planner_provider_default",
    planner_runtime: "planner_only",
    memory_runtime: "memory_gateway_required",
    execution_runtime: "tool_intent_only",
    credential_refs: [...hint.credential_refs],
  };
}

function cloneTenantVisibility(visibility: HermesPluginTenantVisibility): HermesPluginTenantVisibility {
  return {
    mode: visibility.mode,
    ...(visibility.tenant_ids === undefined ? {} : { tenant_ids: [...visibility.tenant_ids] }),
  };
}

function requirePattern(value: unknown, field: string, pattern: RegExp): string {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new HermesPluginBridgeError("PLATFORM_INVALID_REQUEST", "Planner plugin field is invalid", { field });
  }
  return value;
}

function assertNoNativePluginBridgePayload(value: unknown): void {
  const forbiddenKeys = /^(?:credential_material|raw_credential|api_key|password|token|secret|env|environment|native_session_id|native_error|native_path|native_url|base_url|endpoint|file_path|path|url|session_id|tool_name|memory_path)$/i;
  const forbiddenStrings = /MEMORY\.md|USER\.md|SKILL\.md|https?:\/\/|vendor\/|\.\.\/|\/(?:tmp|var|workspace|opt)\/|\b(?:native_session[A-Za-z0-9_-]*|native_error[A-Za-z0-9_-]*|raw_credential|credential_material|api_key|password|secret[-_ ]?token|bearer\s+[A-Za-z0-9._-]+)\b/i;
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item);
      return;
    }
    if (candidate && typeof candidate === "object") {
      for (const [key, item] of Object.entries(candidate)) {
        if (forbiddenKeys.test(key)) {
          throw new HermesPluginBridgeError("PLATFORM_INVALID_REQUEST", "Planner plugin payload contains non-platform field", { field: key });
        }
        visit(item);
      }
      return;
    }
    if (typeof candidate === "string" && forbiddenStrings.test(candidate)) {
      throw new HermesPluginBridgeError("PLATFORM_INVALID_REQUEST", "Planner plugin payload contains non-platform marker");
    }
  };
  visit(value);
}

function sanitizePluginBridgeDetails(value: Record<string, unknown>): Record<string, unknown> {
  const raw = JSON.stringify(value, (_key, item) => {
    if (typeof item === "string") {
      return item
        .replace(/https?:\/\/\S+/gi, "[redacted-url]")
        .replace(/\/[^\s"']+/gi, "[redacted-path]")
        .replace(/MEMORY\.md|USER\.md|SKILL\.md/gi, "[redacted-native-file]")
        .replace(/\b(?:native_session|native_error|raw_credential|credential_material|api_key|password|token|secret)\b/gi, "[redacted-field]");
    }
    return item;
  });
  return JSON.parse(raw) as Record<string, unknown>;
}
