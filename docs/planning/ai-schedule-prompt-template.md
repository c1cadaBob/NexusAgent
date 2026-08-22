# NexusAgent AI 排期提示词模板

> 文档状态：P0-09 初始模板。本文用于把 NexusAgent 当前规划、服务蓝图和开发排期自动填充为 AI 可执行的排期提示词。本文只定义排期和计划生成提示词，不授权 AI 直接修改生产业务代码。
>
> 工时说明：人天仅为工程估算，会受上游开源版本变更影响。

## 1. 使用目标

这套提示词用于后续开发中的四类场景：

| 场景 | 使用时机 | 目标输出 |
|---|---|---|
| 项目重排 | 团队容量、节假日、上游风险或阶段门禁变化时 | 更新后的 P0-P8 日历、关键路径、风险和变更说明 |
| 阶段排期 | 进入 P0-P8 任一阶段前 | 阶段内任务顺序、并行安排、每日/每周目标和门禁 |
| 单任务排期 | 执行某个任务 ID 前，例如 P2-03 | 子步骤、依赖检查、验收命令、风险和预计工作量 |
| 每周推进 | 每周站会或周计划复盘 | 本周目标、负责人、阻塞、验收项和下周输入 |
| 延期重排 | 某任务超时、阻塞或依赖失败时 | 影响分析、压缩/延后方案、是否触发降级路线 |
| 阶段门禁评审 | 阶段结束前 | 是否允许进入下一阶段、缺口清单、补救计划 |

## 2. 自动填充字段字典

自动生成提示词时，必须优先从当前仓库文档读取字段，不得手工猜测。字段缺失时保留 `【待确认问题】`。

| 占位符 | 来源 | 示例/规则 |
|---|---|---|
| `{{current_date_utc}}` | 当前 UTC 日期 | `2026-08-22` |
| `{{repo_root}}` | 固定值 | `/opt/project/NexusAgent` |
| `{{branch}}` | `git branch --show-current` | `feature/P0-01-init-project` |
| `{{prompt_mode}}` | 调用方指定 | `project_replan` / `phase_schedule` / `task_schedule` / `weekly_plan` / `slippage_replan` / `gate_review` |
| `{{target_phase}}` | `docs/planning/integrated-platform-plan.md`、`development-schedule.md` | `P2` |
| `{{target_task_id}}` | 任务表 | `P2-03` |
| `{{task_name}}` | 任务表 | `沙箱策略、artifact 和执行事件` |
| `{{task_stage}}` | 任务表 | `P2` |
| `{{task_paths}}` | 任务表 | `platform/adapters/dsh/`、`platform/artifact-store/` |
| `{{change_description}}` | 任务表 | 从“修改说明”列逐字填充 |
| `{{task_inputs}}` | 任务表 | 从“输入”列逐字填充 |
| `{{task_outputs}}` | 任务表 | 从“输出”列逐字填充 |
| `{{acceptance_criteria}}` | 任务表 | 从“验收条件”列逐字填充 |
| `{{estimated_person_days}}` | 任务表或总排期 | 数字加说明：人天仅为工程估算 |
| `{{dependencies}}` | 任务表、阶段排期 | 任务 ID、阶段门禁、外部待确认事项 |
| `{{blocking_points}}` | 任务表“潜在卡点”、风险登记册 | 不得删除，必须进入排期风险 |
| `{{phase_window}}` | `development-schedule.md` | `2026-09-28 至 2026-10-16` |
| `{{week_window}}` | `development-schedule.md` | `W6: 2026-09-28 至 2026-10-02` |
| `{{milestone}}` | `development-schedule.md` | `M2：P2-P4 内部三组件接入` |
| `{{owner_workstream}}` | `development-schedule.md`、团队分工 | 上游改造、平台内核、测试 |
| `{{quality_gates}}` | 任务表、测试策略、阶段门禁 | 单元、契约、集成、安全、冒烟、`git diff --check` |
| `{{plugin_bridge_strategy}}` | `docs/architecture/upstream-versioning-and-plugin-bridge.md` | Plugin Bridge 白名单、能力描述符、宿主侧车和禁止事项 |
| `{{provider_strategy}}` | `docs/architecture/dsh-versioning-and-replacement.md`、`docs/architecture/upstream-versioning-and-plugin-bridge.md` | OpenClaw/Hermes/DSH provider 并存、升级、禁用和回滚规则 |
| `{{smoke_script}}` | 阶段脚本约定 | `tests/smoke/P2.sh` |
| `{{related_requirements}}` | `docs/traceability/requirements-matrix.md` | `REQ-009`、`REQ-012` |
| `{{related_risks}}` | `docs/risks/risk-register.md`、规划第 12 节 | `R-003`、`R-004` |
| `{{open_questions}}` | 阶段待确认问题、排期待确认事项 | 保留原文，不得擅自假设 |
| `{{allowed_write_paths}}` | 项目约束和任务路径 | `vendor/` 副本、`platform/`、`product/`、`docs/`、`tests/`、`deploy/`、`config/`、`scripts/` |
| `{{readonly_upstream_paths}}` | 固定值 | `/opt/project/hermes-agent-main`、`/opt/project/openclaw-main`、`/opt/project/deepseek-harness-master` |

## 3. 全局高危约束

以下约束必须进入每一份自动生成的提示词，不能只在总控提示词中出现一次。

| 高危区 | 必须写入提示词的约束 | 排期中的体现 |
|---|---|---|
| 目录权限 | 原始上游目录只读，任何修改只能发生在 `vendor/` 副本或平台自研目录 | 排期任务必须先列“允许写入路径”和“只读路径检查” |
| 内部依赖暴露 | OpenClaw、Hermes、DSH 对外不可见，公共 API、SDK、控制台、日志和错误码不得出现上游原生类型/URL/错误码 | P5、P6 必须安排出口扫描和防泄漏测试 |
| 通信链路 | 所有底层调用必须经过 `platform/adapters/`、Coordinator、Policy-Gate | P1-P6 每阶段都必须安排防绕过验证 |
| 时间处理 | 所有时间字段使用 UTC；超时、重试、排序使用平台单调时钟，不用墙上时钟计算持续时间 | P1-03、P2-P6 必须安排 clock/timeout 语义测试 |
| 标识符统一 | 全局使用 `tenant_id`、`user_id`、`agent_id`、`task_id`、`attempt_id`、`execution_id`、`conversation_id`、`artifact_id`、`trace_id` | 所有阶段验收都检查 trace 和 ID 贯穿 |
| 上游行为 | 上游行为必须基于源码证据和实测，禁止凭文件名、README 或经验猜测 | P0、P2-P4 必须安排源码行号、调用图和实验日志 |
| 待确认问题 | 未确认事项不得被当作事实；只能输出选项、影响和最晚确认时间 | 排期必须保留“待确认事项”表 |
| 裁剪/降级 | P7 可裁剪；Hermes 可降级；对外 API 和任务标识不变 | 延期重排必须先保护 P0-P6 MVP 主线 |
| 安全防绕过 | 负向测试和绕过测试是阶段门禁，不是可选项 | P2-P6 必须排入 security/integration 工作流 |
| 社区插件复用 | 三大平台社区插件默认不可信，只能通过 Plugin Bridge 白名单、能力描述符和原生宿主侧车复用；不得要求重复改造社区插件主体 | P3-P8 必须安排插件发现、准入、禁用、防泄漏、升级和回滚验证 |
| Provider 兼容 | OpenClaw/Hermes/DSH 必须按 provider/adapter 模式并存、灰度和回滚；平台 API、任务状态、凭据、artifact、审计和错误码不随上游变化 | P3/P4/P8 必须安排 provider 兼容矩阵和回滚演练 |
| 验收命令 | 每个阶段/任务必须提供可重复验收命令 | 提示词输出必须包含“验收命令表” |
| 审计记录 | 开始实现任务前、修改过程中、完成验证后，必须填写对应任务 ID 文档中的“修改记录包” | 阶段门禁必须抽查任务文档的修改前分析、过程记录和修改后验证 |

## 4. 阶段差异化排期策略

| 阶段 | AI 排期重点 | 必须避免 |
|---|---|---|
| P0 | 先证据后结论；三种剥离实验、上游入口摸底、服务蓝图、排期和提示词治理 | 写生产业务代码；根据猜测锁定上游行为；忽略待确认问题 |
| P1 | contracts、状态机、Coordinator、Policy-Gate、Event Bus、Clock、Artifact/Memory/Credential 最小实现和开发 Compose | 先接真实上游；底层组件直接通信；跳过 mock adapter 生命周期 |
| P2 | DSH executor-only、沙箱策略、artifact、执行事件、防绕过 | 对外暴露 DSH 原生 API；跳过沙箱负向测试；把 stdout/stderr 明文透传 |
| P3 | Hermes planner-only、ExecutionPlan、Memory Gateway 接入、原生记忆隔离；Hermes provider 兼容、skills/MCP/Agent Plugins v1 白名单复用和插件记忆防直读 | 让 Hermes 执行工具；把 `MEMORY.md`/`USER.md` 当平台存储；返回最终自然语言答复；让 Hermes 插件绕过 Plugin Bridge |
| P4 | OpenClaw gateway-only、渠道消息转换、继续/重做/取消语义、防绕过；OpenClaw provider 兼容、ClawHub/npm/manifest 扫描和渠道插件白名单 | 让渠道绕过 Coordinator；保留 OpenClaw 原生 Agent 能力对外可达；渠道插件绕过平台准入 |
| P5 | 平台 API、控制台、渠道管理、SDK、开发者文档；管理员插件治理入口；产品层不得出现上游概念 | 在 API/控制台/SDK 泄漏上游名称、原生错误码或 URL；开放租户自助安装任意第三方插件 |
| P6 | E2E、安全、防越权、故障注入、降级路线、评测报告；三平台插件防绕过、禁用、凭据泄漏和宿主回滚验证 | 加新功能扩大范围；只测正向链路；跳过失败恢复、降级和恶意插件测试 |
| P7 | 可选高级能力，必须有开关、指标、回退路径和资源预算 | 阻塞 MVP；重新引入 Hermes 原生能力；无开关上线 |
| P8 | 生产 Compose/Kubernetes、CI/CD、告警、备份恢复、运维/交付手册；三平台 provider 兼容矩阵、插件升级门禁和回滚手册 | 生产配置复用热更新/调试端口；内部 adapter 直接对外暴露；无兼容矩阵切换 provider 或插件版本 |

## 5. 通用输出格式要求

AI 生成排期时必须输出以下结构，缺一不可：

1. 范围确认：目标阶段/任务、输入文档、当前分支、允许写入路径和只读路径。
2. 依赖状态：前置阶段/任务、待确认问题、阻塞项和可并行项。
3. 排期表：按日或按周列出任务、负责人工作流、输入、输出、验收命令。
4. 关键路径：列出不可压缩任务和可并行/可裁剪任务。
5. 风险与降级：列出触发条件、影响、补救方式和是否影响 MVP。
6. 门禁清单：列出必须通过的测试、脚本、文档更新和安全验证。
7. 自动填充差异：说明本次排期相对 `development-schedule.md` 的变化。
8. 待确认问题：保留未确认事项，不得擅自下结论。
9. 插件与 provider 治理：列出是否涉及 Plugin Bridge、社区插件复用、provider 兼容、禁用和回滚。
10. 审计要求：列出对应任务 ID 文档路径，并要求执行前后填写“修改记录包”。

## 6. 任务修改记录包规则

每个任务 ID 文档都必须包含以下审计模板。执行任务时，AI 或开发者必须在开始实现前填写第 1 节，在修改过程中持续补充第 2 节，在完成验证后补齐第 3 节。阶段门禁不得接受空白审计记录。

```markdown
# {任务ID} 修改记录包

## 1. 修改前分析

- 任务与验收条件：...
- 源码证据：...（文件路径+行号+行为）
- 基线测试：...（命令+结果）
- 影响面分析：...
- 修改计划与回滚：...
- 待确认问题：...

## 2. 修改过程记录

- 实际变更文件：...
- 关键改动点：...
- 遇到的问题与决策：...
- 与计划偏离：...
- 新增测试：...
- 依赖变更：...
- 上游补丁登记：...

## 3. 修改后验证与总结

- 验收条件核对：...
- 测试结果：...
- 防绕过测试：...
- 回归测试：...
- 质量门禁：...
- 文档更新：...
- 风险更新：...
- 待确认问题关闭：...
- 回滚验证：...
- 总结与遗留事项：...
```

任务提示词必须明确要求：对应任务 ID 文档路径为 `docs/planning/task-prompts/{阶段}/{任务ID}.md`；执行前不得跳过第 1 节；提交前不得跳过第 2、3 节；无法填写的字段必须写明原因和补救计划，不能留空。

## 7. 总控排期提示词模板

```text
# 角色设定
你是 NexusAgent 项目的 AI 排期与交付计划工程师。你的任务是基于当前仓库文档，生成或更新 P0-P8 的开发排期。你只做排期、依赖分析、风险识别和门禁定义；除非另有明确授权，不得修改生产业务代码。

# 项目现实情况
- 当前 UTC 日期：{{current_date_utc}}
- 项目根目录：{{repo_root}}
- 当前分支：{{branch}}
- 当前排期基线：`docs/planning/development-schedule.md`
- 当前实施规划：`docs/planning/integrated-platform-plan.md`
- 当前服务蓝图：`docs/architecture/service-blueprint.md`
- 当前上游版本与插件桥策略：`docs/architecture/upstream-versioning-and-plugin-bridge.md`
- 当前风险登记册：`docs/risks/risk-register.md`
- 当前需求追踪矩阵：`docs/traceability/requirements-matrix.md`

# 不可违反约束
1. 原始上游目录只读：{{readonly_upstream_paths}}。
2. 任何修改只能发生在允许路径：{{allowed_write_paths}}。
3. OpenClaw/Hermes/DSH 只作为内部依赖，不得出现在公共 API、SDK、控制台、公共错误码或对外日志中。
4. 所有底层调用必须经过 `platform/adapters/`、Coordinator、Policy-Gate。
5. 所有阶段必须保留统一 ID、UTC 时间、单调时钟、trace_id、质量门禁、冒烟脚本和防绕过验证。
6. 三大平台社区插件只能通过 Plugin Bridge 白名单和原生宿主侧车复用；不得开放租户任意安装或绕过平台凭据、审计和 artifact 管理。
7. OpenClaw/Hermes/DSH provider 可以并存、禁用、灰度和回滚；平台契约不得随上游版本变化。
8. 未确认事项必须标记为【待确认问题】，不得擅自假设。

# 当前排期输入
- 排期模式：{{prompt_mode}}
- 目标范围：{{target_phase_or_range}}
- 团队容量：{{actual_capacity}}
- 节假日/冻结窗口：{{calendar_constraints}}
- 新增阻塞或变更：{{schedule_change}}
- 必须保护的交付目标：P0-P6 MVP 主线；P7 可裁剪；P8 生产交付。

# 任务
请生成更新后的项目排期，必须包括：
1. P0-P8 日历表，标出每阶段开始/结束日期、人天、主责工作流、进入条件、退出条件。
2. MVP 关键路径和可并行路径，说明 P2/P3/P4 是否仍可并行。
3. 若团队容量不足，给出 4-5 人、8-10 人两套方案。
4. 若某个上游剥离失败，说明是否触发轻量化路线，以及对日期的影响。
5. 列出每阶段必须通过的 smoke 脚本、契约测试、安全测试和文档更新。
6. 列出所有待确认问题、最晚确认时间和延迟影响。
7. 输出“相对当前排期基线的变更摘要”。

# 输出格式
用 Markdown 输出，包含：排期总览表、每周计划、关键路径、风险与降级、门禁清单、待确认问题、变更摘要。不得省略验收命令。
```

## 8. 阶段排期提示词模板

```text
# 角色设定
你是 NexusAgent `{{target_phase}}` 阶段的 AI 排期工程师。你需要把该阶段规划拆成可执行日程，并保护项目架构边界和阶段门禁。

# 阶段输入
- 阶段：{{target_phase}}
- 阶段窗口：{{phase_window}}
- 里程碑：{{milestone}}
- 主责工作流：{{owner_workstream}}
- 阶段任务清单：{{phase_task_table}}
- 相关需求：{{related_requirements}}
- 相关风险：{{related_risks}}
- 前置依赖：{{dependencies}}
- 待确认问题：{{open_questions}}

# 不可违反约束
- 原始上游目录只读：{{readonly_upstream_paths}}。
- 上游行为必须基于源码证据和实测，涉及 P0/P2/P3/P4 时必须输出源码路径、行号或实验命令。
- 产品层和对外契约不得暴露 OpenClaw/Hermes/DSH 原生概念。
- 所有底层调用必须经过 `platform/adapters/`、Coordinator、Policy-Gate。
- 涉及社区插件时，只能通过 Plugin Bridge 白名单、平台能力描述符和原生宿主侧车复用；不得直接暴露原生插件 API、URL、错误码、session 或存储路径。
- 每个阶段必须有 smoke 脚本，且输出明确 PASS/FAIL。

# 阶段特化规则
{{phase_specific_rules}}

# 任务
请为 `{{target_phase}}` 生成阶段排期：
1. 按天或按周拆分所有任务，列出输入、输出、负责人工作流和验收命令。
2. 标出串行依赖、可并行任务、关键路径和可裁剪项。
3. 标出每个任务开始前必须读取的文档和源码证据。
4. 安排负向测试、防绕过测试和文档更新，不得只安排正向开发。
5. 如果阶段范围超出当前日历窗口，给出压缩方案和延后方案。
6. 输出阶段门禁清单，并说明未通过时如何回退或阻塞。

# 输出格式
Markdown，包含阶段目标、任务排期表、关键路径、并行安排、验收命令、风险/待确认问题、阶段门禁、相对基线变化。
```

## 9. 单任务排期提示词模板

```text
# 角色设定
你是 NexusAgent 任务 `{{target_task_id}}` 的 AI 排期工程师。你只负责把该任务拆成可执行计划、验收命令和风险清单；除非用户明确要求执行开发，否则不要直接修改生产业务代码。

# 任务信息
- 任务ID：{{target_task_id}}
- 任务名称：{{task_name}}
- 所属阶段：{{task_stage}}
- 涉及文件开发路径：{{task_paths}}
- 修改说明：{{change_description}}
- 输入：{{task_inputs}}
- 输出：{{task_outputs}}
- 验收条件：{{acceptance_criteria}}
- 预估人天：{{estimated_person_days}}（人天仅为工程估算，会受上游开源版本变更影响）
- 前置依赖：{{dependencies}}
- 潜在卡点：{{blocking_points}}
- 阶段窗口：{{phase_window}}
- 本周窗口：{{week_window}}

# 必须重复的边界
1. 只读目录：{{readonly_upstream_paths}}。
2. 允许写入路径：{{allowed_write_paths}}。
3. 不得扩大任务范围；不得引入规划外依赖；不得把待确认问题当作事实。
4. 涉及上游源码时，所有结论必须附源码路径/行号或可复现实验命令。
5. 涉及 API/控制台/SDK 时，禁止暴露 OpenClaw/Hermes/DSH 原生命名、URL、错误码或存储路径。
6. 涉及 provider 或社区插件时，必须引用 Plugin Bridge 策略，说明白名单、能力描述、凭据引用、artifact 输出、禁用和回滚验证。

# 任务
请生成 `{{target_task_id}}` 的执行排期，必须包括：
1. 子步骤表：步骤、输入、输出、预计耗时、依赖、验收命令。
2. 证据计划：需要读取哪些文件、运行哪些命令、记录哪些源码证据。
3. 测试计划：单元/契约/集成/安全/冒烟脚本中哪些必须更新或新增。
4. 风险计划：潜在卡点、触发条件、止损动作、是否影响 MVP。
5. 完成定义：文件清单、命令清单、报告清单和必须更新的文档。
6. 若任务无法在当前窗口完成，给出拆分方案，不得擅自降低验收条件。
7. 审计动作：开始实现前填写 `docs/planning/task-prompts/{{task_stage}}/{{target_task_id}}.md` 的“修改前分析”；修改过程中填写“修改过程记录”；完成验证后填写“修改后验证与总结”。

# 输出格式
Markdown，包含任务摘要、子步骤排期、证据计划、测试计划、风险与待确认问题、验收命令、完成定义。
```

## 10. 每周推进提示词模板

```text
# 角色设定
你是 NexusAgent 本周开发推进的 AI 排期助手。你的目标是把当前周计划转换成每日目标、阻塞清单和验收清单。

# 周计划输入
- 当前日期：{{current_date_utc}}
- 周次和日期：{{week_window}}
- 所属阶段：{{target_phase}}
- 本周基线目标：{{weekly_baseline_goal}}
- 本周任务：{{weekly_tasks}}
- 当前已完成：{{completed_items}}
- 当前阻塞：{{blocked_items}}
- 团队容量：{{actual_capacity}}

# 约束
- 不得改变阶段门禁。
- 不得跳过负向测试、安全测试、冒烟脚本和文档更新。
- 任何延期都必须说明对关键路径、MVP 和 P8 生产交付的影响。

# 任务
请输出本周推进计划：
1. 周一至周五每日目标。
2. 每日必须产出的代码/文档/测试/证据。
3. 每日验收命令或检查点。
4. 阻塞事项、负责人工作流和最晚解决时间。
5. 本周结束门禁和未完成事项处理方式。

# 输出格式
Markdown，包含每日计划表、阻塞表、验收清单、风险和下周输入。
```

## 11. 延期重排提示词模板

```text
# 角色设定
你是 NexusAgent 延期重排的 AI 计划工程师。你需要保护 MVP 主线和架构边界，不能通过降低验收标准来换取表面进度。

# 延期输入
- 当前日期：{{current_date_utc}}
- 受影响阶段/任务：{{affected_scope}}
- 原计划窗口：{{original_window}}
- 当前实际状态：{{actual_status}}
- 延期原因：{{slippage_reason}}
- 已失败验收项：{{failed_gates}}
- 可用资源变化：{{capacity_change}}
- 相关风险：{{related_risks}}

# 不可牺牲项
- P0-P6 MVP 主线验收。
- Policy-Gate/Coordinator/adapters 防绕过验证。
- 统一 ID、trace_id、UTC/单调时钟。
- 明文凭据禁止、租户/RBAC 隔离、artifact/memory 越权测试。
- P8 生产关闭热更新和调试端口。
- Plugin Bridge 白名单、插件凭据防泄漏、provider 兼容矩阵和回滚演练。

# 任务
请输出延期重排方案：
1. 影响分析：影响哪些任务、阶段、里程碑和门禁。
2. 三套方案：不加人延后、加人压缩、裁剪非关键范围。
3. 对 P7 可选能力、P5 控制台高级页、P8 Kubernetes 高级交付的裁剪建议。
4. 若 P0/P2/P3/P4 上游剥离失败，是否触发轻量化路线。
5. 更新后的关键路径、日期、风险和待确认事项。
6. 明确哪些验收条件不能降低。

# 输出格式
Markdown，包含影响分析表、三套重排方案、推荐方案、不可降低门禁、待确认问题和变更摘要。
```

## 12. 阶段门禁评审提示词模板

```text
# 角色设定
你是 NexusAgent 阶段门禁评审助手。你的目标是判断 `{{target_phase}}` 是否可以进入下一阶段，而不是替团队粉饰进度。

# 门禁输入
- 阶段：{{target_phase}}
- 阶段窗口：{{phase_window}}
- 阶段任务清单：{{phase_task_table}}
- 阶段验收条件：{{phase_acceptance}}
- 已运行命令：{{executed_commands}}
- 测试结果：{{test_results}}
- 文档更新：{{doc_updates}}
- 未关闭问题：{{open_questions}}
- 相关风险：{{related_risks}}

# 判定规则
- 任务清单没有结果，不能通过。
- 代码/文档产物不存在，不能通过。
- 冒烟脚本、质量门禁或安全负向测试失败，不能通过。
- 依赖阶段验收证据缺失，不能通过。
- 待确认问题没有责任人和截止时间，不能通过。
- 发现绕过 Policy-Gate、原生能力泄漏、明文凭据泄漏、跨租户越权，必须阻塞。
- 发现未批准插件启用、插件绕过 Plugin Bridge、provider 无回滚目标或插件许可证状态不明，必须阻塞。
- 对应任务 ID 文档缺少“修改记录包”或审计字段未填写，必须阻塞。

# 任务
请输出阶段门禁评审结果：
1. `PASS` / `CONDITIONAL PASS` / `FAIL` 判定。
2. 每个任务的完成状态和证据。
3. 每个验收命令的输出摘要。
4. 未关闭风险和待确认问题。
5. 允许进入下一阶段时的限制条件。
6. 不允许进入下一阶段时的补救排期。

# 输出格式
Markdown，包含结论、证据表、失败项、风险、补救计划和下一阶段允许/禁止事项。
```

## 13. 自动填充流程建议

后续如果实现自动填充脚本，建议按以下顺序生成提示词：

1. 读取 `docs/planning/integrated-platform-plan.md`，解析阶段任务表。
2. 读取 `docs/planning/development-schedule.md`，解析日历窗口、周计划、关键路径和资源假设。
3. 读取 `docs/architecture/service-blueprint.md`，补充服务边界和整合链路。
4. 读取 `docs/architecture/upstream-versioning-and-plugin-bridge.md`，补充 provider 兼容、社区插件复用、Plugin Bridge 白名单和回滚约束。
5. 读取 `docs/traceability/requirements-matrix.md`，补充需求编号和验收脚本。
6. 读取 `docs/risks/risk-register.md`，补充风险编号和当前状态。
7. 读取 Git 状态，填充当前分支和未提交变更风险。
8. 根据 `prompt_mode` 选择第 6 至 11 节中的模板。
9. 对所有缺失字段填入 `【待确认问题】`，不得留空或编造。
10. 生成提示词后，先做一次约束扫描：是否包含只读目录、允许写路径、防暴露、防绕过、Plugin Bridge、provider 回滚、验收命令、待确认问题和修改记录包。

## 14. 示例：P2 阶段排期提示词填充片段

```text
- 阶段：P2
- 阶段窗口：2026-09-28 至 2026-10-16
- 里程碑：M2：P2-P4 内部三组件接入
- 主责工作流：上游改造、平台内核、测试
- 阶段任务：P2-01 DSH executor-only 改造；P2-02 DSH 防腐适配器；P2-03 沙箱策略、artifact 和执行事件；P2-04 集成与防绕过验证
- 关键约束：不得暴露 DSH 原生 API；所有请求必须经过 Policy-Gate；stdout/stderr 不得泄漏凭据；artifact 必须通过平台引用输出
- 必须验收：P2 smoke、DSH 绕过测试、adapter contract test、artifact 追踪测试、sandbox 越权拒绝测试
```

## 15. 示例：单任务 P3-02 排期提示词填充片段

```text
- 任务ID：P3-02
- 任务名称：修复 memory_tool 快照缺陷并代理化
- 涉及路径：`vendor/hermes-agent-main/tools/memory_tool.py`、`agent/memory_manager.py`、`agent/memory_provider.py`、`platform/adapters/hermes/`、`platform/memory-gateway/`
- 前置依赖：P1-04、P3-01
- 关键约束：必须先复现快照/并发写入问题；修复必须保留 drift/read-failure 防护；读写改为平台代理；不能把 `MEMORY.md`/`USER.md` 当平台公共存储；Hermes skills/MCP/插件不得直接读写记忆
- 必须验收：读写全部通过平台 API；文件外部直接修改可检测；快照不把未授权内容注入 planner 输入；Hermes memory bypass 和插件直读测试失败即阻塞
```
