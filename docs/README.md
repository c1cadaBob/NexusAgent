# 项目文档

## 文档分阶段维护

规划文档遵循“两轮写入”流程：

1. 第一轮只提交目录、章节标题、任务表头、占位符和文档维护规则。
2. 第二轮及以后按 P0 到 P8 的依赖顺序逐阶段深化，并同步更新契约、追踪矩阵、风险登记册和冒烟脚本。

禁止把未经源码验证的行为写成确定事实。无法从当前源码确认的内容必须标记为【待确认问题】。

## 目录

- [完整实施规划](planning/integrated-platform-plan.md)
- [开发排期基线](planning/development-schedule.md)
- [AI 排期提示词模板](planning/ai-schedule-prompt-template.md)
- [任务实施规划提示词索引](planning/task-prompts/README.md)
- [对外 API 契约](contracts/openapi.yaml)
- [服务功能与整合蓝图](architecture/service-blueprint.md)
- [需求追踪矩阵](traceability/requirements-matrix.md)
- [开发端口规划](architecture/ports.md)
- [测试策略](testing/strategy.md)
- [风险登记册](risks/risk-register.md)
- [上游接口摸底](architecture/upstream-interface-inventory.md)

所有文档使用 UTC 时间、平台统一标识和平台层术语。Hermes、OpenClaw、DSH 只在内部实现、适配器、风险和源码追踪语境中出现。

执行任一任务前后，必须在 `planning/task-prompts/{阶段}/{任务ID}.md` 中填写“修改记录包”。阶段门禁不得接受缺少修改前分析、修改过程记录或修改后验证总结的任务。
