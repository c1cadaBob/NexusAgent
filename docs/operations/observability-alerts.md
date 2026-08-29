# P8-03 Observability Alerts

P8-03 locks the production Alpha observability profile to `nexus.observability_readiness.p8.v1`, RPO `15m`, RTO `4h`, and OpenTelemetry with Prometheus, Loki, and Tempo as the default backend family. Enterprise replacements must preserve platform trace fields and sanitized labels.

## Alert Catalog

| Signal | Severity | Default Threshold | Action |
|---|---|---|---|
| `api.availability` | critical | below 99.5 percent for 5m | Check platform API health, ingress, and dependency readiness. |
| `task.failure_rate` | warning | above 1 percent for 15m | Inspect task state transitions, Policy-Gate denials, and recent release candidates. |
| `adapter.degradation` | critical | any default provider degraded for 5m | Keep traffic on current default, block promotion, and use provider rollback runbooks. |
| `event.backlog_dlq` | critical | replay lag above 15m or DLQ growth | Pause promotion, replay tenant-scoped stream segments, and verify idempotency. |
| `artifact.checksum_failure` | critical | any checksum mismatch | Quarantine affected artifact references and run restore verification. |
| `credential.lease_failure` | critical | any reference or lease failure | Rotate affected references and verify redaction-only audit evidence. |
| `memory.conflict_sweep_anomaly` | warning | open conflict growth or sweep failure | Review admin conflict queue and retention sweep result metadata. |
| `backup.freshness` | critical | latest backup older than 15m | Trigger manual backup and block production default promotion until freshness recovers. |
| `restore.drill_status` | critical | latest drill failed or missing | Run the deterministic restore drill and attach the sanitized report to release evidence. |

## API Availability

The platform API is the only public control-plane endpoint. Alert labels must include `tenant_id`, `trace_id`, `service`, and `signal`; labels must not include provider-native fields, local paths, or credential values.

## Task Failure Rate

Task failures are investigated through platform task state, audit records, and `trace_id` correlation. Native provider errors remain internal and must be mapped to platform reason codes before leaving the adapter boundary.

## Adapter Degradation

Provider degradation blocks canary promotion. Recovery uses the P8-02 compatibility matrix rollback target and keeps traffic on the prior platform default until smoke gates pass.

## Event Backlog And DLQ

NATS JetStream is the P8-03 default Event Bus backend. Replay is tenant-scoped, ordered by platform sequence/monotonic metadata, and DLQ handling records only event metadata.

## Backup Freshness

Backup freshness is evaluated against the `15m` RPO. A stale backup blocks production default promotion and triggers the backup restore runbook.

## Restore Drill Status

Restore drill status is sourced from `nexus.backup_restore.p8.v1` reports. A passing drill verifies audit continuity, event replay, artifact checksums, memory versions, credential reference-only restore, and observability readiness.
