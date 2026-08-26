# P6 阶段门禁报告

> 文档状态：P6 阶段门禁收口。
>
> 评审日期 UTC：2026-08-26。
>
> P6-03 fault injection and degradation gate：完成后由本任务 commit 与推送记录作为最终远端证据。

## 1. 门禁结论

P6 阶段自身允许收口。P6-01 至 P6-03 已在 `main` 上完成 deterministic in-process 基础业务闭环、防腐层/防绕过/越权安全矩阵、双格式恶意插件隔离、故障注入矩阵、轻量化 OpenClaw + DSH 降级路线、三平台 provider 回滚、插件禁用验证和真实 dev service lifecycle drill；P6 不新增公共 REST/OpenAPI/SDK/控制台能力，不接真实渠道网络、不使用真实凭据、不修改原始上游目录。

门禁依据：

- P6-01 用同一 `ManualClock`、`InMemoryEventBus`、`PolicyGate`、`Coordinator`、Memory Gateway、Artifact Store 和 OpenClaw/Hermes/DSH adapters 验证 approved channel inbound、任务提交、Hermes memory/planning、DSH execution/artifact、OpenClaw queued outbound send intent 与 audit timeline 可通过统一 ID 串联。
- P6-02 新增 anti-corruption attack matrix，验证 direct adapter invoke、伪造 Policy-Gate/trusted header、disabled/unknown provider、跨租户 artifact/memory/credential、审批/预算绕过、底层端口暴露和双格式恶意插件 fixture 均 fail closed，并保留 `policy.denied` event 与 `api.request.denied` audit evidence。
- P6-03 新增 P6 fault injection matrix，验证 Hermes disabled 时 seeded platform plan lightweight route 仍能完成基础任务，DSH canary throw、timeout、resource exhaustion、破坏性返回、duplicate events dead-letter、memory conflict 和 payload 清洗均由平台恢复或失败策略处理。
- P6-03 通过 Hermes/OpenClaw/DSH provider registry select/disable/rollback 测试和 `LocalPluginGovernance` approve/disable/reject 测试验证 provider rollback、plugin rollback、capability visibility 和 sanitized public projection。
- P6-03 真实服务演练使用 `deploy/docker-compose.dev.yml` 启动 dev 占位服务，停止 `hermes-adapter` 后确认 `platform-api`、`openclaw-adapter`、`dsh-adapter`、`memory-gateway`、`artifact-store` 和 `event-bus` 仍健康，再重启 Hermes 并清理 Compose 资源。
- `tests/smoke/P6.sh` 已覆盖 P6-01/P6-02/P6-03 required files、审计记录无占位、E2E/security/fault markers、P6 OQ/风险/追踪同步、Date.now 禁用扫描、targeted E2E/security/fault tests 和 real-service drill。

## 2. P6 任务完成状态

| 任务ID | 门禁状态 | 证据 |
|---|---|---|
| P6-01 | 通过 | commit `994cf3e26863d4ec8a6eec4d476cb4cc80229003`；`tests/integration/p6-business-closed-loop.test.mjs` 和 `tests/smoke/P6.sh` 覆盖 approved inbound、TaskState/Coordinator、Hermes memory/planning、DSH execution/artifact、OpenClaw outbound queued send intent、Event Bus/audit timeline、ID 关联和 payload 清洗。 |
| P6-02 | 通过 | commit `7c75d10cf73cd3b55ebd8fdc32fc13f818a8db77`；`tests/security/p6-anti-corruption-bypass.test.mjs`、`tests/security/p6-tenant-data-spine-authorization.test.mjs` 和 `tests/security/p6-plugin-isolation.test.mjs` 覆盖 direct invoke、伪造 trust/header、跨租户数据脊柱、审批/预算绕过、底层端口静态扫描、双格式恶意插件隔离和 denied audit/trace evidence。 |
| P6-03 | 通过 | 本任务 commit hash 由完成报告记录；`tests/fault-injection/p6-provider-recovery.test.mjs`、`tests/fault-injection/p6-plugin-provider-rollback.test.mjs` 和 `tests/fault-injection/p6-real-service-drill.sh` 覆盖 seeded platform plan lightweight route、DSH 故障/预算/破坏性输出、duplicate/dead-letter、memory conflict、三平台 provider rollback、plugin rollback 和 Docker Compose dev lifecycle drill。 |

## 3. 已关闭问题

P6 阶段本轮未新增完全关闭的 `OQ-*`。P0 阶段已关闭问题继续保持关闭状态：

| 问题ID | 确认结论 | 解决说明文档 | 关闭任务/commit |
|---|---|---|---|
| OQ-UPSTREAM-004 | 接受默认快照策略，长期排除构建产物、缓存、日志和依赖目录。 | `docs/planning/open-questions/P0-resolution-plan.md`、`docs/planning/phase-gates/P0-gate-review.md` | 568014bebb2ae256b1d86a9618adde1abd6c24d1 |
| OQ-SCHEDULE-001 | 接受默认容量模型，采用 8-10 个核心角色基线并保留 4-5 人降级排期。 | `docs/planning/open-questions/P0-resolution-plan.md`、`docs/planning/phase-gates/P0-gate-review.md` | 568014bebb2ae256b1d86a9618adde1abd6c24d1 |
| OQ-SCHEDULE-002 | 接受默认日历策略，按当前排期基线和冻结缓冲推进。 | `docs/planning/open-questions/P0-resolution-plan.md`、`docs/planning/phase-gates/P0-gate-review.md` | 568014bebb2ae256b1d86a9618adde1abd6c24d1 |
| OQ-CHANNEL-001 | 接受默认首批渠道为钉钉、飞书、Telegram；新增渠道作为范围变更处理。 | `docs/planning/open-questions/P0-resolution-plan.md`、`docs/planning/open-questions/P4-resolution-plan.md`、`docs/planning/phase-gates/P0-gate-review.md` | 568014bebb2ae256b1d86a9618adde1abd6c24d1 |

## 4. 仍为自动确认的问题

以下问题仍为 `自动确认`，默认处理方式已在对应确认文件登记。它们不阻塞 P6 自身收口，原因是 P6 已完成 MVP 必需的闭环、安全、防绕过、故障注入、降级路线和 provider/plugin 回滚证据；生产 durable workflow、真实业务评测集、真实上游 sidecar、生产 OS 隔离、发布运维手册、插件升级兼容矩阵和许可证发布包继续由 P8 或后续任务关闭。

| 问题ID | 当前状态 | 默认处理方式摘要 | 后续承接 | 不阻塞理由 |
|---|---|---|---|---|
| OQ-INFRA-006 | 自动确认 | P1-P6 默认沿用平台自研 `TaskState/Coordinator`；P6-03 已证明关闭 Hermes 后 seeded platform plan lightweight route 可经 Coordinator/Policy-Gate、DSH、Artifact Store、Event Bus/audit 和 OpenClaw queued outbound intent 完成基础任务。 | `docs/planning/task-prompts/P8/P8-04.md` 或后续 durable workflow ADR | P6 已覆盖最小故障恢复、重试/失败、事件重复、memory conflict 和 provider rollback；Temporal/Cadence 或生产 durable backend 属于生产化选型，不影响 P6 MVP 冻结。 |
| OQ-PLUGIN-001 | 自动确认 | 平台管理员白名单治理保持默认，租户不得自助安装第三方插件；P6-02 双格式恶意插件隔离和 P6-03 plugin rollback/capability visibility 证明未批准、禁用或拒绝插件不能穿透公共能力。 | `docs/planning/task-prompts/P8/P8-04.md` | P6 已验证恶意 manifest/payload、Plugin Bridge 变体和治理状态变化 fail closed；真实插件 sidecar、升级兼容矩阵、生产回滚手册和许可证发布包仍是 P8 范围。 |
| OQ-PRODUCT-001 | 自动确认 | P7 高级能力默认不进入 MVP；若项目负责人指定单项进入首版，必须另建任务并配套开关、指标、预算和回滚。 | P7/P8 后续裁剪或增强任务 | P6 的基础闭环、安全和故障恢复均未依赖 P7 高级能力；真实业务评测集和高级记忆/自动评测可在 MVP 冻结后独立推进。 |
| OQ-DSH-001、OQ-DSH-002 | 自动确认 | DSH 当前 provider 继续作为可替换 executor provider；P6-03 已补 canary throw、timeout、预算耗尽、破坏性返回清洗和 rollback 证据，但生产 sandbox 后端、文件/网络策略和发布切换手册仍待 P8。 | `docs/planning/task-prompts/P8/P8-02.md`、`docs/planning/task-prompts/P8/P8-04.md` | P6 已证明平台 contract 不随 DSH 故障或 canary 切换漂移；生产 sandbox/sidecar/升级治理不属于 P6 最小闭环。 |
| OQ-MEMORY-001、OQ-MEMORY-002 | 自动确认 | Memory Gateway 继续沿用 P3/P6 的 scope、version 和 expected_version 冲突策略；生产检索/存储、保留期和备份策略仍待 P8。 | `docs/planning/task-prompts/P8/P8-04.md` | P6-03 已验证 memory expected_version conflict fail closed 且不泄漏原生路径或 credential；长期存储选型是生产化问题。 |
| OQ-UPSTREAM-001、OQ-UPSTREAM-002、OQ-UPSTREAM-003、OQ-API-001、OQ-API-002、OQ-LEGAL-001、OQ-INFRA-001 至 OQ-INFRA-005、OQ-DEPLOY-001 | 自动确认 | 真实 upstream remote/commit、REST 之外的协议、生产 IdP/SSO、消息/对象存储/密钥/观测/部署和法务发布包仍按既有 P5/P8 默认结论推进。 | P8 或后续生产化任务 | P6 不改变 P5 公共 API/SDK/控制台/文档，也不要求生产基础设施最终选型。 |

当前无需人工确认的问题：暂无。若项目负责人覆盖任一默认方案，必须把对应问题更新为 `人工确认` 或重新打开，并同步任务提示词、风险登记册和需求追踪矩阵。

## 5. 历史问题回扫

回扫范围：`docs/planning/open-questions-register.md`、`docs/planning/open-questions/`、`docs/planning/task-prompts/P0/`、`docs/planning/task-prompts/P1/`、`docs/planning/task-prompts/P2/`、`docs/planning/task-prompts/P3/`、`docs/planning/task-prompts/P4/`、`docs/planning/task-prompts/P5/`、`docs/planning/task-prompts/P6/`、`docs/planning/phase-gates/P0-gate-review.md`、`docs/planning/phase-gates/P1-gate-review.md`、`docs/planning/phase-gates/P2-gate-review.md`、`docs/planning/phase-gates/P3-gate-review.md`、`docs/planning/phase-gates/P4-gate-review.md`、`docs/planning/phase-gates/P5-gate-review.md`、`docs/traceability/requirements-matrix.md`、`docs/risks/risk-register.md`、`tests/smoke/P0.sh`、`tests/smoke/P1.sh`、`tests/smoke/P2.sh`、`tests/smoke/P3.sh`、`tests/smoke/P4.sh`、`tests/smoke/P5.sh`、`tests/smoke/P6.sh`。

回扫结论：

- P0-01 至 P0-11、P1-01 至 P1-06、P2-01 至 P2-04、P3-01 至 P3-04、P4-01 至 P4-04、P5-01 至 P5-04、P6-01 至 P6-03 任务文档均存在。
- P6-01、P6-02 和 P6-03 修改记录包均已补齐修改前分析、修改过程记录和修改后验证总结；P6 smoke 已纳入三项审计记录无占位检查。
- 当前不存在 `打开` 或 `人工确认` 的待确认问题；P0 到期问题继续保持关闭，P6 相关 `OQ-INFRA-006`、`OQ-PLUGIN-001` 和 `OQ-PRODUCT-001` 仍为 `自动确认` 并有 P8 或后续任务承接。
- 需求追踪矩阵和风险登记册已同步 P6 基础闭环、防绕过、安全矩阵、恶意插件隔离、故障注入、降级路线、provider rollback、plugin rollback 和真实 dev service lifecycle drill 证据。
- P6 不关闭真实渠道网络、生产凭据、真实业务评测集、生产 durable workflow、真实上游 sidecar、生产 OS 级隔离、插件升级兼容矩阵、发布运维手册或法务发布包；这些作为非阻塞遗留项交给 P8 或后续生产化任务。

## 6. 验收命令

P6 门禁提交前后必须运行：

```bash
git status --short --branch
scripts/planning/generate-task-prompts.py --check
node --test tests/integration/p6-business-closed-loop.test.mjs
node --test tests/security/p6-anti-corruption-bypass.test.mjs tests/security/p6-tenant-data-spine-authorization.test.mjs tests/security/p6-plugin-isolation.test.mjs
node --test tests/fault-injection/p6-provider-recovery.test.mjs tests/fault-injection/p6-plugin-provider-rollback.test.mjs
bash tests/fault-injection/p6-real-service-drill.sh
git diff --check
git diff --check -- . ':!vendor/**'
bash tests/smoke/P0.sh
bash tests/smoke/P1.sh
bash tests/smoke/P2.sh
bash tests/smoke/P3.sh
bash tests/smoke/P4.sh
bash tests/smoke/P5.sh
bash tests/smoke/P6.sh
```

同时清理 Docker Compose dev 服务、非 vendor `node_modules`、`dist`、coverage/cache，并扫描非 vendor `.env*`、生成产物和高置信明文凭据；若 P2/P4/P5 smoke 产生 vendor cache，清理后重跑 P0 smoke 确认 vendor snapshot 排除检查恢复通过。
