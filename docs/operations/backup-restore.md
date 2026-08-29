# P8-03 Backup And Restore

P8-03 locks the production Alpha backup profile to `nexus.backup_restore.p8.v1` with RPO `15m` and RTO `4h`. The profile is metadata-first: platform events, audit hashes, artifact references, memory versions, conflict metadata, and credential references are restorable without exporting memory text or credential material.

## Production Defaults

| Service | Backend Default | Restore Evidence |
|---|---|---|
| Event Bus | `nats_jetstream` | tenant-scoped stream replay, ordered sequence, DLQ replay marker |
| Artifact Store | `s3_compatible_object_store` | SHA-256 checksum, object version marker, tenant prefix marker |
| Credential Center | `vault` | reference-only snapshot, lease metadata, material hash marker |
| Memory Gateway | `postgres_pgvector` | tenant version continuity, conflict queue metadata, retention policy marker |
| Observability | `otel_prometheus_loki_tempo` | trace correlation, alert status, restore drill readiness marker |

## Backup Freshness

Freshness is evaluated against the `15m` RPO. A stale backup blocks production default promotion until a new tenant-scoped snapshot is recorded and the restore drill gate passes.

## Artifact Checksum

Every artifact restore verifies `artifact_id`, `tenant_id`, `task_id`, `trace_id`, `sha256`, `size_bytes`, and `classification`. Checksum mismatch quarantines the affected reference and fails the restore drill.

## Credential Reference Only Restore

Credential restore is reference-only. Backup metadata may include `credential_ref`, purpose, lease mode, issue/expiry timestamps, redaction status, and a material hash used only for continuity checks; credential values are never exported, logged, or written to restore reports.

## Memory Version Continuity

Memory restore verifies tenant version, active record metadata, conflict metadata, retention policy, and planner snapshot metadata. Deleted or expired text remains unavailable; conflict decisions are restored as metadata-only queue state.

## Restore Acceptance

The deterministic P8-03 drill must pass these gates before release promotion: `audit_hash_chain_verified`, `event_order_and_dlq_replay_verified`, `artifact_sha256_verified`, `memory_version_continuity_verified`, `credential_reference_hash_only_verified`, `observability_readiness_reported`, and `rpo_15m_rto_4h_recorded`.
