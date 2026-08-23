# P1 阶段门禁报告

> 文档状态：P1 阶段门禁收口。
>
> 评审日期 UTC：2026-08-23。
>
> P1 任务完成基线 commit：51e407d2855234ddae3d8d7eda464aaad46d56fa。

## 1. 门禁结论

P1 阶段允许进入 P2/P3/P4 并行接入阶段。P1-01 至 P1-06 已在 `main` 上完成，P1 smoke 覆盖 contracts、状态机、Coordinator、Policy-Gate、Clock、Event Bus、adapter 抽象、Artifact/Memory/Credential、Tenancy/RBAC/Audit/Observability、开发 Compose、端口连续性、健康检查、平台错误码一致性和防绕过测试。

门禁依据：

- 项目主线为 `main`，当前工作树与 `origin/main` 对齐。
- P1 smoke 已通过，并继续覆盖 P1-01 至 P1-06 的核心单元、契约、集成、安全和开发编排门禁。
- P0 smoke 仍通过，说明 P1 收口未破坏 P0 vendor、规划、提示词、OQ 台账和阶段历史问题回扫基线。
- P1 阶段未修改三个原始只读上游目录；开发 Compose 只使用平台占位服务和本地健康检查，不接真实上游 provider。
- 当前不存在 `打开` 或 `人工确认` 的待确认问题；P1 相关 7 个问题仍为 `自动确认`，已记录默认处理方式并排入后续阶段，不阻塞进入 P2/P3/P4。

## 2. P1 任务完成状态

| 任务ID | 门禁状态 | 证据 |
|---|---|---|
| P1-01 | 通过 | `platform/contracts/`、`platform/task-state/`、`tests/unit/task-state.test.mjs`、`tests/contract/p1-contracts.test.mjs` 已纳入 P1 smoke；非法状态转移和跨租户 ID 拒绝测试通过。 |
| P1-02 | 通过 | `platform/coordinator/`、`platform/policy-gate/`、`tests/integration/coordinator-policy-gate.test.mjs`、`tests/security/policy-gate-bypass.test.mjs` 已纳入 P1 smoke；伪造或绕过 Policy-Gate 的请求失败。 |
| P1-03 | 通过 | `platform/clock/`、`platform/event-bus/`、`platform/adapters/` 和 mock adapter lifecycle 已纳入 P1 smoke；事件顺序、幂等、dead-letter 和单调时钟测试通过。 |
| P1-04 | 通过 | `platform/artifact-store/`、`platform/memory-gateway/`、`platform/credentials/` 已纳入 P1 smoke；artifact 读写/过期、memory 租户隔离、credential 脱敏测试通过。 |
| P1-05 | 通过 | `platform/tenancy/`、`platform/rbac/`、`platform/audit/`、`platform/observability/` 已纳入 P1 smoke；跨租户、越权、缺 trace 和伪造审计记录拒绝测试通过。 |
| P1-06 | 通过 | `deploy/docker-compose.dev.yml`、`config/ports.dev.yaml`、`config/services.dev.yaml`、`scripts/dev/p1-dev-service.mjs` 和 P1 smoke 开发编排校验已通过；服务端口 3050-3059、调试宿主机端口 9250-9259 连续且无冲突。 |

## 3. 已关闭问题

P1 阶段本轮未新增关闭的 `OQ-*`。P0 阶段已关闭问题继续保持关闭状态：

| 问题ID | 确认结论 | 解决说明文档 | 关闭任务/commit |
|---|---|---|---|
| OQ-UPSTREAM-004 | 接受默认快照策略，长期排除构建产物、缓存、日志和依赖目录。 | `docs/planning/open-questions/P0-resolution-plan.md`、`docs/planning/phase-gates/P0-gate-review.md` | 568014bebb2ae256b1d86a9618adde1abd6c24d1 |
| OQ-SCHEDULE-001 | 接受默认容量模型，采用 8-10 个核心角色基线并保留 4-5 人降级排期。 | `docs/planning/open-questions/P0-resolution-plan.md`、`docs/planning/phase-gates/P0-gate-review.md` | 568014bebb2ae256b1d86a9618adde1abd6c24d1 |
| OQ-SCHEDULE-002 | 接受默认日历策略，按当前排期基线和冻结缓冲推进。 | `docs/planning/open-questions/P0-resolution-plan.md`、`docs/planning/phase-gates/P0-gate-review.md` | 568014bebb2ae256b1d86a9618adde1abd6c24d1 |
| OQ-CHANNEL-001 | 接受默认首批渠道为钉钉、飞书、Telegram。 | `docs/planning/open-questions/P0-resolution-plan.md`、`docs/planning/open-questions/P4-resolution-plan.md`、`docs/planning/phase-gates/P0-gate-review.md` | 568014bebb2ae256b1d86a9618adde1abd6c24d1 |

## 4. 仍为自动确认的问题

以下问题仍为 `自动确认`，默认处理方式已在 `docs/planning/open-questions/P1-resolution-plan.md` 或后续阶段确认文件中登记。它们不阻塞进入 P2/P3/P4，原因是 P1 已固定平台抽象、本地最小实现、开发编排和 smoke 门禁，生产后端、产品 API 和发布形态将在对应后续任务中关闭。

| 问题ID | 当前状态 | 默认处理方式摘要 | 后续承接 | 不阻塞理由 |
|---|---|---|---|---|
| OQ-INFRA-001 | 自动确认 | P1 默认 Fastify + TypeScript 服务标准，具体产品 API 实现按平台契约推进。 | `docs/planning/task-prompts/P5/P5-01.md`、`docs/planning/task-prompts/P8/P8-04.md` | P1 已完成 contracts、Policy-Gate、health/dev 编排；真实 product API framework 可在 P5 实现时关闭。 |
| OQ-API-001 | 自动确认 | REST 先行，gRPC 延后到 P5/P8 复核。 | `docs/planning/task-prompts/P5/P5-01.md`、`docs/planning/task-prompts/P5/P5-04.md`、`docs/planning/task-prompts/P8/P8-04.md` | P1 仅要求内部平台契约和开发底座，未依赖 gRPC 同期交付。 |
| OQ-INFRA-002 | 自动确认 | P1-P6 业务代码依赖 EventBusPort；生产 NATS/Kafka/企业消息系统 P8 复核。 | `docs/planning/task-prompts/P6/P6-03.md`、`docs/planning/task-prompts/P8/P8-03.md`、`docs/planning/task-prompts/P8/P8-04.md` | P1 已实现内存 Event Bus 和事件信封测试，不锁死生产消息系统。 |
| OQ-INFRA-003 | 自动确认 | 开发默认 S3-compatible/MinIO 思路；生产对象存储 P8 绑定企业标准。 | `docs/planning/task-prompts/P2/P2-03.md`、`docs/planning/task-prompts/P8/P8-03.md`、`docs/planning/task-prompts/P8/P8-04.md` | P1 已固定 artifact metadata/reference 和租户隔离，真实对象存储不影响 P2-P4 接入启动。 |
| OQ-INFRA-004 | 自动确认 | P1 使用 Credential Center 抽象和本地 provider；生产 Vault/企业密钥平台 P8 复核。 | `docs/planning/task-prompts/P6/P6-02.md`、`docs/planning/task-prompts/P8/P8-03.md`、`docs/planning/task-prompts/P8/P8-04.md` | P1 已验证 credential reference、短租约元数据和明文不泄漏，生产密钥后端可延后绑定。 |
| OQ-INFRA-005 | 自动确认 | P1-P6 统一 OpenTelemetry 语义，生产观测后端和告警标准 P8 复核。 | `docs/planning/task-prompts/P6/P6-03.md`、`docs/planning/task-prompts/P8/P8-03.md`、`docs/planning/task-prompts/P8/P8-04.md` | P1 已实现本地 health/metrics/logs/trace 接口并通过缺 trace 拒绝测试。 |
| OQ-DEPLOY-001 | 自动确认 | P1-P6 使用开发 Compose；P8 交付 Kubernetes 主路径和生产 Compose 复现包。 | `docs/planning/task-prompts/P8/P8-01.md`、`docs/planning/task-prompts/P8/P8-04.md` | P1-06 已证明开发 Compose 可解析、可健康检查，生产热更新/调试隔离由 P8 关闭。 |

## 5. 需要人工确认的问题

当前无需人工确认的问题：暂无。若项目负责人覆盖任一默认处理方式，必须把对应问题更新为 `人工确认` 或重新打开，并同步任务提示词、风险登记册和需求追踪矩阵。

## 6. 历史问题回扫

回扫范围：`docs/planning/open-questions-register.md`、`docs/planning/open-questions/`、`docs/planning/task-prompts/P0/`、`docs/planning/task-prompts/P1/`、`docs/planning/task-prompts/P2/`、`docs/planning/task-prompts/P5/`、`docs/planning/task-prompts/P6/`、`docs/planning/task-prompts/P8/`、`docs/traceability/requirements-matrix.md`、`docs/risks/risk-register.md`、`tests/smoke/P0.sh`、`tests/smoke/P1.sh`。

回扫结论：

- 当前不存在 `打开` 问题，P0 到期问题已关闭。
- P1 相关 7 个问题仍为 `自动确认`，已列入本门禁报告并映射到后续任务提示词，不阻塞 P2/P3/P4。
- P0-01 至 P0-11、P1-01 至 P1-06 均保留三段修改记录包；严格空占位扫描未发现未填字段。
- `scripts/planning/generate-task-prompts.py --check` 已确认 45 个任务提示词无覆盖率问题。
- P2/P3/P4 启动时必须继续读取本报告、集中台账和对应确认文件，执行时不得把仍为 `自动确认` 的问题写成已关闭。

## 7. 验收命令

P1 门禁提交前后必须运行：

```bash
git status --short --branch
scripts/planning/generate-task-prompts.py --check
git diff --check
git diff --check -- . ':!vendor/**'
bash tests/smoke/P0.sh
bash tests/smoke/P1.sh
```

同时扫描非 vendor 范围的 `.env`、依赖缓存、构建产物和明文凭据，确认不会随门禁提交入库。
