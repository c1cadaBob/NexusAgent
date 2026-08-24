# P2 阶段门禁报告

> 文档状态：P2 阶段门禁收口。
>
> 评审日期 UTC：2026-08-24。
>
> P2 任务完成基线 commit：80eeb40ee61f350242432bcd45088993d85d6882。

## 1. 门禁结论

P2 阶段自身允许收口。P2-01 至 P2-04 已在 `main` 上完成，DSH executor provider 的 provider registry、防腐 adapter、sandbox/artifact/event controls、防绕过、静态端口隔离和 fixture failover/rollback 均已纳入 `tests/smoke/P2.sh`。

门禁依据：

- 项目主线为 `main`，P2-04 完成后已推送 `origin/main`，本轮回扫开始时本地与远端同步。
- P0、P1、P2 smoke 均通过，说明 P2 收口未破坏早期 vendor、规划、公共契约、P1 平台内核和 DSH executor-only 门禁。
- P2 只修改 NexusAgent 仓库内 `platform/`、`tests/`、`docs/` 和 `vendor/` 副本记录，未修改 `/opt/project/deepseek-harness-master` 原始上游目录。
- 当前不存在 `打开` 或 `人工确认` 的待确认问题；P2 相关 3 个问题仍为 `自动确认`，已记录默认方案、P2 最小证据和 P6/P8 后续关闭路径，不阻塞 P2 自身收口。
- P2 完成不等于 P2-P4 三组件总里程碑完成；P3 Hermes 与 P4 OpenClaw 仍需各自阶段门禁后，才能满足 M2 内部三组件接入总门禁。

## 2. P2 任务完成状态

| 任务ID | 门禁状态 | 证据 |
|---|---|---|
| P2-01 | 通过 | `platform/adapters/dsh/index.ts`、`tests/unit/dsh-provider-registry.test.mjs`、vendor `nexus-executor-only-provider.spec.ts` 和 P2 smoke 覆盖默认 provider、启用/禁用、回滚、native loop 阻断、取消和工具 allowlist。 |
| P2-02 | 通过 | `DshExecutorAdapter`、`platform/contracts/execution-request.schema.json`、`execution-result.schema.json`、`tests/unit/dsh-adapter-contracts.test.mjs`、`tests/integration/dsh-adapter.test.mjs` 和 `tests/security/dsh-adapter-leakage.test.mjs` 覆盖平台 schema、Coordinator/Policy-Gate 调度、provider disabled、allowlist block 和原生字段清洗。 |
| P2-03 | 通过 | `tests/unit/dsh-execution-policy.test.mjs`、`tests/integration/dsh-artifact-events.test.mjs` 和 `tests/security/dsh-sandbox-credential.test.mjs` 覆盖 `resource_budget`、sandbox/network 静态门禁、ArtifactReference 入库、Event Bus metadata 和 credential/stdout/stderr redaction。 |
| P2-04 | 通过 | `tests/security/dsh-bypass.test.mjs`、`tests/security/dsh-network-isolation.test.mjs` 和 `tests/integration/dsh-adapter-failover.test.mjs` 覆盖直接调用、伪造决策/header、native/raw credential payload、非法 ID、租户不匹配、dev/prod 端口隔离和失败/disabled canary rollback。 |

## 3. 已关闭问题

P2 阶段本轮未新增关闭的 `OQ-*`。P0 阶段已关闭问题继续保持关闭状态：

| 问题ID | 确认结论 | 解决说明文档 | 关闭任务/commit |
|---|---|---|---|
| OQ-UPSTREAM-004 | 接受默认快照策略，长期排除构建产物、缓存、日志和依赖目录。 | `docs/planning/open-questions/P0-resolution-plan.md`、`docs/planning/phase-gates/P0-gate-review.md` | 568014bebb2ae256b1d86a9618adde1abd6c24d1 |
| OQ-SCHEDULE-001 | 接受默认容量模型，采用 8-10 个核心角色基线并保留 4-5 人降级排期。 | `docs/planning/open-questions/P0-resolution-plan.md`、`docs/planning/phase-gates/P0-gate-review.md` | 568014bebb2ae256b1d86a9618adde1abd6c24d1 |
| OQ-SCHEDULE-002 | 接受默认日历策略，按当前排期基线和冻结缓冲推进。 | `docs/planning/open-questions/P0-resolution-plan.md`、`docs/planning/phase-gates/P0-gate-review.md` | 568014bebb2ae256b1d86a9618adde1abd6c24d1 |
| OQ-CHANNEL-001 | 接受默认首批渠道为钉钉、飞书、Telegram。 | `docs/planning/open-questions/P0-resolution-plan.md`、`docs/planning/open-questions/P4-resolution-plan.md`、`docs/planning/phase-gates/P0-gate-review.md` | 568014bebb2ae256b1d86a9618adde1abd6c24d1 |

## 4. 仍为自动确认的问题

以下问题仍为 `自动确认`，默认处理方式已在对应确认文件登记。它们不阻塞 P2 自身收口，原因是 P2 已完成 DSH executor provider 的最小可验收代码、测试和文档证据，而生产级基础设施、真实上游 remote/commit、真实 sidecar 和故障注入在后续阶段关闭。

| 问题ID | 当前状态 | 默认处理方式摘要 | 后续承接 | 不阻塞理由 |
|---|---|---|---|---|
| OQ-UPSTREAM-003 | 自动确认 | P2 继续使用当前 DSH 本地快照，禁止无来源证据的默认 provider 升级。 | `docs/planning/task-prompts/P8/P8-02.md`、`docs/planning/task-prompts/P8/P8-04.md` | P2 已固定 `dsh-0.1.1-rc.2` provider 并登记 vendor patch；真实 upstream remote/commit 影响升级治理，不影响当前 P2 provider 边界验收。 |
| OQ-DSH-001 | 自动确认 | 固定当前 provider，建立 registry、启用/禁用、默认切换和回滚能力。 | `docs/planning/task-prompts/P6/P6-03.md`、`docs/planning/task-prompts/P8/P8-02.md` | P2-01/P2-04 已验证 registry 和 fixture failover/rollback；真实 provider 故障注入和生产切换演练仍需 P6/P8。 |
| OQ-DSH-002 | 自动确认 | 所有执行必须带 sandbox policy、resource budget、credential ref 和 artifact policy；生产 sandbox 后端后续确认。 | `docs/planning/task-prompts/P6/P6-02.md`、`docs/planning/task-prompts/P6/P6-03.md`、`docs/planning/task-prompts/P8/P8-03.md`、`docs/planning/task-prompts/P8/P8-04.md` | P2-03/P2-04 已验证平台最小 sandbox/artifact/redaction/端口隔离门禁；真实容器/内核 sandbox、sidecar 权限和故障注入仍需后续阶段。 |
| OQ-INFRA-001、OQ-API-001、OQ-INFRA-002、OQ-INFRA-003、OQ-INFRA-004、OQ-INFRA-005、OQ-DEPLOY-001 | 自动确认 | P1 保持平台抽象与开发实现，生产框架、REST/gRPC、消息、对象存储、密钥、观测和部署形态后续确认。 | P5/P6/P8 对应任务 | P2 仅依赖 P1 抽象接口，不要求生产基础设施最终选型。 |
| OQ-UPSTREAM-001、OQ-MEMORY-001、OQ-MEMORY-002 | 自动确认 | Hermes remote、Memory Gateway 策略和生产存储在 P3/P8 关闭。 | P3/P8 对应任务 | P2 只接入 DSH executor provider，不依赖 Hermes provider 生产化。 |
| OQ-UPSTREAM-002 | 自动确认 | OpenClaw remote 在 P4/P8 关闭。 | P4/P8 对应任务 | P2 只接入 DSH executor provider，不依赖 OpenClaw gateway provider 生产化。 |
| OQ-API-002、OQ-PLUGIN-001、OQ-LEGAL-001、OQ-INFRA-006、OQ-PRODUCT-001 | 自动确认 | 产品 API、插件治理、许可证、长任务编排和 P7 范围在后续阶段关闭。 | P5/P6/P8 对应任务 | P2 不开放公共产品面或插件市场，后续阶段继续关闭。 |

当前无需人工确认的问题：暂无。若项目负责人覆盖任一默认处理方式，必须把对应问题更新为 `人工确认` 或重新打开，并同步任务提示词、风险登记册和需求追踪矩阵。

## 5. 历史问题回扫

回扫范围：`docs/planning/open-questions-register.md`、`docs/planning/open-questions/`、`docs/planning/task-prompts/P0/`、`docs/planning/task-prompts/P1/`、`docs/planning/task-prompts/P2/`、`docs/planning/phase-gates/P0-gate-review.md`、`docs/planning/phase-gates/P1-gate-review.md`、`docs/traceability/requirements-matrix.md`、`docs/risks/risk-register.md`、`tests/smoke/P0.sh`、`tests/smoke/P1.sh`、`tests/smoke/P2.sh`。

回扫结论：

- P0-01 至 P0-11、P1-01 至 P1-06、P2-01 至 P2-04 任务文档均存在。
- P0、P1、P2 修改记录包均包含修改前分析、过程记录和验证总结；P1-01 至 P1-05 中旧 `git status` 三点分支记号已改为非占位描述，严格省略号扫描不再命中当前阶段及之前阶段审计包。
- 当前不存在 `打开` 问题，P0 到期问题已关闭。
- P1/P2 相关自动确认问题均有确认文件和后续任务承接，不阻塞 P2 自身收口。
- `scripts/planning/generate-task-prompts.py --check` 已确认 45 个任务提示词无覆盖率问题。
- P3/P4 启动和后续阶段门禁必须继续读取本报告、集中台账和对应确认文件，执行时不得把仍为 `自动确认` 的问题写成已关闭。

## 6. 验收命令

P2 门禁提交前后必须运行：

```bash
git status --short --branch
scripts/planning/generate-task-prompts.py --check
git diff --check
git diff --check -- . ':!vendor/**'
bash tests/smoke/P0.sh
bash tests/smoke/P1.sh
bash tests/smoke/P2.sh
node --test tests/unit/dsh-provider-registry.test.mjs tests/unit/dsh-adapter-contracts.test.mjs tests/unit/dsh-execution-policy.test.mjs tests/integration/dsh-adapter.test.mjs tests/integration/dsh-artifact-events.test.mjs tests/integration/dsh-adapter-failover.test.mjs tests/security/dsh-adapter-leakage.test.mjs tests/security/dsh-sandbox-credential.test.mjs tests/security/dsh-bypass.test.mjs tests/security/dsh-network-isolation.test.mjs
corepack pnpm exec vitest run packages/core/agent-loop/tests/nexus-executor-only-experiment.spec.ts packages/core/agent-loop/tests/nexus-executor-only-provider.spec.ts
```

同时扫描非 vendor 范围的 `.env`、依赖缓存、构建产物和明文凭据；vendor targeted tests 产生的依赖目录必须在提交前清理。
