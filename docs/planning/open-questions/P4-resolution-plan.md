# P4 待确认问题处理计划

> 阶段目标：把 OpenClaw 固化为 gateway-only provider，并证明渠道消息、渠道插件、出站回写和语义命令都必须经过 Coordinator 与 Policy-Gate。P4 不允许 OpenClaw 启动原生 Agent、执行原生工具或直接读取平台凭据/记忆。

## OQ-UPSTREAM-002：OpenClaw 真实 remote、release commit 和 fork 分支

推荐处理：优先确认官方 remote/tag；如果当前快照来自 fork，则记录 fork remote、base commit、差异摘要和本地补丁。若仍无法确认来源，允许 P4 暂用本地快照，但必须把渠道插件升级和 provider 回滚风险保留为高风险。

三平台影响：

- OpenClaw：渠道插件兼容、gateway-only patch、ClawHub/npm 来源白名单都依赖真实来源。
- Hermes：只接收平台任务上下文，不通过 OpenClaw 原生 session 读取上下文。
- DSH：渠道命令不会直接调用 executor，必须由平台 task/attempt/execution 链路触发。

关闭证据：`vendor/MANIFEST.yaml` 补 remote/tag/fork；P4 provider 兼容记录补渠道插件版本；P4 smoke 验证 provider 可禁用/回滚。

P4-01 进展：已在 `platform/adapters/openclaw/index.ts` 固定当前 vendor 快照为 `openclaw-2026.8.1` 默认 gateway-only provider，并通过 `OpenClawProviderRegistry`、`tests/unit/openclaw-provider-registry.test.mjs` 和 `tests/smoke/P4.sh` 验证 provider 可禁用、恢复和回滚。真实 upstream remote/release commit/fork 分支仍未从本地快照确认，`OQ-UPSTREAM-002` 保持自动确认并继续由 P8 兼容矩阵关闭。

P4-02 进展：已在 `platform/adapters/openclaw/index.ts` 增加 `nexus.openclaw_channel_inbound.p4.v1` / `nexus.openclaw_channel_outbound.p4.v1`，通过 `tests/unit/openclaw-channel-contracts.test.mjs`、`tests/integration/openclaw-channel-adapter.test.mjs` 和 `tests/security/openclaw-channel-leakage.test.mjs` 验证 channel 防腐契约不依赖真实 upstream remote。真实 upstream 来源仍不在 P4-02 关闭。

P4-03 进展：已新增 `nexus.openclaw_command_mapping.p4.v1` 和平台 `nexus.task_command.p4.v1` 命令入口，continue/redo/cancel 只通过 Coordinator、Policy-Gate、TaskState 和 Event Bus 处理；`tests/unit/openclaw-command-mapping.test.mjs`、`tests/integration/openclaw-command-routing.test.mjs` 和 `tests/security/openclaw-command-bypass.test.mjs` 验证命令语义不依赖 OpenClaw 原生 task/cancel API。真实 upstream 来源仍不在 P4-03 关闭。

## OQ-CHANNEL-001：首批渠道的 P4 落地

推荐处理：若 P0 未另行确认，P4 默认按钉钉、飞书、Telegram 建立 channel fixture 和白名单；企业微信或 Slack 只在项目负责人确认后加入 P4/P5 范围。所有渠道插件必须进入 Plugin Bridge inventory 和 admission policy。

三平台影响：

- OpenClaw：复用渠道 transport、inbound envelope、thread binding 和出站回写能力，但关闭原生 Agent dispatch 和 gateway-visible tools。
- Hermes：渠道消息只作为 planner context，不允许 Hermes 原生 gateway 接入渠道。
- DSH：渠道文件和命令最终只通过平台 `TaskRequest`、`ExecutionPlan` 和 `ExecutionRequest` 进入 DSH。

关闭证据：P4 渠道白名单、渠道入站/出站 contract tests、未批准插件拒绝测试、直接触发 OpenClaw 原生 Agent 失败。

确认结论：已关闭。P0 门禁接受钉钉、飞书、Telegram 为首批默认渠道；P4 继续落实 channel fixture、Plugin Bridge 白名单、凭据托管和防绕过测试，新增企业微信或 Slack 时按范围变更处理。

P4-01 进展：已在 OpenClaw Plugin Bridge fixture 中登记钉钉、飞书、Telegram 三个 approved channel capability，并通过 `tests/security/openclaw-plugin-bypass.test.mjs` 验证未批准、禁用、native agent/tool、direct memory、raw URL/path/session/secret-like 插件 payload 均 fail closed。P4-02/P4-04 继续补真实渠道 payload 映射、出站回写和完整 channel-routing 门禁。

P4-02 进展：已把 approved channel inbound 映射为平台 `nexus.task_request.v1`，把平台最终结果映射为 queued channel send intent，并继续要求 Coordinator + Policy-Gate trusted invocation。流式输出、真实渠道厂商发送、重试和完整继续/重做/取消语义留给 P4-03/P4-04。

P4-03 进展：已按保守命令词策略识别 `/continue`、`/redo`、`/retry`、`/cancel`、`/stop` 及对应中文明确命令；同一渠道 `message_id` 生成稳定 idempotency key，重放不重复创建 attempt 或取消事件。自然语言命令歧义不在 P4-03 做分类，真实渠道厂商发送与流式输出仍留给后续任务。

## OQ-PLUGIN-001：OpenClaw 插件治理最小落地

推荐处理：P4-01 采用与 P3-04 一致的“平台管理员白名单批准，租户不可自助安装”路线，只允许 approved `channel`、`message_transform`、`mcp_server` capability descriptor 进入 gateway provider；完整管理员 API、控制台、许可证审核、真实 sidecar 绑定和升级回滚仍由 P5/P6/P8 关闭。

三平台影响：

- OpenClaw：渠道插件可作为 gateway-only capability 复用，但不能启动原生 Agent、执行 gateway-visible tools、读取独立记忆或携带 raw credential/native URL/session/path。
- Hermes：只消费平台 TaskRequest/ExecutionPlan 上下文，不读取 OpenClaw 插件原生 manifest。
- DSH：渠道插件不能直接触发 executor；必须经过平台任务、规划和执行链路。

关闭证据：P4-01 已提供最小准入和防绕过测试；完整插件治理仍保持 `OQ-PLUGIN-001` 自动确认，后续在 P5/P8 关闭。

P4-02 进展：已将 OpenClaw Plugin Bridge 首批 PluginInventory 来源收窄为 ClawHub + npm，并输出平台 `PluginInventory` / `CapabilityDescriptor` / gateway hint 投影；`tests/security/openclaw-plugin-bypass.test.mjs` 验证 Git、本地包、未批准、禁用、native runtime、raw URL/path/session/secret-like manifest 均 fail closed。完整插件治理 API、许可证审核、真实 sidecar 绑定和升级回滚继续由 P5/P8 关闭。

P4-03 进展：渠道或插件产生的 continue/redo/cancel 只能落为平台 command mapping，不允许附带 raw credential、native session/path/url/error、OpenClaw 原生 task/cancel 或 plugin subagent payload；完整租户插件治理和真实 sidecar 绑定继续由 P5/P6/P8 关闭。
