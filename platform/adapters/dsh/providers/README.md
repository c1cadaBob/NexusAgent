# DSH Provider Directory

本目录只放 DSH executor-only provider 的版本隔离实现和验证材料。P2-01 已固定当前 `dsh-0.1.1-rc.2` 为基线 provider，并在 `platform/adapters/dsh/index.ts` 提供最小 provider registry、启用/禁用、默认选择和回滚语义。P2-02 已新增平台 `ExecutionRequest` / `ExecutionResult` 防腐映射和 provider contract fixture，provider 外部只能看到平台 schema。P2-03 已把 provider stdout/stderr/artifact candidates 归一化为平台 `ArtifactReference`，并由 adapter 强制 sandbox/network/resource budget 和标准化 execution/sandbox Event Bus 事件。

必须遵守：

- provider 外部只能暴露平台执行请求、执行事件、artifact 引用、凭据引用和健康状态。
- Cordis 工具插件和执行型工具只能在 Policy-Gate、Credential Center、Artifact Store 和 Event Bus 约束下运行。
- 每个 provider 版本都必须保留上一版回滚目标，并通过同一组平台 contract fixture。
- 禁止 DSH 原生类型、错误码、URL、session、路径或 tool-call 对象进入产品层。
- provider 输出只能返回平台 result/event 形态；stdout/stderr 和执行产物必须经 adapter 脱敏、预算校验并入 Artifact Store。

P2 验证入口：

- `node --test tests/unit/dsh-provider-registry.test.mjs`
- `node --test tests/unit/dsh-adapter-contracts.test.mjs tests/integration/dsh-adapter.test.mjs tests/security/dsh-adapter-leakage.test.mjs`
- `node --test tests/unit/dsh-execution-policy.test.mjs tests/integration/dsh-artifact-events.test.mjs tests/security/dsh-sandbox-credential.test.mjs`
- `corepack pnpm exec vitest run packages/core/agent-loop/tests/nexus-executor-only-experiment.spec.ts packages/core/agent-loop/tests/nexus-executor-only-provider.spec.ts`
- `bash tests/smoke/P2.sh`
