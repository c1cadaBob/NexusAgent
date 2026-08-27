# P7 待确认问题处理计划

> 阶段目标：把用户明确指定进入 P7 的高级能力做成可开关、可观测、可回退的增量能力；默认不改变 P6 MVP 基础闭环，不引入真实外部网络、真实模型调用或生产 billing 后端。

## OQ-BUDGET-001：Token 预算按租户、用户、Agent 还是任务计费

推荐处理：P7-04 alpha 采用 All configured 预算维度，同时记录 tenant、user、agent 和 task；attempt 与 execution 只作为 trace context，不作为独立计费维度。默认策略开启，使用 deterministic token estimator 和内存 ledger；真实 tokenizer、模型计费、durable billing backend、生产 quota 和账单归属在 P8 复核。

三平台影响：

- OpenClaw：渠道入站提交任务前由平台 Coordinator 检查 budget，不允许渠道侧传入原生预算或绕过平台降级。
- Hermes：planner adapter dispatch 前统一走平台 budget ledger；超预算时不调用 planner adapter，只记录平台 `budget.degraded` 与 `policy.denied` 证据。
- DSH：executor adapter dispatch 前统一走平台 budget ledger；超预算或单次 attempt 超限时 fail closed，并保持 artifact、event 和错误投影为平台字段。

关闭证据：P7-04 新增 `platform/coordinator/token-budget.ts`，固定 `nexus.token_budget.p7.v1`、`TOKEN_BUDGET_DEFAULT_ENABLED=true`、`TOKEN_BUDGET_DIMENSION_MODE=all_configured` 和 `TOKEN_BUDGET_ENFORCEMENT_SCOPE=task_adapter_api`；`Coordinator.submitTask()`、planner/executor `dispatchToAdapter()` 和 `/v1/budget/check` 共用同一 ledger 校验。`tests/unit/token-budget.test.mjs`、`tests/integration/p7-token-budget-api.test.mjs` 和 `tests/integration/p7-budget-coordinator-enforcement.test.mjs` 验证默认限额、ledger、超预算降级和 adapter 未被调用；`tests/security/p7-token-budget-memory-conflict-leakage.test.mjs` 验证预算响应、SDK/Console view-model、events/logs 不包含 raw credential、native URL/path/session/error、provider runtime、memory rejected text、stale payload 或本地路径。

P7-04 同步结论：alpha 阶段已按用户默认方案关闭“租户、用户、Agent 还是任务计费”的选择为 All configured。该结论不代表生产 billing 已关闭；生产持久化账本、真实模型 token 计量、发票/成本归属、配额后端和告警阈值继续由 P8 发布治理确认。

## P7-05 定时长期目标任务补充

推荐处理：P7-05 按用户确认的 Default Off + manual tick 方案落地定时长期目标任务。调度表达式采用 UTC 5-field Cron-like alpha 子集，支持 `*`、数字、逗号列表、范围和步进；不实现秒、年份、时区、后台 daemon、durable queue 或错过窗口补偿。所有 due 执行都生成普通平台 `TaskRequest`，通过 Coordinator、Policy-Gate、Token Budget、Event Bus、Audit 和 Observability，不直接调用 adapter。

三平台影响：

- OpenClaw：scheduled goal 不接真实渠道网络，也不从渠道侧执行调度；manual tick 只生成平台任务，后续渠道出站仍保持 queued send intent 或平台任务结果路径。
- Hermes：scheduled goal 不直接调用 planner adapter；只有生成的平台任务在既有 Coordinator dispatch 路径中进入 planner，Hermes 不获得原生调度、URL/path/session 或 credential material。
- DSH：scheduled goal 不直接调用 executor；预算、策略、任务状态和 artifact 归档继续由 Coordinator 与平台执行路径约束。

关闭证据：P7-05 新增 `platform/coordinator/scheduled-goals.ts`，固定 `nexus.scheduled_goal.p7.v1`、`SCHEDULED_GOALS_DEFAULT_ENABLED=false`、`cron_like_utc`、`manual_tick` 和 `alpha_in_memory_limits`；`product/api/index.ts`、OpenAPI、TypeScript SDK、Web Console 和 docs-site 增加 `/v1/scheduled-goals*` 管理面。`tests/unit/scheduled-goals.test.mjs`、`tests/integration/p7-scheduled-goals-api.test.mjs`、`tests/integration/p7-scheduled-goals-coordinator.test.mjs`、`tests/security/p7-scheduled-goals-leakage.test.mjs` 和 `tests/contract/p7-scheduled-goals-openapi.test.mjs` 验证 default off、cron 校验、manual due scan、普通 scheduler-source task、取消/重试、预算降级、租户隔离和公共面泄漏防护。

## P7-04 记忆冲突处理补充

推荐处理：P7-04 使用默认启用的 Admin resolve queue。`expected_version` mismatch 继续 fail closed 返回平台 conflict，同时创建 metadata-only conflict record；管理员只能把冲突标记为 `resolved` 或 `ignored`，不会自动应用 stale write，也不会保存 rejected memory text。

三平台影响：

- OpenClaw：渠道消息不能直接覆盖长期记忆；进入平台 memory write 后才参与 expected version 校验和冲突队列。
- Hermes：planner memory proxy 看到的 snapshot 默认过滤冲突、删除和过期记录，不能从冲突队列取回 stale payload。
- DSH：executor 产出的候选记忆必须通过 Memory Gateway 写入；冲突只以 metadata-only 事件和管理员队列呈现。

关闭证据：`platform/memory-gateway/index.ts` 新增 `nexus.memory_conflict.p7.v1`、`MEMORY_CONFLICT_DEFAULT_ENABLED=true` 和 `MEMORY_CONFLICT_RESOLUTION_MODE=admin_resolve_queue`；`product/api/index.ts`、OpenAPI、TypeScript SDK 和 Web Console 增加 `/v1/memory/conflicts*` 管理面。`tests/unit/memory-conflict.test.mjs`、`tests/integration/p7-memory-conflict-api.test.mjs` 和 `tests/security/p7-token-budget-memory-conflict-leakage.test.mjs` 验证冲突生成、同租户管理员 resolve/ignore、跨租户/低权限 fail closed 和 metadata-only 投影。
