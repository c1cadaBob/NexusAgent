# NexusAgent Developer Docs Site

P5-04 delivers the first developer documentation site as an independent React, Vite, and TypeScript app under `product/docs-site/`. It does not change the repository root package configuration.

## Local preview

```bash
corepack pnpm --dir product/docs-site install --frozen-lockfile
corepack pnpm --dir product/docs-site run dev
```

## Build

```bash
corepack pnpm --dir product/docs-site run build
```

## P5 Alpha content

- The route matrix is limited to public `/v1/*` REST API operations from `docs/contracts/openapi.yaml`.
- The SDK method catalog covers the TypeScript SDK delivered in `product/sdk/`.
- Webhook delivery and streaming transports are documented as later work; P5 Alpha reads task events with `GET /v1/tasks/{task_id}/events`.
- Tenant self-service third-party plugin installation is not supported in P5 Alpha.
- P7-03 documents skill evaluation as a Default Off administrator workflow with manual runs, Approved + Rejected deterministic coverage, and metadata-only reports from the public `/v1/skill-evaluations/*` routes.
- P7-04 documents Default On token budget controls with All configured tenant/user/agent/task dimensions, budget ledger APIs, and memory conflict Admin resolve queue routes. Conflict and budget examples are metadata-only and do not include memory rejected text, stale payload, secret material, internal implementation markers, or local filesystem references.
- P7-05 documents scheduled goals as Default Off + manual tick long-term goal tasks with UTC 5-field Cron-like recurrence, ordinary scheduler-source platform task creation, and `/v1/scheduled-goals*` API plus SDK coverage. Background daemon scheduling, durable queues, external network delivery, and production scheduling recovery remain later work.

## Design direction

The docs site uses a Swiss direction: white and neutral surfaces, Helvetica-family typography, one Yves Klein Blue accent, left-aligned text, numbered sections, and 1 px grid rules. The visible content is route and SDK catalog data, not generated fixture activity.
