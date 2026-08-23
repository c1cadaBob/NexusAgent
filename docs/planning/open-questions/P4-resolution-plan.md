# P4 待确认问题处理计划

> 阶段目标：把 OpenClaw 固化为 gateway-only provider，并证明渠道消息、渠道插件、出站回写和语义命令都必须经过 Coordinator 与 Policy-Gate。P4 不允许 OpenClaw 启动原生 Agent、执行原生工具或直接读取平台凭据/记忆。

## OQ-UPSTREAM-002：OpenClaw 真实 remote、release commit 和 fork 分支

推荐处理：优先确认官方 remote/tag；如果当前快照来自 fork，则记录 fork remote、base commit、差异摘要和本地补丁。若仍无法确认来源，允许 P4 暂用本地快照，但必须把渠道插件升级和 provider 回滚风险保留为高风险。

三平台影响：

- OpenClaw：渠道插件兼容、gateway-only patch、ClawHub/npm 来源白名单都依赖真实来源。
- Hermes：只接收平台任务上下文，不通过 OpenClaw 原生 session 读取上下文。
- DSH：渠道命令不会直接调用 executor，必须由平台 task/attempt/execution 链路触发。

关闭证据：`vendor/MANIFEST.yaml` 补 remote/tag/fork；P4 provider 兼容记录补渠道插件版本；P4 smoke 验证 provider 可禁用/回滚。

## OQ-CHANNEL-001：首批渠道的 P4 落地

推荐处理：若 P0 未另行确认，P4 默认按钉钉、飞书、Telegram 建立 channel fixture 和白名单；企业微信或 Slack 只在项目负责人确认后加入 P4/P5 范围。所有渠道插件必须进入 Plugin Bridge inventory 和 admission policy。

三平台影响：

- OpenClaw：复用渠道 transport、inbound envelope、thread binding 和出站回写能力，但关闭原生 Agent dispatch 和 gateway-visible tools。
- Hermes：渠道消息只作为 planner context，不允许 Hermes 原生 gateway 接入渠道。
- DSH：渠道文件和命令最终只通过平台 `TaskRequest`、`ExecutionPlan` 和 `ExecutionRequest` 进入 DSH。

关闭证据：P4 渠道白名单、渠道入站/出站 contract tests、未批准插件拒绝测试、直接触发 OpenClaw 原生 Agent 失败。

确认结论：已关闭。P0 门禁接受钉钉、飞书、Telegram 为首批默认渠道；P4 继续落实 channel fixture、Plugin Bridge 白名单、凭据托管和防绕过测试，新增企业微信或 Slack 时按范围变更处理。
