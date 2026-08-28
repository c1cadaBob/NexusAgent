# P8 待确认问题处理计划

> 阶段目标：把 P1-P6 的默认实现和抽象接口复核为生产交付形态，完成部署、备份恢复、观测告警、provider/插件兼容矩阵、许可证声明和运维手册。P8 不改变平台 API，只替换或锁定生产 provider。

## P8-01 同步状态

P8-01 已关闭 `OQ-DEPLOY-001`：两者都交付但 Kubernetes 优先；Kubernetes 是标准生产主路径，Docker Compose prod 是单机私有化、小规模部署和故障复现路径。`deploy/docker-compose.prod.yml`、`deploy/k8s/`、`config/services.prod.yaml` 和 `tests/smoke/P8.sh` 已提供生产模板与静态隔离门禁。消息、对象存储、密钥、观测、Memory 生产后端、备份恢复、CI/CD、provider/插件兼容矩阵和法务发布包仅获得 backend reference 与编排证据，仍由 P8-02/P8-03/P8-04 承接。

## OQ-INFRA-002：消息总线生产后端复核

推荐处理：P1-P6 默认使用 NATS JetStream，P8 做生产复核；如果客户或企业标准要求 Kafka、Pulsar 或托管消息系统，只能通过 EventBus provider 替换，不改变平台事件信封、task state、audit 和 adapter contract。

三平台影响：

- OpenClaw：渠道消息、重试、取消和插件事件必须先进入平台事件信封，再由 Event Bus 分发，不能让 OpenClaw 原生队列成为外部事实源。
- Hermes：planner 产出的 ExecutionPlan 和 memory 事件只发布平台事件，避免 Hermes 原生事件格式泄漏到产品层。
- DSH：executor 执行事件、artifact 完成事件和 sandbox 失败事件需要支持至少一次投递、幂等消费和 DLQ，避免任务状态丢失。

关闭证据：`deploy/k8s/` 和 `deploy/docker-compose.prod.yml` 均声明生产消息后端；P8 smoke 验证事件发布、消费、重放、DLQ 和 provider 回滚；`docs/operations/` 记录消息堆积、重放和故障恢复步骤。

## OQ-INFRA-003：Artifact Store 生产对象存储复核

推荐处理：开发和联调使用 MinIO/S3-compatible 接口；P8 锁定生产对象存储 provider，可选企业 S3-compatible、AWS S3、云厂商对象存储或私有化 MinIO 集群。Artifact contract、artifact_id、checksum 和租户权限不随后端变化。

三平台影响：

- OpenClaw：渠道附件、图片、文件和插件产物必须先入 Artifact Store，对外只返回 artifact 引用，不暴露 OpenClaw 原生文件路径。
- Hermes：planner 只能引用平台 artifact，不能把本地 memory 文件、trace 文件或临时文件作为对外产物。
- DSH：executor 所有 stdout/stderr、补丁、报告、沙箱输出和大文件必须入库并带 checksum，不能让用户直接访问 sandbox 路径。

关闭证据：生产对象存储完成 checksum、versioning、lifecycle、加密、租户隔离、备份和恢复演练；P8 smoke 能上传、下载、权限拒绝、回滚 provider；风险登记册记录残留限制。

## OQ-INFRA-004：Credential Center 生产密钥后端复核

推荐处理：默认 Vault；若企业已有密钥平台，P8 通过 SecretBackend provider 接入。任何后端都必须支持 credential_ref、短租约、撤销、审计、脱敏和跨租户隔离。

三平台影响：

- OpenClaw：渠道 token、bot secret 和插件凭据只能通过平台 credential_ref 访问，禁止写入 OpenClaw 原生配置或日志。
- Hermes：planner/skill/MCP 只能拿到脱敏后的能力授权，不能直接读取明文凭据或持久化到 memory。
- DSH：executor 工具调用按用途申请短租约凭据，sandbox、artifact、event 和日志中不得出现明文 secret。

关闭证据：SecretBackend provider 兼容矩阵完成；P8 smoke 覆盖签发、撤销、过期、越权拒绝、日志脱敏和 provider 回滚；`docs/operations/` 写明密钥轮换和泄漏响应流程。

## OQ-INFRA-005：Observability 生产后端复核

推荐处理：P1-P6 先固定 OpenTelemetry 语义、trace_id 贯穿和平台日志字段；P8 再锁定后端，可为 Prometheus/Grafana/Loki/Tempo 或企业 APM/日志/告警平台。

三平台影响：

- OpenClaw：渠道入口、插件宿主、gateway-only 拦截和消息投递必须形成完整 trace，但不能把 OpenClaw 原生错误直接暴露给产品层。
- Hermes：planner-only 决策、memory gateway 调用、降级路径和 provider 版本必须进入 trace，便于排查计划质量问题。
- DSH：sandbox 生命周期、资源限制、工具调用、artifact 入库和失败原因必须可观测，便于安全审计和成本控制。

关闭证据：P8 完成告警规则、SLO、trace/log/metrics 关联和任务时间线展示；生产配置可切换 OTEL exporter；P8 smoke 验证 trace_id 从 API 到三个 provider 全链路贯穿。

## OQ-MEMORY-002：Memory Gateway 存储生产复核

推荐处理：P3 先以 PostgreSQL + pgvector 或等价 MemoryStore provider 验证统一记忆语义；P8 根据容量、延迟、备份、租户隔离和企业标准决定是否保留或切换 Qdrant/企业向量检索。

三平台影响：

- OpenClaw：渠道上下文只能通过 Memory Gateway 查询或写入，不保留 OpenClaw 原生记忆后端作为事实源。
- Hermes：Hermes 原生 memory 文件和 provider 只能作为内部迁移/适配输入，最终读写必须落到 Memory Gateway。
- DSH：执行器只消费经过 Coordinator/Policy-Gate 批准的 memory context，不能直接查询 Hermes 或其他原生存储。

关闭证据：MemoryStore provider 完成容量、延迟、并发写、冲突检测、备份恢复、租户隔离和回滚演练；P8 文档记录保留期、删除策略和记忆冲突处理。

## OQ-DEPLOY-001：生产部署目标

状态：已关闭于 P8-01。确认结论为两者都交付但 Kubernetes 优先；Kubernetes 是标准生产主路径，Docker Compose prod 是单机私有化、小规模部署和故障复现路径。

推荐处理：选择“两者都交付但分优先级”。Kubernetes 是标准生产主路径，Docker Compose prod 是单机私有化、小规模部署和故障复现路径。两个交付物都必须关闭热更新和调试端口；只有平台 API 与 Web 控制台可对外暴露，渠道入口继续经平台 API、Coordinator、Policy-Gate 和内部 adapter 治理。

三平台影响：

- OpenClaw：adapter 作为内部 gateway provider workload，只暴露平台批准的 channel ingress，不暴露 OpenClaw 原生 Gateway、tools.invoke 或插件管理入口。
- Hermes：adapter 作为内部 planner provider workload，限制 Python sidecar 访问范围，不暴露 Hermes 原生 gateway、CLI 或 memory 文件路径。
- DSH：adapter 作为内部 executor provider workload，必须启用网络隔离、资源限制、sandbox policy、artifact 入库和 provider 回滚。

关闭证据：P8-01 新增生产 Compose 模板、Kubernetes namespace/service account/config/secret template/deployments/services/ingress/network policies/kustomization、`config/services.prod.yaml`、`tests/deployment/p8-production-orchestration.test.mjs`、`tests/security/p8-production-isolation.test.mjs` 和 `tests/smoke/P8.sh`。静态门禁验证只有 `platform-api` 与 `web-console` 暴露入口，adapter、memory、artifact、event、credential 和 observability 全部 internal-only；Kubernetes workload 具备 probes、resource requests/limits、non-root、read-only root filesystem、no privilege escalation 和 capabilities drop all。备份恢复细节、生产 SecretBackend、ExternalSecret 控制器和发布运维演练继续由 P8-03/P8-04 承接，不作为 P8-01 关闭前提。

## OQ-LEGAL-001：许可证与再分发复核

推荐处理：发布前完成上游二次开发、第三方插件、native addon、vendored packages、社区 skills/MCP/Cordis 工具的许可证与 NOTICE 复核。任何许可证不清或再分发限制不明的插件不得进入默认启用清单。

三平台影响：

- OpenClaw：ClawHub/npm 渠道插件需要记录来源、版本、hash、许可证和默认启用状态。
- Hermes：skills、Agent Plugins v1、MCP 和 Python 依赖需要记录再分发边界，禁止许可证不清的 planner 插件默认启用。
- DSH：Cordis 工具插件、执行型工具、sandbox 运行时和 native addon 需要额外检查二进制再分发限制。

关闭证据：生成第三方声明、NOTICE、插件许可证清单和默认启用白名单；风险登记册关闭或降级许可证风险；P8 smoke 检查默认启用插件均有许可证记录。

## OQ-UPSTREAM-001：Hermes provider 兼容矩阵

推荐处理：P8 将 Hermes 当前生产 provider、候选新版本和回滚版本纳入兼容矩阵，记录 remote、release commit、fork 分支、vendor hash、本地 patch、兼容 fixture、升级门禁和回滚目标。

三平台影响：

- OpenClaw：Hermes 升级不能改变渠道侧 task handoff、conversation_id 和平台事件字段。
- Hermes：planner-only、Memory Gateway、防直读和插件白名单约束必须在每个 provider 版本中重新验证。
- DSH：Hermes 输出的 ExecutionPlan 必须保持 DSH adapter 可执行，不把 Hermes 原生 tool/runtime 对象传入 executor。

关闭证据：`docs/operations/` 或 provider 兼容矩阵记录 Hermes 升级、禁用、回滚演练；P8 smoke 覆盖计划生成、memory 防直读和 provider 回滚。

## OQ-UPSTREAM-002：OpenClaw provider 兼容矩阵

推荐处理：P8 将 OpenClaw 当前生产 provider、候选新版本和回滚版本纳入兼容矩阵，记录 remote、release commit、fork 分支、vendor hash、本地 patch、渠道插件 fixture、升级门禁和回滚目标。

三平台影响：

- OpenClaw：gateway-only、防绕过、渠道插件白名单和原生入口禁用必须在每个 provider 版本中重新验证。
- Hermes：OpenClaw 升级不能改变平台 TaskRequest 中的 conversation_id、input、tenant/user/agent metadata。
- DSH：OpenClaw 渠道消息不得直接触发 executor；必须经过 Coordinator、Policy-Gate、Hermes planner 或明确的执行路径。

关闭证据：兼容矩阵记录 OpenClaw provider 升级/回滚；P8 smoke 覆盖渠道 ingress、tools.invoke 拒绝、原生 gateway 禁用和插件禁用。

## OQ-UPSTREAM-003：DSH provider 兼容矩阵

推荐处理：P8 将 DSH 当前生产 provider、候选新版本和回滚版本纳入兼容矩阵，记录 remote、release commit、fork 分支、vendor hash、本地 patch、sandbox fixture、升级门禁和回滚目标。

三平台影响：

- OpenClaw：OpenClaw 渠道输入不能因 DSH 升级绕过平台任务状态机或直接进入 native agent-loop。
- Hermes：ExecutionPlan schema 是 Hermes 与 DSH 的稳定边界，DSH 升级只能在 adapter 内适配。
- DSH：executor-only、防 native agent-loop、工具调用、取消语义、artifact 入库和 sandbox policy 是每次升级必测项。

关闭证据：兼容矩阵记录 DSH provider 升级/回滚；P8 smoke 覆盖执行成功、取消、超时、恶意工具、artifact 校验和回滚。

## OQ-PLUGIN-001：插件市场开放范围复核

推荐处理：首版仍不开放租户任意安装第三方插件；P8 只复核是否进入“管理员白名单 + 原生宿主侧车 + 能力代理”的生产治理形态。若评估租户自助市场，必须新增产品/安全 ADR，并通过恶意插件、防绕过、许可证和凭据泄漏测试。

三平台影响：

- OpenClaw：优先复用渠道插件，但插件启用、升级和租户可见性由平台 PluginAdmissionPolicy 控制。
- Hermes：skills/MCP/Agent Plugins 只能作为 planner 能力或 ToolIntent 生成来源，不能直接执行工具或读写 memory。
- DSH：Cordis 工具插件可以在 executor 宿主中复用，但执行必须经过 Policy-Gate、Credential Center、Artifact Store 和 audit。

关闭证据：插件兼容矩阵、默认启用白名单、禁用/升级/回滚脚本、恶意插件测试和许可证记录全部完成；产品文档明确首版不提供租户任意安装。
