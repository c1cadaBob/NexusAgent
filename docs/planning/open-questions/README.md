# 待确认问题分阶段处理计划索引

> 文档状态：P0-09 后续治理补充。
>
> 用途：本目录是 `OQ-*` 问题的确认文件与处理计划存放位置。`docs/planning/open-questions-register.md` 只登记问题和状态；推荐处理方式、三大上游平台影响、默认解决方案、关闭证据和最终确认说明都必须写入本目录对应阶段或对应问题文件。系统结合 OpenClaw、Hermes、DSH 生成推荐处理方式后，台账状态可进入 `自动确认`；只有确认结论、解决说明文档和关闭任务/commit 补齐后，才能进入 `已关闭`。

## 处理原则

- 每个问题都必须至少有一个阶段计划落点，不能只留在集中台账中等待上下文记忆。
- 新问题产生后，必须先写入 `docs/planning/open-questions-register.md` 对应位置，再在本目录对应阶段或对应问题文件中补充推荐处理方式和确认依据。
- 涉及 OpenClaw、Hermes、DSH 的问题必须分别说明 gateway-only、planner-only、executor-only 边界影响。
- 若没有项目负责人另行确认，本目录中的“推荐处理方式”即作为默认解决方案，台账状态可记为 `自动确认`。
- `人工确认` 是可选状态：仅当项目负责人或指定责任人需要覆盖默认解决方案时使用；接受默认解决方案时，可以从 `自动确认` 直接进入 `已关闭`。
- `自动确认` 和 `人工确认` 都不等于关闭；只有确认结论、解决说明文档和关闭任务/commit 全部补齐后，台账状态才能改为 `已关闭`。
- 如果某个问题的解决需要加入排期，必须同步在 `docs/planning/task-prompts/` 的相应阶段文件夹添加或更新对应实施规划提示词。
- 生产基础设施类问题采用“P1/P2/P3/P4 先抽象与开发默认实现，P8 再按企业标准复核”的处理方式，避免 P1 被外部选型阻塞。
- 问题关闭后，必须回写 `open-questions-register.md` 的 `确认结论`、`解决说明文档`、`关闭任务/commit`，并同步需求追踪矩阵和风险登记册。
- 自动确认类问题必须以源码证据、测试、ADR、兼容矩阵或阶段 smoke 为默认方案依据；关闭仍需要完整字段，不能凭推断关闭。

## 阶段计划

- [P0 待确认问题处理计划](P0-resolution-plan.md)：上游快照、团队容量、节假日/冻结窗口、首批渠道方向。
- [P1 待确认问题处理计划](P1-resolution-plan.md)：Node 框架、REST/gRPC、Event Bus、Artifact Store、Credential Center、Observability、部署方向。
- [P2 待确认问题处理计划](P2-resolution-plan.md)：DSH 上游来源、executor provider、沙箱与 artifact 策略。
- [P3 待确认问题处理计划](P3-resolution-plan.md)：Hermes 上游来源、Memory Gateway 层级、记忆存储。
- [P4 待确认问题处理计划](P4-resolution-plan.md)：OpenClaw 上游来源、渠道插件和 gateway-only 生产落地。
- [P5 待确认问题处理计划](P5-resolution-plan.md)：API 契约细节、插件治理、许可证/NOTICE。
- [P6 待确认问题处理计划](P6-resolution-plan.md)：长任务编排、P7 高级能力是否进入首版、安全闭环。
- [P7 待确认问题处理计划](P7-resolution-plan.md)：Token 预算计费维度和记忆冲突管理员队列。
- [P8 待确认问题处理计划](P8-resolution-plan.md)：生产复核、部署交付、备份恢复、兼容矩阵和最终关闭证据。

## 覆盖范围

本目录覆盖当前台账中的 24 个问题：

- `OQ-UPSTREAM-001`、`OQ-UPSTREAM-002`、`OQ-UPSTREAM-003`、`OQ-UPSTREAM-004`
- `OQ-SCHEDULE-001`、`OQ-SCHEDULE-002`
- `OQ-API-001`、`OQ-API-002`
- `OQ-CHANNEL-001`
- `OQ-PLUGIN-001`、`OQ-LEGAL-001`
- `OQ-INFRA-001`、`OQ-INFRA-002`、`OQ-INFRA-003`、`OQ-INFRA-004`、`OQ-INFRA-005`、`OQ-INFRA-006`
- `OQ-MEMORY-001`、`OQ-MEMORY-002`
- `OQ-DSH-001`、`OQ-DSH-002`
- `OQ-DEPLOY-001`、`OQ-PRODUCT-001`
- `OQ-BUDGET-001`
