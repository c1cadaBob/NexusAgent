# DSH Provider Directory

本目录只放 DSH executor-only provider 的版本隔离实现和验证材料。P2-01 已固定当前 `dsh-0.1.1-rc.2` 为基线 provider，并在 `platform/adapters/dsh/index.ts` 提供最小 provider registry、启用/禁用、默认选择和回滚语义。

必须遵守：

- provider 外部只能暴露平台执行请求、执行事件、artifact 引用、凭据引用和健康状态。
- Cordis 工具插件和执行型工具只能在 Policy-Gate、Credential Center、Artifact Store 和 Event Bus 约束下运行。
- 每个 provider 版本都必须保留上一版回滚目标，并通过同一组平台 contract fixture。
- 禁止 DSH 原生类型、错误码、URL、session、路径或 tool-call 对象进入产品层。

P2-01 验证入口：

- `node --test tests/unit/dsh-provider-registry.test.mjs`
- `corepack pnpm exec vitest run packages/core/agent-loop/tests/nexus-executor-only-experiment.spec.ts packages/core/agent-loop/tests/nexus-executor-only-provider.spec.ts`
- `bash tests/smoke/P2.sh`
