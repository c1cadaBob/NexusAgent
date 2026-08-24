export const HERMES_BASELINE_PROVIDER_ID = "hermes-0.20.5";
export const HERMES_PROVIDER_CONTRACT_VERSION = "nexus.hermes_provider.p3.v1";
export const HERMES_EXECUTION_PLAN_SCHEMA_VERSION = "nexus.execution_plan.p0.v1";

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
