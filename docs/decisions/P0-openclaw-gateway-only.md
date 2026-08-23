# P0 OpenClaw gateway-only 剥离实验记录

> 文档状态：P0-02 实验记录。本文记录 OpenClaw 作为 NexusAgent 内部 channel gateway provider 的最小剥离证据，不代表 P4 生产改造已经完成。

## 1. 实验结论

- P0-02 在 NexusAgent 内部 OpenClaw vendor 快照中加入 opt-in 实验开关 `NEXUS_OPENCLAW_GATEWAY_ONLY=1`。
- 开启实验开关后，`chat.send` / agent turn 链路在内容准备后投影为平台 `TaskRequest` handoff，不进入原生 Agent dispatch / execution。
- 开启实验开关后，直接调用 gateway-visible tools 的 `tools.invoke` 被拒绝，覆盖 core、plugin、channel 和 memory tool 的直接执行入口。
- OpenClaw channel inbound envelope 构建能力保留，可继续作为后续 P4 gateway-only 改造的渠道消息标准化候选入口。
- 本实验不修改 `/opt/project/openclaw-main` 原始目录；所有补丁只落在 `/opt/project/NexusAgent/vendor/openclaw-main`。

## 2. 调用图

```text
channel inbound event
  -> src/channels/inbound-event/envelope.ts
  -> resolveChannelInboundRouteEnvelope / createChannelInboundEnvelopeBuilder
  -> formatted inbound body + resolved route

gateway chat / agent turn
  -> src/gateway/agent-turn/agent-turn-service.ts
  -> prepareAgentRequestRouting
  -> prepareAgentContentPhase
  -> [P0-02 guard] emit NexusAgent TaskRequest handoff when NEXUS_OPENCLAW_GATEWAY_ONLY=1
  -> prepareAgentRunDispatch
  -> startAgentRunExecution
  -> dispatchAgentRunFromGateway
  -> agentCommandFromGatewayIngress(defaultRuntime, deps, ...)

direct gateway tools
  -> src/gateway/server-methods/tools-invoke.ts
  -> invokeGatewayTool
  -> [P0-02 guard] reject when NEXUS_OPENCLAW_GATEWAY_ONLY=1
  -> resolveGatewayScopedTools
  -> runBeforeToolCallHook
  -> gatewayTool.execute
```

## 3. 源码证据

| 分类 | 源码路径 | 行号 | 证据 |
|---|---|---:|---|
| 保留 | `vendor/openclaw-main/src/channels/inbound-event/envelope.ts` | 19-47 | `createChannelInboundEnvelopeBuilder` 和 `resolveChannelInboundRouteEnvelope` 只负责路由解析、历史 timestamp 读取和 envelope 格式化，不直接启动 Agent。 |
| 隔离 | `vendor/openclaw-main/src/gateway/agent-turn/agent-turn-service.ts` | 202-244 | P0-02 guard 插在 `prepareAgentContentPhase` 后、`prepareAgentRunDispatch` 前，实验模式只发 `TaskRequest` handoff 并返回。 |
| 禁止 | `vendor/openclaw-main/src/gateway/agent-turn/agent-turn-service.ts` | 534-584 | 未隔离时会进入 `prepareAgentRunDispatch`，该路径属于原生 Agent admission / dispatch 前置阶段。 |
| 禁止 | `vendor/openclaw-main/src/gateway/agent-turn/agent-run-dispatch.ts` | 141-158 | 二级防线在实验模式下返回 `UNAVAILABLE`，清理 run context，并不继续调度原生 Agent。 |
| 禁止 | `vendor/openclaw-main/src/gateway/agent-turn/agent-run-dispatch.ts` | 214-225 | 未阻断时 `dispatchAgentRunFromGateway` 会调用 `agentCommandFromGatewayIngress(..., defaultRuntime, ...)`。 |
| 禁止 | `vendor/openclaw-main/src/gateway/tools-invoke-shared.ts` | 201-211 | `tools.invoke` 在实验模式下返回 `tool_call_blocked`，不进入工具解析和执行。 |
| 禁止 | `vendor/openclaw-main/src/gateway/tools-invoke-shared.ts` | 297-340 | 未阻断时会运行 before-tool hook 并执行 `gatewayTool.execute`。 |

## 4. 保留、隔离和禁止入口

| 入口类型 | P0-02 决策 | 说明 |
|---|---|---|
| Channel inbound envelope | 保留 | 用于后续 OpenClaw provider 复用渠道消息解析、路由和格式化能力。 |
| Channel outbound transport | 保留候选 | P0-02 不做生产出站改造，P4 依据本实验继续锁定具体出站文件。 |
| Native Agent run dispatch | 禁止 | 平台必须通过 Coordinator / Policy-Gate / adapter 产生任务，不允许 OpenClaw 自行启动 Agent。 |
| Gateway visible tools | 禁止 | `tools.invoke` 可直接触发 core/plugin/channel/memory 工具，必须在 gateway-only 实验中拒绝。 |
| Native memory tools | 禁止 | `memory_search`、`memory_get` 等记忆能力后续必须经平台 Memory Gateway。 |
| Plugin subagent | 禁止 | plugin-owned subagent run 属于原生 Agent 执行扩展，P0-02 不保留。 |

## 5. 回归测试清单

- `vendor/openclaw-main/src/gateway/agent-turn/nexus-gateway-only-experiment.test.ts`：验证实验开关、`TaskRequest` 投影、handoff frame、dispatch 防绕过。
- `vendor/openclaw-main/src/gateway/nexus-gateway-only-tools-invoke.test.ts`：验证 `agents_list` 和 `memory_search` 在实验模式下被拒绝。
- `vendor/openclaw-main/src/channels/inbound-event/envelope.test.ts`：验证实验模式不影响 channel envelope 构建。
- `tests/smoke/P0.sh`：验证决策文档存在、P0-02 审计记录不保留占位、vendor 未引入依赖缓存。

## 6. 回滚方式

1. 删除或关闭运行环境中的 `NEXUS_OPENCLAW_GATEWAY_ONLY`，默认 OpenClaw 行为保持不变。
2. 若需回退补丁，撤销以下文件变更：`nexus-gateway-only-experiment.ts`、`agent-turn-service.ts`、`agent-run-dispatch.ts`、`tools-invoke-shared.ts` 及对应测试。
3. P4 正式改造前不得把本实验开关视为生产策略；生产 provider 边界必须迁移到 `platform/adapters/openclaw/` 与 Policy-Gate。

## 7. 待确认问题

- OpenClaw 首批正式支持渠道仍待确认，当前文档中的钉钉、飞书、Telegram 仅为规划候选。
- OpenClaw upstream remote、release commit 和 fork 分支仍无法从本地快照确认。
- P4 生产改造时，是否以环境开关、provider 配置还是单独 sidecar build 作为 gateway-only 强制模式，仍需架构评审。
