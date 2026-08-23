# NexusAgent 独立一体化 AI Agent 平台开发实施规划

> 文档状态：P0-01 第二轮深化草案。P0 验收前，所有上游源码行为仍以实测和源码证据为准。
>
> 工时说明：人天仅为工程估算，会受上游开源版本变更影响。

## 规划约束

- 实际开发根目录唯一为 `/opt/project/NexusAgent`。
- `/opt/project/hermes-agent-main`、`/opt/project/openclaw-main`、`/opt/project/deepseek-harness-master` 只读；所有修改只能发生在 `vendor/` 副本或平台自研目录。
- OpenClaw、Hermes、DeepSeek Harness 是平台内部实现依赖，对外不可见、不可直接访问、不可出现在平台公共 API 和错误码中。
- 所有底层调用必须经过 `platform/adapters/`、`Coordinator` 和 `Policy-Gate`；禁止三个底层组件两两直连。
- 任务统一使用 `tenant_id`、`user_id`、`agent_id`、`task_id`、`attempt_id`、`execution_id`、`conversation_id`、`artifact_id`、`trace_id`。
- 所有时间字段使用 UTC；超时、重试和排序使用平台单调时钟，禁止使用墙上时钟计算持续时间。
- 每个任务完成前必须通过对应质量门禁、单元测试和阶段冒烟脚本。
- 每个任务开始实现前、修改过程中和完成验证后，必须在对应 `docs/planning/task-prompts/{阶段}/{任务ID}.md` 中填写“修改记录包”，用于审计源码证据、基线测试、实际变更、偏离、验证结果、风险和回滚信息。

## 0. 项目总览

### 0.1 产品定位

NexusAgent 是一个完整独立、可交付的一体化 AI Agent 平台。终端用户只接触统一平台 API、Web 管理控制台、多渠道配置、租户、用户、任务、技能、记忆、审批、预算和审计能力。

| 类型 | 对外/内部 | 内容 |
|---|---|---|
| 平台对外能力 | 对外 | 统一 REST/gRPC API、任务提交和查询、技能管理、记忆管理、租户与用户、RBAC、审批、预算、渠道管理、审计和监控 |
| 平台内部依赖 | 内部 | OpenClaw gateway-only 渠道适配、Hermes planner-only 规划记忆、DSH executor-only 沙箱执行 |
| 禁止暴露 | 内部 | 三个上游的原生 API、原生 Agent/Loop、原生会话、原生记忆文件、原生错误码和内部 URL |

### 0.2 技术栈基线

| 层 | 基线 | 边界 |
|---|---|---|
| 平台内核与对外 API | Node.js/TypeScript | Coordinator、Policy-Gate、公共契约、适配器、API 和 SDK |
| Hermes 内部进程 | Python 3.11+ | 只输出平台标准化 `ExecutionPlan`，通过平台适配器通信 |
| Web 控制台 | React + Vite + TypeScript | 只调用平台 API，不引用上游源码包 |
| DSH/OpenClaw | 上游锁定版本 | 只在 `vendor/` 中改造，接口通过防腐层转换 |
| 开发容器 | Docker Compose | 源码卷挂载、热更新、调试端口、trace_id 日志 |
| 生产容器 | Docker Compose/Kubernetes | 禁止热更新、禁止调试端口、使用独立生产配置 |

### 0.3 成功标准与阻塞触发

成功标准：平台公共 API 可以完成任务提交、规划、执行、artifact 产出和结果返回；租户/RBAC/审计可用；任何外部请求无法绕过 Policy-Gate 直接访问底层；关闭 Hermes 后，平台仍能沿轻量化路线运行。

以下任一条件触发 P0 否决或回退评估：

1. 任一 gateway-only、planner-only、executor-only 实验无法在隔离测试中稳定通过。
2. 无法在平台边界内阻断原生底层 API 或原生记忆存储访问。
3. 统一任务标识、事件信封或 artifact 引用无法跨进程保持一致。
4. DSH 预览版接口变更导致适配器无法维护且无替代版本。

### 0.4 十个基础服务设计边界

十个基础服务的功能需求、默认技术栈、设计规划、三大上游复用边界、外部可借鉴项目和整体整合方式维护在 [`docs/architecture/service-blueprint.md`](../architecture/service-blueprint.md)。该蓝图是 P1 平台内核、P2-P4 三个 adapter 改造、P5 产品层和 P6 集成测试的共同输入。

| 服务 | 设计结论 |
|---|---|
| 平台统一 API | 必须自研为唯一北向入口；可借鉴 OIDC/OPA/Temporal 等成熟能力，但不得代理暴露上游原生 API。 |
| Web 管理控制台 | 必须自研为平台控制台；只调用平台 API，不显示 Hermes/OpenClaw/DSH 原生命名。 |
| OpenClaw 网关适配器 | 基于 OpenClaw 改造为 gateway-only，复用渠道接入和出站能力。 |
| DSH 执行器适配器 | 基于 DeepSeek Harness 改造为 executor-only，复用沙箱执行和 artifact 产生路径。 |
| Hermes 规划器适配器 | 基于 Hermes 改造为 planner-only，复用规划与记忆推理能力。 |
| Memory Gateway | 可借鉴 Hermes 记忆模型，但平台存储、租户、版本、权限和审计必须自研。 |
| Artifact Store | 可消费 DSH 产物，但保存、引用、权限和生命周期必须平台统一实现。 |
| Event Bus | 不复用上游事件模型；平台事件信封自研，底层消息系统可评估 NATS/Kafka/Temporal。 |
| Credential Center | 不复用上游凭据机制；平台只传 credential reference，生产密钥托管可对接 Vault/KMS。 |
| Observability | 不暴露上游原生日志/错误码；平台定义 trace、metrics、logs 和任务时间线。 |

## 1. P0 预研与可行性验证阶段

P0 不开发产品业务代码，拥有项目否决权。每项任务都必须输出源码证据、实验日志和可复现命令。

| 任务ID | 任务名称 | 所属阶段 | 涉及文件开发路径 | 修改说明 | 输入 | 输出 | 验收条件 | 预估人天 | 前置依赖 | 潜在卡点 |
|---|---|---|---|---|---|---|---|---:|---|---|
| P0-01 | 初始化仓库、目录和上游快照 | P0 | `scripts/bootstrap/vendor-snapshot.sh`、`scripts/source-manifest/create-manifest.sh`、`vendor/`、`docs/` | 初始化 Git；复制三份源码；生成版本和树哈希清单；不修改原始目录 | 三个只读源码目录 | Git 分支、目录骨架、`vendor/MANIFEST.yaml`、文档大纲 | `git status --short` 无未预期文件；三份 vendor 存在；清单版本为 Hermes 0.20.5、OpenClaw 2026.8.1、DSH 0.1.1-rc.2；重新执行清单脚本得到相同树哈希 | 1.5 | 无 | 上游目录无 Git 元数据；快照体积较大 |
| P0-02 | OpenClaw gateway-only 剥离实验 | P0 | `/opt/project/NexusAgent/vendor/openclaw-main/src/gateway/agent-turn/agent-request-routing.ts`、`agent-run-dispatch.ts`、`agent-run-execution-phase.ts`、`agent-turn-service.ts`；`src/channels/inbound-event/envelope.ts`；新增实验记录 `docs/decisions/P0-openclaw-gateway-only.md` | 先建立调用图；实验分支中关闭或隔离原生 Agent、原生工具和原生记忆入口；只保留渠道消息接收/发送验证 | OpenClaw 快照、P0 接口摸底 | gateway-only patch、调用图、回归测试清单 | 渠道输入只能产生标准 `TaskRequest`；直接触发原生 Agent/工具/记忆的路径被拒绝；原有 gateway 健康检查通过 | 4 | P0-01 | 入口分散；现有测试依赖原生 Agent |
| P0-03 | Hermes planner-only 剥离实验 | P0 | `/opt/project/NexusAgent/vendor/hermes-agent-main/agent/conversation_loop.py`、`agent/tool_executor.py`、`agent/memory_manager.py`、`agent/memory_provider.py`、`tools/memory_tool.py`、`hermes_cli/loops.py`；新增 `docs/decisions/P0-hermes-planner-only.md` | 先建立运行时调用图；实验中隔离原生网关和工具 Runtime；验证仅返回结构化规划结果；Memory 文件不作为平台公共存储 | Hermes 快照 | planner-only patch、ExecutionPlan 样例、记忆代理边界记录 | 输入可产生 schema 校验通过的 `ExecutionPlan`；不产生面向用户的最终自然语言回复；外部进程不能直接读写 `MEMORY.md`/`USER.md` | 5 | P0-01 | Python 运行路径和插件加载复杂；memory snapshot 行为需实测 |
| P0-04 | DSH executor-only 剥离实验 | P0 | `/opt/project/NexusAgent/vendor/deepseek-harness-master/packages/core/agent-loop/src/agent.ts`、`constants.ts`、`index.ts`、`runtime-context.ts`、`tool-calls.ts`；`packages/core/agent/src/dispatch.ts`；新增 `docs/decisions/P0-dsh-executor-only.md` | 先确认 agent-loop、tool-call、sandbox 和 session 依赖；实验中禁止内部 Agent Loop，只保留受策略约束的执行入口 | DSH 快照、developer preview 版本 | executor-only patch、执行输入输出样例、兼容性清单 | 请求必须附带平台 execution_id 和策略；不能从外部启动 DSH 原生 agent-loop；执行结果和事件可被平台解析 | 5 | P0-01 | 预览版接口不稳定；Cordis 插件依赖可能阻塞剥离 |
| P0-05 | 底层接口摸底与兼容性登记 | P0 | `docs/architecture/upstream-interface-inventory.md`、`docs/risks/risk-register.md`、`scripts/upstream-tracking/` | 记录实际入口、协议、启动参数、依赖、许可证和已知泄漏点；未确认内容标记为【待确认问题】 | P0-02 至 P0-04 证据 | 接口清单、风险卡点、上游变更登记模板 | 每个底层入口都能归类为保留、隔离或禁止；没有凭源码猜测的行为描述 | 2 | P0-02/P0-03/P0-04 | 缺少 upstream remote/commit；许可证需确认 |
| P0-06 | 平台 OpenAPI 初稿 | P0 | `docs/contracts/openapi.yaml`、`platform/contracts/` | 定义平台任务、技能、记忆、租户、审批和健康 API；禁止出现底层原生类型和路径 | 需求原文、P0 接口边界 | OpenAPI 3.1 初稿、平台错误码草案 | `npx @redocly/cli lint docs/contracts/openapi.yaml` 或等价校验通过；所有接口使用平台术语 | 2 | P0-05 | REST/gRPC 是否同期交付待确认 |
| P0-07 | 十个基础服务功能和整合蓝图 | P0 | `docs/architecture/service-blueprint.md`、`docs/README.md`、`docs/traceability/requirements-matrix.md`、`docs/risks/risk-register.md` | 明确平台统一 API、Web 控制台、OpenClaw/DSH/Hermes adapter、Memory Gateway、Artifact Store、Event Bus、Credential Center、Observability 的功能、技术栈、复用边界、参考项目和整合链路 | 用户补充问题、端口规划、P0 上游快照 | 服务蓝图、追踪矩阵和风险补充 | 每个服务都有功能需求、技术栈、设计规划、上游复用结论、借鉴/自研边界和整合方式；不得把外部项目写成已确定生产选型 | 1.5 | P0-01 | 外部基础设施标准和企业技术栈偏好待确认 |
| P0-08 | 开发排期基线和资源计划 | P0 | `docs/planning/development-schedule.md`、`docs/README.md`、`docs/traceability/requirements-matrix.md`、`docs/risks/risk-register.md` | 将 P0-P8 人天估算转换为日历排期；明确 MVP、生产交付、并行工作流、资源假设、关键路径和压缩/延后规则 | P0-P8 任务估算、团队分工、服务蓝图、当前日期 | 排期基线、每周执行计划、资源容量规则、待确认事项 | 排期必须覆盖 P0-P8；明确 P0-P6 MVP、P7 可裁剪、P8 生产交付；不得把团队容量和节假日假设写成已确认事实 | 1 | P0-07 | 实际团队人数、节假日和发布冻结窗口待确认 |
| P0-09 | AI 排期提示词模板 | P0 | `docs/planning/ai-schedule-prompt-template.md`、`docs/planning/open-questions-register.md`、`docs/README.md`、`docs/traceability/requirements-matrix.md`、`docs/risks/risk-register.md` | 基于高危约束、项目现实情况、服务蓝图、开发排期和待确认问题集中台账，建立可自动填充的总控、阶段、任务、周计划、延期重排和门禁评审提示词 | 用户补充提示词要求、P0-07 服务蓝图、P0-08 排期基线、当前散落待确认问题 | AI 排期提示词模板、自动填充字段字典、阶段差异化规则、待确认问题集中台账 | 模板必须重复包含只读目录、上游不可见、防绕过、UTC/单调时钟、统一 ID、源码证据、待确认问题集中台账、OQ 问题 ID 和验收命令要求；不得授权 AI 擅自修改生产业务代码 | 1 | P0-08 | 后续自动填充脚本尚未实现；提示词执行效果和台账关闭质量需在阶段复盘中校正 |
| P0-10 | 按任务 ID 生成实施规划提示词文档 | P0 | `scripts/planning/generate-task-prompts.py`、`docs/planning/task-prompts/`、`docs/README.md`、`docs/traceability/requirements-matrix.md` | 参考实施规划和 AI 排期提示词模板，为每个任务 ID 生成一份单独完整的实施规划提示词文档，便于后续开发直接复制使用 | P0-09 提示词模板、当前任务表、排期基线、需求追踪矩阵、风险登记册 | 任务提示词生成脚本、任务提示词文档目录、每个任务 ID 的完整提示词文件和索引 | 每个任务 ID 都有单独文档；每份提示词必须包含任务信息、排期上下文、只读目录、允许写入路径、防暴露、防绕过、UTC/单调时钟、统一 ID、源码证据、待确认问题和验收命令要求；生成过程可重复 | 1 | P0-09 | 任务表结构存在 P7/P8 简化列，需要生成时补齐缺省字段 |
| P0-11 | P0 已自动确认问题同步修复 | P0 | `docs/planning/task-prompts/P0/P0-01.md` 至 `P0-08.md`、`docs/planning/open-questions-register.md`、`docs/planning/open-questions/`、`docs/traceability/requirements-matrix.md`、`docs/risks/risk-register.md` | 根据当前 `自动确认` 状态，把 P0-01 至 P0-08 已确认但未同步的问题回写到任务文档、风险、追踪矩阵和专业文档；若仍有未处理问题，则按当前阶段进度重新创建实时规划提示词 | P0-01 至 P0-08 修改记录包、集中台账、确认文件、阶段进度 | 同步修复后的任务文档、台账状态说明、后续实时规划提示词清单 | 修改前分析必须先处理待确认问题；不能把 `自动确认` 写成 `已关闭`；若关闭必须补齐确认结论、解决说明文档和关闭 commit；P0 smoke 通过 | 1 | P0-09/P0-10 | P0-01 至 P0-08 历史记录分散，可能需要逐项映射 OQ ID 和确认文件 |

### P0 阶段待确认问题

- 三个上游目录对应的 Git remote、release commit 和 fork 分支是什么？当前快照无法读取。
- 是否允许排除上游构建产物、缓存、日志和依赖目录后作为内部交付快照？
- OpenClaw 的首批渠道是否确定为钉钉、飞书、Telegram？
- Hermes 五层记忆的层级、保留期、冲突处理和存储选型是什么？
- DSH 预览版是否允许固定到当前 `0.1.1-rc.2` 的本地快照？
- Event Bus、Credential Center、Observability、Artifact Store 和 Memory Gateway 的生产底层选型是否已有企业标准？
- 实际团队人数、角色投入比例、地区节假日和发布冻结窗口是什么？
- 后续是否需要实现自动填充脚本，将任务表和排期表转换为具体 AI 提示词？
- 后续是否需要将任务提示词文档生成接入 CI，检查每个任务 ID 是否都有对应提示词？

## 2. P1 平台内核公共底座开发

自研代码统一放在 `/opt/project/NexusAgent/platform/`，适配器只能依赖平台 contracts，不能直接把上游类型传到产品层。

| 任务ID | 任务名称 | 所属阶段 | 涉及文件开发路径 | 修改说明 | 输入 | 输出 | 验收条件 | 预估人天 | 前置依赖 | 潜在卡点 |
|---|---|---|---|---|---|---|---|---:|---|---|
| P1-01 | 公共标识、事件信封和状态机 | P1 | `platform/contracts/*.schema.json`、`platform/task-state/` | 定义全局 ID、七层任务状态、事件信封、错误码、UTC/单调时钟字段 | P0 OpenAPI、服务蓝图 | JSON Schema、类型定义、状态转移表 | 非法状态转移和跨租户 ID 被拒绝；schema 校验和单元测试通过 | 4 | P0-06/P0-07 | 状态语义需和产品审批/重试对齐 |
| P1-02 | Coordinator 与 Policy-Gate | P1 | `platform/coordinator/`、`platform/policy-gate/` | 实现统一调度、租户/RBAC/预算/审批校验和适配器路由；不允许底层直连 | P1-01 | 内核服务接口、拦截中间件、决策日志 | 所有内部调用带 trace_id 和 execution_id；绕过 Policy-Gate 的测试请求均失败 | 7 | P1-01 | 跨进程鉴权和重试语义 |
| P1-03 | 适配器抽象、事件总线、统一时钟 | P1 | `platform/adapters/`、`platform/event-bus/`、`platform/clock/` | 定义适配器生命周期、请求/响应转换、事件发布订阅和单调时间服务 | P1-01 | 三种空实现适配器、事件总线和时钟 API | mock adapter 可跑通 task 生命周期；事件顺序和重复投递策略有测试 | 5 | P1-01 | 消息总线选型待确认 |
| P1-04 | Artifact Store、Memory Gateway、凭据中心 | P1 | `platform/artifact-store/`、`platform/memory-gateway/`、`platform/credentials/` | 统一 artifact 引用、五层记忆代理和凭据引用；禁止传递明文密钥 | P1-01 | 服务接口、引用 schema、最小本地实现 | artifact 可上传/读取/过期；memory 读写带租户隔离；日志和事件不含明文凭据 | 7 | P1-01 | 生产存储选型和密钥托管待确认 |
| P1-05 | 租户、RBAC、审计和 trace 链路 | P1 | `platform/tenancy/`、`platform/rbac/`、`platform/audit/`、`platform/observability/` | 建立租户边界、角色权限、不可抵赖审计和 trace_id 关联 | P1-02 | 权限骨架、审计事件、指标/健康接口 | 跨租户访问、越权操作和无 trace_id 事件均被拒绝；审计记录可查询 | 5 | P1-02 | 组织模型和审计留存策略待确认 |
| P1-06 | 开发编排、错误码和 P1 冒烟 | P1 | `deploy/docker-compose.dev.yml`、`config/ports.dev.yaml`、`config/services.dev.yaml`、`tests/smoke/P1.sh` | 加入源码卷挂载、热更新、调试端口、健康检查、端口冲突校验和平台错误码 | P1-01 至 P1-05、服务蓝图 | 开发 Compose、端口表、健康脚本 | `docker compose -f deploy/docker-compose.dev.yml config` 通过；服务端口从 3050 连续且无冲突；冒烟脚本输出 PASS | 4 | P1-01 至 P1-05 | 本地 Docker/调试器版本差异；服务边界配置漂移 |

### P1 阶段待确认问题

- 生产数据库、对象存储、消息总线和密钥托管的标准选型是什么？
- 七层任务状态的最终命名和审批/重试状态是否已有外部系统兼容要求？
- 平台内核是统一 HTTP/gRPC，还是服务间允许事件总线和 HTTP 混用？

## 3. P2 内部底层执行底座改造接入

DSH 只作为平台内部执行沙箱，DSH 原生 API 绝不暴露到平台外部。由于 DSH 仍在快速迭代，P2 必须把 DSH 接入实现为可替换 executor provider；平台对外契约不得随 DSH 版本变化，详细规则见 [`docs/architecture/dsh-versioning-and-replacement.md`](../architecture/dsh-versioning-and-replacement.md)。

| 任务ID | 任务名称 | 所属阶段 | 涉及文件开发路径 | 修改说明 | 输入 | 输出 | 验收条件 | 预估人天 | 前置依赖 | 潜在卡点 |
|---|---|---|---|---|---|---|---|---:|---|---|
| P2-01 | DSH executor-only 改造 | P2 | `/opt/project/NexusAgent/vendor/deepseek-harness-master/packages/core/agent-loop/src/agent.ts`、`constants.ts`、`index.ts`、`runtime-context.ts`、`tool-calls.ts`、`packages/core/agent/src/dispatch.ts` | 按 P0 调用图关闭 agent-loop 入口，保留最小 executor 能力；所有改动登记在 `vendor/MANIFEST.yaml`；形成当前 DSH provider 的源码证据和补丁边界 | P0-04 patch 和测试 | DSH 本地补丁、provider 兼容性说明、变更说明、回归测试 | agent-loop 直接调用失败；平台 executor 请求可执行且可取消；原有必要单元测试不回归；当前 provider 可被配置禁用或回滚 | 6 | P0-04、P1 | 预览版内部 API 变化；provider 边界不清导致后续版本难替换 |
| P2-02 | DSH 防腐适配器 | P2 | `platform/adapters/dsh/` | 把平台 `ExecutionRequest` 转成 DSH 内部请求，把结果和错误转成平台事件；不导出 DSH 类型；预留 provider registry 和版本目录 | P1-03、P2-01 | DSH adapter、provider registry、契约测试 | adapter 只接受平台 schema；所有请求经过 Policy-Gate；原生 DSH URL/错误码不出现在响应；新旧 provider contract fixture 可复用 | 5 | P1-03、P2-01 | 跨进程协议、取消语义和 provider 切换语义 |
| P2-03 | 沙箱策略、artifact 和执行事件 | P2 | `platform/adapters/dsh/`、`platform/artifact-store/`、`platform/event-bus/` | 强制 sandbox policy、资源预算、artifact 引用和标准化 execution events | P2-02 | 执行策略、artifact 事件、失败分类 | 越权文件/网络访问被拒绝；stdout/stderr 不泄漏凭据；artifact 引用可追踪 | 5 | P1-04、P2-02 | 沙箱能力和运行环境差异 |
| P2-04 | 集成与防绕过验证 | P2 | `tests/integration/dsh-adapter.*`、`tests/security/dsh-bypass.*`、`tests/smoke/P2.sh` | 验证外部 API 无法直接访问 DSH；注入非法 execution_id、凭据和策略；覆盖 provider 切换、禁用和回滚路径 | P2-01 至 P2-03 | 集成测试、拦截测试、provider 兼容测试、冒烟脚本 | 直接端口、原生请求、伪造内部 header 均失败；正常平台请求 PASS；默认 provider 切换失败时可回滚上一版 provider | 3 | P2-03 | 网络隔离配置错误；新旧 provider fixture 不一致 |

### P2 阶段待确认问题

- DSH 的正式沙箱后端和允许的文件/网络策略集合是什么？
- 是否需要保留 DSH session 查询能力，还是只保留单次 executor 生命周期？
- DSH 后续版本接入是否允许 vendor 快照并存，还是通过单一 vendor 加 provider patch 管理？
- 生产默认 executor provider 是否必须是 DSH，还是允许替换为经门禁验证的其他沙箱执行后端？

## 4. P3 内部决策记忆引擎改造接入

Hermes 原生 API、`MEMORY.md`/`USER.md` 文件机制和自然语言回复全部由平台封装。Hermes provider 可以复用 skills、Agent Plugins v1、MCP 和规划辅助插件，但必须保持 planner-only：插件不得在 Hermes 内直接执行工具或直接读写记忆，工具类插件只能转成平台 `ToolIntent` 或交由 DSH executor 执行。

| 任务ID | 任务名称 | 所属阶段 | 涉及文件开发路径 | 修改说明 | 输入 | 输出 | 验收条件 | 预估人天 | 前置依赖 | 潜在卡点 |
|---|---|---|---|---|---|---|---|---:|---|---|
| P3-01 | Hermes planner-only 改造 | P3 | `/opt/project/NexusAgent/vendor/hermes-agent-main/agent/conversation_loop.py`、`agent/tool_executor.py`、`hermes_cli/loops.py`、`hermes_cli/gateway.py`；`platform/adapters/hermes/providers/hermes-0.20.5/` | 依据 P0 调用图关闭原生网关/工具 Runtime；只保留规划所需调用；建立 Hermes provider 版本边界、插件白名单和禁用机制；所有补丁记录在 vendor 清单 | P0-03 证据、Plugin Bridge 策略 | Hermes planner patch、provider 兼容说明、插件白名单记录、回归测试 | 规划请求只返回平台 `ExecutionPlan`；禁止原生网关启动和工具直接执行；Hermes provider 可禁用/回滚 | 6 | P0-03、P1 | Hermes 启动路径、插件依赖和 provider 边界复杂 |
| P3-02 | 修复 memory_tool 快照缺陷并代理化 | P3 | `/opt/project/NexusAgent/vendor/hermes-agent-main/tools/memory_tool.py`、`agent/memory_manager.py`、`agent/memory_provider.py`；`platform/adapters/hermes/`、`platform/memory-gateway/` | 先复现快照/并发写入问题；修复必须保留 drift/read-failure 防护；读写改为平台代理；阻断 Hermes 插件直接读写原生记忆文件 | Hermes memory 实测、P1 Memory Gateway、Plugin Bridge 策略 | Hermes patch、Memory Gateway adapter、数据迁移/恢复说明、插件记忆隔离测试 | 读写全部通过平台 API；文件外部直接修改可检测；快照不把未授权内容注入 planner 输入；Hermes 插件不能直读记忆 | 7 | P1-04、P3-01 | 五层记忆策略未最终确定；插件原生文件路径可能绕过代理 |
| P3-03 | 标准化 ExecutionPlan | P3 | `platform/contracts/execution-plan.schema.json`、`platform/adapters/hermes/` | 将 Hermes 输出转换为可校验的步骤、工具意图、预算、依赖和风险字段；把 Hermes skills/MCP/规划插件结果映射为平台 planner hint 或 `ToolIntent`；禁止自然语言最终回复 | P1-01、P3-01 | schema、转换器、样例、插件能力映射规则 | schema 校验失败时拒绝进入 Coordinator；不存在上游类型泄漏；Hermes 工具类插件不能直接执行 | 4 | P3-01 | Hermes 输出可能包含非结构化文本；插件能力语义需要平台化 |
| P3-04 | Hermes 集成和防直读验证 | P3 | `tests/integration/hermes-adapter.*`、`tests/security/hermes-memory-bypass.*`、`tests/security/hermes-plugin-bypass.*`、`tests/smoke/P3.sh` | 验证只能通过 Memory Gateway 访问记忆；验证 skills/MCP 可被平台发现，Hermes 原生工具执行和记忆直读失败 | P3-01 至 P3-03 | 集成、隔离、插件白名单和冒烟测试 | 直接文件路径、原生端口、伪造 adapter 身份、未批准插件和原生工具执行均失败；平台记忆 API PASS | 3 | P3-03 | 容器卷权限、进程身份和插件加载配置 |

### P3 阶段待确认问题

- 五层记忆是否需要跨租户共享层？如需要，审批和脱敏规则是什么？
- planner 输出是否允许模型解释字段，还是必须严格只含 ExecutionPlan？
- Hermes skills tap、Agent Plugins v1 和 MCP server 是否允许租户级启用，还是只能平台管理员全局启用？

## 5. P4 内部渠道适配器改造接入

OpenClaw 只负责多渠道消息接收、标准 TaskRequest 转换和结果出站适配。OpenClaw provider 可以复用 ClawHub/npm 渠道插件、消息插件、MCP 声明和 manifest 元数据，但必须保持 gateway-only：渠道插件不得绕过 Coordinator、Policy-Gate、Credential Center 或平台审计。

| 任务ID | 任务名称 | 所属阶段 | 涉及文件开发路径 | 修改说明 | 输入 | 输出 | 验收条件 | 预估人天 | 前置依赖 | 潜在卡点 |
|---|---|---|---|---|---|---|---|---:|---|---|
| P4-01 | OpenClaw gateway-only 改造 | P4 | `/opt/project/NexusAgent/vendor/openclaw-main/src/gateway/agent-turn/agent-request-routing.ts`、`agent-run-dispatch.ts`、`agent-run-execution-phase.ts`、`agent-turn-service.ts`、`src/channels/inbound-event/envelope.ts`；`platform/adapters/openclaw/providers/openclaw-2026.8.1/` | 按 P0 调用图隔离原生 Agent、本地工具和独立记忆；保留渠道 transport 所需入口；建立 OpenClaw provider 版本边界和渠道插件白名单机制 | P0-02 证据、Plugin Bridge 策略 | OpenClaw patch、provider 兼容说明、渠道插件白名单记录、渠道回归测试 | gateway 只产生标准消息事件；不能在无 Coordinator 授权时启动原生 Agent；provider 可禁用/回滚 | 6 | P0-02、P1 | 渠道、插件和 Agent 逻辑耦合 |
| P4-02 | OpenClaw 防腐适配器 | P4 | `platform/adapters/openclaw/` | 接收 IM/WebSocket 消息，转换为 TaskRequest；接收平台结果后做渠道输出；扫描 ClawHub/npm 插件 manifest 和 MCP 声明；不暴露 OpenClaw 类型 | P1-03、P4-01 | 渠道 adapter、PluginInventory/CapabilityDescriptor 映射表、契约测试 | 所有入站事件带租户/会话/trace 信息；出站只发送平台结果；未批准渠道插件不可启用 | 5 | P4-01 | 多渠道 payload 差异、插件 manifest 兼容和重试 |
| P4-03 | 继续/重做/取消语义映射 | P4 | `platform/adapters/openclaw/command-mapping.*`、`platform/contracts/task-request.schema.json` | 将用户指令映射为新的 attempt 或取消当前 attempt；禁止渠道自行操作底层执行 | P1-01、P4-02 | 语义映射、幂等规则、事件 | 同一消息重放不产生重复执行；取消具有可追踪结果；错误码为平台错误码 | 3 | P4-02 | 自然语言命令歧义 |
| P4-04 | 渠道防绕过和冒烟 | P4 | `tests/security/openclaw-bypass.*`、`tests/security/openclaw-plugin-bypass.*`、`tests/integration/channel-routing.*`、`tests/smoke/P4.sh` | 验证所有渠道消息经过 Policy-Gate 和 Coordinator；验证未批准插件、伪造 manifest 和原生 Agent 触发失败 | P4-01 至 P4-03 | 拦截测试、插件白名单测试、渠道集成、冒烟脚本 | 直接触发原生 Agent、伪造内部 header、未知渠道、未批准渠道插件均失败 | 3 | P4-03 | 渠道厂商网络/凭据不可用；第三方插件 fixture 维护 |

### P4 阶段待确认问题

- 首批生产渠道范围和各渠道的回调/出站凭据托管方式是什么？
- 渠道消息是否需要流式输出，还是只支持最终结果？
- OpenClaw ClawHub、npm、Git 和本地包的首批允许来源清单是什么？

## 6. P5 平台对外产品层开发

P5 只有在 P1-P4 全部验收通过后才能开始；产品层不得依赖任何底层原生概念。首版只开放管理员插件治理 API 和控制台入口：管理员可以导入、扫描、批准、启用、禁用和升级插件；租户只能启用已批准能力，不能直接从 ClawHub/npm/PyPI/GitHub 自助安装任意插件。

| 任务ID | 任务名称 | 所属阶段 | 涉及文件开发路径 | 修改说明 | 输入 | 输出 | 验收条件 | 预估人天 | 前置依赖 | 潜在卡点 |
|---|---|---|---|---|---|---|---|---:|---|---|
| P5-01 | 统一 REST/gRPC API | P5 | `product/api/`、`platform/contracts/`、`docs/contracts/openapi.yaml` | 实现任务提交/查询/取消、技能、记忆、租户、用户、权限、审批、预算和管理员插件治理 API | P0 OpenAPI、P1-P4 adapters、Plugin Bridge 策略 | API 服务、OpenAPI、PluginInventory/CapabilityDescriptor 契约、错误码和契约测试 | OpenAPI 契约测试全通过；响应不含 Hermes/OpenClaw/DSH 原生字段；插件治理 API 只暴露平台能力名、风险、权限和状态 | 10 | P1-P4 | REST/gRPC 同期交付范围待确认；插件治理范围容易外溢 |
| P5-02 | Web 管理控制台 | P5 | `product/web-console/` | 实现租户、Agent 实例、任务面板、审计、监控、技能、审批和管理员插件治理视图 | P5-01 | React/Vite 控制台、插件治理页面 | 关键操作均调用平台 API；无底层品牌/原生路径；权限不足时界面和 API 同时拒绝；插件页面不显示原生 URL/错误码/存储路径 | 12 | P5-01 | 交互/视觉规范、实时刷新策略和插件风险展示 |
| P5-03 | 渠道接入管理 | P5 | `product/channel-management/` | 管理钉钉/飞书/Telegram 等渠道配置；凭据只提交引用；调用内部 OpenClaw adapter | P5-01、P4-02 | 渠道配置页面和 API | 用户看不到 OpenClaw；凭据不回显；连接测试经过 Policy-Gate | 5 | P5-01、P4 | 外部渠道测试环境 |
| P5-04 | SDK 和开发者文档 | P5 | `product/sdk/`、`product/docs-site/`、`docs/contracts/` | 提供平台 SDK 示例、认证、任务、事件、错误、webhook 和插件治理文档 | P5-01 | SDK、示例、开发者手册、插件治理说明 | 示例可运行；只引用平台 API；契约测试覆盖文档示例；文档说明首版不支持租户自助安装第三方插件 | 5 | P5-01 | SDK 语言范围待确认 |

### P5 阶段待确认问题

- SDK 首批语言是否为 TypeScript、Python，还是需要 Java/Go？
- 控制台是否需要多语言和企业 SSO？
- 插件治理 API 是否仅管理员可用，还是需要租户管理员启用已批准能力？

## 7. P6 全平台端到端闭环集成测试

| 任务ID | 任务名称 | 所属阶段 | 涉及文件开发路径 | 修改说明 | 输入 | 输出 | 验收条件 | 预估人天 | 前置依赖 | 潜在卡点 |
|---|---|---|---|---|---|---|---|---:|---|---|
| P6-01 | 内部组件集成和基础业务闭环 | P6 | `tests/integration/`、`tests/smoke/P6.sh` | 覆盖渠道入站、任务、规划、执行、artifact、结果出站和审计 | P1-P5 | E2E 场景集、冒烟脚本 | 最小业务闭环可重复运行；所有 ID 和事件可关联 | 6 | P5-01 | 多服务时序和异步重试 |
| P6-02 | 防腐层、防绕过和越权测试 | P6 | `tests/security/` | 尝试直接访问底层端口、伪造身份、跨租户读取 artifact/记忆、跳过审批、加载未批准插件和绕过 Plugin Bridge | P1-P5 | 安全测试集、恶意插件 fixture、失败样例 | 所有绕过请求失败；审计记录包含 trace_id 和拒绝原因；恶意插件不能访问凭据、artifact、memory、底层端口或原生 agent-loop | 5 | P6-01 | 容器网络、测试身份配置和恶意插件 fixture 维护 |
| P6-03 | 故障注入和降级路径 | P6 | `tests/fault-injection/`、`tests/evaluation/` | 注入 Hermes/DSH/OpenClaw 不可用、超时、重复事件、记忆损坏、预算耗尽、插件宿主异常和 provider 破坏性返回结构 | P6-01 | 故障矩阵、三平台 provider 回滚验证、插件禁用验证、恢复和降级报告 | 关闭 Hermes 后轻量化路线仍能完成基础任务；任一 provider 或插件不可用时可按策略失败、重试、禁用或回滚；重试/退出符合策略 | 6 | P6-01 | 故障注入工具、数据清理、插件禁用和 provider 回滚状态一致性 |

### P6 阶段待确认问题

- 业务评测集的真实任务和成功率阈值是什么？
- 故障演练是否允许在共享开发环境执行，还是必须独立环境？
- 恶意插件 fixture 是否可以使用真实上游插件格式，还是使用最小 mock 插件格式？

## 8. P7 高级平台特性开发

P7 为可裁剪阶段，不得阻塞 MVP。任务分别实现元认知、主动遗忘、技能自动评测、完整 Token 预算、记忆冲突检测和定时长期任务。每个任务必须拥有独立开关、指标、回退路径和资源预算，并继续使用平台 contracts，不得重新引入 Hermes 原生能力。

| 任务ID | 任务名称 | 主要路径 | 依赖 | 验收重点 |
|---|---|---|---|---|
| P7-01 | 元认知与计划质量信号 | `platform/coordinator/`、`platform/observability/` | P6 | 有可解释指标和关闭开关 |
| P7-02 | 主动遗忘与保留策略 | `platform/memory-gateway/` | P6、记忆策略确认 | 删除/过期可审计、不可跨租户误删 |
| P7-03 | 技能自动评测回归 | `platform/`、`product/`、`tests/evaluation/` | P6 | 评测集可重复，失败不影响基础任务 |
| P7-04 | Token 预算与记忆冲突检测 | `platform/coordinator/`、`platform/memory-gateway/` | P6 | 超预算可降级，冲突可标记和人工处理 |
| P7-05 | 定时长期目标任务 | `platform/coordinator/`、`product/api/` | P6 | 取消、重试、租户隔离和审计完整 |

### P7 阶段待确认问题

- 元认知、主动遗忘和自动评测是否属于首个生产版本？
- Token 预算按租户、用户、Agent 还是任务计费？

## 9. P8 打包、部署、运维和交付物

| 任务ID | 任务名称 | 主要路径 | 产出 | 验收重点 |
|---|---|---|---|---|
| P8-01 | 生产 Compose/Kubernetes 编排 | `deploy/docker-compose.prod.yml`、`deploy/k8s/` | 一键部署包和配置模板 | 无热更新、无调试端口、内部组件不直接暴露 |
| P8-02 | CI/CD、发布和上游追踪 | `.github/workflows/`、`scripts/upstream-tracking/` | 质量门禁、版本策略、每周上游检查报告、OpenClaw/Hermes/DSH provider 兼容矩阵、插件升级门禁 | 未通过门禁不可发布；上游破坏性变更可暂停阶段；默认 provider 或插件版本切换必须可回滚 |
| P8-03 | 告警、备份和恢复 | `platform/observability/`、`docs/operations/` | SLO、告警、备份、恢复演练 | 数据恢复、artifact 完整性和审计连续性可验证 |
| P8-04 | 交付文档 | `docs/operations/`、`docs/contracts/`、`product/docs-site/` | 管理员手册、开发者 API、运维手册、升级迁移说明、三平台 provider 与插件升级/回滚手册 | 新环境按文档可部署、升级和回滚；provider 或插件替换不改变平台 API |

### P8 阶段待确认问题

- 正式交付是否同时包含单机 Compose 和 Kubernetes？
- 生产备份的 RPO/RTO、保留期和加密标准是什么？
- 第三方插件许可证、NOTICE、再分发和商业使用是否需要法务逐项确认？

## 10. 总排期汇总

| 阶段 | 主要工作 | 预估人天 | 前置依赖 | 里程碑交付物 | 风险等级 | 是否可裁剪 |
|---|---|---:|---|---|---|---|
| P0 | 快照、三种剥离实验、接口摸底、OpenAPI、服务蓝图、排期基线、AI 排期提示词模板、任务提示词文档 | 24 | 无 | P0 可行性报告、vendor、OpenAPI 初稿、十个基础服务蓝图、开发排期、AI 排期提示词模板、任务提示词文档库 | 极高 | 否 |
| P1 | 平台内核和开发编排 | 32 | P0 | Coordinator、Policy-Gate、Compose、公共契约 | 高 | 否 |
| P2 | DSH executor-only 和接入 | 19 | P1、P0-04 | DSH adapter、provider registry、沙箱和拦截测试 | 极高 | 否，失败时触发回退 |
| P3 | Hermes planner-only 和记忆代理 | 20 | P1、P0-03 | Hermes adapter、Memory Gateway、skills/MCP 白名单 | 极高 | 可降级下线 Hermes |
| P4 | OpenClaw gateway-only 和渠道接入 | 17 | P1、P0-02 | OpenClaw adapter、渠道插件白名单、渠道测试 | 高 | MVP 可先保留一个渠道 |
| P5 | API、控制台、SDK | 32 | P1-P4 | 对外平台产品、管理员插件治理入口 | 中 | 控制台高级页可延后 |
| P6 | E2E、安全、故障和降级 | 17 | P5 | 闭环测试报告、provider/插件回滚验证 | 高 | 否 |
| P7 | 高级特性 | 20 | P6 | 可选能力包 | 中 | 是 |
| P8 | 生产交付和运维 | 20 | P6，P7 可选 | 部署包、交付手册、provider/插件兼容矩阵 | 高 | Kubernetes 可分批 |
| **合计** |  | **201** |  |  |  |  |

## 11. 团队分工建议

| 角色 | 责任 |
|---|---|
| 平台内核团队 | Coordinator、Policy-Gate、contracts、状态机、事件、时钟、租户/RBAC、审计 |
| 上游改造团队 | DSH/Hermes/OpenClaw 源码剥离、补丁、上游测试和版本追踪 |
| 产品 API 团队 | REST/gRPC、OpenAPI、SDK、认证、错误码和契约测试 |
| 前端团队 | React/Vite 控制台、租户/任务/审计/监控/技能/渠道页面 |
| 测试与评测团队 | 单元、集成、契约、安全、防绕过、故障注入和业务评测集 |
| DevOps/SRE | Compose/Kubernetes、CI/CD、观测、告警、备份、恢复和发布 |
| 架构/产品负责人 | P0 否决、待确认问题裁决、阶段门禁和降级决策 |

## 12. 风险登记册

| 风险描述 | 影响等级 | 触发条件 | 缓解措施 | 止损回退方案 |
|---|---|---|---|---|
| DSH 预览版接口变动 | 极高 | package、插件、session、sandbox、artifact 或 tool-call 接口破坏性变更 | 固定 vendor 快照；每周检查 release；adapter 隔离类型；P2 实现 provider registry；P6 验证回滚；P8 建立兼容矩阵 | 暂停默认 provider 切换，回滚上一版 provider；必要时切换已验证执行后端或保留平台外壳 |
| 任一剥离实验失败 | 极高 | Agent Loop/网关/工具无法隔离 | P0 独立实验和否决门 | 下线 Hermes，使用 OpenClaw + DSH 轻量化平台 |
| 原生能力泄漏 | 极高 | 外部响应出现上游类型、URL、错误码或记忆路径 | schema 白名单、出口扫描、端口隔离和防绕过测试 | 关闭暴露服务，回滚到最近通过门禁的适配器 |
| 防腐适配器被绕过 | 极高 | 直接端口/内部 header/伪造身份可调用底层 | 网络 deny-by-default、Policy-Gate、负向测试 | 隔离底层容器，阻断发布 |
| 跨栈联调超时 | 高 | Node/Python 事件或取消语义不一致 | 明确事件信封、超时、重试和 trace_id | 先交付同步最小闭环，延后流式能力 |
| 记忆脏数据或快照漂移 | 高 | 并发写入、外部编辑、恢复失败 | Memory Gateway 单写、版本、漂移检测、备份 | 只读记忆并关闭自动写入 |
| 性能或 Token 超标 | 高 | p95 延迟、队列长度或 token 预算超阈值 | 预算门、采样、降级、压测和指标 | 关闭高级记忆/元认知，保留基础任务 |
| 凭据明文泄漏 | 极高 | 日志、事件或 artifact 出现 secret | 只传 credential reference；日志脱敏；安全测试 | 立即轮换凭据并阻断相关渠道 |
| 上游许可证/NOTICE 不清 | 高 | 再分发或修改条款无法确认 | P0 法务检查和第三方声明清单 | 暂停交付相关组件 |
| 服务边界不清导致产品层泄漏上游概念 | 极高 | 控制台、API、SDK、日志或错误码出现 Hermes/OpenClaw/DSH 原生类型 | 服务蓝图、契约白名单、adapter 出口扫描、代码评审 | 冻结 P5，对泄漏路径回退到 adapter 层重构 |
| 第三方插件绕过平台权限 | 极高 | 未批准插件、伪造 manifest、原生宿主直连或插件绕过 Policy-Gate 成功 | Plugin Bridge 白名单、deny-by-default、能力描述符、恶意插件 fixture 和防绕过测试 | 禁用插件宿主，回滚到最近批准插件清单 |
| 第三方插件凭据或产物泄漏 | 极高 | 插件 config、MCP env、stdout/stderr、日志、事件或 artifact 出现明文凭据或原生路径 | Credential Center 引用、日志脱敏、artifact 入库、出口扫描和审计 | 立即禁用插件、轮换凭据、隔离受影响租户 |
| 插件更新破坏兼容 | 高 | OpenClaw/Hermes/DSH 插件升级导致 capability descriptor、provider binding 或原生宿主启动失败 | provider/插件兼容矩阵、升级门禁、上一版 binding 保留 | 暂停插件升级并回滚上一版 binding |
| 外部基础设施选型过早锁死 | 高 | P1/P8 前未确认企业标准却绑定具体消息、密钥、存储或观测产品 | 服务蓝图只给候选项目；P1 保留抽象接口；P8 前完成正式选型 | 回退到接口兼容层，替换底层实现 |
| 团队容量低于排期基线 | 高 | 实际投入人数、关键角色或节假日安排低于基线假设 | 每周排期复盘；P2-P4 分批执行；P5 高级控制台和 P7 延后 | 保留 P0-P6 MVP 主线，移动非关键路径功能 |
| AI 自动排期遗漏高危约束 | 高 | 生成的阶段/任务提示词缺少只读目录、上游不可见、防绕过、待确认问题或验收命令 | 使用 AI 排期提示词模板；每次自动填充后做约束扫描；阶段复盘记录偏差 | 暂停使用自动生成提示词，回退人工排期审核 |
| 任务修改审计记录缺失 | 高 | 开始实现前未填写修改前分析，完成后未记录测试、风险、回滚和遗留事项 | 在每个任务提示词文档生成固定“修改记录包”；P0 smoke 检查模板存在；阶段门禁抽查填写完整性 | 暂停阶段门禁，补齐审计记录和证据后再继续 |

## 13. 裁剪策略与降级路线

### MVP 必选模块

P0 快照/可行性、P1 Coordinator/Policy-Gate/公共契约/审计、P2 DSH executor、P4 至少一个渠道、P5 任务 API、基础租户/RBAC、artifact、基础控制台和 P6 闭环/安全测试是 MVP 必选项。

### 可延后能力

元认知、主动遗忘、技能自动评测、复杂记忆冲突处理、长期目标调度、多渠道批量管理、完整 gRPC SDK、Kubernetes 高级运维能力可延后到 P7/P8 增量交付。

### 轻量化回退

满足以下任一条件时，保留平台外壳、Coordinator、Policy-Gate、Artifact Store、租户/RBAC、审计和 OpenClaw/DSH 两层能力，下线 Hermes：

- Hermes planner-only 或 Memory Gateway 实验不通过。
- Hermes 原生记忆无法完全封装。
- Hermes 性能/Token 成本超过批准阈值。
- Hermes 上游变更导致维护成本超过止损阈值。

回退必须保留同一平台 API 和任务标识，不能让终端用户感知底层实现切换。

若 DSH 当前 provider 因上游破坏性更新、沙箱缺陷或防绕过失败无法继续作为 executor，则不得把 DSH 原生接口临时暴露给产品层。处理顺序为：先回滚到上一版已验证 provider；回滚失败时切换到经 P2/P6 门禁验证的替代 executor provider；仍不可用时暂停执行型任务，仅保留任务接收、审批、审计、artifact 查询和人工处理路径。

若第三方插件导致权限绕过、凭据泄漏、许可证风险或兼容破坏，处理顺序为：立即禁用对应 `NativeHostBinding`；保留平台 API 和已批准能力清单；回滚到上一版 `PluginInventory`；必要时只保留内置渠道、内置 skills 和内置 DSH 工具。

## 14. 阶段完成与阻塞判定

### 完成条件

阶段完成必须同时满足：任务清单全部有结果；代码/文档产物存在；质量门禁通过；阶段冒烟脚本输出 PASS；依赖阶段的验收证据已归档；待确认问题已关闭或明确责任人/截止时间；风险登记册已更新；对应任务 ID 文档中的“修改记录包”已按修改前、修改过程、修改后验证三段补齐。

### 阻塞条件

出现以下情况不得标记完成：核心接口没有可重复验收命令；绕过平台的负向测试通过；任一关键 ID 或事件无法追踪；生产配置仍启用热更新/调试端口；测试失败被跳过；上游行为仅凭推测记录；对应任务 ID 文档缺少修改记录包或审计字段仍为空。

连续三个工作日无法解决、且没有替代实现或回退路径的问题，必须提交架构负责人进行降级/止损决策；P0 级阻塞直接暂停后续阶段。

## 一页管理层极简摘要

目标：交付一个对外独立的 AI Agent 平台，统一 API、控制台、渠道、任务、技能、记忆、租户和审计；Hermes、OpenClaw、DSH 仅作为内部实现依赖。十个基础服务的功能和整合边界已在服务蓝图中单独维护，开发日历和资源假设已在排期基线中维护，后续 AI 排期自动填充使用统一提示词模板。

里程碑：P0 验证三种剥离可行性；P1 建成平台内核；P2-P4 接入内部执行/规划/渠道组件；P5 交付用户产品；P6 完成安全和端到端闭环；P8 完成生产交付。

主要风险：DSH 预览版接口变化、三种剥离失败、底层能力泄漏、防腐层绕过、第三方插件绕过/泄漏、记忆脏数据、跨栈联调和 Token/性能超标。DSH 风险按可替换 executor provider 管理，插件生态按 Plugin Bridge 白名单治理，平台 API 不随上游或插件版本变化。

MVP 时间窗口：按 201 人天工程估算，P0-P6 为首个可用平台基线；当前排期从 2026-08-24 启动，MVP 候选在 2026-11-27 冻结，生产交付候选在 2026-12-24 冻结。实际日历时间取决于团队规模、上游变更、渠道凭据和待确认问题关闭时间。若 Hermes 剥离失败，沿轻量化 OpenClaw + DSH 路线保留平台外壳交付。
