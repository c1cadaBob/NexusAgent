# NexusAgent TypeScript SDK

P5-04 delivers the first NexusAgent SDK as a local TypeScript package. It calls the public `/v1/*` platform API only and keeps the repository root package configuration unchanged.

## Build

```bash
corepack pnpm --dir product/sdk install --frozen-lockfile
corepack pnpm --dir product/sdk run build
```

## Client

```ts
import { NexusAgentClient, createTraceFactory } from "@nexusagent/sdk";

const trace = createTraceFactory("trace_sdk");
const client = new NexusAgentClient({
  baseUrl: process.env.NEXUS_API_BASE_URL ?? "http://localhost:8080",
  accessToken: process.env.NEXUS_API_TOKEN ?? "dev-operator-alpha",
});

const task = await client.submitTask({
  tenant_id: "tenant_alpha01",
  user_id: "user_alpha01",
  agent_id: "agent_alpha01",
  conversation_id: "conv_sdk01",
  input: "Summarize the platform task queue",
  trace_id: trace(),
});
```

## Examples

Build the SDK first, then run examples. Without `NEXUS_API_BASE_URL`, examples use an in-process P5 API harness for repeatable local verification.

```bash
node product/sdk/examples/quickstart.mjs
node product/sdk/examples/memory-budget.mjs
node product/sdk/examples/channel-management.mjs
node product/sdk/examples/plugin-governance.mjs
```

## P5 Alpha Scope

- TypeScript is the only SDK language in P5-04; Python, Go, and Java remain later SDK work.
- Webhook delivery and streaming transports are not implemented in P5 Alpha. Read task events with `GET /v1/tasks/{task_id}/events`.
- Tenant self-service third-party plugin installation is not supported in P5 Alpha. Plugin import and admission are platform administrator operations.
- Channel tests are dry-run checks and do not contact external channel networks.

## P7-02 Memory Retention

The SDK includes tenant-admin memory retention helpers: `getMemoryRetentionPolicy`, `updateMemoryRetentionPolicy`, `sweepMemoryRetention`, and `deleteMemory`. These methods call platform `/v1/memory*` routes only. Delete and sweep responses return metadata such as policy ID, counts, status, and trace ID; memory text is not echoed.
