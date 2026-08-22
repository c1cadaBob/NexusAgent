# NexusAgent 服务功能与整合蓝图

> 文档状态：P0-01 架构补充草案。本文回答十个基础服务的功能需求、技术栈、设计规划、三大上游复用边界、外部可借鉴项目和整合方式。所有上游行为仍需在 P0-02 至 P0-04 通过源码分析和实验确认。
>
> 工时说明：人天仅为工程估算，会受上游开源版本变更影响。

## 1. 服务划分原则

- 对外只出现平台概念：任务、尝试、执行、技能、记忆、审批、租户、渠道、artifact、审计和 trace。
- OpenClaw、Hermes、DeepSeek Harness 只作为内部依赖，不作为对外品牌、API、错误码或 URL。
- 每个服务都必须接受并传递 `tenant_id`、`user_id`、`agent_id`、`task_id`、`attempt_id`、`execution_id`、`conversation_id`、`artifact_id`、`trace_id` 中的相关字段。
- 所有调用必须经过 `Coordinator` 与 `Policy-Gate`，内部组件不得两两直连。
- P1 先实现最小可运行骨架；P2-P4 再把三个上游快照分别接入；P5 才开放完整产品 API 和控制台能力。

## 2. 十个服务的功能需求、技术栈与设计规划

| 服务 | 具体功能需求 | 默认技术栈 | 设计规划 | 三大上游复用方式 | 自研/借鉴边界 |
|---|---|---|---|---|---|
| 平台统一 API | 对外 REST/gRPC；任务提交、查询、取消、重试；技能、记忆、审批、租户、用户、RBAC、预算、渠道、artifact、审计查询；Webhook/SSE 或 gRPC streaming 事件出口 | Node.js + TypeScript；优先 Fastify/NestJS 二选一；OpenAPI 3.1；后续可补 protobuf | 作为唯一北向入口，先做认证、租户解析、schema 校验，再调用 Policy-Gate 和 Coordinator；响应只返回平台错误码和平台资源 ID | 不直接复用三大上游 API；只通过平台 adapter 间接调用 Hermes/OpenClaw/DSH | API 领域模型必须自研；认证可对接 Keycloak/OIDC；策略决策可借鉴 OPA；长任务编排可评估 Temporal |
| Web 管理控制台 | 租户/用户/RBAC、任务面板、执行轨迹、审批队列、技能库、记忆检索、渠道配置、artifact 浏览、审计日志、健康监控 | React + Vite + TypeScript；TanStack Query/Router；企业后台 UI 组件库待 P5 确认 | 只调用平台统一 API；按租户、任务、渠道、审计、监控分区；不展示上游原生命名；所有按钮操作必须有权限校验结果 | 不复用三大上游前端；可展示平台 adapter 状态，但不能跳转到上游原生 UI | 控制台需要自研；信息架构可借鉴 Backstage 的目录/插件化思路和 Grafana 的仪表盘/数据源组织 |
| OpenClaw 网关适配器 | 接收钉钉、飞书、Telegram 等渠道消息；解析入站事件；转换为平台 `TaskRequest`；接收平台结果并回写渠道；处理继续、重做、取消 | TypeScript；OpenClaw vendor 内部补丁 + `platform/adapters/openclaw/` 防腐层 | OpenClaw 只保留 gateway-only 能力；所有入站先进入 adapter，再经 Policy-Gate 与 Coordinator；出站只消费平台事件 | 重点复用 OpenClaw 的渠道接入、消息 envelope、路由候选入口和出站能力；隔离原生 Agent/工具/记忆 | 不从零做渠道 transport；平台适配器、租户映射、权限拦截和语义命令映射必须自研 |
| DSH 执行器适配器 | 接收平台 `ExecutionRequest`；执行沙箱工具/命令；产出 stdout/stderr、artifact、执行事件；支持取消、超时、资源预算和策略拒绝 | TypeScript/Node；DSH vendor 内部补丁 + `platform/adapters/dsh/` 防腐层 | DSH 只保留 executor-only 能力；禁止外部启动 DSH 原生 agent-loop；执行前必须校验 sandbox policy 和 credential reference | 重点复用 DSH 的 sandbox、tool-call、runtime context、artifact 产生路径候选入口；隔离原生 agent-loop | 沙箱策略、平台事件、artifact 引用和错误映射必须自研；沙箱后端可评估 Firecracker/gVisor/容器隔离 |
| Hermes 规划器适配器 | 接收平台任务上下文；读取 Memory Gateway；输出标准 `ExecutionPlan`；不直接执行工具；不返回最终用户自然语言回复 | Python 3.11+ Hermes 进程 + TypeScript adapter 边界；JSON Schema 契约 | Hermes 只保留 planner-only 能力；关闭原生 gateway 和工具 runtime；Memory 文件机制改为平台代理 | 重点复用 Hermes 的规划、推理、记忆处理思路和候选入口；隔离原生 CLI/gateway/工具执行 | 规划结果 schema、Memory Gateway 接入、跨进程协议和失败语义必须自研 |
| Memory Gateway | 统一记忆读写、检索、快照、保留期、冲突检测、租户隔离、审计；向 Hermes 提供受控记忆上下文 | Node.js + TypeScript；PostgreSQL/pgvector 或 Qdrant 待 P1/P3 决策；对象存储用于快照 | 成为唯一记忆入口；支持短期会话记忆、长期用户记忆、Agent 技能记忆、组织记忆和审计快照；所有写入带版本和来源 | 可借鉴 Hermes 的记忆层级和 memory_tool 缺陷修复经验，但不复用 Hermes 原生文件作为平台存储 | 服务主体必须自研；向量检索可借鉴 pgvector/Qdrant；长期记忆策略可参考 LangChain/Deep Agents，但需平台化重写 |
| Artifact Store | 保存执行产物、上传文件、日志片段、模型输出快照；返回 `artifact_id` 和引用 URL；支持过期、版本、审计和权限 | Node.js + TypeScript；S3 兼容对象存储，开发默认 MinIO；PostgreSQL 存元数据 | DSH 只上交 artifact payload 或临时路径；平台统一入库、脱敏、分类、生命周期和访问控制；外部只能拿平台 artifact reference | 可消费 DSH 执行产物；不复用三大上游的任意公开文件路径 | 存储服务逻辑自研；底层对象存储借鉴或采用 MinIO/S3；生命周期/版本/权限按平台规则实现 |
| Event Bus | 内部事件分发；任务状态、审批、执行、artifact、审计、观测事件；支持幂等、重放、死信和订阅 | P1 可用轻量内存/Redis/NATS；生产评估 NATS JetStream 或 Kafka | 统一事件信封；Coordinator 发布任务生命周期事件；adapter、审计、观测按订阅消费；禁止服务直接调用底层实现绕过事件 | 三大上游只通过 adapter 进入事件总线；不复用上游事件模型作为平台公共模型 | 事件信封和状态语义必须自研；底层消息系统可借鉴 NATS/Kafka/Temporal 事件历史能力 |
| Credential Center | 凭据引用、密钥托管、访问授权、轮换、脱敏、审计；渠道 token、模型密钥、对象存储密钥、执行凭据 | Node.js + TypeScript；开发可用本地加密存储；生产对接 Vault/KMS；OIDC service account | 平台只传 `credential_ref`，禁止服务间传明文；Policy-Gate 决定能否解析；审计记录谁在何时为何使用凭据 | 不复用三大上游凭据机制；OpenClaw/DSH/Hermes 只能通过 adapter 获取临时凭据 | 权限模型和引用协议必须自研；密钥存储、动态凭据和审计可借鉴 Vault/KMS |
| Observability | 统一 health、metrics、logs、traces、审计关联；trace_id 贯穿 API、Coordinator、adapter、执行器、事件总线 | OpenTelemetry SDK/Collector；Prometheus/Grafana/Loki/Tempo 或同类栈待 P1/P8 决策 | 所有服务默认输出结构化日志和 OTEL trace；内部事件携带 trace_id；控制台可查看任务级时间线、错误和资源消耗 | 可接收三大上游 adapter 的包装指标；不直接暴露上游原生日志路径和错误码 | 观测语义、指标命名和任务时间线自研；采集、面板和告警借鉴 OpenTelemetry/Grafana 生态 |

## 3. 哪些服务可以基于三大平台改造整合

| 服务 | 可复用上游 | 复用等级 | 说明 |
|---|---|---|---|
| OpenClaw 网关适配器 | OpenClaw | 高 | 复用渠道接入、入站 envelope、出站 transport 和 gateway 候选入口；改造目标是 gateway-only。 |
| DSH 执行器适配器 | DeepSeek Harness | 高 | 复用沙箱执行、tool-call、runtime context 和 artifact 产生路径；改造目标是 executor-only。 |
| Hermes 规划器适配器 | Hermes | 高 | 复用规划推理和记忆相关能力；改造目标是 planner-only，禁止工具执行和原生网关。 |
| Memory Gateway | Hermes | 中 | 可借鉴 Hermes 记忆模型和缺陷修复经验，但平台存储、版本、租户、权限和审计必须重写。 |
| Artifact Store | DSH | 低到中 | DSH 可以作为 artifact 来源，但平台必须统一保存、脱敏、授权和生命周期。 |
| Event Bus | 三者 adapter | 低 | 三者只产生或消费平台事件，不复用其内部事件语义。 |
| 平台统一 API | 无 | 不复用 | 必须是平台自有 API，不能包一层后继续暴露上游原生 API。 |
| Web 管理控制台 | 无 | 不复用 | 需要自研产品体验；最多展示 adapter 健康状态。 |
| Credential Center | 无 | 不复用 | 凭据不能继承上游分散机制，必须平台代理。 |
| Observability | 无 | 不复用 | 统一 trace/metrics/logs 由平台定义，上游日志只作为内部诊断输入。 |

## 4. 其他服务可借鉴项目与是否需要从零开发

| 平台能力 | 可借鉴/可采用项目 | 建议采用方式 | 是否从零开发 |
|---|---|---|---|
| 长任务编排、重试、恢复 | Temporal/Cadence | P1 先用自研状态机；若任务跨服务、长时间、可恢复要求上升，P1/P6 评估引入 Temporal 作为 Coordinator 后端 | 不建议完全从零长期维护复杂 durable workflow |
| Policy-Gate | Open Policy Agent | P1 可先实现内置策略接口；中后期把策略表达、审批、RBAC/ABAC 决策迁移到 OPA 或 OPA sidecar | 决策模型自研，策略引擎不必从零写 |
| Event Bus | NATS JetStream / Apache Kafka | P1 开发环境可轻量；生产按吞吐、顺序、重放和运维成熟度选择 NATS 或 Kafka | 事件 schema 自研，消息系统不建议从零写 |
| Artifact Store | MinIO / S3 | 开发默认 MinIO，生产支持 S3 兼容对象存储；平台自研 metadata、权限和生命周期 | 对象存储不从零写 |
| Credential Center | HashiCorp Vault / 云 KMS | 本地开发用封装实现；生产用 Vault/KMS 做密钥保存、轮换和审计，平台只持有引用 | 密钥存储不从零写 |
| 身份认证与租户入口 | Keycloak / 企业 IdP | P5 前确认是否接入企业 SSO；平台保留 user/tenant/RBAC 映射，不把 IdP 角色直接等同平台权限 | IdP 不从零写；平台授权模型自研 |
| Observability | OpenTelemetry / Prometheus / Grafana / Loki / Tempo | 统一 OTEL 埋点；Prometheus 拉指标；Grafana 面板；日志和 trace 后端按生产标准选型 | 采集与面板不从零写；指标语义自研 |
| Web 控制台信息架构 | Backstage / Grafana | 借鉴插件化、目录、数据源和仪表盘组织；不直接把 NexusAgent 做成 Backstage 插件 | 产品控制台自研 |
| Memory Gateway 检索 | PostgreSQL + pgvector / Qdrant | 小到中型优先 Postgres + pgvector 简化一致性；大规模语义检索评估 Qdrant | 记忆策略自研，向量存储不从零写 |

## 5. 服务整合方式

### 5.1 同步主链路

```text
用户/渠道/API Client
  -> 平台统一 API 或 OpenClaw 网关适配器
  -> Policy-Gate
  -> Coordinator
  -> Hermes 规划器适配器（可选，失败可降级）
  -> Coordinator
  -> DSH 执行器适配器
  -> Artifact Store / Memory Gateway / Event Bus / Audit
  -> 平台统一 API 或 OpenClaw 网关适配器
  -> 用户/渠道/API Client
```

### 5.2 内部事件主链路

```text
Coordinator
  -> Event Bus: task.created / attempt.started / plan.ready / execution.started / execution.completed / task.completed
  -> Observability: trace、metrics、logs
  -> Audit: 不可抵赖审计事件
  -> Web 管理控制台: 查询任务时间线和健康状态
```

### 5.3 数据与权限主链路

```text
Policy-Gate
  -> Tenancy/RBAC: 判断用户、租户、角色、资源范围
  -> Credential Center: 解析 credential_ref，禁止明文跨服务传输
  -> Memory Gateway: 按租户/用户/Agent/任务范围读取记忆
  -> Artifact Store: 按 artifact_id 和租户权限读取产物
```

### 5.4 服务间契约

- 北向 API：`docs/contracts/openapi.yaml`，只描述平台概念。
- 内部契约：`platform/contracts/*.schema.json`，包括 task request、task state、execution plan、event envelope、artifact reference 和 credential reference。
- 服务发现与端口：`config/ports.dev.yaml` 与 P1 的 `deploy/docker-compose.dev.yml`。
- 安全边界：所有 adapter 只能接收平台 schema；所有上游原生类型在 adapter 内终止。

### 5.5 推荐的内部协议与部署边界

| 调用方向 | 推荐协议 | 原因 | 禁止事项 |
|---|---|---|---|
| 浏览器/SDK -> 平台统一 API | HTTPS REST；长任务事件使用 SSE/WebSocket，gRPC 作为服务端或 SDK 补充 | 易调试、易生成文档，适合首批产品接入 | 浏览器直接访问任何内部 adapter |
| 平台统一 API -> Coordinator/Policy-Gate | 同进程调用或内部 HTTP/gRPC | 便于统一鉴权、trace 和错误映射 | 由 API 层自行拼接上游请求 |
| Coordinator -> Hermes/DSH/OpenClaw adapter | 内部 gRPC 或带 mTLS 的 HTTP；契约使用平台 JSON Schema/Protobuf 映射 | 支持跨语言、超时、取消和统一 metadata | 传递 Hermes/OpenClaw/DSH 原生对象 |
| Coordinator/adapter -> Event Bus | NATS JetStream 或 Kafka 客户端 | 任务生命周期和审计/观测适合异步解耦 | 用事件总线传递明文凭据或未脱敏大文件 |
| adapter -> Artifact Store | 内部 HTTPS/S3；大对象走预签名内部上传 | 避免把大文件塞进事件；平台掌握引用和权限 | 对外返回 vendor 文件路径 |
| adapter -> Memory Gateway | 内部 HTTP/gRPC；读写必须带租户和版本条件 | 可做并发控制、冲突检测和审计 | Hermes 直接读写 `MEMORY.md`/`USER.md` |
| 任意服务 -> Credential Center | 内部 mTLS；请求只包含 `credential_ref` 和用途 | 支持最小权限、短租约和脱敏 | 在环境变量、事件、日志或 artifact 中传递明文 secret |
| 任意服务 -> Observability | OTLP/HTTP 或 OTLP/gRPC | 统一 trace、metrics、logs 数据模型 | 将上游原生日志原样作为平台 API 响应 |

十个服务是逻辑边界，不代表每个服务都必须永久独立扩缩容。P1 可以按表中端口提供独立开发容器；生产部署时允许把低流量模块合并进平台内核进程，但必须保留相同的 contracts、权限边界和可观测性。

### 5.6 失败、重试与降级语义

| 失败点 | Coordinator 行为 | 用户可见结果 | 审计/观测要求 |
|---|---|---|---|
| Policy-Gate 拒绝 | 不创建执行；记录拒绝决策 | 平台权限/审批错误 | 记录 `trace_id`、主体、资源、策略版本和拒绝原因，不记录凭据 |
| Hermes 不可用 | 按任务策略重试；超过阈值切换无 Hermes 轻量化计划或人工审批 | 平台任务仍可查询，不泄漏 Hermes 错误 | 标记 `planner_degraded=true`，保留原始失败分类的平台代理映射 |
| DSH 超时或沙箱拒绝 | 结束当前 attempt 或按策略重试；禁止无限重试 | 平台执行失败/需要重试 | 记录资源预算、sandbox policy、attempt_id 和取消原因 |
| Event Bus 短暂不可用 | 关键状态先写 durable state/outbox，再异步发布 | 任务状态查询不依赖实时事件消费 | outbox 重放、重复事件幂等、死信告警 |
| Memory Gateway 冲突 | 拒绝覆盖或生成冲突版本，等待人工/策略解决 | 任务可以继续使用最近一致快照，或进入待处理 | 记录版本、来源、冲突字段和解决结果 |
| Artifact Store 不可用 | 执行结果标记为待持久化，不宣称任务完成 | 用户看到“执行完成但产物待保存”或失败 | 记录校验和、重试次数和最终引用状态 |
| Credential Center 不可用 | 不使用缓存明文凭据；任务暂停或失败 | 平台凭据服务不可用 | 记录引用 ID 和失败类别，不记录 secret |

## 6. P1 最小实现顺序建议

1. 先实现 `platform/contracts/`、Task State、Event Envelope 和平台错误码。
2. 再实现 Policy-Gate 的最小决策接口：租户、RBAC、预算、审批、credential_ref 是否允许。
3. 实现 Coordinator 的最小状态机：创建任务、创建 attempt、请求规划、请求执行、完成任务、失败/取消。
4. 实现 Event Bus 的开发期轻量版本和 Observability 的 OTEL 埋点规范。
5. 实现 Artifact Store、Memory Gateway、Credential Center 的本地最小可用版本，先保证接口和审计。
6. 接入 OpenClaw/Hermes/DSH adapter 的空实现，跑通 P1 smoke 后再进入 P2-P4 的真实 vendor 改造。

## 7. 阶段门禁补充

- P1 完成前，每个服务至少有 health、version、trace_id 日志和契约测试。
- P2-P4 完成前，adapter 必须证明外部无法绕过平台直接调用上游。
- P5 完成前，Web 控制台和 SDK 不得出现 Hermes、OpenClaw、DSH 原生类型、原生 URL 或原生错误码。
- P6 完成前，必须通过直接端口、伪造 header、跨租户访问、明文凭据、artifact 越权、memory 越权等负向测试。

## 8. 外部参考资料

以下资料用于技术选型和边界设计，不代表已经锁定生产依赖：

| 领域 | 参考资料 | 在 NexusAgent 中借鉴的部分 |
|---|---|---|
| durable workflow | Temporal Workflow Execution、Activity Execution、Retry Policy | 长任务持久化、Activity 超时/重试、人工信号恢复；不直接把 Temporal 类型暴露到平台 API |
| policy engine | Open Policy Agent 文档与 REST API | 策略即代码、外部决策接口、决策日志；平台仍维护租户、审批和资源模型 |
| event streaming | NATS JetStream、Apache Kafka 文档 | 持久化、重放、消费者和高吞吐事件流；平台自研事件信封和幂等键 |
| secrets | HashiCorp Vault Secrets Engines | 动态凭据、租约、轮换和分路径隔离；平台只保存 credential reference |
| identity | Keycloak OIDC/RBAC 文档 | OIDC 登录、客户端 scope 和角色映射；平台保留自己的 user/tenant/RBAC 资源授权 |
| observability | OpenTelemetry Collector 与 Signals 文档 | traces、metrics、logs 的统一采集和 OTLP 导出；平台定义业务指标和脱敏规则 |
