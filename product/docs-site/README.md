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

## Design direction

The docs site uses a Swiss direction: white and neutral surfaces, Helvetica-family typography, one Yves Klein Blue accent, left-aligned text, numbered sections, and 1 px grid rules. The visible content is route and SDK catalog data, not generated fixture activity.
