# P8-03 Incident Restore Drill

The P8-03 incident restore drill is a deterministic local exercise. It uses platform fixtures for Event Bus, Audit, Artifact Store, Memory Gateway, Credential Center, and Observability readiness; it does not call production backends, customer infrastructure, external networks, or real credential stores.

## Restore Drill Gate

The gate succeeds only when the sanitized `nexus.backup_restore.p8.v1` report proves RPO `15m`, RTO `4h`, audit hash-chain continuity, ordered event replay with DLQ evidence, artifact SHA-256 verification, memory tenant version continuity, credential reference-only recovery, and observability readiness. Any report containing credential material, memory text, provider-native fields, external network locators, or local absolute paths fails closed.

## Drill Steps

1. Create a tenant-scoped metadata snapshot fixture with event, audit, artifact, memory, credential, and readiness records.
2. Reconstruct the fixture into the restore report without exporting artifact bytes, memory text, or credential material.
3. Verify all restore gates and attach only the sanitized report summary to release evidence.
4. Keep production default promotion paused until the P8 smoke and restore validators pass.
