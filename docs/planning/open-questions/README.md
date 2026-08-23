# 待确认问题分阶段处理计划索引

> 文档状态：P0-09 后续治理补充。
>
> 用途：本目录把 `docs/planning/open-questions-register.md` 中的所有 `OQ-*` 问题按阶段落到可执行计划。这里提供推荐处理路线、三大上游平台影响和关闭证据要求，不替代最终确认结论；需要项目负责人、SRE、安全、法务或产品拍板的问题仍保持 `Open`，直到台账、风险、追踪矩阵和对应任务修改记录包同步完成。

## 处理原则

- 每个问题都必须至少有一个阶段计划落点，不能只留在集中台账中等待上下文记忆。
- 涉及 OpenClaw、Hermes、DSH 的问题必须分别说明 gateway-only、planner-only、executor-only 边界影响。
- 生产基础设施类问题采用“P1/P2/P3/P4 先抽象与开发默认实现，P8 再按企业标准复核”的处理方式，避免 P1 被外部选型阻塞。
- 项目负责人确认后，必须回写 `open-questions-register.md` 的 `确认结论`、`解决说明文档`、`关闭任务/commit`，并同步需求追踪矩阵和风险登记册。
- 自动确认类问题必须以源码证据、测试、ADR、兼容矩阵或阶段 smoke 为关闭证据，不能凭推断关闭。

## 阶段计划

- [P0 待确认问题处理计划](P0-resolution-plan.md)：上游快照、团队容量、节假日/冻结窗口、首批渠道方向。
- [P1 待确认问题处理计划](P1-resolution-plan.md)：Node 框架、REST/gRPC、Event Bus、Artifact Store、Credential Center、Observability、部署方向。
- [P2 待确认问题处理计划](P2-resolution-plan.md)：DSH 上游来源、executor provider、沙箱与 artifact 策略。
- [P3 待确认问题处理计划](P3-resolution-plan.md)：Hermes 上游来源、Memory Gateway 层级、记忆存储。
- [P4 待确认问题处理计划](P4-resolution-plan.md)：OpenClaw 上游来源、渠道插件和 gateway-only 生产落地。
- [P5 待确认问题处理计划](P5-resolution-plan.md)：API 契约细节、插件治理、许可证/NOTICE。
- [P6 待确认问题处理计划](P6-resolution-plan.md)：长任务编排、P7 高级能力是否进入首版、安全闭环。
- [P8 待确认问题处理计划](P8-resolution-plan.md)：生产复核、部署交付、备份恢复、兼容矩阵和最终关闭证据。

## 覆盖范围

本目录覆盖当前台账中的 23 个问题：

- `OQ-UPSTREAM-001`、`OQ-UPSTREAM-002`、`OQ-UPSTREAM-003`、`OQ-UPSTREAM-004`
- `OQ-SCHEDULE-001`、`OQ-SCHEDULE-002`
- `OQ-API-001`、`OQ-API-002`
- `OQ-CHANNEL-001`
- `OQ-PLUGIN-001`、`OQ-LEGAL-001`
- `OQ-INFRA-001`、`OQ-INFRA-002`、`OQ-INFRA-003`、`OQ-INFRA-004`、`OQ-INFRA-005`、`OQ-INFRA-006`
- `OQ-MEMORY-001`、`OQ-MEMORY-002`
- `OQ-DSH-001`、`OQ-DSH-002`
- `OQ-DEPLOY-001`、`OQ-PRODUCT-001`
