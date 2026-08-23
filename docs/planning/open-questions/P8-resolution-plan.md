# P8 待确认问题处理计划

> 阶段目标：把 P1-P6 的默认实现和抽象接口复核为生产交付形态，完成部署、备份恢复、观测告警、provider/插件兼容矩阵、许可证声明和运维手册。P8 不改变平台 API，只替换或锁定生产 provider。

## 生产基础设施复核

OQ-INFRA-002 的 P8 处理：复核 Event Bus 生产后端。若无企业标准，默认 NATS JetStream；若企业要求 Kafka 或标准消息系统，只能在 EventBus provider 层替换，平台事件信封、task state、audit 和 adapter contract 不变。

OQ-INFRA-003 的 P8 处理：复核 Artifact Store 生产对象存储。开发 MinIO 不自动等同生产选择；生产可为企业 S3-compatible、AWS S3、云厂商对象存储或私有化 MinIO 集群。必须完成 checksum、versioning、lifecycle、加密、备份和恢复演练。

OQ-INFRA-004 的 P8 处理：复核 Credential Center 生产后端。默认 Vault；如有企业密钥平台，必须通过 SecretBackend provider 接入，并证明短租约、撤销、审计、脱敏和跨租户隔离不回退。

OQ-INFRA-005 的 P8 处理：复核 Observability 生产后端。P1-P6 的 OTEL 语义保持不变，后端可选 Prometheus/Grafana/Loki/Tempo 或企业 APM/日志/告警平台。必须完成告警规则、SLO、trace/log/metrics 关联和任务时间线展示。

OQ-MEMORY-002 的 P8 处理：复核 Memory Gateway 存储。若 P3 使用 PostgreSQL + pgvector，P8 评估容量、延迟、备份和租户隔离；如切换 Qdrant 或企业向量检索，只能在 MemoryStore provider 层替换。

## 部署交付复核

OQ-DEPLOY-001 的 P8 处理：Kubernetes 是标准生产主路径，Docker Compose prod 是单机私有化、小规模部署和故障复现路径。两个交付物都必须关闭热更新和调试端口；只有平台 API、Web 控制台和经平台治理的渠道入口可对外暴露。

三平台部署要求：

- OpenClaw adapter 作为内部 gateway provider workload，只暴露平台批准的 channel ingress，不暴露 OpenClaw 原生 Gateway、tools.invoke 或插件管理入口。
- Hermes adapter 作为内部 planner provider workload，限制 Python sidecar 访问范围，不暴露 Hermes 原生 gateway、CLI 或 memory 文件路径。
- DSH adapter 作为内部 executor provider workload，必须启用网络隔离、资源限制、sandbox policy、artifact 入库和 provider 回滚。

关闭证据：`deploy/docker-compose.prod.yml`、`deploy/k8s/`、NetworkPolicy、Secret/ExternalSecret、health probes、资源限制、备份恢复脚本和 P8 smoke 全部通过。

## 上游、插件和许可证复核

OQ-LEGAL-001 的 P8 处理：发布前完成上游二次开发、第三方插件、native addon、vendored packages、社区 skills/MCP/Cordis 工具的许可证与 NOTICE 复核。任何许可证不清或再分发限制不明的插件不得进入默认启用清单。

OQ-UPSTREAM-001、OQ-UPSTREAM-002、OQ-UPSTREAM-003 的 P8 处理：三大上游 provider 必须进入兼容矩阵，记录 remote、release commit、fork 分支、vendor hash、本地 patch、兼容 fixture、升级门禁和回滚目标。

OQ-PLUGIN-001 的 P8 处理：首版仍不开放租户任意安装第三方插件；若评估租户自助市场，必须新增产品/安全 ADR，并通过恶意插件、防绕过、许可证和凭据泄漏测试。

关闭证据：P8 交付文档、provider/plugin 兼容矩阵、升级/回滚演练、第三方声明、风险登记册和需求追踪矩阵全部更新。
