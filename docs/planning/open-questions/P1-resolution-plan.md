# P1 待确认问题处理计划

> 阶段目标：建立平台内核可运行基线。P1 优先固化平台 contracts、Coordinator、Policy-Gate、Event Bus、Artifact Store、Credential Center、Observability 和开发编排；生产后端选型允许在 P8 复核，但 P1 必须把接口、边界和测试钉住。

## OQ-INFRA-001：Web/API 框架

推荐处理：选择 Fastify + TypeScript 作为 P1 默认运行时，同时建立 NexusAgent Node Service Standard v1。也就是底层用 Fastify 保持轻量，标准按企业级服务治理来建：统一目录、配置、trace、日志、schema 校验、错误码、health、Policy-Gate middleware 和测试模板。

三平台影响：

- OpenClaw：API 和 channel adapter 只接平台 schema，不能把 OpenClaw gateway 原生路由透出。
- Hermes：TypeScript adapter 与 Python sidecar 通过平台契约通信，Hermes 原生 CLI/gateway 不进入产品 API。
- DSH：DSH provider 只在 adapter 内部，product API、Coordinator、Policy-Gate 不 import DSH vendor 或 provider 对象。

关闭证据：新增架构决策记录；P1 skeleton 服务通过 health/version/schema 测试；P1 smoke 能验证 trace_id、PlatformError 和 Policy-Gate middleware 生效。

## OQ-API-001：REST 与 gRPC 是否同期交付

推荐处理：REST 先行，gRPC 延后到 P5/P8 复核。P1/P5 先冻结 OpenAPI 3.1 和 REST contract tests，长任务事件优先使用 SSE/WebSocket；gRPC 只保留内部接口或 SDK 后续扩展位置。

三平台影响：

- OpenClaw：渠道入站和出站不依赖 gRPC，对外只看到平台 REST 任务和渠道管理 API。
- Hermes：planner sidecar 可以用内部 HTTP/gRPC，但不影响北向 REST 优先。
- DSH：execution streaming 可先通过 Event Bus + REST 查询表达，gRPC streaming 后续再补。

关闭证据：`docs/contracts/openapi.yaml` 明确 REST MVP；P5 API contract tests 通过；若 gRPC 延后，排期和 SDK 文档写明批次。

P5-01 进展：已按该默认结论交付 REST MVP 和 `tests/smoke/P5.sh`，gRPC/protobuf 与 streaming 仍作为 P5/P8 后续复核项，不阻塞 P5-01 API contract gate。

## OQ-INFRA-002：Event Bus 生产底层选型

推荐处理：P1-P6 默认 NATS JetStream，P8 保留 Kafka/企业消息系统复核。业务代码只能依赖平台 EventBusPort 和 PlatformEventEnvelope，不能直接依赖 NATS subject、Kafka topic 或任何上游原生事件模型。

三平台影响：

- OpenClaw：渠道消息、出站结果、插件拒绝和 channel health 统一转为平台事件。
- Hermes：planner 请求、计划创建、schema 拒绝、memory context 使用和降级事件由 adapter 包装。
- DSH：execution.started、tool.called、artifact.created、sandbox.denied、execution.completed 等执行事件进入统一 Event Bus。

关闭证据：P1 实现 in-memory 与 NATS provider；P1 smoke 验证 publish/subscribe、ack、dead-letter、trace_id；P8 产出生产消息系统 ADR。

## OQ-INFRA-003：Artifact Store 对象存储和备份策略

推荐处理：开发 MinIO + 生产企业标准对象存储。P1 实现 S3-compatible provider 和 metadata schema；P8 再根据生产环境绑定 AWS S3、企业对象存储、云厂商对象存储或私有化 MinIO 集群。

三平台影响：

- DSH：执行产物、stdout/stderr 摘要、工具输出和沙箱导出必须入平台 Artifact Store，只返回 `artifact_id`。
- OpenClaw：渠道附件和出站文件必须经平台 artifact reference 授权，不返回原生渠道或本地路径。
- Hermes：ExecutionPlan 快照、planner 诊断和 memory context 摘要必须脱敏后保存，不把原生记忆文件当公共 artifact。

关闭证据：P1 artifact metadata 和权限测试通过；P2/P4/P6 验证执行产物、渠道附件、跨租户访问和 secret scan；P8 通过备份恢复演练。

## OQ-INFRA-004：Credential Center 生产密钥后端

推荐处理：生产默认 HashiCorp Vault，同时保留企业密钥平台 provider。P1 先实现 Credential Center 抽象、本地开发 provider、`credential_ref` schema、用途校验、短租约语义、脱敏和审计；P8 前如存在企业密钥平台，则以 provider 替换 Vault。

三平台影响：

- OpenClaw：渠道 token 和 webhook secret 只以 `credential_ref` 进入 adapter，渠道插件不能保存长期明文。
- Hermes：planner 只能看到能力和凭据可用性，不接收真实 secret；工具类插件只能产生 `ToolIntent`。
- DSH：executor 只拿短期租约，stdout/stderr/log/artifact 必须做 secret scan，执行后凭据过期或撤销。

关闭证据：P1 凭据引用和脱敏测试通过；P2/P3/P4 各 provider 凭据负向测试通过；P6 恶意插件凭据泄漏测试通过。

## OQ-INFRA-005：Observability 后端和告警标准

推荐处理：P1-P6 统一 OpenTelemetry 语义和采集规范，P8 再锁定后端。开发环境可使用 OTEL Collector + Prometheus/Grafana/Loki/Tempo；生产如果有企业 APM/日志/告警平台，则通过 OTEL Collector exporter 接入。

三平台影响：

- OpenClaw：channel message、plugin blocked、delivery failure 和 channel health 必须带平台 `trace_id`。
- Hermes：planner latency、plan schema reject、memory context、skills/MCP 发现和 degraded 状态必须平台化观测。
- DSH：execution/tool/sandbox/artifact/provider rollback 事件必须可观测，stdout/stderr 不得原样进入公共日志。

关闭证据：P1 每个服务有 health/version/trace_id 日志；P2-P4 adapter 有 provider 版本和 trace；P6 故障注入可关联全链路；P8 告警和 SLO 文档完成。

## OQ-DEPLOY-001：生产部署目标

推荐处理：选择“两者都交付但分优先级”。P1-P6 使用 Docker Compose 作为开发、联调、演示和 smoke 基线；P8 以 Kubernetes 作为标准生产主路径，同时保留 `docker-compose.prod.yml` 作为单机私有化、小规模部署和故障复现包。

三平台影响：

- OpenClaw：Compose 便于渠道调试，Kubernetes 负责生产端口隔离和渠道插件宿主治理。
- Hermes：Kubernetes 更适合限制 Python sidecar、只读文件系统、Memory Gateway 访问和 planner 降级策略。
- DSH：生产默认需要 Kubernetes 的 NetworkPolicy、资源限制、Pod 安全、RuntimeClass/gVisor/Firecracker 候选和 sandbox 隔离。

关闭证据：P1 `docker-compose.dev.yml` 通过；P8 `docker-compose.prod.yml` 和 `deploy/k8s/` 均通过 smoke；生产配置无热更新、无调试端口、内部 adapter 不对外暴露。
