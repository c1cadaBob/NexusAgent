# 项目文档

## 文档分阶段维护

规划文档遵循“两轮写入”流程：

1. 第一轮只提交目录、章节标题、任务表头、占位符和文档维护规则。
2. 第二轮及以后按 P0 到 P8 的依赖顺序逐阶段深化，并同步更新契约、追踪矩阵、风险登记册和冒烟脚本。

禁止把未经源码验证的行为写成确定事实。无法从当前源码确认的内容必须标记为【待确认问题】。

## 目录

- [完整实施规划](planning/integrated-platform-plan.md)
- [开发排期基线](planning/development-schedule.md)：P0-08 基线，覆盖 P0-P8 日历、MVP/生产边界、关键路径、容量假设、阶段门禁和自动重排触发器。
- [待确认问题集中台账](planning/open-questions-register.md)：P0-09 基线，统一登记仍未关闭的问题、状态、责任工作流、确认结论和解决说明文档位置。
- [待确认问题确认文件](planning/open-questions/README.md)：按 P0/P1/P2/P3/P4/P5/P6/P8 承接全部 `OQ-*`，保存推荐处理方式、默认解决方案、三平台影响分析和关闭证据。
- [P0 阶段门禁报告](planning/phase-gates/P0-gate-review.md)：P0 门禁收口，关闭 4 个 P0 到期 `OQ-*`，并列明仍为 `自动确认` 的后续阶段问题。
- [P1 阶段门禁报告](planning/phase-gates/P1-gate-review.md)：P1 门禁收口，确认 P1-01 至 P1-06 完成，列明仍为 `自动确认` 的 P1/P8 基础设施和 API 问题及后续承接任务。
- [P2 阶段门禁报告](planning/phase-gates/P2-gate-review.md)：P2 门禁收口，确认 P2-01 至 P2-04 完成，列明 DSH provider、sandbox、artifact、防绕过和回滚证据，以及仍为 `自动确认` 的 P2/P6/P8 问题。
- [P3 阶段门禁报告](planning/phase-gates/P3-gate-review.md)：P3 门禁收口，确认 P3-01 至 P3-04 完成，列明 Hermes planner-only、Memory Gateway、ExecutionPlan、Plugin Bridge 最小证据，以及仍为 `自动确认` 的 P3/P5/P6/P8 问题。
- [P4 阶段门禁报告](planning/phase-gates/P4-gate-review.md)：P4 门禁收口，确认 P4-01 至 P4-04 完成，列明 OpenClaw gateway-only、channel 防腐、command mapping、渠道防绕过和仍为 `自动确认` 的 P4/P5/P6/P8 问题。
- [P5 阶段门禁报告](planning/phase-gates/P5-gate-review.md)：P5 门禁收口，确认 P5-01 至 P5-04 完成，列明 REST-first API、Web 控制台、渠道管理、TypeScript SDK、开发者文档站、插件治理和仍为 `自动确认` 的 P5/P6/P8 问题。
- [P6 阶段门禁报告](planning/phase-gates/P6-gate-review.md)：P6 门禁收口，确认 P6-01 至 P6-03 完成，列明基础业务闭环、防腐层/防绕过、故障注入、降级路线、provider 回滚、plugin rollback、真实 dev service lifecycle drill 和仍为 `自动确认` 的 P6/P8 问题。
- [AI 排期提示词模板](planning/ai-schedule-prompt-template.md)
- [任务实施规划提示词索引](planning/task-prompts/README.md)
- [子 Agent 角色记忆](agents/README.md)：P0-01 基线，固化长期协作角色、只读上游边界、交接格式和各角色常读资料，避免上下文压缩或交接后遗忘项目约束。
- [对外 API 契约](contracts/openapi.yaml)
- [Plugin Bridge 平台契约](../platform/contracts/plugin-inventory.schema.json)
- [P1 公共契约与任务状态机](../platform/contracts/task-state.schema.json)：P1-01 基线，覆盖统一 ID、TaskRequest、TaskState、EventEnvelope、Artifact/Credential 引用和状态转移测试。
- [P1 Coordinator 与 Policy-Gate](../platform/coordinator/index.ts)：P1-02 基线，覆盖任务接收、受控 adapter 路由、租户/RBAC/预算/审批校验、决策日志和防绕过测试。
- [P1 Clock、Event Bus 与 Adapter 抽象](../platform/event-bus/index.ts)：P1-03 基线，覆盖统一单调时钟、内存事件总线、adapter lifecycle、mock lifecycle 和防绕过测试。
- [P1 Artifact、Memory 与 Credential 数据服务](../platform/artifact-store/index.ts)：P1-04 基线，覆盖本地 artifact 引用、五层 Memory Gateway、Credential Center 引用/脱敏和租户隔离测试。
- [P1 Tenancy、RBAC、Audit 与 Observability](../platform/tenancy/index.ts)：P1-05 基线，覆盖租户边界、角色权限、hash-chain 审计、trace/health/metrics/logs 本地接口和安全拒绝测试。
- [P1 开发编排与端口基线](architecture/ports.md)：P1-06 基线，覆盖 10 个开发服务、3050-3059 连续服务端口、9250-9259 调试宿主机端口、源码卷、热更新、健康检查和平台错误码一致性 smoke。
- [P2 DSH executor provider registry](../platform/adapters/dsh/index.ts)：P2-01 基线，固定 `dsh-0.1.1-rc.2` 默认 provider，覆盖 provider 启用/禁用、默认切换、回滚、native loop 阻断和 `tests/smoke/P2.sh`。
- [P2 DSH 防腐适配器](../platform/adapters/dsh/index.ts)：P2-02 基线，覆盖平台 `ExecutionRequest` / `ExecutionResult` schema、`DshExecutorAdapter`、provider 内部映射、contract fixture、Coordinator/Policy-Gate 集成和原生字段清洗测试。
- [P2 DSH 沙箱、Artifact 与执行事件](../platform/adapters/dsh/index.ts)：P2-03 基线，覆盖 `resource_budget`、sandbox/network 静态门禁、stdout/stderr 脱敏入库、`ArtifactReference` 追踪和 adapter execution/sandbox Event Bus 事件。
- [P2 DSH 集成、防绕过与回滚](../platform/adapters/dsh/index.ts)：P2-04 基线，覆盖直接调用/伪造决策/native payload/raw credential 拒绝、dev/prod 端口隔离静态校验和 provider failover/rollback 测试。
- [P3 Hermes planner provider registry](../platform/adapters/hermes/index.ts)：P3-01 基线，固定 `hermes-0.20.5` 默认 planner-only provider，覆盖 provider 启用/禁用、默认切换、回滚、原生 gateway 阻断和 `tests/smoke/P3.sh`。
- [P3 Hermes Memory Gateway 代理化](architecture/hermes-memory-gateway-migration.md)：P3-02 基线，覆盖内部 memory proxy schema、三层 planner scope、snapshot sanitizer、`expected_version` conflict、vendor proxy helper 和缺 scope fail-closed。
- [P3 Hermes ExecutionPlan 标准化](../platform/contracts/execution-plan.schema.json)：P3-03 基线，覆盖严格 `nexus.execution_plan.p3.v1`、平台 ID、steps、ToolIntent、budget、dependencies、risks、memory_context、planner adapter validator 和泄漏负向测试；P0 marker 仅作为历史证据保留。
- [P3 Hermes 集成、防直读与 Plugin Bridge guard](../platform/adapters/hermes/plugin-bridge.ts)：P3-04 基线，覆盖 planner+memory 组合 adapter、Memory Gateway 防直读、防原生端口静态隔离和 approved skill/MCP 到 sanitized planner hint 的最小准入验证。
- [P4 OpenClaw 防腐 channel adapter](../platform/adapters/openclaw/index.ts)：P4-02 基线，覆盖 channel inbound 到平台 `TaskRequest`、平台最终结果到 queued send intent、ClawHub/npm PluginInventory 映射和 channel 泄漏负向测试。
- [P4 OpenClaw 命令语义映射](../platform/adapters/openclaw/command-mapping.ts)：P4-03 基线，覆盖 continue/redo/cancel 明确命令到平台 `TaskCommand`、Coordinator 幂等、redo attempt、cancel event 和原生命令绕过拒绝。
- [P4 OpenClaw 渠道防绕过门禁](../tests/security/openclaw-bypass.test.mjs)：P4-04 基线，覆盖 approved channel routing、direct invoke/伪造 trust/header、未知渠道、identity mismatch、native Agent/tool/memory/task/cancel、raw credential、native URL/path/session/error、plugin subagent 和未批准 manifest fail-closed。
- [P5 平台 REST API](../product/api/index.ts)：P5-01 基线，覆盖无新增 npm 依赖的 REST app factory、任务/记忆/审批/预算/租户/RBAC/插件治理 API、平台中性 Plugin Governance 投影、OpenAPI 契约测试和公共响应泄漏门禁。
- [P5 渠道接入管理](../product/channel-management/README.md)：P5-03 基线，覆盖租户级渠道配置 API、控制台 Channels 页面、凭据引用不回显、连接测试 dry-run、approved channel allowlist 和产品公共面泄漏门禁。
- [P5 TypeScript SDK](../product/sdk/README.md)：P5-04 基线，覆盖 TypeScript-only SDK、平台 `/v1/*` client、可运行 examples、平台错误映射和 SDK/OpenAPI 契约测试。
- [P5 开发者文档站](../product/docs-site/README.md)：P5-04 基线，覆盖 Vite React docs-site、OpenAPI route matrix、SDK method catalog、webhook/streaming 延后说明和产品公共面泄漏门禁。
- [P6 基础业务闭环测试](../tests/integration/p6-business-closed-loop.test.mjs)：P6-01 基线，覆盖 deterministic in-process channel inbound、TaskState/Coordinator、Hermes memory/planning、DSH execution/artifact、OpenClaw outbound queued send intent 和 Event Bus/audit timeline 关联。
- [P6 防腐层与恶意插件隔离测试](../tests/security/p6-anti-corruption-bypass.test.mjs)：P6-02 基线，覆盖 direct adapter invoke、伪造 Policy-Gate/trusted header、跨租户 artifact/memory/credential、审批/预算绕过、底层端口静态扫描、双格式恶意插件 fixture、`policy.denied` event 和 `api.request.denied` audit evidence。
- [P6 故障注入与降级测试](../tests/fault-injection/p6-provider-recovery.test.mjs)：P6-03 基线，覆盖 P6 fault injection matrix、Hermes disabled seeded platform plan lightweight route、DSH canary throw/timeout/resource exhaustion、duplicate events dead-letter、memory conflict 和 payload 清洗。
- [P6 provider/plugin 回滚测试](../tests/fault-injection/p6-plugin-provider-rollback.test.mjs)：P6-03 基线，覆盖 Hermes/OpenClaw/DSH provider 回滚、`LocalPluginGovernance` approve/disable/reject、plugin rollback 和 capability visibility。
- [P6 真实服务演练](../tests/fault-injection/p6-real-service-drill.sh)：P6-03 Docker Compose dev lifecycle drill，停止 Hermes 后验证 OpenClaw + DSH 基础服务仍健康并可恢复。
- [服务功能与整合蓝图](architecture/service-blueprint.md)：P0-07 基线，覆盖十个基础服务的功能、技术栈、输入输出、复用边界、参考项目和 P1 工作包。
- [DSH 版本兼容与替换策略](architecture/dsh-versioning-and-replacement.md)
- [上游版本适配与社区插件复用桥接策略](architecture/upstream-versioning-and-plugin-bridge.md)
- [需求追踪矩阵](traceability/requirements-matrix.md)
- [开发端口规划](architecture/ports.md)
- [测试策略](testing/strategy.md)
- [远端上传与关键节点提交规则](operations/remote-upload-policy.md)
- [风险登记册](risks/risk-register.md)
- [上游接口摸底](architecture/upstream-interface-inventory.md)

## P0 架构基线关系

- P0-01 的 [子 Agent 角色记忆](agents/README.md) 定义 Program Lead、Upstream Snapshot Engineer、Platform Core Engineer、Security Quality Engineer 和 Product Delivery Engineer 五类长期角色；后续子 agent 开工前必须读取对应角色文档和当前任务修改记录包。
- P0-05 的 [上游接口摸底](architecture/upstream-interface-inventory.md) 定义三大上游入口的保留、隔离和禁止分类。
- P0-06 的 [对外 API 契约](contracts/openapi.yaml) 定义只包含平台概念的 REST OpenAPI 初稿和平台错误码草案。
- P0-07 的 [服务功能与整合蓝图](architecture/service-blueprint.md) 把十个基础服务映射到 P1 最小交付、P2-P4 上游接入和 P5 产品化能力。
- P0-08 的 [开发排期基线](planning/development-schedule.md) 把 P0-P8 转换为日历排期、周计划、关键路径、资源容量和阶段门禁，并保留团队容量、节假日和冻结窗口为【待确认问题】。
- P0-09 的 [待确认问题集中台账](planning/open-questions-register.md) 是后续 AI 排期、任务提示词和阶段门禁的未关闭问题索引；状态流为 `打开`、`自动确认`、`人工确认`、`已关闭`。[待确认问题确认文件目录](planning/open-questions/README.md) 是推荐处理方式、默认解决方案、三平台影响和关闭证据的保存位置。问题关闭后必须回写台账确认结论、解决说明文档和关闭任务/commit；需要加入开发排期的问题必须同步更新 `planning/task-prompts/` 对应阶段提示词。
- P0-10 的 [任务提示词生成器](../scripts/planning/generate-task-prompts.py) 默认只执行 `--check` 覆盖率和治理校验；显式 `--write` 才创建缺失文档，`--write --overwrite` 才允许覆盖已有人工优化提示词。生成器校验 45 个任务 ID、差异化角色、审计记录、集中台账、确认文件目录和阶段历史问题回扫规则。
- P0-11 的 [实时规划提示词](planning/task-prompts/P0/P0-11.md) 已把 P0-01 至 P0-08 已 `自动确认` 但尚未同步的问题回写到对应任务文档，形成 OQ ID、确认文件和未关闭状态的同步矩阵；实时规划任务必须先填写“修改前分析”，先处理待确认问题，再进入后续实现。
- P0 阶段门禁的 [阶段门禁报告](planning/phase-gates/P0-gate-review.md) 已关闭 `OQ-UPSTREAM-004`、`OQ-SCHEDULE-001`、`OQ-SCHEDULE-002`、`OQ-CHANNEL-001`；其余 19 个问题仍为 `自动确认`，按 P1-P8 后续最晚确认阶段继续关闭。
- P1 阶段门禁的 [阶段门禁报告](planning/phase-gates/P1-gate-review.md) 已确认 P1-01 至 P1-06 全部完成并通过 P1 smoke；P1 相关 `OQ-INFRA-*`、`OQ-API-001` 和 `OQ-DEPLOY-001` 仍保持 `自动确认`，已映射到 P5/P6/P8 后续任务继续关闭。
- P2 阶段门禁的 [阶段门禁报告](planning/phase-gates/P2-gate-review.md) 已确认 P2-01 至 P2-04 全部完成并通过 P2 smoke；P2 相关 `OQ-UPSTREAM-003`、`OQ-DSH-001` 和 `OQ-DSH-002` 仍保持 `自动确认`，已映射到 P6/P8 后续故障注入、生产 sandbox、sidecar 权限和上游追踪任务继续关闭。
- P3-01 已完成 Hermes planner-only provider 最小基线并通过 `tests/smoke/P3.sh` 纳入门禁；P3-02 已把 planner-only 记忆读取和受控写入代理到 Memory Gateway，验证三层 scope、sanitizer、缺 scope fail-closed 和原生文件 drift 回归；P3-03 已把当前 planner 输出升级为严格 `nexus.execution_plan.p3.v1` 并禁止解释字段、自然语言 final response 和原生 URL/session/path/error/raw credential；P3-04 已补 Hermes planner+memory 组合验证、Memory Gateway 防直读、防原生端口静态隔离和 Plugin Bridge 最小 approved skill/MCP planner hint 准入。P3 相关 `OQ-UPSTREAM-001`、`OQ-MEMORY-002` 和 `OQ-PLUGIN-001` 仍保持 `自动确认`，最终 upstream 来源、生产 Memory Gateway 存储/检索和完整插件治理继续由 P5/P6/P8 关闭。
- P3 阶段门禁的 [阶段门禁报告](planning/phase-gates/P3-gate-review.md) 已确认 P3-01 至 P3-04 全部完成并通过 P0-P3 smoke；P3 相关自动确认问题已映射到 P5/P6/P8 后续插件治理、生产 Memory、sidecar/OS 隔离和上游追踪任务继续关闭。
- P4-01 已完成 OpenClaw gateway-only provider 最小基线：`openclaw-2026.8.1` 默认 provider registry 支持禁用/回滚，`OpenClawGatewayAdapter` 只能通过 Coordinator/Policy-Gate trusted invocation 接收内部 `nexus.openclaw_gateway_event.p4.v1`，vendor gateway-only guard 拒绝 native payload，Plugin Bridge 最小准入只开放 approved 钉钉/飞书/Telegram channel capability 和 message transform；`tests/smoke/P4.sh` 已纳入 P4-01 provider、plugin、network isolation 和公共泄漏扫描。P4-02 已补内部 `nexus.openclaw_channel_inbound.p4.v1` / `nexus.openclaw_channel_outbound.p4.v1` 防腐契约，把 approved inbound 转为平台 `TaskRequest`，把平台最终结果转为 queued channel send intent，并将 ClawHub/npm manifest 映射为平台 `PluginInventory` / `CapabilityDescriptor`。P4-03 已新增 `nexus.openclaw_command_mapping.p4.v1` 和 Coordinator `submitTaskCommand()`，把明确 continue/redo/cancel 命令映射为平台 attempt/task 语义，覆盖幂等重放、redo attempt、cancelled 事件和原生命令绕过拒绝。P4-04 已新增 approved channel routing 集成和集中防绕过测试，验证 direct invoke、伪造 trust/header、未知渠道、identity mismatch、native payload、raw credential、native URL/path/session/error、plugin subagent 和未批准 manifest 均 fail closed，并把 P4-04 纳入 `tests/smoke/P4.sh`。真实厂商出站发送、streaming、Git/local 插件来源和完整插件治理留给 P5/P6/P8。`OQ-UPSTREAM-002` 与完整 `OQ-PLUGIN-001` 仍保持 `自动确认`。
- P4 阶段门禁的 [阶段门禁报告](planning/phase-gates/P4-gate-review.md) 已确认 P4-01 至 P4-04 全部完成并通过 P0-P4 smoke；P4 相关自动确认问题已映射到 P5/P6/P8 后续真实渠道发送、生产 sidecar/凭据隔离、插件治理、streaming 决策和上游追踪任务继续关闭。
- P5-01 已完成 REST-first 平台 API Alpha：`product/api/index.ts` 暴露 health、tasks、skills、capabilities、memory、tenants/users/permissions、approvals、budget 和 admin plugin governance；`platform/plugin-governance/index.ts` 将既有 Plugin Bridge 证据投影为平台能力/插件清单，公共 API 不返回 source_ref、provider binding、runtime、session、URL/path 或 secret material。P5-02 已新增独立 React/Vite Web 控制台 Alpha：`product/web-console/` 只调用 `/v1/*` 平台 API，覆盖 overview、tenants/users、agent summary、tasks/events/cancel/retry、approvals、skills/capabilities、memory、budget 和管理员插件治理；控制台采用手动刷新 + 15 秒轮询，不接 streaming、真实 SSO 或多语言。P5-03 已新增 `platform/channel-management/`、`/v1/channels*` 和控制台 Channels 页面，租户管理员可管理 approved channel 配置，连接测试只做平台 dry-run，公共响应只显示 `credential_status`。P5-04 已新增 TypeScript-only SDK、可运行 examples 和 Vite React 开发者文档站，SDK/docs 仅引用平台 `/v1/*` API，webhook delivery 和 streaming 继续文档化延期。`tests/smoke/P5.sh` 已纳入 P5-01/P5-02/P5-03/P5-04 contract/integration/security tests、SDK/docs/web-console build、产品 API/控制台/渠道管理/SDK/docs 上游术语泄漏扫描和审计记录检查。gRPC/protobuf、streaming、生产 IdP/SSO、真实渠道网络和其他 SDK 语言继续由 P8 或后续任务承接。
- P5 阶段门禁的 [阶段门禁报告](planning/phase-gates/P5-gate-review.md) 已确认 P5-01 至 P5-04 全部完成并通过 P0-P5 smoke；P5 相关自动确认问题已映射到 P6/P8 或后续 SDK 批次继续关闭，REST Alpha、控制台、渠道管理、TypeScript SDK、docs-site 和管理员插件治理公共面已完成收口。
- P6-01 已新增基础业务闭环门禁：`tests/integration/p6-business-closed-loop.test.mjs` 使用同一 `ManualClock`、`InMemoryEventBus`、`PolicyGate`、`Coordinator`、`LocalMemoryGateway`、`LocalArtifactStore` 和 OpenClaw/Hermes/DSH adapters，验证 approved channel inbound 到任务、memory/planning、execution/artifact、outbound queued send intent 与 audit timeline 可通过统一 ID 串联；`tests/smoke/P6.sh` 已纳入 required files、审计无占位、OQ-INFRA-006/OQ-PRODUCT-001 默认结论、TaskState/Coordinator、P7 高级能力延后、Date.now 禁用和 targeted E2E。P6-02 已新增防腐层、防绕过、越权和恶意插件隔离门禁：三组 `tests/security/p6-*.test.mjs` 验证 direct adapter invoke、伪造 Policy-Gate/trusted header、跨租户 artifact/memory/credential、审批/预算绕过、底层端口静态扫描和“双格式覆盖”恶意插件 fixture 均 fail closed；`policy.denied` event 与 `api.request.denied` audit record 提供 `trace_id` 和拒绝原因。P6-03 已新增故障注入与降级路线门禁：`tests/fault-injection/p6-provider-recovery.test.mjs` 验证 Hermes disabled 时 seeded platform plan lightweight route、DSH canary throw/timeout/resource exhaustion、duplicate/dead-letter 和 memory conflict，`tests/fault-injection/p6-plugin-provider-rollback.test.mjs` 验证 provider 回滚与 plugin rollback，`tests/fault-injection/p6-real-service-drill.sh` 执行真实 Docker Compose dev service lifecycle drill；`docs/planning/phase-gates/P6-gate-review.md` 已列明 P6-01/P6-02/P6-03 完成状态和不阻塞 P7/P8 的理由。真实业务评测集、真实渠道网络、生产 durable workflow、生产 sidecar/OS 隔离、插件升级兼容矩阵和发布运维手册继续由 P8 或后续任务关闭。
- P6 阶段门禁的 [阶段门禁报告](planning/phase-gates/P6-gate-review.md) 已确认 P6-01 至 P6-03 全部完成并通过 P0-P6 smoke；P6 相关自动确认问题已映射到 P8 或后续生产化任务继续关闭，MVP 必需的基础闭环、安全、防绕过、故障注入、降级路线、provider 回滚和插件禁用验证已完成收口。
- 每个阶段结束前必须回扫当前阶段及其之前阶段的未处理问题、任务修改记录包、风险登记册和需求追踪矩阵；如果仍有未处理或未同步问题，必须先修复或创建后续实时规划提示词，再判断是否允许进入下一阶段。

所有文档使用 UTC 时间、平台统一标识和平台层术语。Hermes、OpenClaw、DSH 只在内部实现、适配器、风险和源码追踪语境中出现。

执行任一任务前后，必须在 `planning/task-prompts/{阶段}/{任务ID}.md` 中填写“修改记录包”。阶段门禁不得接受缺少修改前分析、修改过程记录或修改后验证总结的任务。
