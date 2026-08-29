# P8 阶段门禁报告

> 文档状态：P8 阶段门禁收口。
>
> 评审日期 UTC：2026-08-29。
>
> P8-04 delivery docs and legal notice gate：完成后由本任务 commit 与推送记录作为最终远端证据。

## 1. 门禁结论

P8 阶段自身允许收口。P8-01 至 P8-04 已在 `main` 上完成生产 Compose/Kubernetes 编排、CI/CD 发布门禁、GHCR candidate image 范围、provider/plugin 兼容矩阵、上游追踪、生产告警、备份恢复、deterministic restore drill、交付手册、升级迁移手册、provider/plugin 回滚手册、法务 NOTICE 包和阶段门禁报告。

门禁依据：

- P8-01 已关闭 `OQ-DEPLOY-001`：Kubernetes 是标准生产主路径，Docker Compose prod 是单机私有化、小规模部署和故障复现路径；生产模板只允许 `platform-api` 与 `web-console` 对外暴露，内部 adapters 与数据服务保持 internal-only。
- P8-02 已建立 `nexus.release_gate.p8.v1`、provider/plugin compatibility matrix、canary-first promotion、GHCR tag candidate publish 和 release pause；上游真实 remote/commit 仍未确认时继续 fail closed，不提升 production default。
- P8-03 已关闭 `OQ-INFRA-002`、`OQ-INFRA-003`、`OQ-INFRA-004`、`OQ-INFRA-005` 和 `OQ-MEMORY-002`：生产默认后端为 NATS JetStream、S3-compatible Object Store、Vault、PostgreSQL + pgvector 和 OpenTelemetry + Prometheus/Loki/Tempo；RPO `15m`、RTO `4h` 由 backup/restore profile 和 restore drill 验证。
- P8-04 已补 `nexus.delivery_readiness.p8.v1` 和 `nexus.legal_notice.p8.v1`，新增管理员/开发者交付手册、升级迁移手册、provider/plugin 回滚手册、delivery readiness 清单和 `THIRD_PARTY_NOTICE`，并按用户确认关闭 `OQ-LEGAL-001`。
- P8-04 保持公共 REST API、OpenAPI、TypeScript SDK、Web Console route 和 docs-site runtime surface 不变；provider/plugin 替换只改变内部兼容矩阵和治理状态，不改变平台 `/v1/*` contract。
- `tests/smoke/P8.sh` 覆盖 P8-01/P8-02/P8-03/P8-04 required files、审计记录无占位、生产隔离、发布门禁、backup/restore、delivery docs、legal notice、Date.now 禁用、secret/build artifact 扫描和 targeted deployment/security tests。

## 2. P8 任务完成状态

| 任务ID | 门禁状态 | 证据 |
|---|---|---|
| P8-01 | 通过 | commit `fbab3bf68`；`deploy/docker-compose.prod.yml`、`deploy/k8s/`、`config/services.prod.yaml`、`tests/deployment/p8-production-orchestration.test.mjs` 和 `tests/security/p8-production-isolation.test.mjs` 覆盖生产 public/internal 边界、probes、resource/security context、NetworkPolicy、无 debug/hot reload/source mount 和无 public adapter ports。 |
| P8-02 | 通过 | commit `bf2f8bb30`；`.github/workflows/p8-release-gate.yml`、`config/release-gate.p8.json`、`config/provider-compatibility.p8.json`、`config/plugin-compatibility.p8.json`、release/upstream scripts 和 targeted tests 覆盖 tag 推 GHCR、真实 runtime image scope、canary-first、release pause、rollback target 和 upstream optional remote check。 |
| P8-03 | 通过 | commit `8882e2a9b`；`config/observability-alerts.p8.json`、`config/backup-restore.p8.json`、`platform/observability/readiness.ts`、`platform/backup-restore/index.ts`、operations runbooks 和 targeted tests 覆盖 RPO/RTO、backend defaults、alert catalog、metadata-only restore drill、audit hash-chain、Event Bus replay/DLQ、artifact checksum、memory version 和 credential reference-only recovery。 |
| P8-04 | 通过 | 本任务 commit hash 由完成报告记录；`config/delivery-readiness.p8.json`、`config/legal-notice.p8.json`、`docs/operations/admin-handoff.md`、`docs/operations/developer-handoff.md`、`docs/operations/upgrade-migration.md`、`docs/operations/provider-plugin-rollback.md`、`docs/operations/delivery-readiness.md`、`docs/legal/THIRD_PARTY_NOTICE.md`、P8-04 validators 和 targeted tests 覆盖交付、升级、回滚、NOTICE、OQ-LEGAL-001 closure 和 `P8-04_PUBLIC_API_STABILITY`。 |

## 3. 已关闭问题

P8 阶段新增关闭 7 个生产交付问题：P8-01 关闭 `OQ-DEPLOY-001`，P8-03 关闭 `OQ-INFRA-002`、`OQ-INFRA-003`、`OQ-INFRA-004`、`OQ-INFRA-005` 和 `OQ-MEMORY-002`，P8-04 关闭 `OQ-LEGAL-001`。P0 已关闭问题继续保持关闭。

| 问题ID | 确认结论 | 解决说明文档 | 关闭任务/commit |
|---|---|---|---|
| OQ-DEPLOY-001 | 两者都交付但 Kubernetes 优先；Compose prod 保留为单机私有化、小规模部署和故障复现路径。 | `docs/planning/open-questions/P8-resolution-plan.md`、`docs/operations/production-orchestration.md` | P8-01 `fbab3bf68` |
| OQ-INFRA-002 | Event Bus 生产默认后端为 NATS JetStream，平台事件信封和 replay/DLQ 语义不随后端漂移。 | `docs/planning/open-questions/P8-resolution-plan.md`、`docs/operations/backup-restore.md` | P8-03 `8882e2a9b` |
| OQ-INFRA-003 | Artifact Store 生产默认后端为 S3-compatible Object Store，artifact 只以 reference/checksum/tenant metadata 恢复。 | `docs/planning/open-questions/P8-resolution-plan.md`、`docs/operations/backup-restore.md` | P8-03 `8882e2a9b` |
| OQ-INFRA-004 | Credential Center 生产默认后端为 Vault，backup/restore 只保存 credential reference 和 hash/redaction metadata。 | `docs/planning/open-questions/P8-resolution-plan.md`、`docs/operations/backup-restore.md` | P8-03 `8882e2a9b` |
| OQ-INFRA-005 | Observability 生产默认后端为 OpenTelemetry + Prometheus/Loki/Tempo，告警使用 sanitized platform labels。 | `docs/planning/open-questions/P8-resolution-plan.md`、`docs/operations/observability-alerts.md` | P8-03 `8882e2a9b` |
| OQ-MEMORY-002 | Memory Store 生产默认后端为 PostgreSQL + pgvector，tenant partition/version/conflict/retention 语义由 restore drill 验证。 | `docs/planning/open-questions/P8-resolution-plan.md`、`docs/operations/backup-restore.md` | P8-03 `8882e2a9b` |
| OQ-LEGAL-001 | P8 Alpha 仓库级 license/NOTICE/再分发证据包已完成；默认启用 provider/plugin 均有 license、notice、hash、risk、allowlist 和 rollback evidence。 | `docs/planning/open-questions/P8-resolution-plan.md`、`docs/legal/THIRD_PARTY_NOTICE.md`、`config/legal-notice.p8.json` | P8-04 本任务提交 |

## 4. 仍为自动确认的问题

以下问题仍为 `自动确认`，不阻塞 P8 阶段交付，因为已有默认处理方式、release pause 或后续任务承接，且 P8-04 没有把未确认事实写成已关闭。

| 问题ID | 当前状态 | 默认处理方式摘要 | 不阻塞理由 |
|---|---|---|---|
| OQ-UPSTREAM-001、OQ-UPSTREAM-002、OQ-UPSTREAM-003 | 自动确认 | 三个内部 provider 的真实 upstream remote/commit 仍未确认；P8-02 compatibility matrix 和 upstream check 输出 identity unconfirmed。 | 未确认来源会阻止 production default promotion，但不阻止当前仓库模板、交付文档、NOTICE 包和 smoke gate 收口。 |
| OQ-DSH-001、OQ-DSH-002 | 自动确认 | 当前 DSH provider 已有 registry、禁用、回滚、sandbox/artifact/故障注入证据；正式生产 sandbox/OS 隔离继续后续治理。 | P8-04 交付回滚手册和 release pause，不新增真实 executor sidecar 或客户 runtime。 |
| OQ-PLUGIN-001 | 自动确认 | 首版保持平台管理员白名单治理，租户不得自助安装第三方插件；升级需 hash/license/NOTICE/risk/allowlist/rollback。 | P8-04 交付插件回滚手册和 legal package，但真实插件市场扩展仍需独立产品/安全任务。 |
| OQ-INFRA-001、OQ-INFRA-006 | 自动确认 | Web/API 框架和 durable workflow 继续按现有平台抽象推进；生产 durable orchestration 未在 P8-04 新增。 | P8-04 不改变 API runtime 或任务编排实现，现有 P6/P7/P8 smoke 已证明当前链路可交付。 |
| OQ-API-001、OQ-API-002 | 自动确认 | REST-first、dev bearer、polling events、TypeScript SDK 已落地；gRPC/protobuf/streaming/webhook/生产 IdP/SSO 延后。 | P8-04 明确不新增公共接口，public surface stability tests 保持现有契约。 |
| OQ-MEMORY-001、OQ-PRODUCT-001、OQ-BUDGET-001 | 自动确认 | Memory retention/conflict、P7 高级能力裁剪和 token budget alpha 维度已有证据；生产 billing/评测/调度可继续后续深化。 | P8-04 只做交付和 legal closure，不改变 P7 alpha 行为或 P6 MVP 链路。 |

当前无需人工确认的问题：暂无。若项目负责人覆盖任一默认方案，必须重新打开或标记人工确认，并同步 OQ、风险、追踪矩阵和任务提示词。

## 5. 历史问题回扫

回扫范围：`docs/planning/open-questions-register.md`、`docs/planning/open-questions/`、`docs/planning/task-prompts/P0/` 至 `docs/planning/task-prompts/P8/`、`docs/planning/phase-gates/P0-gate-review.md` 至 `P8-gate-review.md`、`docs/traceability/requirements-matrix.md`、`docs/risks/risk-register.md`、`tests/smoke/P0.sh` 至 `tests/smoke/P8.sh`。

回扫结论：

- P0-01 至 P8-04 任务文档均存在；P8-04 修改记录包在本任务完成时补齐修改前分析、修改过程记录和修改后验证总结。
- P0-P7 阶段门禁报告均已存在，P8-04 新增本报告作为 P8 阶段收口证据。
- 当前无 `打开` 或 `人工确认` 的待确认问题；关闭项已同步解决说明文档，未关闭项保留默认方案和后续承接说明。
- P8-04 不修改公共 API、SDK、控制台或原始上游目录；公共面稳定性由 targeted tests 和 P8 smoke 校验。
- P8 阶段仍不代表真实客户基础设施 rollout、外部律师意见、真实 upstream remote/commit 全部确认、生产 sidecar/OS 级隔离全部完成或后续商业发布审批完成。

## 6. 验收命令

P8 门禁提交前后必须运行：

```bash
git status --short --branch
scripts/planning/generate-task-prompts.py --check
node scripts/quality/validate-p8-delivery-docs.mjs
node scripts/quality/validate-p8-legal-notice.mjs
node --test tests/deployment/p8-delivery-docs.test.mjs tests/security/p8-delivery-public-surface.test.mjs tests/security/p8-legal-notice-isolation.test.mjs
docker compose -f deploy/docker-compose.prod.yml config --format json
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
bash tests/smoke/P8.sh
```

同时清理非 vendor `node_modules`、`dist`、coverage/cache、临时 release/restore reports，并扫描非 vendor `.env*`、生成产物、Docker/K8s secret 明文和高置信凭据模式。
