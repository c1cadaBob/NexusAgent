# P7 阶段门禁报告

> 文档状态：P7 阶段门禁收口。
>
> 评审日期 UTC：2026-08-28。
>
> P7 任务完成基线 commit：0056ccae88f609a0c5f53e5a18015a7acec43cef。
>
> P7 阶段门禁报告：完成后由本报告 commit 与推送记录作为最终远端证据。

## 1. 门禁结论

P7 阶段自身允许收口。P7-01 至 P7-05 已在 `main` 上完成默认关闭的计划质量信号、默认启用的主动遗忘与保留策略、默认关闭的技能自动评测回归、默认启用的 Token 预算与记忆冲突检测，以及默认关闭加 manual tick 的定时长期目标任务。P7 能力均保持平台中性、可开关、可观测和可回退；不调用真实模型、不接真实外部网络、不使用真实凭据、不新增根依赖、不修改原始上游目录。

门禁依据：

- P7-01 新增 `nexus.plan_quality.p7.v1` 内部质量信号，默认关闭，只评估 `nexus.execution_plan.p3.v1`，显式开启后写入内部 Observability metrics/logs/timeline；关闭或评估异常不阻塞 planner dispatch，也不进入公共 REST/OpenAPI/SDK/控制台。
- P7-02 新增 `nexus.memory_retention.p7.v1` Conservative retention，默认启用，支持 session 7 天 TTL、长期层默认保留、`audit_snapshot` immutable、soft delete、manual sweep、metadata-only audit/event/Observability 证据，并通过 REST/API SDK/Web Console 暴露管理员操作。
- P7-03 新增 `nexus.skill_evaluation.p7.v1` 技能自动评测回归，默认关闭，管理员必须先启用后手动触发；deterministic corpus 同时覆盖 approved capability visible 和 rejected/disabled candidate blocked，失败仅生成 sanitized failed report 与 Observability warning，不影响任务、渠道、记忆或插件状态。
- P7-04 新增 `nexus.token_budget.p7.v1` 默认开启预算 ledger，按 All configured 同时记录 tenant/user/agent/task，并在 task submit、planner/executor dispatch 和 `/v1/budget/check` 统一 enforcement；同时新增 `nexus.memory_conflict.p7.v1` Admin resolve queue，`expected_version` mismatch fail closed 且只保存 metadata-only conflict record。
- P7-05 新增 `nexus.scheduled_goal.p7.v1` 定时长期目标任务，默认关闭，采用 UTC 5-field Cron-like alpha 子集和 manual due scan；due 执行只通过 Coordinator `submitTask()` 生成普通 `source.kind = "scheduler"` 平台任务，继续经过 Policy-Gate、Token Budget、Event Bus、Audit 和 Observability。
- `tests/smoke/P7.sh` 已覆盖 P7-01/P7-02/P7-03/P7-04/P7-05 required files、审计记录无占位、schema/default-on/default-off markers、API/SDK/Console/docs-site alignment、Date.now 禁用扫描、公共面泄漏扫描和 targeted unit/integration/security/evaluation/contract tests。
- P7 公共 API、SDK、Web Console、docs-site、events、logs、metrics 和 report projection 不暴露 raw credential、credential material、native URL/path/session/error、provider runtime/binding、memory rejected text、stale payload、真实网络 URL 或本地路径；负向测试均 fail closed。

## 2. P7 任务完成状态

| 任务ID | 门禁状态 | 证据 |
|---|---|---|
| P7-01 | 通过 | commit `097fe4a3a4f96e71d80d46e688f3f64234ce2683`；`platform/coordinator/plan-quality.ts`、`tests/unit/plan-quality.test.mjs`、`tests/integration/p7-plan-quality-observability.test.mjs` 和 `tests/security/p7-plan-quality-leakage.test.mjs` 覆盖默认关闭、ExecutionPlan-only deterministic scoring、内部 Observability、评估异常不阻塞和泄漏清洗。 |
| P7-02 | 通过 | commit `14d57d0380740fab856aa77f921a9b5d81ef7c3e`；`platform/memory-gateway/index.ts`、`product/api/index.ts`、OpenAPI、SDK、Web Console、`tests/unit/memory-retention.test.mjs`、`tests/integration/p7-memory-retention-api.test.mjs` 和 `tests/security/p7-memory-retention-leakage.test.mjs` 覆盖 Conservative retention、soft delete、manual sweep、`audit_snapshot` 保护、tenant 管理边界和 metadata-only 投影。 |
| P7-03 | 通过 | commit `ce17923ab6a946373bbf26ef622302737b1d3ff0`；`platform/skill-evaluation/index.ts`、`tests/evaluation/p7-skill-regression.test.mjs`、`tests/integration/p7-skill-evaluation-api.test.mjs` 和 `tests/security/p7-skill-evaluation-leakage.test.mjs` 覆盖 Default Off、管理员启用/manual run、Approved + Rejected deterministic corpus、失败隔离、权限 fail closed 和报告泄漏防护。 |
| P7-04 | 通过 | commit `fa75b56b9588781c356942ccd92803f49296d990`；`platform/coordinator/token-budget.ts`、Memory conflict queue、OpenAPI/API/SDK/Console/docs-site 增量、`tests/unit/token-budget.test.mjs`、`tests/unit/memory-conflict.test.mjs`、`tests/integration/p7-token-budget-api.test.mjs`、`tests/integration/p7-memory-conflict-api.test.mjs`、`tests/integration/p7-budget-coordinator-enforcement.test.mjs` 和 `tests/security/p7-token-budget-memory-conflict-leakage.test.mjs` 覆盖 All configured ledger、Task+adapter+API enforcement、超预算降级、Admin resolve queue 和泄漏拒绝。 |
| P7-05 | 通过 | commit `0056ccae88f609a0c5f53e5a18015a7acec43cef`；`platform/coordinator/scheduled-goals.ts`、`/v1/scheduled-goals*`、SDK/Web Console/docs-site 增量、`tests/unit/scheduled-goals.test.mjs`、`tests/integration/p7-scheduled-goals-api.test.mjs`、`tests/integration/p7-scheduled-goals-coordinator.test.mjs`、`tests/security/p7-scheduled-goals-leakage.test.mjs` 和 `tests/contract/p7-scheduled-goals-openapi.test.mjs` 覆盖 Default Off + manual tick、UTC 5-field Cron-like recurrence、ordinary scheduler-source TaskRequest、取消/重试、预算降级、租户隔离和公共面泄漏防护。 |

## 3. 已关闭问题

P7 阶段本轮未新增完全关闭的 `OQ-*`。P7-04 已把 `OQ-BUDGET-001` 的 alpha 默认结论明确为 All configured，但生产 billing、真实 tokenizer/model accounting、durable billing backend、生产 quota 和账单归属仍留 P8，因此集中台账继续保持 `自动确认`。P0 阶段已关闭问题继续保持关闭状态：

| 问题ID | 确认结论 | 解决说明文档 | 关闭任务/commit |
|---|---|---|---|
| OQ-UPSTREAM-004 | 接受默认快照策略，长期排除构建产物、缓存、日志和依赖目录。 | `docs/planning/open-questions/P0-resolution-plan.md`、`docs/planning/phase-gates/P0-gate-review.md` | 568014bebb2ae256b1d86a9618adde1abd6c24d1 |
| OQ-SCHEDULE-001 | 接受默认容量模型，采用 8-10 个核心角色基线并保留 4-5 人降级排期。 | `docs/planning/open-questions/P0-resolution-plan.md`、`docs/planning/phase-gates/P0-gate-review.md` | 568014bebb2ae256b1d86a9618adde1abd6c24d1 |
| OQ-SCHEDULE-002 | 接受默认日历策略，按当前排期基线和冻结缓冲推进。 | `docs/planning/open-questions/P0-resolution-plan.md`、`docs/planning/phase-gates/P0-gate-review.md` | 568014bebb2ae256b1d86a9618adde1abd6c24d1 |
| OQ-CHANNEL-001 | 接受默认首批渠道为钉钉、飞书、Telegram；新增渠道作为范围变更处理。 | `docs/planning/open-questions/P0-resolution-plan.md`、`docs/planning/open-questions/P4-resolution-plan.md`、`docs/planning/phase-gates/P0-gate-review.md` | 568014bebb2ae256b1d86a9618adde1abd6c24d1 |

## 4. 仍为自动确认的问题

以下问题仍为 `自动确认`，默认处理方式已在对应确认文件登记。它们不阻塞 P7 自身收口，原因是 P7 已完成用户指定的高级能力 alpha 增量、开关策略、公共面治理、内部观测、预算降级、记忆治理、技能评测和定时任务门禁；生产基础设施、真实业务评测平台、真实模型计费、durable scheduler、发布治理和法务发布包继续由 P8 或后续任务关闭。

| 问题ID | 当前状态 | 默认处理方式摘要 | 后续承接 | 不阻塞理由 |
|---|---|---|---|---|
| OQ-PRODUCT-001 | 自动确认 | P6 MVP 基础链路不依赖 P7 高级能力；P7-01 至 P7-05 作为用户指定增量分别采用默认关闭或 conservative 默认开启，并配套权限、开关、预算、观测、测试和回滚。 | P8 发布治理或后续高级能力任务 | P7 增量不改变 P6 基础闭环，真实业务评测平台、生产调度和发布治理仍按后续任务复核。 |
| OQ-BUDGET-001 | 自动确认 | P7-04 alpha 默认结论为 All configured：tenant/user/agent/task ledger，attempt/execution 仅作 trace context；Task+adapter+API 统一 enforcement。 | `docs/planning/open-questions/P7-resolution-plan.md`、P8 billing/quota 任务 | P7 已证明预算降级、ledger 和公共管理面；真实 tokenizer、durable billing、生产 quota、账单归属和告警阈值属于 P8 生产化范围。 |
| OQ-MEMORY-001、OQ-MEMORY-002 | 自动确认 | P7-02 补保留期、soft delete、manual sweep 和 metadata-only audit；P7-04 补 Admin resolve queue；生产 Memory Gateway 存储/检索、备份和物理清除策略仍待 P8。 | `docs/planning/task-prompts/P8/P8-04.md` 或生产 Memory 任务 | P7 已覆盖 alpha 层保留/冲突语义和跨租户 fail closed；durable backend 与长期数据治理不影响 P7 alpha 收口。 |
| OQ-PLUGIN-001 | 自动确认 | P5/P6 已固定管理员白名单治理；P7-03 将 approved/rejected/disabled capability visibility 纳入 deterministic regression。 | `docs/planning/task-prompts/P8/P8-04.md` | P7 已验证评测不会改变插件/channel/task/memory 状态且不泄漏原始 fixture；真实插件运行时、升级兼容矩阵、生产 sidecar/OS 隔离和发布手册仍待 P8。 |
| OQ-API-001、OQ-API-002 | 自动确认 | P5/P7 继续 REST-first，P7-02 至 P7-05 的新增公共面均已对齐 OpenAPI/SDK/Console/docs-site；streaming/webhook runtime、gRPC/protobuf、生产 IdP/SSO 和其他 SDK 语言延期。 | P8 或后续 SDK/API 批次 | P7 API 增量均通过 contract/alignment/leakage tests；多协议和生产身份治理不影响 P7 alpha。 |
| OQ-INFRA-001 至 OQ-INFRA-006、OQ-DEPLOY-001 | 自动确认 | 当前继续使用平台抽象、本地内存实现、dev bearer、Manual/System Clock、in-process tests 和 dev Compose；生产框架、Event Bus、对象存储、密钥、Observability、部署和 durable workflow 待 P8。 | `docs/planning/task-prompts/P8/P8-01.md` 至 `P8-04.md` | P7 所有能力已在本地 alpha 和 smoke 门禁中可重复验证，且未要求生产基础设施最终选型。 |
| OQ-UPSTREAM-001、OQ-UPSTREAM-002、OQ-UPSTREAM-003、OQ-DSH-001、OQ-DSH-002 | 自动确认 | 三个内部 provider 的真实 upstream remote、release commit、生产 sandbox/artifact、真实渠道网络、sidecar 和升级回滚继续由 P8 复核。 | P8 上游追踪、sandbox 和发布治理任务 | P7 不修改原始上游目录，不新增真实外部网络，不改变 P2-P6 已验收的 planner-only、executor-only 和 gateway-only 边界。 |
| OQ-LEGAL-001 | 自动确认 | P5/P7 公共面保留 license/hash/NOTICE 元数据入口；最终法务、THIRD_PARTY/NOTICE 发布包和再分发确认待 P8。 | `docs/planning/task-prompts/P8/P8-04.md` | P7 未引入真实插件包或新上游分发，法务发布包不是 P7 alpha 阶段阻塞项。 |

当前无需人工确认的问题：暂无。若项目负责人覆盖任一默认方案，必须把对应问题更新为 `人工确认` 或重新打开，并同步任务提示词、风险登记册和需求追踪矩阵。

## 5. 历史问题回扫

回扫范围：`docs/planning/open-questions-register.md`、`docs/planning/open-questions/`、`docs/planning/task-prompts/P0/`、`docs/planning/task-prompts/P1/`、`docs/planning/task-prompts/P2/`、`docs/planning/task-prompts/P3/`、`docs/planning/task-prompts/P4/`、`docs/planning/task-prompts/P5/`、`docs/planning/task-prompts/P6/`、`docs/planning/task-prompts/P7/`、`docs/planning/phase-gates/P0-gate-review.md` 至 `docs/planning/phase-gates/P6-gate-review.md`、`docs/traceability/requirements-matrix.md`、`docs/risks/risk-register.md`、`tests/smoke/P0.sh` 至 `tests/smoke/P7.sh`。

回扫结论：

- P0-01 至 P0-11、P1-01 至 P1-06、P2-01 至 P2-04、P3-01 至 P3-04、P4-01 至 P4-04、P5-01 至 P5-04、P6-01 至 P6-03、P7-01 至 P7-05 任务文档均存在。
- P7-01 至 P7-05 修改记录包均已补齐修改前分析、修改过程记录和修改后验证总结；P7 smoke 已纳入五项审计记录无占位检查。
- 当前不存在 `打开` 或 `人工确认` 的待确认问题；P0 到期问题继续保持关闭，20 个问题仍为 `自动确认` 并已有默认方案与后续承接。
- P0-P6 阶段门禁报告均已存在；本报告补齐 P7 阶段门禁收口证据。
- 需求追踪矩阵和风险登记册已同步 P7 计划质量、记忆保留、技能评测、Token 预算、记忆冲突、定时长期目标任务、公共面泄漏门禁、预算降级和 P8 遗留范围。
- P7 不关闭真实业务评测平台、真实模型调用、真实外部网络、生产凭据、生产 durable scheduler、后台 daemon、分布式锁、错过窗口补偿、生产 billing/quota、durable Memory Gateway、生产 IdP/SSO、真实上游 sidecar、生产 OS 隔离、插件升级兼容矩阵、发布运维手册或法务发布包；这些作为非阻塞遗留项交给 P8 或后续生产化任务。

## 6. 验收命令

P7 门禁生成前已运行并通过：

```bash
git status --short --branch
scripts/planning/generate-task-prompts.py --check
git diff --check
git diff --check -- . ':!vendor/**'
bash tests/smoke/P0.sh
bash tests/smoke/P1.sh
bash tests/smoke/P2.sh
bash tests/smoke/P3.sh
bash tests/smoke/P4.sh
bash tests/smoke/P5.sh
bash tests/smoke/P6.sh
bash tests/smoke/P7.sh
```

P7 targeted 覆盖已由 `tests/smoke/P7.sh` 统一运行：

```bash
node --test \
  tests/unit/plan-quality.test.mjs \
  tests/integration/p7-plan-quality-observability.test.mjs \
  tests/security/p7-plan-quality-leakage.test.mjs \
  tests/unit/memory-retention.test.mjs \
  tests/integration/p7-memory-retention-api.test.mjs \
  tests/security/p7-memory-retention-leakage.test.mjs \
  tests/evaluation/p7-skill-regression.test.mjs \
  tests/integration/p7-skill-evaluation-api.test.mjs \
  tests/security/p7-skill-evaluation-leakage.test.mjs \
  tests/unit/token-budget.test.mjs \
  tests/unit/memory-conflict.test.mjs \
  tests/integration/p7-token-budget-api.test.mjs \
  tests/integration/p7-memory-conflict-api.test.mjs \
  tests/integration/p7-budget-coordinator-enforcement.test.mjs \
  tests/security/p7-token-budget-memory-conflict-leakage.test.mjs \
  tests/contract/p7-token-budget-memory-conflict-openapi.test.mjs \
  tests/unit/scheduled-goals.test.mjs \
  tests/integration/p7-scheduled-goals-api.test.mjs \
  tests/integration/p7-scheduled-goals-coordinator.test.mjs \
  tests/security/p7-scheduled-goals-leakage.test.mjs \
  tests/contract/p7-scheduled-goals-openapi.test.mjs \
  tests/integration/web-console-api-client.test.mjs \
  tests/security/web-console-leakage.test.mjs \
  tests/integration/sdk-typescript-client.test.mjs \
  tests/contract/docs-site-openapi-alignment.test.mjs \
  tests/contract/web-console-openapi-alignment.test.mjs \
  tests/contract/p5-sdk-openapi-contract.test.mjs
```

本次复核结果：`bash tests/smoke/P7.sh` 通过 99 项；完整 P0-P7 smoke 链路通过。验收生成的 `product/sdk/node_modules`、`product/sdk/dist`、`product/web-console/node_modules`、`product/web-console/dist`、`product/docs-site/node_modules` 和 `product/docs-site/dist` 已清理；非 vendor `.env*`、构建产物、coverage/cache 和高置信 secret pattern 扫描无命中。
