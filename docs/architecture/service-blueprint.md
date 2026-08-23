# NexusAgent 服务功能与整合蓝图

> 文档状态：P0-07 架构基线。本文回答十个基础服务的功能需求、技术栈、设计规划、三大上游复用边界、外部可借鉴项目和整合方式。OpenClaw、Hermes 与 DSH 已分别在 P0-02/P0-03/P0-04 形成实验性剥离证据；P0-05 已登记上游接口分类；P0-06 已形成平台 OpenAPI 初稿。生产 provider 化仍需 P2-P4 和 P6 安全验证。
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

### 2.1 服务输入输出与 P1 最小交付

| 服务 | 平台输入 | 平台输出 | P1 最小交付 | 后续阶段约束 |
|---|---|---|---|---|
| 平台统一 API | `TaskRequest`、查询参数、审批决策、管理员插件治理请求、bearer token | 平台资源 JSON、`PlatformError`、health 状态、分页结果 | Fastify 或 NestJS skeleton、OpenAPI 路由占位、统一鉴权 middleware、`trace_id` 注入、错误映射 | P5 才补完整产品 API、SDK、SSE/gRPC 事件出口和兼容契约测试 |
| Web 管理控制台 | 平台 API 响应、用户会话、权限结果 | 任务面板、审批队列、渠道/插件治理视图、健康和审计查询 UI | React + Vite skeleton、只读 health/task/approval 页面 mock 到平台 API schema | P5 前不得展示上游原生品牌、原生 URL、原生错误码或原生存储路径 |
| OpenClaw 网关适配器 | 渠道事件、平台渠道配置、租户映射、出站平台事件 | 平台 `TaskRequest`、渠道回写结果、渠道审计事件 | 空 adapter + contract fixture；只接收/输出平台 schema | P4 才接入真实渠道插件和 gateway-only provider；所有消息必须先过 Policy-Gate |
| DSH 执行器适配器 | 平台 `ExecutionRequest`、sandbox policy、credential reference、artifact policy | `ExecutionEvent`、`ExecutionResult`、artifact reference、执行审计事件 | 空 adapter + executor provider interface；先固化 execution/event/error schema | P2 才接入 DSH 工具和沙箱；禁止外部启动 native agent-loop |
| Hermes 规划器适配器 | 平台任务上下文、Memory Gateway 摘要、技能/能力描述 | 标准 `ExecutionPlan`、planner 诊断事件 | Python sidecar 调用边界或 mock provider interface；先固化 plan schema | P3 才接入真实规划推理；禁止工具执行、最终回复和文件记忆直读 |
| Memory Gateway | 记忆读写请求、租户/用户/agent 范围、版本条件 | 记忆结果、冲突状态、快照引用、审计事件 | 本地存储接口 + schema，占位检索实现，版本字段和租户隔离检查 | P3/P6 再确定五层记忆、保留期、冲突策略和向量存储 |
| Artifact Store | 上传文件、执行产物、日志片段、模型输出快照、访问请求 | `artifact_id`、artifact reference、生命周期状态、审计事件 | 本地/MinIO 兼容接口占位、metadata schema、权限检查入口 | P2/P6 验证执行产物脱敏、对象存储权限和越权访问失败 |
| Event Bus | 任务、审批、执行、artifact、memory、audit 事件 | 订阅投递、重放游标、死信记录、观测信号 | 开发期内存或 Redis/NATS 兼容接口、统一 event envelope、outbox 占位 | P1/P8 再决定 NATS JetStream 或 Kafka，不把底层事件模型暴露给产品层 |
| Credential Center | `credential_ref`、用途、主体、租户、策略上下文 | 临时凭据句柄、拒绝结果、使用审计记录 | 本地加密/假密钥 provider、引用解析接口、日志脱敏规则 | 生产对接 Vault/KMS；禁止事件、日志、artifact 或环境变量传递明文 secret |
| Observability | health、logs、metrics、traces、audit correlation | OTEL trace、metrics、结构化日志、任务时间线数据 | OpenTelemetry SDK 规范、统一字段名、health/version/trace_id 日志 | P8 再锁定 Collector、Prometheus/Grafana/Loki/Tempo 或企业标准观测栈 |

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

### 3.1 Community Plugin Bridge / Plugin Gateway

Community Plugin Bridge 是平台治理能力，不是第四套插件运行时。首版采用“平台内置白名单 + 原生宿主侧车 + OpenClaw 渠道插件优先”：OpenClaw、Hermes、DSH 的社区插件尽量在各自原生宿主中运行，平台只负责能力发现、准入、权限、凭据、事件、artifact、审计和观测。详细规则见 [上游版本适配与社区插件复用桥接策略](upstream-versioning-and-plugin-bridge.md)。

- OpenClaw 优先复用 ClawHub/npm 渠道插件、消息插件、MCP 声明和 manifest 元数据，但所有渠道消息必须经过 Coordinator 和 Policy-Gate。
- Hermes 优先复用 skills、Agent Plugins v1、MCP 和规划辅助插件；工具类插件只能输出平台 `ToolIntent` 或交由 DSH 执行，不能在 Hermes 内直接执行。
- DSH 复用 Cordis 工具插件和执行型工具，但必须保留 sandbox policy、credential reference、artifact reference 和 execution event 的平台治理。
- 产品层只展示平台 `PluginInventory`、`CapabilityDescriptor`、`PluginAdmissionPolicy` 和 `NativeHostBinding` 的治理视图，不展示原生插件 API、URL、错误码或存储路径。

### 3.2 DSH 版本隔离与可替换边界

DSH 当前处于快速迭代阶段，不假设后续版本与当前 `0.1.1-rc.2` 快照兼容。P2 接入时必须把 DSH 视为可替换 executor provider，而不是平台核心依赖；详细升级、回滚和替换规则维护在 [DSH 版本兼容与替换策略](dsh-versioning-and-replacement.md)。

- 平台稳定面只包括 `ExecutionRequest`、`ExecutionResult`、`ExecutionEvent`、`ArtifactReference`、`CredentialReference`、`SandboxPolicy`、取消/超时/重试语义、平台错误码和统一 ID。
- `platform/adapters/dsh/` 必须预留 provider registry 和版本目录；DSH 原生对象只能存在于具体 provider 内部。
- Coordinator、Policy-Gate、product API、SDK 和控制台不得 import DSH vendor 或 provider 代码。
- 新 DSH 版本或替代 executor 上线前必须通过同一组 adapter contract、sandbox、artifact、credential leak、防绕过和故障注入测试。
- 生产切换默认 executor provider 前必须保留上一版 provider 回滚路径，并更新 `vendor/MANIFEST.yaml`、风险登记册和对应任务修改记录包。

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
| 社区插件准入治理 | OpenClaw ClawHub、Hermes Agent Plugins v1、MCP、DSH Cordis | 原生插件生态通过 Plugin Bridge 白名单复用；平台自研 inventory、admission、capability descriptor 和 host binding | 不重写三大生态插件主体，但准入、权限、审计、凭据和产品展示必须平台化 |

### 4.1 选型状态声明

| 能力 | P0-07 状态 | 最晚确认阶段 | 未确认影响 |
|---|---|---|---|
| Web/API 框架 | Fastify 与 NestJS 均为候选，P1 选择一个并记录 ADR | P1 | 影响 middleware、依赖注入、测试结构和 SDK 生成方式 |
| 事件总线 | 开发期可先用内存/Redis/NATS 兼容接口，生产 NATS JetStream 或 Kafka 待评估 | P1/P8 | 影响重放、顺序性、死信、运维成本和容量规划 |
| 对象存储 | 开发默认 MinIO/S3 兼容思路，生产对象存储标准待确认 | P1/P8 | 影响 artifact URL、生命周期、加密和备份恢复 |
| 凭据后端 | 本地 provider 仅用于开发，Vault/KMS 或企业标准待确认 | P1/P8 | 影响凭据轮换、动态租约、审计和密钥权限模型 |
| 记忆检索 | PostgreSQL + pgvector 与 Qdrant 均为候选 | P3 | 影响检索延迟、一致性、备份、租户隔离和运维复杂度 |
| 观测栈 | OpenTelemetry 是采集标准，后端 Prometheus/Grafana/Loki/Tempo 或企业标准待确认 | P1/P8 | 影响指标命名、日志保留、trace 存储和告警接入 |
| 长任务编排 | P1 先自研状态机，Temporal/Cadence 仅作升级候选 | P6/P8 | 影响恢复、人工信号、重试、补偿事务和部署复杂度 |

任何候选项目进入生产依赖前，都必须补充 ADR、许可证/NOTICE 检查、运维负责人、容量假设、回滚方式和阶段验收脚本。

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
| Plugin Bridge -> OpenClaw/Hermes/DSH sidecar | 内部 HTTP/gRPC 或原生宿主配置写入；只传平台批准的 capability binding | 复用社区生态且不重写插件主体 | 让租户直接安装任意第三方插件或绕过平台白名单 |

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

### 6.1 P1 工作包拆分

| 工作包 | 覆盖服务 | 主要输出 | 验收脚本 |
|---|---|---|---|
| P1 contracts spine | 平台统一 API、Coordinator、Task State、Event Bus | `platform/contracts/`、任务状态机、事件信封、错误码、OpenAPI 路由 skeleton | `tests/unit/`、`tests/smoke/P1.sh` |
| P1 policy spine | Policy-Gate、Tenancy、RBAC、Credential Center | 租户解析、权限决策、凭据引用校验、审批触发接口 | `tests/security/`、`tests/smoke/P1.sh` |
| P1 data spine | Memory Gateway、Artifact Store、Audit | 本地存储接口、artifact metadata、memory query stub、审计事件 | `tests/integration/`、`tests/smoke/P1.sh` |
| P1 observability spine | Observability、Event Bus、所有服务 health | health/version、结构化日志、`trace_id`、OTEL 基线 | `tests/smoke/P1.sh` |
| P1 adapter shell | OpenClaw/Hermes/DSH adapters | 空 provider、contract fixtures、禁用真实 vendor 调用的默认配置 | `tests/contract/`、`tests/smoke/P1.sh` |

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

## 9. P0-07 验收状态

- 十个基础服务均已具备功能需求、默认技术栈、设计规划、上游复用方式、自研/借鉴边界、输入输出、P1 最小交付和后续阶段约束。
- 三个上游组件的复用范围与 P0-05 接口摸底保持一致：OpenClaw 只做 gateway-only，Hermes 只做 planner-only，DSH 只做 executor-only。
- 外部基础设施均标记为候选或可借鉴项目，没有作为生产锁定选型写入。
- P1 可按 contracts spine、policy spine、data spine、observability spine、adapter shell 五个工作包拆分。
- 本文不声明任何未完成 P2-P4/P6 测试的生产安全边界。

## 10. 保留【待确认问题】

1. 企业默认 Node API 框架是 Fastify、NestJS，还是已有内部标准。
2. REST 与 gRPC 是否必须在 P5 同期交付；若同期交付，需要新增 Protobuf 契约和 SDK 生成链路。
3. Event Bus 生产选型是 NATS JetStream、Kafka、Temporal 事件历史，还是企业既有消息系统。
4. Artifact Store 生产对象存储、加密、备份恢复和生命周期策略是否已有标准。
5. Credential Center 是否必须接入 Vault/KMS，还是允许先用企业 IdP/OIDC service account 方案。
6. Memory Gateway 的五层记忆、保留期、冲突策略、向量库和快照策略仍待 P3 决策。
7. Observability 后端、日志保留期、trace 采样率、告警渠道和审计留存期限仍待 P1/P8 决策。
8. 首批正式渠道、插件市场开放范围和租户自助安装时间点仍待 P4/P5/P8 决策。
