# P0 阶段门禁报告

> 文档状态：P0 阶段门禁收口。
>
> 评审日期 UTC：2026-08-23。
>
> 关闭任务/commit：568014bebb2ae256b1d86a9618adde1abd6c24d1。

## 1. 门禁结论

P0 阶段允许进入后续阶段。P0-01 至 P0-11 已在 `main` 上完成并纳入 `tests/smoke/P0.sh`，本次门禁关闭 P0 到期的 4 个 `OQ-*`，其余 19 个问题继续保持 `自动确认`，按各自最晚确认阶段进入 P1-P8 后续任务。

门禁依据：

- 项目主线为 `main`，当前阶段所有成果均已合入主线。
- P0 smoke 覆盖 vendor 快照、上游剥离实验记录、OpenAPI 初稿、服务蓝图、排期基线、OQ 台账、任务提示词、子 agent 角色记忆和阶段历史问题回扫规则。
- P0 阶段未新增生产业务代码，不修改三个原始只读上游目录。
- P0 到期问题已接受确认文件中的默认解决方案，并补齐确认结论、解决说明文档和关闭任务占位。

## 2. P0 任务完成状态

| 任务ID | 门禁状态 | 证据 |
|---|---|---|
| P0-01 | 通过 | `vendor/MANIFEST.yaml`、快照脚本、角色记忆和 P0 smoke 已覆盖。 |
| P0-02 | 通过 | OpenClaw gateway-only opt-in 实验证据和决策记录已纳入 P0 smoke。 |
| P0-03 | 通过 | Hermes planner-only opt-in 实验证据、ExecutionPlan schema 和决策记录已纳入 P0 smoke。 |
| P0-04 | 通过 | DSH executor-only opt-in 实验证据、ExecutionEvent schema 和决策记录已纳入 P0 smoke。 |
| P0-05 | 通过 | 上游接口摸底、保留/隔离/禁止分类和变更登记模板已纳入 P0 smoke。 |
| P0-06 | 通过 | 平台 OpenAPI 初稿通过泄漏检查和 Redocly 记录，公共契约不暴露上游原生术语。 |
| P0-07 | 通过 | 十个基础服务蓝图、P1 最小交付和自研/复用边界已纳入 P0 smoke。 |
| P0-08 | 通过 | P0-P8 日历、容量模型、阶段门禁和自动重排触发器已纳入 P0 smoke。 |
| P0-09 | 通过 | 23 个 OQ 的集中台账和确认文件目录已建立。 |
| P0-10 | 通过 | 45 个任务提示词由安全生成器 `--check` 校验。 |
| P0-11 | 通过 | P0-01 至 P0-08 历史问题已同步到 OQ 台账和确认文件。 |

## 3. 已关闭的 P0 问题

| 问题ID | 确认结论 | 解决说明文档 | 关闭任务/commit |
|---|---|---|---|
| OQ-UPSTREAM-004 | 接受默认快照策略：长期排除构建产物、缓存、日志和依赖目录，以源码快照、排除规则和可复现 hash 作为交付口径。 | `docs/planning/open-questions/P0-resolution-plan.md` | 568014bebb2ae256b1d86a9618adde1abd6c24d1 |
| OQ-SCHEDULE-001 | 接受默认容量模型：采用 8-10 个核心角色基线，保留 4-5 人降级排期；实际容量变化触发后续重排。 | `docs/planning/open-questions/P0-resolution-plan.md` | 568014bebb2ae256b1d86a9618adde1abd6c24d1 |
| OQ-SCHEDULE-002 | 接受默认日历策略：按当前排期基线和冻结缓冲推进；真实节假日或发布冻结窗口变化触发后续重排。 | `docs/planning/open-questions/P0-resolution-plan.md` | 568014bebb2ae256b1d86a9618adde1abd6c24d1 |
| OQ-CHANNEL-001 | 接受默认首批渠道：钉钉、飞书、Telegram；企业微信、Slack 等新增渠道作为 P4/P5 范围变更处理。 | `docs/planning/open-questions/P0-resolution-plan.md`、`docs/planning/open-questions/P4-resolution-plan.md` | 568014bebb2ae256b1d86a9618adde1abd6c24d1 |

## 4. 仍为自动确认的问题

以下 19 个问题仍为 `自动确认`，但不阻塞 P0 门禁，因为它们的最晚确认阶段在 P1 或之后，且默认解决方案已经在对应确认文件中登记：

| 最晚确认阶段 | 问题ID | 后续处理 |
|---|---|---|
| P1 前或 P1 结束前 | OQ-INFRA-001、OQ-API-001、OQ-INFRA-002、OQ-INFRA-003、OQ-INFRA-004、OQ-INFRA-005 | P1/P5/P8 根据企业标准、API 范围和生产基础设施继续关闭。 |
| P2 前 | OQ-UPSTREAM-003、OQ-DSH-001、OQ-DSH-002 | P2 executor provider、沙箱和 artifact 策略落地时关闭。 |
| P3 前 | OQ-UPSTREAM-001、OQ-MEMORY-001、OQ-MEMORY-002 | P3 planner provider 与 Memory Gateway 落地时关闭。 |
| P4 前 | OQ-UPSTREAM-002 | P4 gateway provider 兼容和渠道接入时关闭。 |
| P5/P6/P8 前 | OQ-API-002、OQ-PLUGIN-001、OQ-LEGAL-001、OQ-INFRA-006、OQ-DEPLOY-001、OQ-PRODUCT-001 | P5-P8 产品、插件、法务、编排和发布门禁继续关闭。 |

当前无需人工确认的问题：暂无。若项目负责人覆盖默认方案，相关问题必须回到 `人工确认` 或重新打开，并同步任务提示词、风险和追踪矩阵。

## 5. 历史问题回扫

回扫范围：`docs/planning/open-questions-register.md`、`docs/planning/open-questions/`、`docs/planning/task-prompts/P0/`、`docs/traceability/requirements-matrix.md`、`docs/risks/risk-register.md`、`tests/smoke/P0.sh`。

回扫结论：

- 当前阶段及之前阶段不存在 `打开` 问题。
- P0 到期问题已关闭并指向解决说明文档。
- 仍为 `自动确认` 的 19 个问题已按后续阶段保留，不阻塞 P0 进入后续阶段。
- P0-01 至 P0-11 均保留修改记录包，P0 smoke 会拒绝缺少审计记录的任务文档。
- 后续 P1/P2/P3/P4/P5/P6/P8 门禁必须继续回扫未关闭问题和任务修改记录包。

## 6. 验收命令

P0 门禁提交前后必须运行：

```bash
git status --short --branch
scripts/planning/generate-task-prompts.py --check
git diff --check -- . ':!vendor/**'
bash tests/smoke/P0.sh
bash tests/smoke/P1.sh
```

同时扫描非 vendor 范围的 `.env`、依赖缓存和构建产物，确认不会随门禁提交入库。
