# NexusAgent Platform API

P5-01 delivers the local REST MVP for platform resources. The service uses Node built-ins and existing platform modules only; no root package manager dependency is required.

## Local runtime

```bash
PORT=8080 node product/api/server.mjs
```

The service exposes `/v1/health` without authentication. All other routes require one of the local development bearer tokens:

- `dev-platform-admin`: platform administration and plugin governance.
- `dev-tenant-admin-alpha`: tenant-scoped administration.
- `dev-operator-alpha`: task, memory, approval, and budget operations.
- `dev-viewer-alpha`: read-only tenant visibility.

## P5-01 scope

- REST is the executable contract for P5-01; gRPC and streaming remain documented follow-up work.
- API state is local and in-memory for alpha contract tests.
- Plugin governance imports metadata, approval state, risk, license, notice, hash, and capability projections only. It does not fetch packages, run plugins, or contact external services.
- Channel management stores tenant-scoped channel configuration in memory for P5 Alpha. It accepts credential references in requests, returns only `credential_status`, and uses a platform dry-run for connection tests.
- Public responses are checked before return so blocked implementation details, local paths, endpoint references, session identifiers, and secret material fail closed.

## P5-03 channel routes

- `GET /v1/channels`
- `POST /v1/channels`
- `GET /v1/channels/{channel_config_id}`
- `PATCH /v1/channels/{channel_config_id}`
- `POST /v1/channels/{channel_config_id}/status`
- `POST /v1/channels/{channel_config_id}/test`

The channel test route performs a dry-run only. It validates platform policy and queues a send-intent projection without reaching any external channel network.

## P7-02 memory retention routes

- `GET /v1/memory/retention`
- `PATCH /v1/memory/retention`
- `POST /v1/memory/retention/sweep`
- `POST /v1/memory/{memory_id}/delete`

Memory retention is tenant-admin managed in P7-02. The default conservative policy is enabled, soft-deletes expired `session` memory after seven days through manual sweep, retains longer-lived memory layers, and keeps `audit_snapshot` immutable. Responses return policy, count, and tombstone metadata only; memory text is not returned by delete or sweep results.

## P7-03 skill evaluation routes

- `GET /v1/skill-evaluations/config`
- `PATCH /v1/skill-evaluations/config`
- `POST /v1/skill-evaluations/runs`
- `GET /v1/skill-evaluations/runs`
- `GET /v1/skill-evaluations/runs/{run_id}`

Skill evaluation is a Default Off P7 advanced capability. Tenant or platform administrators must explicitly enable the config before a manual run can execute. The deterministic regression corpus covers Approved + Rejected skill candidates and returns metadata-only run reports, case statuses, reason codes, trace IDs, UTC timestamps, and resource budget summaries. Operator/viewer or cross-tenant calls fail closed, and failed runs do not change task, channel, memory, or plugin state.

## P7-04 token budget and memory conflict routes

- `GET /v1/budget/policy`
- `PATCH /v1/budget/policy`
- `GET /v1/budget/ledger`
- `POST /v1/budget/check`
- `GET /v1/memory/conflicts`
- `GET /v1/memory/conflicts/{conflict_id}`
- `POST /v1/memory/conflicts/{conflict_id}/decision`

Token budget is Default On in P7-04 with All configured tenant, user, agent, and task ledger dimensions. Task submit, planner/executor adapter dispatch, and API budget checks share the same deterministic accounting path; exceeded budget returns platform errors or blocked/degraded task state without calling the adapter. Memory conflict detection is also Default On and uses an Admin resolve queue. `expected_version` mismatches create metadata-only conflict records and never return memory rejected text, stale payload, credential material, native fields, provider runtime, or local paths.
