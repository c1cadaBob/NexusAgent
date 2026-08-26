# P6 待确认问题处理计划

> 阶段目标：完成端到端闭环、安全、防绕过、故障注入、provider/插件回滚和 MVP 冻结判定。P6 是确认高级能力是否进入首版、长任务编排是否升级以及轻量化路线是否启动的关键阶段。

## OQ-INFRA-006：长任务编排是否引入 Temporal/Cadence

推荐处理：P1-P6 默认沿用平台自研任务状态机，不在 MVP 前引入 Temporal/Cadence；P6 通过故障注入和长任务恢复评估是否在 P8/P7+ 引入 durable workflow 后端。若企业已有 workflow 平台，可作为 provider 候选，但不能改变平台 TaskState contract。

三平台影响：

- OpenClaw：继续/重做/取消语义先映射到平台 attempt/execution，不由渠道直接操作底层执行。
- Hermes：planner timeout、degraded 和 retry 由 Coordinator 管理，不让 Hermes 自己决定长期任务生命周期。
- DSH：execution cancellation、timeout、retry 和 provider rollback 由平台状态机控制，DSH 不拥有最终任务状态。

关闭证据：P6 故障注入证明当前状态机能覆盖任务恢复、取消、重试和降级；若不足，新增 ADR 评估 Temporal/Cadence 或企业 workflow。

P6-01 证据：`tests/integration/p6-business-closed-loop.test.mjs` 已用 deterministic in-process fixture 复用同一 `ManualClock`、`InMemoryEventBus`、`PolicyGate`、`Coordinator`、Memory Gateway、Artifact Store 和三个内部 adapter，验证渠道入站、任务提交、Hermes memory/planning、DSH execution/artifact、OpenClaw outbound queued send intent 与 audit timeline 可用平台 `TaskState/Coordinator` 串联。P6-01 不引入 Temporal/Cadence，不关闭故障恢复和 durable workflow 最终选型；P6-03/P6 gate 继续补取消、重试、失败恢复和降级证据。

## OQ-PRODUCT-001：P7 高级能力是否进入首版

推荐处理：默认 P7 全部延后，不阻塞 MVP；只允许项目负责人明确指定的单项高级能力进入首版，并且必须具备独立开关、指标、回退路径和资源预算。高级能力不得重新引入 Hermes 原生执行或绕过平台 contracts。

三平台影响：

- Hermes：元认知、主动遗忘、技能自动评测和记忆冲突等能力价值高，但也最容易扩大 P3/P7 范围，默认不进 MVP。
- DSH：完整 Token 预算、长期任务和自动评测会增加 executor 压力，必须先有 P6 资源预算证据。
- OpenClaw：渠道侧高级交互不应阻塞首版渠道入站/出站闭环。

关闭证据：P6 MVP 验收报告明确 P7 裁剪清单；若某项进入首版，必须有任务 ID、测试、开关、告警和回滚说明。

P6-01 证据：基础业务闭环只覆盖 MVP 主链路，未引入 P7 高级能力、真实业务评测集、流式交互、自动评测或高级记忆策略。`tests/smoke/P6.sh` 将 P6-01 deterministic in-process E2E 纳入阶段门禁，并保留 P7 高级能力默认延后结论；最终 P7 裁剪清单仍由 P6 gate 或项目负责人明确覆盖。
