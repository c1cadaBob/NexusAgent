# P8-04 Provider And Plugin Rollback Manual

> Marker: `P8-04_PROVIDER_PLUGIN_ROLLBACK_MANUAL`.

This manual turns the P8-02 compatibility matrix into an operator checklist. It is intentionally internal and does not expose provider controls as product APIs.

## Provider Contract Stability

Marker: `provider_contract_stability`.

- Provider upgrades are recorded in `config/provider-compatibility.p8.json` with current, candidate, canary, default, rollback target, tree hash, required tests, and release pause state.
- Provider selection, disable, and rollback must preserve platform contracts: TaskRequest, ExecutionPlan, ExecutionResult, Event Bus envelope, ArtifactReference, CredentialReference, and PlatformError.
- Upstream identity that remains unconfirmed keeps production default promotion paused. This is a release safety state, not a public API state.

## Provider Rollback Flow

1. Pause promotion and keep the current public API serving from the last good release.
2. Revert the candidate provider entry to its recorded `rollback_target`.
3. Run the provider required tests listed in the matrix and `bash tests/smoke/P8.sh`.
4. Keep audit evidence with tenant, task, attempt, execution, conversation, artifact, and trace identifiers where applicable.
5. Update the release review with the failed candidate reason code and the restored default target.

## Plugin Admission Rollback

Marker: `plugin_admission_rollback`.

- Plugin promotion requires hash, license, notice status, risk level, allowlist status, required tests, and rollback target.
- To disable a plugin, set the governed admission state to disabled or rejected through the existing platform admin governance path.
- Tenant self-service third-party installation remains unsupported in P8 Alpha.
- A disabled or rejected plugin must not expose capability visibility, raw fixture payload, direct tool access, memory access, provider binding, or secret values.

## Public API Invariant

Provider/plugin replacement changes only internal compatibility and admission state. It must not add or remove `/v1/*` routes, change SDK method names, or add console routes outside an explicitly approved product task.
