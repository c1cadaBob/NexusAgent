# NexusAgent

NexusAgent 是一个独立交付、面向用户使用的一体化 AI Agent 平台。Hermes、OpenClaw 和 DeepSeek Harness 只作为平台内部实现依赖；它们的原生 API、原生概念和原生存储不属于平台对外契约。

## 当前状态

项目当前处于 P0 项目初始化与可行性规划阶段。本阶段已完成项目骨架、上游源码快照、平台契约占位和完整实施规划，尚未编写生产业务代码。

## 目录说明

- `platform/`：平台内核和内部防腐适配器。
- `product/`：对外 API、管理控制台、渠道管理、SDK 和开发者资料。
- `vendor/`：锁定版本的上游源码本地快照。禁止修改 `/opt/project/` 下的原始只读源码目录。
- `deploy/`：开发和生产部署编排。
- `tests/`：冒烟、契约、单元、集成、安全、故障注入和业务评测测试。
- `docs/`：分阶段实施规划、架构、测试、风险和运维文档。

## 开发边界

平台对外只暴露统一的 REST/gRPC API、Web 管理控制台和平台层任务/技能/记忆/租户/RBAC/审计能力。所有底层调用必须经过 `Coordinator`、`Policy-Gate` 和 `platform/adapters/`，禁止外部直接访问 Hermes、OpenClaw 或 DSH。

详细阶段门禁、任务拆解和验收条件见[完整实施规划](docs/planning/integrated-platform-plan.md)。

十个基础服务的功能需求、技术栈、三大上游复用边界、外部可借鉴项目和整合方式见[服务功能与整合蓝图](docs/architecture/service-blueprint.md)。

当前开发日历、里程碑、并行工作流和资源假设见[开发排期基线](docs/planning/development-schedule.md)。

后续按阶段或任务自动生成 AI 排期提示词时，使用[AI 排期提示词模板](docs/planning/ai-schedule-prompt-template.md)。

每个任务 ID 的完整实施规划提示词已生成到[任务实施规划提示词索引](docs/planning/task-prompts/README.md)。

执行任一任务前后，必须在对应任务 ID 文档中填写“修改记录包”，记录修改前分析、修改过程和修改后验证，作为阶段门禁审计依据。
