# P8-01 Production Orchestration

> Status: P8-01 production template and static validation baseline.

## Deployment Paths

- Kubernetes is the standard production path for managed, multi-node, and enterprise deployments.
- Docker Compose prod is a single-node/private deployment and fault-reproduction path.
- P8-01 delivers templates and static validation, not image publication, customer rollout, or production credentials.

## Public Boundary

Only these services may expose an external entrypoint:

- `platform-api`
- `web-console`

The following services are internal-only in both production Compose and Kubernetes templates:

- `openclaw-adapter`
- `hermes-adapter`
- `dsh-adapter`
- `memory-gateway`
- `artifact-store`
- `event-bus`
- `credential-center`
- `observability`

Internal adapters remain reachable only through platform-owned service boundaries. They must not expose provider-native gateway, tool, agent, plugin, session, runtime, credential, file, or debug entrypoints.

## Template Guarantees

- Production Compose uses `nexus-prod-edge` only for `platform-api` and `web-console`; all internal services join only `nexus-prod-internal`.
- Production Compose has no `--watch`, `--inspect`, `NEXUS_HOT_RELOAD`, `NEXUS_DEBUG_PORT`, source bind mounts, or committed credential material.
- Kubernetes workloads include readiness/liveness probes, resource requests/limits, non-root execution, read-only root filesystem, no privilege escalation, and capabilities drop all.
- Kubernetes services use `ClusterIP`; public access is represented only by the `nexusagent-public` Ingress for `platform-api` and `web-console`.
- Kubernetes NetworkPolicy starts with default deny and permits public ingress plus platform-governed internal service communication only.
- Secret templates contain placeholder keys only; real secret injection is deferred to P8-03/P8-04 production backend work.

## Backend References

`config/services.prod.yaml` records the required production backend references without selecting final providers:

- `NEXUS_EVENT_BUS_BACKEND_REF`
- `NEXUS_ARTIFACT_BACKEND_REF`
- `NEXUS_CREDENTIAL_BACKEND_REF`
- `NEXUS_MEMORY_BACKEND_REF`
- `NEXUS_OBSERVABILITY_BACKEND_REF`

Final backend choices, backup RPO/RTO, restore drills, alerting, release automation, provider compatibility matrix, plugin compatibility matrix, and legal release bundle remain P8-02/P8-03/P8-04 scope.

## Validation

Run these checks before treating the production orchestration template as ready for review:

```bash
docker compose -f deploy/docker-compose.prod.yml config --format json
node --test tests/deployment/p8-production-orchestration.test.mjs tests/security/p8-production-isolation.test.mjs
node --test tests/security/dsh-network-isolation.test.mjs tests/security/hermes-network-isolation.test.mjs tests/security/openclaw-network-isolation.test.mjs
bash tests/smoke/P8.sh
```
