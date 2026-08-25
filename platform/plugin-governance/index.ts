import {
  buildHermesPluginBridgeFixtures,
  discoverHermesPlannerCapabilities,
  type HermesPluginInventoryCandidate,
} from "../adapters/hermes/plugin-bridge.ts";
import {
  buildOpenClawPluginBridgeFixtures,
  discoverOpenClawGatewayCapabilities,
  type OpenClawPluginInventoryCandidate,
} from "../adapters/openclaw/plugin-bridge.ts";
import { assertPlatformId } from "../task-state/index.ts";
import { assertPublicRequestPayload, assertPublicResponsePayload } from "../public-surface/index.ts";

export const PLUGIN_GOVERNANCE_SCHEMA_VERSION = "nexus.plugin_governance.p5.v1";

export type PublicPluginSourceKind = "marketplace" | "package_registry" | "git_repository" | "local_snapshot" | "mcp_manifest";
export type PublicPluginRiskLevel = "low" | "medium" | "high" | "critical";
export type PublicPluginStatus = "pending_scan" | "pending_review" | "approved" | "disabled" | "rejected";
export type PublicNoticeStatus = "recorded" | "pending_review";

export interface PublicCapabilityDescriptor {
  capability_id: string;
  capability_type: "channel" | "message_transform" | "skill" | "mcp_server" | "tool" | "planner_hint" | "provider_metadata" | "hook_metadata";
  display_name: string;
  plugin_id: string;
  status: PublicPluginStatus;
  risk_level: PublicPluginRiskLevel;
  required_permissions: readonly string[];
}

export interface PublicPluginInventoryEntry {
  plugin_id: string;
  display_name: string;
  source_kind: PublicPluginSourceKind;
  version: string;
  sha256: string;
  license: string;
  notice_status: PublicNoticeStatus;
  risk_level: PublicPluginRiskLevel;
  allowlist_status: PublicPluginStatus;
  capability_ids: readonly string[];
  trace_id: string;
}

export interface PluginImportInput {
  source_kind: PublicPluginSourceKind;
  source_ref: string;
  display_name: string;
  version: string;
  expected_sha256: string;
  license: string;
  notice_status: PublicNoticeStatus;
  risk_level?: PublicPluginRiskLevel;
  trace_id: string;
}

export interface PluginAdmissionInput {
  decision: "approve" | "disable" | "reject";
  reason: string;
  trace_id: string;
}

interface StoredPluginInventoryEntry extends PublicPluginInventoryEntry {
  source_ref: string;
}

interface StoredCapabilityDescriptor extends PublicCapabilityDescriptor {
  tenant_visibility: { mode: "platform_admin_only" | "approved_tenants" | "all_tenants"; tenant_ids?: readonly string[] };
}

export class PluginGovernanceError extends Error {
  readonly code: "PLATFORM_INVALID_REQUEST" | "PLATFORM_FORBIDDEN" | "PLATFORM_NOT_FOUND" | "PLATFORM_CONFLICT";
  readonly details: Record<string, unknown>;

  constructor(code: PluginGovernanceError["code"], message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "PluginGovernanceError";
    this.code = code;
    this.details = sanitizeDetails(details);
  }
}

export class LocalPluginGovernance {
  readonly #inventory = new Map<string, StoredPluginInventoryEntry>();
  readonly #capabilities = new Map<string, StoredCapabilityDescriptor>();
  #sequence = 0;

  constructor(options: { tenant_id?: string; trace_id?: string } = {}) {
    const tenant_id = options.tenant_id ?? "tenant_alpha01";
    const trace_id = options.trace_id ?? "trace_plugin01";
    assertPlatformId("tenant_id", tenant_id);
    assertPlatformId("trace_id", trace_id);
    this.#seedPlannerCapabilities(tenant_id, trace_id);
    this.#seedGatewayCapabilities(tenant_id, trace_id);
  }

  listInventory(): readonly PublicPluginInventoryEntry[] {
    return [...this.#inventory.values()]
      .sort((left, right) => left.plugin_id.localeCompare(right.plugin_id))
      .map(projectInventoryEntry);
  }

  listCapabilities(options: { tenant_id?: string; include_disabled?: boolean } = {}): readonly PublicCapabilityDescriptor[] {
    if (options.tenant_id !== undefined) assertPlatformId("tenant_id", options.tenant_id);
    return [...this.#capabilities.values()]
      .filter((capability) => options.include_disabled || capability.status === "approved")
      .filter((capability) => options.tenant_id === undefined || isVisibleToTenant(capability.tenant_visibility, options.tenant_id))
      .sort((left, right) => left.capability_id.localeCompare(right.capability_id))
      .map(projectCapabilityDescriptor);
  }

  importPlugin(input: PluginImportInput): PublicPluginInventoryEntry {
    assertPublicRequestPayload(input);
    assertPlatformId("trace_id", input.trace_id);
    assertSourceKind(input.source_kind);
    assertRiskLevel(input.risk_level ?? "medium");
    assertNoticeStatus(input.notice_status);
    requireSafeText(input.source_ref, "source_ref");
    requireSafeText(input.display_name, "display_name");
    requireSafeText(input.version, "version");
    requireSafeText(input.license, "license");
    if (!/^[A-Fa-f0-9]{64}$/.test(input.expected_sha256)) {
      throw new PluginGovernanceError("PLATFORM_INVALID_REQUEST", "Plugin expected_sha256 must be a 64 character SHA-256 hex value", {
        field: "expected_sha256",
      });
    }

    const plugin_id = this.#nextPluginId(input.source_kind);
    const entry: StoredPluginInventoryEntry = {
      plugin_id,
      display_name: input.display_name,
      source_kind: input.source_kind,
      source_ref: input.source_ref,
      version: input.version,
      sha256: input.expected_sha256.toLowerCase(),
      license: input.license,
      notice_status: input.notice_status,
      risk_level: input.risk_level ?? "medium",
      allowlist_status: "pending_scan",
      capability_ids: [],
      trace_id: input.trace_id,
    };
    this.#inventory.set(plugin_id, entry);
    return projectInventoryEntry(entry);
  }

  decideAdmission(plugin_id: string, input: PluginAdmissionInput): PublicPluginInventoryEntry {
    requirePluginId(plugin_id);
    assertPublicRequestPayload(input);
    assertPlatformId("trace_id", input.trace_id);
    if (!input.reason.trim()) {
      throw new PluginGovernanceError("PLATFORM_INVALID_REQUEST", "Plugin admission decision requires a reason");
    }
    if (!["approve", "disable", "reject"].includes(input.decision)) {
      throw new PluginGovernanceError("PLATFORM_INVALID_REQUEST", "Plugin admission decision is unsupported", { decision: input.decision });
    }
    const entry = this.#inventory.get(plugin_id);
    if (!entry) {
      throw new PluginGovernanceError("PLATFORM_NOT_FOUND", "Plugin inventory entry not found", { plugin_id });
    }
    const nextStatus = input.decision === "approve" ? "approved" : input.decision === "disable" ? "disabled" : "rejected";
    entry.allowlist_status = nextStatus;
    entry.trace_id = input.trace_id;
    for (const capability_id of entry.capability_ids) {
      const capability = this.#capabilities.get(capability_id);
      if (capability) capability.status = nextStatus;
    }
    return projectInventoryEntry(entry);
  }

  #seedPlannerCapabilities(tenant_id: string, trace_id: string): void {
    const candidates = buildHermesPluginBridgeFixtures();
    const discovered = discoverHermesPlannerCapabilities(candidates, { tenant_id, trace_id });
    for (const candidate of candidates) {
      this.#storePlannerInventory(candidate);
    }
    for (const capability of discovered.capabilities) {
      const plugin_id = publicPluginId(capability.plugin_id);
      this.#capabilities.set(capability.capability_id, {
        capability_id: capability.capability_id,
        capability_type: capability.capability_type,
        display_name: capability.display_name,
        plugin_id,
        status: "approved",
        risk_level: this.#inventory.get(plugin_id)?.risk_level ?? "medium",
        required_permissions: [...capability.required_permissions],
        tenant_visibility: capability.tenant_visibility,
      });
    }
  }

  #seedGatewayCapabilities(tenant_id: string, trace_id: string): void {
    const candidates = buildOpenClawPluginBridgeFixtures();
    const discovered = discoverOpenClawGatewayCapabilities(candidates, { tenant_id, trace_id });
    for (const entry of discovered.plugin_inventory) {
      this.#inventory.set(entry.plugin_id, {
        plugin_id: entry.plugin_id,
        display_name: displayNameFromId(entry.plugin_id),
        source_kind: entry.source_type,
        source_ref: entry.source_ref,
        version: entry.version,
        sha256: normalizeSha256(entry.sha256),
        license: entry.license,
        notice_status: "recorded",
        risk_level: entry.risk_level,
        allowlist_status: entry.allowlist_status,
        capability_ids: [...entry.capability_ids],
        trace_id: entry.trace_id,
      });
    }
    for (const capability of discovered.capabilities) {
      this.#capabilities.set(capability.capability_id, {
        capability_id: capability.capability_id,
        capability_type: capability.capability_type,
        display_name: capability.display_name,
        plugin_id: capability.plugin_id,
        status: "approved",
        risk_level: this.#inventory.get(capability.plugin_id)?.risk_level ?? "medium",
        required_permissions: [...capability.required_permissions],
        tenant_visibility: capability.tenant_visibility,
      });
    }
  }

  #storePlannerInventory(candidate: HermesPluginInventoryCandidate): void {
    const plugin_id = publicPluginId(candidate.plugin_id);
    this.#inventory.set(plugin_id, {
      plugin_id,
      display_name: displayNameFromId(plugin_id),
      source_kind: candidate.source_type,
      source_ref: candidate.source_ref,
      version: candidate.version,
      sha256: normalizeSha256(candidate.sha256),
      license: candidate.license,
      notice_status: "recorded",
      risk_level: candidate.risk_level,
      allowlist_status: "approved",
      capability_ids: candidate.capabilities.map((capability) => capability.capability_id),
      trace_id: candidate.trace_id,
    });
  }

  #nextPluginId(sourceKind: PublicPluginSourceKind): string {
    this.#sequence += 1;
    return `plugin_${sourceKind.replace(/[^A-Za-z0-9]+/g, "_")}_${String(this.#sequence).padStart(4, "0")}`;
  }
}

function publicPluginId(plugin_id: string): string {
  return plugin_id.replace(/^plugin_hermes_/, "plugin_planner_");
}

function projectInventoryEntry(entry: StoredPluginInventoryEntry): PublicPluginInventoryEntry {
  const projected: PublicPluginInventoryEntry = {
    plugin_id: entry.plugin_id,
    display_name: entry.display_name,
    source_kind: entry.source_kind,
    version: entry.version,
    sha256: entry.sha256,
    license: entry.license,
    notice_status: entry.notice_status,
    risk_level: entry.risk_level,
    allowlist_status: entry.allowlist_status,
    capability_ids: [...entry.capability_ids],
    trace_id: entry.trace_id,
  };
  assertPublicResponsePayload(projected);
  return projected;
}

function projectCapabilityDescriptor(capability: StoredCapabilityDescriptor): PublicCapabilityDescriptor {
  const projected: PublicCapabilityDescriptor = {
    capability_id: capability.capability_id,
    capability_type: capability.capability_type,
    display_name: capability.display_name,
    plugin_id: capability.plugin_id,
    status: capability.status,
    risk_level: capability.risk_level,
    required_permissions: [...capability.required_permissions],
  };
  assertPublicResponsePayload(projected);
  return projected;
}

function isVisibleToTenant(
  visibility: StoredCapabilityDescriptor["tenant_visibility"],
  tenant_id: string,
): boolean {
  if (visibility.mode === "all_tenants") return true;
  if (visibility.mode === "platform_admin_only") return false;
  return (visibility.tenant_ids ?? []).includes(tenant_id);
}

function assertSourceKind(value: unknown): asserts value is PublicPluginSourceKind {
  if (!["marketplace", "package_registry", "git_repository", "local_snapshot", "mcp_manifest"].includes(String(value))) {
    throw new PluginGovernanceError("PLATFORM_INVALID_REQUEST", "Plugin source_kind is unsupported", { source_kind: value });
  }
}

function assertRiskLevel(value: unknown): asserts value is PublicPluginRiskLevel {
  if (!["low", "medium", "high", "critical"].includes(String(value))) {
    throw new PluginGovernanceError("PLATFORM_INVALID_REQUEST", "Plugin risk_level is unsupported", { risk_level: value });
  }
}

function assertNoticeStatus(value: unknown): asserts value is PublicNoticeStatus {
  if (!["recorded", "pending_review"].includes(String(value))) {
    throw new PluginGovernanceError("PLATFORM_INVALID_REQUEST", "Plugin notice_status is unsupported", { notice_status: value });
  }
}

function requirePluginId(value: unknown): string {
  if (typeof value !== "string" || !/^plugin_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/.test(value)) {
    throw new PluginGovernanceError("PLATFORM_INVALID_REQUEST", "Plugin identifier is invalid", { field: "plugin_id" });
  }
  return value;
}

function requireSafeText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new PluginGovernanceError("PLATFORM_INVALID_REQUEST", "Plugin field is required", { field });
  }
  return value;
}

function normalizeSha256(value: string): string {
  const stripped = value.replace(/^sha256:/, "");
  if (stripped.length >= 64) return stripped.slice(0, 64).toLowerCase();
  return stripped.padEnd(64, "0").toLowerCase();
}

function displayNameFromId(plugin_id: string): string {
  return plugin_id
    .replace(/^plugin_/, "")
    .split("_")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function sanitizeDetails(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "string" ? item.replace(/(?:https?|wss?|ftp):\/\/\S+/gi, "[redacted-url]") : item)) as Record<string, unknown>;
}
