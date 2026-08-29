# P8-04 Upgrade And Migration Guide

> Marker: `P8-04_UPGRADE_MIGRATION`.

This guide describes the P8 Alpha upgrade path for production templates and governed internal providers. It keeps platform APIs stable and uses canary-first release promotion.

## Preflight

- Confirm the source deployment passes `bash tests/smoke/P8.sh`.
- Confirm backup freshness satisfies the P8-03 RPO `15m` and restore drill satisfies the RTO `4h`.
- Confirm `config/provider-compatibility.p8.json`, `config/plugin-compatibility.p8.json`, `config/release-gate.p8.json`, and `config/legal-notice.p8.json` validate.
- Confirm only `platform-api` and `web-console` are public in Compose and Kubernetes manifests.

## Upgrade Flow

Marker: `canary_first`.

1. Generate a candidate release manifest with `node scripts/upstream-tracking/generate-release-manifest.mjs`.
2. Run P0-P8 smoke and all P8 deployment/security validators.
3. Promote to canary only after provider/plugin rollback targets and legal notice entries are present.
4. Observe API availability, task failure rate, adapter degradation, event backlog, artifact checksum, credential lease, memory anomalies, backup freshness, and restore drill status.
5. Promote to default only after canary review clears the release pause conditions.

## Migration Notes

- Kubernetes remains the primary production path; Compose prod is retained for private single-node installs and fault reproduction.
- P8-04 does not migrate persistent customer data. Backup and restore semantics are governed by `config/backup-restore.p8.json`.
- Provider or plugin upgrades must not change `/v1/*` public routes, platform IDs, task state semantics, SDK method names, or console route names.

## Rollback Checkpoint

Marker: `rollback_checkpoint`.

Rollback uses the previous image tag, the provider `rollback_target`, the plugin `rollback_target`, and the most recent passing backup/restore drill report. If any checkpoint is missing, production default promotion must remain paused.
