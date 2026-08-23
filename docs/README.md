# 项目文档

## 文档分阶段维护

规划文档遵循“两轮写入”流程：

1. 第一轮只提交目录、章节标题、任务表头、占位符和文档维护规则。
2. 第二轮及以后按 P0 到 P8 的依赖顺序逐阶段深化，并同步更新契约、追踪矩阵、风险登记册和冒烟脚本。

禁止把未经源码验证的行为写成确定事实。无法从当前源码确认的内容必须标记为【待确认问题】。

## 目录

- [完整实施规划](planning/integrated-platform-plan.md)
- [开发排期基线](planning/development-schedule.md)：P0-08 基线，覆盖 P0-P8 日历、MVP/生产边界、关键路径、容量假设、阶段门禁和自动重排触发器。
- [待确认问题集中台账](planning/open-questions-register.md)：P0-09 基线，统一登记仍未关闭的问题、状态、责任工作流、确认结论和解决说明文档位置。
- [待确认问题分阶段处理计划](planning/open-questions/README.md)：按 P0/P1/P2/P3/P4/P5/P6/P8 承接全部 `OQ-*`，结合 OpenClaw、Hermes、DSH 给出推荐处理、阶段落点和关闭证据。
- [AI 排期提示词模板](planning/ai-schedule-prompt-template.md)
- [任务实施规划提示词索引](planning/task-prompts/README.md)
- [对外 API 契约](contracts/openapi.yaml)
- [Plugin Bridge 平台契约](../platform/contracts/plugin-inventory.schema.json)
- [服务功能与整合蓝图](architecture/service-blueprint.md)：P0-07 基线，覆盖十个基础服务的功能、技术栈、输入输出、复用边界、参考项目和 P1 工作包。
- [DSH 版本兼容与替换策略](architecture/dsh-versioning-and-replacement.md)
- [上游版本适配与社区插件复用桥接策略](architecture/upstream-versioning-and-plugin-bridge.md)
- [需求追踪矩阵](traceability/requirements-matrix.md)
- [开发端口规划](architecture/ports.md)
- [测试策略](testing/strategy.md)
- [远端上传与关键节点提交规则](operations/remote-upload-policy.md)
- [风险登记册](risks/risk-register.md)
- [上游接口摸底](architecture/upstream-interface-inventory.md)

## P0 架构基线关系

- P0-05 的 [上游接口摸底](architecture/upstream-interface-inventory.md) 定义三大上游入口的保留、隔离和禁止分类。
- P0-06 的 [对外 API 契约](contracts/openapi.yaml) 定义只包含平台概念的 REST OpenAPI 初稿和平台错误码草案。
- P0-07 的 [服务功能与整合蓝图](architecture/service-blueprint.md) 把十个基础服务映射到 P1 最小交付、P2-P4 上游接入和 P5 产品化能力。
- P0-08 的 [开发排期基线](planning/development-schedule.md) 把 P0-P8 转换为日历排期、周计划、关键路径、资源容量和阶段门禁，并保留团队容量、节假日和冻结窗口为【待确认问题】。
- P0-09 的 [待确认问题集中台账](planning/open-questions-register.md) 是后续 AI 排期、任务提示词和阶段门禁的未关闭问题索引；[分阶段处理计划](planning/open-questions/README.md) 把每个 `OQ-*` 落到对应阶段，问题关闭后必须写明确认结论、解决说明文档和关闭任务/commit。

所有文档使用 UTC 时间、平台统一标识和平台层术语。Hermes、OpenClaw、DSH 只在内部实现、适配器、风险和源码追踪语境中出现。

执行任一任务前后，必须在 `planning/task-prompts/{阶段}/{任务ID}.md` 中填写“修改记录包”。阶段门禁不得接受缺少修改前分析、修改过程记录或修改后验证总结的任务。
