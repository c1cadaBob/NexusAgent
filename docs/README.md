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
- [待确认问题确认文件](planning/open-questions/README.md)：按 P0/P1/P2/P3/P4/P5/P6/P8 承接全部 `OQ-*`，保存推荐处理方式、默认解决方案、三平台影响分析和关闭证据。
- [AI 排期提示词模板](planning/ai-schedule-prompt-template.md)
- [任务实施规划提示词索引](planning/task-prompts/README.md)
- [对外 API 契约](contracts/openapi.yaml)
- [Plugin Bridge 平台契约](../platform/contracts/plugin-inventory.schema.json)
- [P1 公共契约与任务状态机](../platform/contracts/task-state.schema.json)：P1-01 基线，覆盖统一 ID、TaskRequest、TaskState、EventEnvelope、Artifact/Credential 引用和状态转移测试。
- [P1 Coordinator 与 Policy-Gate](../platform/coordinator/index.ts)：P1-02 基线，覆盖任务接收、受控 adapter 路由、租户/RBAC/预算/审批校验、决策日志和防绕过测试。
- [P1 Clock、Event Bus 与 Adapter 抽象](../platform/event-bus/index.ts)：P1-03 基线，覆盖统一单调时钟、内存事件总线、adapter lifecycle、mock lifecycle 和防绕过测试。
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
- P0-09 的 [待确认问题集中台账](planning/open-questions-register.md) 是后续 AI 排期、任务提示词和阶段门禁的未关闭问题索引；状态流为 `打开`、`自动确认`、`人工确认`、`已关闭`。[待确认问题确认文件目录](planning/open-questions/README.md) 是推荐处理方式、默认解决方案、三平台影响和关闭证据的保存位置。问题关闭后必须回写台账确认结论、解决说明文档和关闭任务/commit；需要加入开发排期的问题必须同步更新 `planning/task-prompts/` 对应阶段提示词。
- P0-10 的 [任务提示词生成器](../scripts/planning/generate-task-prompts.py) 默认只执行 `--check` 覆盖率和治理校验；显式 `--write` 才创建缺失文档，`--write --overwrite` 才允许覆盖已有人工优化提示词。生成器校验 45 个任务 ID、差异化角色、审计记录、集中台账、确认文件目录和阶段历史问题回扫规则。
- P0-11 的 [实时规划提示词](planning/task-prompts/P0/P0-11.md) 已把 P0-01 至 P0-08 已 `自动确认` 但尚未同步的问题回写到对应任务文档，形成 OQ ID、确认文件和未关闭状态的同步矩阵；实时规划任务必须先填写“修改前分析”，先处理待确认问题，再进入后续实现。
- 每个阶段结束前必须回扫当前阶段及其之前阶段的未处理问题、任务修改记录包、风险登记册和需求追踪矩阵；如果仍有未处理或未同步问题，必须先修复或创建后续实时规划提示词，再判断是否允许进入下一阶段。

所有文档使用 UTC 时间、平台统一标识和平台层术语。Hermes、OpenClaw、DSH 只在内部实现、适配器、风险和源码追踪语境中出现。

执行任一任务前后，必须在 `planning/task-prompts/{阶段}/{任务ID}.md` 中填写“修改记录包”。阶段门禁不得接受缺少修改前分析、修改过程记录或修改后验证总结的任务。
