# P0 DSH executor-only 剥离实验记录

> 文档状态：P0-04 实验记录。本文记录 DeepSeek Harness 作为 NexusAgent 内部 executor provider 的最小剥离证据，不代表 P2 生产 provider 已完成。

## 1. 实验结论

- P0-04 在 NexusAgent 内部 DSH vendor 快照中加入 opt-in 实验开关 `NEXUS_DSH_EXECUTOR_ONLY=1`。
- 开启实验开关后，`AgentLoop.create`、`AgentLoop.createAgent`、`AgentLoop.resume`、配置启动 agent、`ReactLoopAgent.send`、`ReactLoopAgent.runMaintenance` 和 `ReactLoopAgent.wakeDriver` 均会被拒绝，外部不能启动或唤醒 DSH 原生 agent-loop。
- 开启实验开关后，`executeToolCalls` 在进入工具 scheduler 之前要求平台 `execution_id` 与 executor policy；缺少上下文时拒绝执行，并且不会追加原生 session event。
- 开启实验开关后，工具名必须通过平台策略 allowlist；例如只允许 `bash` 时，`memory_search` 会被拒绝。
- 新增 P0 experimental `ExecutionEvent` schema，证明 DSH executor 结果可被平台按 `execution_id`、`trace_id`、`event_type` 和 `status` 解析。
- 本实验不修改 `/opt/project/deepseek-harness-master` 原始目录；所有补丁只落在 `/opt/project/NexusAgent/vendor/deepseek-harness-master`。

## 2. 调用图

```text
native AgentLoop startup
  -> packages/core/agent-loop/src/index.ts
  -> AgentLoop constructor / create / createAgent / resume
  -> [P0-04 guard] reject when NEXUS_DSH_EXECUTOR_ONLY=1
  -> ReactLoopAgent native driver is not published or resumed

native ReactLoopAgent input
  -> packages/core/agent-loop/src/agent.ts
  -> send / followup / steer / runMaintenance / wakeDriver
  -> [P0-04 guard] reject native loop wakeup when NEXUS_DSH_EXECUTOR_ONLY=1
  -> turn/start, LLM request and native tool loop are not reached

platform-governed executor work
  -> packages/core/agent-loop/src/tool-calls.ts
  -> executeToolCalls
  -> [P0-04 guard] require NEXUS_DSH_EXECUTION_ID + NEXUS_DSH_EXECUTION_POLICY
  -> [P0-04 guard] enforce allowedTools before scheduler.prepare / scheduler.dispatch
  -> tool/result event only after platform context and policy pass
```

## 3. 源码证据

| 分类 | 源码路径 | 行号 | 证据 |
|---|---|---:|---|
| 禁止 | `vendor/deepseek-harness-master/packages/core/agent-loop/src/agent.ts` | 65 | `ReactLoopAgent` 是 DSH 原生 loop driver。 |
| 隔离 | `vendor/deepseek-harness-master/packages/core/agent-loop/src/agent.ts` | 115、145、176 | P0-04 guard 分别阻断 `send`、`runMaintenance` 和 `wakeDriver`，覆盖直接输入和维护唤醒路径。 |
| 禁止 | `vendor/deepseek-harness-master/packages/core/agent-loop/src/agent.ts` | 418 | 未隔离时原生 loop 会进入 `executeToolCalls` 执行工具。 |
| 禁止 | `vendor/deepseek-harness-master/packages/core/agent-loop/src/index.ts` | 354 | `ctx.agents.setFactory(this)` 把 DSH loop 注册为 agent factory。 |
| 隔离 | `vendor/deepseek-harness-master/packages/core/agent-loop/src/index.ts` | 349、594、612、660 | P0-04 guard 阻断配置启动 agent、`create`、`createAgent` 和 `resume`。 |
| 保留 | `vendor/deepseek-harness-master/packages/core/agent-loop/src/tool-calls.ts` | 60 | `executeToolCalls` 是本实验保留为 executor-only 候选的工具执行边界。 |
| 隔离 | `vendor/deepseek-harness-master/packages/core/agent-loop/src/tool-calls.ts` | 70、84 | P0-04 guard 在工具 scheduler 前要求平台 execution context，并按 policy allowlist 校验工具名。 |
| 禁止 | `vendor/deepseek-harness-master/packages/core/agent-loop/src/tool-calls.ts` | 286 | 未阻断时 DSH 会追加原生 `tool/result` session event；平台生产化需转成 `ExecutionEvent` 与 artifact reference。 |
| 隔离 | `vendor/deepseek-harness-master/packages/core/agent-loop/src/nexus-executor-only-experiment.ts` | 5-11、146-170、177-190 | helper 定义实验开关、平台上下文要求、原生 loop 阻断、工具 allowlist 和 `ExecutionEvent` 构造。 |
| 验证 | `vendor/deepseek-harness-master/packages/core/agent-loop/tests/nexus-executor-only-experiment.spec.ts` | 49-116 | targeted tests 覆盖原生 loop 阻断、`execution_id`/policy 要求、工具 allowlist、事件 shape 和无上下文时不调用 native scheduler/session append。 |

## 4. ExecutionEvent 样例

```json
{
  "schema_version": "nexus.execution_event.p0.v1",
  "execution_id": "exec-123",
  "trace_id": "trace-123",
  "event_type": "execution.accepted",
  "status": "accepted",
  "payload": {
    "provider": "dsh-p0"
  }
}
```

## 5. 保留、隔离和禁止入口

| 入口类型 | P0-04 决策 | 说明 |
|---|---|---|
| Tool execution boundary | 保留候选 | `executeToolCalls` 可作为 P2 executor provider 的候选边界，但必须由平台 adapter 注入执行上下文、沙箱策略、凭据引用和 artifact 归档。 |
| Cordis tool plugins | 保留候选 | 可复用执行型工具生态；所有工具必须通过 Policy-Gate allowlist 和 Credential Center，且结果由 Artifact Store 持久化。 |
| Native AgentLoop create/resume | 禁止 | 平台外部或 DSH 原生调用不能自行创建、恢复或启动 agent-loop。 |
| ReactLoopAgent direct input | 禁止 | `followup`、`steer`、`inject`、维护任务和 wakeup 均不得绕过 Coordinator 触发原生 turn。 |
| Native session events | 隔离 | P0 仅证明阻断点；P2 必须把执行结果映射到平台 `ExecutionEvent`、`ExecutionResult` 和 `ArtifactReference`。 |
| Native memory/tool shortcuts | 禁止 | 任何 DSH 工具若涉及 memory、credential、artifact 或网络访问，必须由平台 policy 明确批准。 |

## 6. 回归测试清单

- `vendor/deepseek-harness-master/packages/core/agent-loop/tests/nexus-executor-only-experiment.spec.ts`：验证原生 AgentLoop 创建阻断、平台 execution context 要求、工具 allowlist、`ExecutionEvent` shape、缺少上下文时不进入 native scheduler/session append。
- `platform/contracts/execution-event.schema.json`：记录 P0 experimental `nexus.execution_event.p0.v1` schema，供 P2/P6 contract tests 硬化。
- `tests/smoke/P0.sh`：验证 P0-04 决策文档存在、P0-04 审计记录不保留占位、`ExecutionEvent` schema 存在、vendor 未引入依赖缓存。
- targeted Vitest 已在 DSH workspace 通过；完整 typecheck 当前受 workspace project references 与预构建输出缺失影响，需在 P2 provider 化时补齐 build chain 后重跑。

## 7. 回滚方式

1. 删除或关闭运行环境中的 `NEXUS_DSH_EXECUTOR_ONLY`，默认 DSH 行为保持不变。
2. 若需回退补丁，撤销以下文件变更：`nexus-executor-only-experiment.ts`、`agent.ts`、`index.ts`、`tool-calls.ts`、`nexus-executor-only-experiment.spec.ts` 及 `platform/contracts/execution-event.schema.json`。
3. P2 正式改造前不得把本实验开关视为生产安全边界；生产边界必须迁移到 `platform/adapters/dsh/`、Policy-Gate、Credential Center、Artifact Store、Event Bus 和容器/沙箱隔离。

## 8. 待确认问题

- DSH upstream remote、release commit 和 fork 分支仍无法从本地快照确认。
- DSH 当前快照版本是否固定为 `0.1.1-rc.2` 作为 P2 provider 基线，仍需确认。
- P2 executor provider 的正式跨进程协议、取消语义、沙箱后端、文件/网络策略和 artifact 归档策略仍需架构评审。
- P0-04 只证明进程内 TypeScript guard；生产环境还需要 P2/P6 通过端口暴露、sidecar 权限、容器网络、凭据脱敏和恶意工具插件测试证明不可绕过。
