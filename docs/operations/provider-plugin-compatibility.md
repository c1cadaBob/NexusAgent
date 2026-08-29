# P8-02 Provider And Plugin Compatibility

P8-02 adds compatibility gates for internal providers and governed plugins. These gates protect production promotion; they do not expose new product APIs or tenant self-service installation.

## Provider Matrix

The provider matrix lives in `config/provider-compatibility.p8.json` and uses schema `nexus.provider_compatibility.p8.v1`.

Tracked providers:

- `hermes-0.20.5`: planner-only current default, rollback target `hermes-0.20.5`.
- `openclaw-2026.8.1`: gateway-only current default, rollback target `openclaw-2026.8.1`.
- `dsh-0.1.1-rc.2`: executor-only current default, rollback target `dsh-0.1.1-rc.2`.

`vendor/MANIFEST.yaml` still marks upstream remote and commit as unconfirmed for all three sources. P8-02 therefore records `upstream_identity_unconfirmed`, sets `release_pause.active=true`, and blocks production default promotion until an upstream change record confirms source identity or an explicit release review accepts the risk. This preserves source truth without inventing upstream metadata.

## Plugin Matrix

The plugin matrix lives in `config/plugin-compatibility.p8.json` and uses schema `nexus.plugin_compatibility.p8.v1`.

P8-02 keeps `tenant_self_service_third_party_install=false`. Plugin promotion requires platform-admin governance, hash, license, notice status, risk level, allowlist status, required tests, and rollback target. Missing metadata or breaking changes trigger `P8-02_PLUGIN_UPGRADE_GATE_PAUSE`.

## Upstream Check

The weekly check script supports two modes:

- Default static check: validates the compatibility matrix against local vendor hashes and emits `UPSTREAM_IDENTITY_UNCONFIRMED` for unresolved source identity.
- Optional remote check: run `NEXUS_UPSTREAM_REMOTE_CHECK=1 node scripts/upstream-tracking/weekly-upstream-check.mjs --remote` after real remote and commit values are registered.

Use `--strict` only in promotion contexts where `remote_unavailable` or `identity_unconfirmed` should block the job.

## Upgrade Flow

1. Register an upstream change record under `scripts/upstream-tracking/`.
2. Update `vendor/MANIFEST.yaml` and the provider/plugin compatibility matrix.
3. Run the matrix validator, weekly check, targeted provider/plugin tests, and P8 smoke.
4. Publish candidate images on a tag if quality gates pass.
5. Keep production default blocked until canary review and rollback confirmation complete.

## P8-04 Delivery And Legal Closure

P8-04 adds the operator rollback manual at `docs/operations/provider-plugin-rollback.md`, the delivery readiness package at `config/delivery-readiness.p8.json`, and the legal notice package at `config/legal-notice.p8.json` plus `docs/legal/THIRD_PARTY_NOTICE.md`. The P8 Alpha repository legal package closes `OQ-LEGAL-001`; upstream identity remains release-paused until real remote and commit evidence is confirmed.

## Deferred Items

P8-02 plus P8-04 do not open tenant self-service plugin installation and do not implement full provider sidecar/OS isolation. Production Event Bus, Artifact Store, Credential Center, Observability, Memory backend, and backup/restore defaults were closed by P8-03; customer infrastructure rollout, external legal opinions, upstream identity confirmation, and deeper production sidecar hardening remain later production governance work.
