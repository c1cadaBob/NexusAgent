# P3 阶段门禁报告

> 文档状态：P3 阶段门禁收口。
>
> 评审日期 UTC：2026-08-25。
>
> P3 任务完成基线 commit：09fb27de5492f4c53c92764b66cee8e14b68c589。

## 1. 门禁结论

P3 阶段自身允许收口。P3-01 至 P3-04 已在 `main` 上完成，Hermes planner-only provider registry、Memory Gateway proxy、严格 `ExecutionPlan`、组合 adapter、防直读、防原生端口和最小 Plugin Bridge 准入 guard 均已纳入 `tests/smoke/P3.sh`。

门禁依据：

- 项目主线为 `main`，P3-04 完成后已推送 `origin/main`，本轮回扫开始时本地与远端同步。
- P0、P1、P2、P3 smoke 均通过，说明 P3 收口未破坏早期 vendor、规划、公共契约、P1 平台内核、DSH executor-only 或 Hermes planner-only 门禁。
- P3 只修改 NexusAgent 仓库内 `platform/`、`tests/`、`docs/` 和 `vendor/MANIFEST.yaml` 记录，未修改 `/opt/project/hermes-agent-main` 原始上游目录。
- 当前不存在 `打开` 或 `人工确认` 的待确认问题；P3 相关问题仍为 `自动确认`，已记录默认方案、P3 最小证据和 P5/P6/P8 后续关闭路径，不阻塞 P3 自身收口。
- P3 完成不等于 P2-P4 三组件总里程碑完成；P4 OpenClaw gateway adapter 仍需完成并通过阶段门禁后，才能满足 M2 内部三组件接入总门禁。

## 2. P3 任务完成状态

| 任务ID | 门禁状态 | 证据 |
|---|---|---|
| P3-01 | 通过 | `platform/adapters/hermes/index.ts`、`tests/unit/hermes-provider-registry.test.mjs`、vendor planner-only guard tests 和 P3 smoke 覆盖 `hermes-0.20.5` 默认 provider、启用/禁用、默认切换、回滚、native gateway/tool/loop 阻断和清洗后的 provider status view。 |
| P3-02 | 通过 | `HermesMemoryGatewayAdapter`、`platform/memory-gateway/index.ts`、`vendor/hermes-agent-main/agent/nexus_memory_gateway_proxy.py`、`tests/unit/memory-gateway-p3.test.mjs`、`tests/integration/hermes-memory-gateway-adapter.test.mjs` 和 `tests/security/hermes-memory-isolation.test.mjs` 覆盖三层 planner scope、snapshot/query/write、`expected_version` conflict、sanitizer、trusted invocation 和缺 scope fail closed。 |
| P3-03 | 通过 | `platform/contracts/execution-plan.schema.json`、`HermesExecutionPlanAdapter`、`tests/unit/hermes-execution-plan-contract.test.mjs`、`tests/integration/hermes-execution-plan-adapter.test.mjs` 和 `tests/security/hermes-execution-plan-leakage.test.mjs` 覆盖严格 `nexus.execution_plan.p3.v1`、平台 ID、steps、ToolIntent、budget、dependencies、risks、memory_context、P0 marker 保留和解释/原生字段泄漏拒绝。 |
| P3-04 | 通过 | `platform/adapters/hermes/plugin-bridge.ts`、`tests/integration/hermes-adapter.test.mjs`、`tests/security/hermes-memory-bypass.test.mjs`、`tests/security/hermes-network-isolation.test.mjs` 和 `tests/security/hermes-plugin-bypass.test.mjs` 覆盖 planner+memory 组合 adapter、防直读、防原生端口、approved skill/MCP planner hint 和未批准/原生插件 fail closed。 |

## 3. 已关闭问题

P3 阶段本轮未新增完全关闭的 `OQ-*`。P0 阶段已关闭问题继续保持关闭状态：

| 问题ID | 确认结论 | 解决说明文档 | 关闭任务/commit |
|---|---|---|---|
| OQ-UPSTREAM-004 | 接受默认快照策略，长期排除构建产物、缓存、日志和依赖目录。 | `docs/planning/open-questions/P0-resolution-plan.md`、`docs/planning/phase-gates/P0-gate-review.md` | 568014bebb2ae256b1d86a9618adde1abd6c24d1 |
| OQ-SCHEDULE-001 | 接受默认容量模型，采用 8-10 个核心角色基线并保留 4-5 人降级排期。 | `docs/planning/open-questions/P0-resolution-plan.md`、`docs/planning/phase-gates/P0-gate-review.md` | 568014bebb2ae256b1d86a9618adde1abd6c24d1 |
| OQ-SCHEDULE-002 | 接受默认日历策略，按当前排期基线和冻结缓冲推进。 | `docs/planning/open-questions/P0-resolution-plan.md`、`docs/planning/phase-gates/P0-gate-review.md` | 568014bebb2ae256b1d86a9618adde1abd6c24d1 |
| OQ-CHANNEL-001 | 接受默认首批渠道为钉钉、飞书、Telegram。 | `docs/planning/open-questions/P0-resolution-plan.md`、`docs/planning/open-questions/P4-resolution-plan.md`、`docs/planning/phase-gates/P0-gate-review.md` | 568014bebb2ae256b1d86a9618adde1abd6c24d1 |

## 4. 仍为自动确认的问题

以下问题仍为 `自动确认`，默认处理方式已在对应确认文件登记。它们不阻塞 P3 自身收口，原因是 P3 已完成 Hermes planner provider 的最小可验收代码、测试和文档证据，而生产级存储、真实上游来源、完整插件治理、真实 sidecar 和故障注入在后续阶段关闭。

| 问题ID | 当前状态 | 默认处理方式摘要 | 后续承接 | 不阻塞理由 |
|---|---|---|---|---|
| OQ-UPSTREAM-001 | 自动确认 | P3 继续使用当前 Hermes 本地快照，禁止无来源证据的默认 provider 升级。 | `docs/planning/task-prompts/P8/P8-02.md`、`docs/planning/task-prompts/P8/P8-04.md` | P3 已固定 `hermes-0.20.5` provider 并登记 P3-01 至 P3-04 patch；真实 upstream remote/commit 影响升级治理，不影响当前 planner boundary 验收。 |
| OQ-MEMORY-001 | 自动确认 | P3 采用 `session`、`user`、`agent_skill` 三层最小实现；organization/audit snapshot、保留期和生产策略后续扩展。 | `docs/planning/task-prompts/P6/P6-02.md`、`docs/planning/task-prompts/P8/P8-03.md`、`docs/planning/task-prompts/P8/P8-04.md` | P3-02/P3-04 已验证三层 planner snapshot、冲突检测、防直读和缺 scope fail closed；长期保留与生产迁移仍需后续阶段。 |
| OQ-MEMORY-002 | 自动确认 | P3 默认 PostgreSQL + pgvector 作为后续候选，P8 复核 Qdrant 或企业检索标准。 | `docs/planning/task-prompts/P8/P8-03.md`、`docs/planning/task-prompts/P8/P8-04.md` | P3 只要求平台 Memory Gateway 抽象、proxy 和 sanitizer；真实存储/检索选型不影响当前 Hermes planner-only 门禁。 |
| OQ-PLUGIN-001 | 自动确认 | 首版采用平台管理员白名单批准；租户自助安装留给后续产品化判断。 | `docs/planning/task-prompts/P5/P5-01.md`、`docs/planning/task-prompts/P5/P5-02.md`、`docs/planning/task-prompts/P6/P6-02.md`、`docs/planning/task-prompts/P8/P8-04.md` | P3-04 已验证 approved skill/MCP 只作为 planner hint，未批准/原生执行/直接记忆插件 fail closed；完整 API、控制台和升级治理后续关闭。 |
| OQ-INFRA-001、OQ-API-001、OQ-INFRA-002、OQ-INFRA-003、OQ-INFRA-004、OQ-INFRA-005、OQ-DEPLOY-001 | 自动确认 | P1 保持平台抽象与开发实现，生产框架、REST/gRPC、消息、对象存储、密钥、观测和部署形态后续确认。 | P5/P6/P8 对应任务 | P3 仅依赖 P1 抽象接口，不要求生产基础设施最终选型。 |
| OQ-UPSTREAM-003、OQ-DSH-001、OQ-DSH-002 | 自动确认 | DSH 上游来源、provider 切换和生产 sandbox/artifact 策略由 P2/P6/P8 继续关闭。 | P6/P8 对应任务 | P3 只接入 Hermes planner provider，不改变 P2 DSH executor-only 边界。 |
| OQ-UPSTREAM-002 | 自动确认 | OpenClaw remote 在 P4/P8 关闭。 | P4/P8 对应任务 | P3 只接入 Hermes planner provider，不依赖 OpenClaw gateway provider 生产化。 |
| OQ-API-002、OQ-LEGAL-001、OQ-INFRA-006、OQ-PRODUCT-001 | 自动确认 | 产品 API、许可证、长任务编排和 P7 范围在后续阶段关闭。 | P5/P6/P8 对应任务 | P3 不开放公共产品面、插件市场或生产编排。 |

当前无需人工确认的问题：暂无。若项目负责人覆盖任一默认处理方式，必须把对应问题更新为 `人工确认` 或重新打开，并同步任务提示词、风险登记册和需求追踪矩阵。

## 5. 历史问题回扫

回扫范围：`docs/planning/open-questions-register.md`、`docs/planning/open-questions/`、`docs/planning/task-prompts/P0/`、`docs/planning/task-prompts/P1/`、`docs/planning/task-prompts/P2/`、`docs/planning/task-prompts/P3/`、`docs/planning/phase-gates/P0-gate-review.md`、`docs/planning/phase-gates/P1-gate-review.md`、`docs/planning/phase-gates/P2-gate-review.md`、`docs/traceability/requirements-matrix.md`、`docs/risks/risk-register.md`、`tests/smoke/P0.sh`、`tests/smoke/P1.sh`、`tests/smoke/P2.sh`、`tests/smoke/P3.sh`。

回扫结论：

- P0-01 至 P0-11、P1-01 至 P1-06、P2-01 至 P2-04、P3-01 至 P3-04 任务文档均存在。
- P0、P1、P2、P3 修改记录包均包含修改前分析、过程记录和验证总结；本轮已把 P0-09/P0-11 的历史 `源码/文档证据` 字段统一为 `源码证据/文档证据`，便于阶段门禁一致检查。
- 当前不存在 `打开` 问题，P0 到期问题已关闭。
- P1/P2/P3 相关自动确认问题均有确认文件和后续任务承接，不阻塞 P3 自身收口。
- `scripts/planning/generate-task-prompts.py --check` 仍为后续门禁必跑项；P4 启动和后续阶段门禁必须继续读取本报告、集中台账和对应确认文件，执行时不得把仍为 `自动确认` 的问题写成已关闭。

## 6. 验收命令

P3 门禁提交前后必须运行：

```bash
git status --short --branch
scripts/planning/generate-task-prompts.py --check
git diff --check
git diff --check -- . ':!vendor/**'
bash tests/smoke/P0.sh
bash tests/smoke/P1.sh
bash tests/smoke/P2.sh
bash tests/smoke/P3.sh
node --test tests/unit/hermes-provider-registry.test.mjs tests/unit/hermes-execution-plan-contract.test.mjs tests/unit/memory-gateway-p3.test.mjs tests/integration/hermes-execution-plan-adapter.test.mjs tests/integration/hermes-memory-gateway-adapter.test.mjs tests/integration/hermes-adapter.test.mjs tests/security/hermes-execution-plan-leakage.test.mjs tests/security/hermes-memory-isolation.test.mjs tests/security/hermes-memory-bypass.test.mjs tests/security/hermes-network-isolation.test.mjs tests/security/hermes-plugin-bypass.test.mjs
```

同时扫描非 vendor 范围的 `.env`、依赖缓存、构建产物和明文凭据；vendor targeted tests 产生的依赖目录必须在提交前清理。
