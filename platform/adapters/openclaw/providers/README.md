# OpenClaw Provider Directory

本目录只放 OpenClaw gateway-only provider 的版本隔离实现和验证材料。P4-01 已把 P0 opt-in 实验升级为平台最小 provider 边界，当前默认 provider 是 `openclaw-2026.8.1`。

必须遵守：

- provider 外部只能暴露平台消息事件、能力描述符和健康状态。
- ClawHub、npm、Git 或本地渠道插件只能通过 Plugin Bridge 白名单启用。
- 禁止在 provider 外透传 OpenClaw 原生 URL、错误码、session、存储路径或 Agent 对象。
- 每个 provider 版本都必须有兼容 fixture、禁用路径和回滚目标。

P4-01 当前能力：

- `OpenClawProviderRegistry` 提供 provider list/enable/disable/default/rollback。
- `OpenClawGatewayAdapter` 只接受 Coordinator + Policy-Gate trusted invocation。
- `nexus.openclaw_gateway_event.p4.v1` 是内部 gateway event 形态，不进入公共 OpenAPI。
- Plugin Bridge 最小准入只开放已批准的 `channel`、`message_transform`、`mcp_server` capability descriptor。

P4-02 当前能力：

- `nexus.openclaw_channel_inbound.p4.v1` 把 approved channel message 归一化为平台 `nexus.task_request.v1` handoff，并强制携带租户、会话、trace、UTC 和 `monotonic_ms`。
- `nexus.openclaw_channel_outbound.p4.v1` 只把平台最终结果转换为 metadata-only channel send intent；真实厂商发送、流式输出和重试留给后续任务。
- Plugin Bridge 将 ClawHub/npm manifest candidate 投影为平台 `PluginInventory` 与 `CapabilityDescriptor`；Git、本地包和完整插件治理继续由 P5/P8 关闭。

P4-03 当前能力：

- `nexus.openclaw_command_mapping.p4.v1` 只识别明确 continue/redo/cancel 命令词，并投影为平台 `nexus.task_command.p4.v1`。
- `Coordinator.submitTaskCommand()` 统一处理 continue、redo、cancel 的 Policy-Gate、TaskState、Event Bus 和 idempotency；adapter 本身不取消、不重开、不调用原生任务。
- 同一渠道 `message_id` 重放返回同一 command result，不重复创建 attempt 或取消事件；不同 payload 复用 idempotency key 返回 `PLATFORM_CONFLICT`。
