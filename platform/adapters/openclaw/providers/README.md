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
