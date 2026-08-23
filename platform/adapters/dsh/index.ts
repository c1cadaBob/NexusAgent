export const DSH_BASELINE_PROVIDER_ID = "dsh-0.1.1-rc.2";
export const DSH_PROVIDER_CONTRACT_VERSION = "nexus.dsh_provider.p2.v1";

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
