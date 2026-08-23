# Hermes Provider Directory

本目录只放 Hermes planner-only provider 的版本隔离实现和验证材料。P3 之前不得在这里写生产业务逻辑。

必须遵守：

- provider 外部只能暴露平台 `ExecutionPlan`、planner 事件、能力描述符和健康状态。
- Hermes skills、Agent Plugins v1 和 MCP 只能通过 Plugin Bridge 白名单复用。
- Hermes 工具类插件只能转成平台 `ToolIntent` 或交由 DSH executor 执行。
- 禁止 Hermes 插件直接执行工具、直接读写记忆文件或暴露原生网关。
