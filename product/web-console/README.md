# NexusAgent Web Console

P5-02 delivers the local alpha Web management console. It is a standalone React, Vite, and TypeScript app under `product/web-console/`; the repository root package configuration is unchanged.

## Local runtime

```bash
corepack pnpm --dir product/web-console install --frozen-lockfile
VITE_NEXUS_API_BASE_URL=http://localhost:8080 corepack pnpm --dir product/web-console run dev
```

Run the platform API separately:

```bash
PORT=8080 node product/api/server.mjs
```

## P5 scope

- The console calls only `/v1/*` platform API routes from P5-01.
- Local development uses the P5-01 dev principals: platform admin, tenant admin, operator, and viewer.
- Task, approval, memory, budget, skills, tenants, users, health, task events, and administrator plugin governance are available in the alpha UI.
- P5-03 adds a Channels page for tenant-scoped channel configuration, status changes, and platform dry-run tests. The page shows `credential_status` only and never renders submitted credential references.
- P7-02 adds Memory retention controls for tenant and platform administrators. The Memory page shows conservative policy rows, supports manual sweep, and can soft-delete searched records without rendering tombstone text.
- P7-03 adds an Evaluations page for tenant and platform administrators. Skill evaluation is Default Off, uses manual runs against an Approved + Rejected deterministic corpus, and renders only config status, run metadata, totals, reason codes, trace IDs, and case summaries.
- P7-04 adds token budget policy and ledger controls plus memory conflict handling. Budget uses Default On All configured tenant/user/agent/task dimensions, while the Memory page shows an Admin resolve queue for metadata-only conflicts and Resolve/Ignore actions.
- P7-05 adds a Scheduled Goals page for Default Off + manual tick long-term goal tasks. The page manages UTC 5-field Cron-like recurrence, create/pause/resume/cancel/retry actions, and manual due scans that create ordinary scheduler-source platform tasks.
- Refresh uses the visible Refresh button plus a 15 second polling interval. Streaming and enterprise sign-on remain follow-up work.
- Plugin governance displays public platform metadata only: ID, display name, source kind, version, SHA-256, license, notice status, risk, allowlist status, and capability IDs.

## Design direction

The console uses a Swiss interface direction: white and neutral surfaces, Helvetica-family typography, one blue accent, left alignment, and 1 px grid rules. Empty states are explicit and no fixture data is fabricated for presentation.
