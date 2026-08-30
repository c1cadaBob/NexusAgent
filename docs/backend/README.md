# Backend 文档入口

这个目录是 Backend / Hermes Agent 文档的统一存放位置。

## 项目入口

- [Backend README](../../Backend/README.md)
- [Backend agent 指南](../../Backend/AGENTS.md)
- [Backend 贡献指南](../../Backend/CONTRIBUTING.md)

## 主要文档

- 架构与决策：[ADR](./ADR.md)、[配置路由](./profile-routing.md)、[会话生命周期](./session-lifecycle.md)
- Gateway 与集成：[relay connector contract](./relay-connector-contract.md)、[streaming TTS](./streaming-tts.md)、[multi gateway](./kanban/multi-gateway.md)
- 运行与配置：[chronos managed cron contract](./chronos-managed-cron-contract.md)、[micro compaction](./micro-compaction.md)、[计费生命周期](./billing-lifecycle.md)
- 安全与网络：[network egress isolation](./security/network-egress-isolation.md)
- 可观测性：[observability 目录](./observability/README.md)、[监控](./observability/monitoring.md)、[relay shared metrics](./observability/relay-shared-metrics.md)
- 设计与 RFC：[profile builder](./design/profile-builder.md)、[plugin config state bridge](./rfcs/plugin-config-state-bridge.md)

## 存放规则

- Backend 专属文档放在 `docs/backend/`
- 跨 Backend / Frontend 的部署、开发和架构文档放在根级主题目录
- `Backend/docs/README.md` 只保留为旧路径兼容入口
