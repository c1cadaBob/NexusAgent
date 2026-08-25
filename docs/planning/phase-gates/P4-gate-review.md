# P4 阶段门禁报告

> 文档状态：P4 阶段门禁收口。
>
> 评审日期 UTC：2026-08-25。
>
> P4-04 OpenClaw channel bypass and smoke gate：完成后由本任务 commit 与推送记录作为最终远端证据。

## 1. 门禁结论

P4 阶段自身允许收口。P4-01 至 P4-04 已在 `main` 上完成 OpenClaw gateway-only provider registry、channel 防腐契约、continue/redo/cancel command mapping、approved channel routing 和集中防绕过门禁；P4 不接真实渠道网络、不使用真实凭据、不实现真实出站发送或 streaming。

门禁依据：

- P4-01 固定 `openclaw-2026.8.1` 默认 gateway-only provider，并验证 provider disable/rollback、vendor gateway guard、Plugin Bridge allowlist、dev/prod 端口隔离和公共泄漏扫描。
- P4-02 将 approved inbound 转为平台 `TaskRequest`，将平台最终结果转为 queued channel send intent，并验证 channel result/event/error 不泄漏原生 URL/session/path/error/raw credential。
- P4-03 将明确 continue/redo/cancel 渠道命令映射为平台 `TaskCommand`，由 Coordinator、Policy-Gate、TaskState 和 Event Bus 处理幂等、redo attempt 与 cancel event。
- P4-04 新增 `tests/integration/channel-routing.test.mjs` 与 `tests/security/openclaw-bypass.test.mjs`，验证 approved routing 正向通过，direct invoke、伪造 trust/header、未知渠道、identity mismatch、native payload、raw credential、native URL/path/session/error、plugin subagent 和未批准 manifest 均 fail closed。
- `markTrustedAdapterInvocation` 已保持为 `platform/adapters` 私有 helper，平台外部只能通过 `invokeLifecycleAdapter()` 或 `Coordinator.dispatchToAdapter()` 进入受 Policy-Gate 验证的 adapter invocation。

## 2. P4 任务完成状态

| 任务ID | 门禁状态 | 证据 |
|---|---|---|
| P4-01 | 通过 | `platform/adapters/openclaw/index.ts`、`platform/adapters/openclaw/plugin-bridge.ts`、`tests/unit/openclaw-provider-registry.test.mjs`、`tests/integration/openclaw-gateway-adapter.test.mjs`、`tests/security/openclaw-gateway-bypass.test.mjs`、`tests/security/openclaw-plugin-bypass.test.mjs` 和 `tests/smoke/P4.sh` 覆盖 gateway-only provider、trusted invocation、native runtime block、Plugin Bridge allowlist 和 network isolation。 |
| P4-02 | 通过 | `nexus.openclaw_channel_inbound.p4.v1` / `nexus.openclaw_channel_outbound.p4.v1`、`tests/unit/openclaw-channel-contracts.test.mjs`、`tests/integration/openclaw-channel-adapter.test.mjs` 和 `tests/security/openclaw-channel-leakage.test.mjs` 覆盖 channel 防腐、send intent、Event Bus 审计和泄漏拒绝。 |
| P4-03 | 通过 | `platform/adapters/openclaw/command-mapping.ts`、`Coordinator.submitTaskCommand()`、`tests/unit/openclaw-command-mapping.test.mjs`、`tests/integration/openclaw-command-routing.test.mjs` 和 `tests/security/openclaw-command-bypass.test.mjs` 覆盖 continue/redo/cancel 到平台 task/attempt 语义、幂等和原生命令绕过拒绝。 |
| P4-04 | 通过 | `tests/integration/channel-routing.test.mjs` 用同一 Coordinator、Policy-Gate、Event Bus 与 `OpenClawGatewayAdapter` 验证 approved inbound text、command mapping、outbound queued send intent 和 provider enabled；`tests/security/openclaw-bypass.test.mjs` 覆盖 direct invoke、伪造 trust/header、未知渠道、identity mismatch、native Agent/tool/memory/task/cancel、raw credential、native URL/path/session/error、plugin subagent 和 unapproved manifest fail closed。 |

## 3. 已关闭问题

P4 阶段本轮未新增完全关闭的 `OQ-*`。P0 已关闭问题继续保持关闭状态：

| 问题ID | 确认结论 | 解决说明文档 | 关闭任务/commit |
|---|---|---|---|
| OQ-UPSTREAM-004 | 接受默认快照策略，长期排除构建产物、缓存、日志和依赖目录。 | `docs/planning/open-questions/P0-resolution-plan.md`、`docs/planning/phase-gates/P0-gate-review.md` | 568014bebb2ae256b1d86a9618adde1abd6c24d1 |
| OQ-SCHEDULE-001 | 接受默认容量模型，采用 8-10 个核心角色基线并保留 4-5 人降级排期。 | `docs/planning/open-questions/P0-resolution-plan.md`、`docs/planning/phase-gates/P0-gate-review.md` | 568014bebb2ae256b1d86a9618adde1abd6c24d1 |
| OQ-SCHEDULE-002 | 接受默认日历策略，按当前排期基线和冻结缓冲推进。 | `docs/planning/open-questions/P0-resolution-plan.md`、`docs/planning/phase-gates/P0-gate-review.md` | 568014bebb2ae256b1d86a9618adde1abd6c24d1 |
| OQ-CHANNEL-001 | 接受默认首批渠道为钉钉、飞书、Telegram；新增企业微信、Slack 等渠道作为范围变更处理。 | `docs/planning/open-questions/P0-resolution-plan.md`、`docs/planning/open-questions/P4-resolution-plan.md`、`docs/planning/phase-gates/P0-gate-review.md` | 568014bebb2ae256b1d86a9618adde1abd6c24d1 |

## 4. 仍为自动确认的问题

以下问题仍为 `自动确认`，默认处理方式已在对应确认文件登记。它们不阻塞 P4 自身收口，原因是 P4-04 已完成 gateway-only channel routing 与防绕过门禁，真实厂商网络、生产 sidecar、完整插件治理和版本升级矩阵属于后续阶段范围。

| 问题ID | 当前状态 | 默认处理方式摘要 | 后续承接 | 不阻塞理由 |
|---|---|---|---|---|
| OQ-UPSTREAM-002 | 自动确认 | P4 继续使用当前 OpenClaw 本地快照，真实 remote、release commit 和 fork 分支由 P8 追踪。 | `docs/planning/task-prompts/P8/P8-02.md`、`docs/planning/task-prompts/P8/P8-04.md` | P4 已固定 `openclaw-2026.8.1` provider 并验证 provider disable/rollback；真实来源影响升级治理，不影响当前 gateway-only 门禁。 |
| OQ-PLUGIN-001 | 自动确认 | 首版采用平台管理员白名单批准；租户自助安装、许可证审核、真实 sidecar 和升级回滚留给后续产品化判断。 | `docs/planning/task-prompts/P5/P5-01.md`、`docs/planning/task-prompts/P5/P5-02.md`、`docs/planning/task-prompts/P6/P6-02.md`、`docs/planning/task-prompts/P8/P8-04.md` | P4 已验证 approved channel/message capability 可发现为 sanitized gateway descriptor，未批准 manifest/native capability/secret transport/plugin subagent fail closed；完整治理 API 和恶意插件演练后续关闭。 |
| OQ-INFRA-001、OQ-API-001、OQ-INFRA-002、OQ-INFRA-003、OQ-INFRA-004、OQ-INFRA-005、OQ-DEPLOY-001 | 自动确认 | 生产框架、REST/gRPC、消息、对象存储、密钥、观测和部署形态后续确认。 | P5/P6/P8 对应任务 | P4 仅依赖 P1 抽象接口，不要求生产基础设施最终选型。 |
| OQ-UPSTREAM-001、OQ-UPSTREAM-003、OQ-DSH-001、OQ-DSH-002、OQ-MEMORY-001、OQ-MEMORY-002 | 自动确认 | Hermes/DSH 上游来源、生产 sandbox/artifact、Memory Gateway 存储/检索由 P6/P8 继续关闭。 | P6/P8 对应任务 | P4 只接入 OpenClaw gateway provider，不改变 P2/P3 已验收的 executor/planner 边界。 |

当前无需人工确认的问题：暂无。若项目负责人覆盖任一默认处理方式，必须把对应问题更新为 `人工确认` 或重新打开，并同步任务提示词、风险登记册和需求追踪矩阵。

## 5. 历史问题回扫

回扫范围：`docs/planning/open-questions-register.md`、`docs/planning/open-questions/`、`docs/planning/task-prompts/P0/`、`docs/planning/task-prompts/P1/`、`docs/planning/task-prompts/P2/`、`docs/planning/task-prompts/P3/`、`docs/planning/task-prompts/P4/`、`docs/planning/phase-gates/P0-gate-review.md`、`docs/planning/phase-gates/P1-gate-review.md`、`docs/planning/phase-gates/P2-gate-review.md`、`docs/planning/phase-gates/P3-gate-review.md`、`docs/traceability/requirements-matrix.md`、`docs/risks/risk-register.md`、`tests/smoke/P0.sh`、`tests/smoke/P1.sh`、`tests/smoke/P2.sh`、`tests/smoke/P3.sh`、`tests/smoke/P4.sh`。

回扫结论：

- P0-01 至 P0-11、P1-01 至 P1-06、P2-01 至 P2-04、P3-01 至 P3-04、P4-01 至 P4-04 任务文档均存在。
- P4-04 修改记录包已补修改前分析、修改过程记录和修改后验证总结；P4 smoke 已纳入 P4-04 审计记录无占位检查。
- 当前不存在 `打开` 问题，P0 到期问题已关闭；P4 相关 `OQ-UPSTREAM-002` 与 `OQ-PLUGIN-001` 保持 `自动确认` 并有后续阶段承接。
- P4 不关闭真实厂商出站发送、streaming、生产 sidecar、完整插件治理或 OpenClaw upstream 来源；这些作为非阻塞遗留项交给 P5/P6/P8。

## 6. 验收命令

P4 门禁提交前后必须运行：

```bash
git status --short --branch
scripts/planning/generate-task-prompts.py --check
node --test tests/integration/channel-routing.test.mjs tests/security/openclaw-bypass.test.mjs
git diff --check
git diff --check -- . ':!vendor/**'
bash tests/smoke/P0.sh
bash tests/smoke/P1.sh
bash tests/smoke/P2.sh
bash tests/smoke/P3.sh
bash tests/smoke/P4.sh
```

同时扫描非 vendor 范围的 `.env`、依赖缓存、构建产物和明文凭据；vendor targeted tests 产生的依赖目录必须在提交前清理。
