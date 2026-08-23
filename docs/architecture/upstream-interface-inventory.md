# 上游接口摸底与兼容性登记

> 文档状态：P0-05 接口摸底基线。本文只登记当前 `/opt/project/NexusAgent` vendor 快照中已经用源码、元数据、P0-02 至 P0-04 实验或命令验证的入口；无法确认的 remote、commit、生产协议和许可证边界保留为【待确认问题】。

## 1. 登记规则

- 只以 `/opt/project/NexusAgent` 为项目根目录；原始上游目录 `/opt/project/hermes-agent-main`、`/opt/project/openclaw-main`、`/opt/project/deepseek-harness-master` 只读。
- `保留` 表示可作为后续 provider 生产改造的候选能力；`隔离` 表示只能在 `platform/adapters/`、Coordinator、Policy-Gate、Credential Center、Artifact Store、Memory Gateway 或 Event Bus 后面使用；`禁止` 表示不得作为 NexusAgent 对外或跨服务入口。
- 本文的源码行号来自 P0-02、P0-03、P0-04 决策记录和当前 vendor 快照元数据；P2-P4 正式源码改造前必须重新跑静态分析并刷新行号。
- 上游目录 Git 探测命令 `git -C <原始目录> rev-parse --is-inside-work-tree` 对三个原始目录均返回 exit 128 和 `not a git repository`；vendor 子目录的 `git rev-parse --show-toplevel` 均指向 `/opt/project/NexusAgent`，不能当作上游 commit 证据。

## 2. 快照与版本基线

| 上游 | 平台内部角色 | 当前 vendor 版本 | 原始只读路径 | vendor 路径 | remote/commit 状态 | 许可证证据 | 补丁状态 |
|---|---|---:|---|---|---|---|---|
| Hermes | planner-only | `0.20.5` | `/opt/project/hermes-agent-main` | `vendor/hermes-agent-main` | 原始目录不是 Git 仓库；`vendor/MANIFEST.yaml` 保留【待确认问题】 | `vendor/hermes-agent-main/pyproject.toml:17-18` 和 `vendor/hermes-agent-main/LICENSE:1-4` 均显示 MIT | P0-03 本地 planner-only guard 已登记在 `vendor/MANIFEST.yaml:41-53` |
| OpenClaw | gateway-only | `2026.8.1` | `/opt/project/openclaw-main` | `vendor/openclaw-main` | 原始目录不是 Git 仓库；package repository 声明不等于本地 commit 证据 | `vendor/openclaw-main/package.json:16` 和 `vendor/openclaw-main/LICENSE:1-4` 均显示 MIT | P0-02 本地 gateway-only guard 已有决策记录，当前 manifest 仍未登记 OpenClaw `local_patches` |
| DSH | executor-only | `0.1.1-rc.2` | `/opt/project/deepseek-harness-master` | `vendor/deepseek-harness-master` | 原始目录不是 Git 仓库；`vendor/MANIFEST.yaml` 保留【待确认问题】 | `vendor/deepseek-harness-master/package.json:4` 和 `vendor/deepseek-harness-master/LICENSE:1-4` 均显示 MIT | P0-04 本地 executor-only guard 已登记在 `vendor/MANIFEST.yaml:77-86` |

## 3. 接口分类总表

| 上游 | 入口/能力 | 真实入口证据 | 协议/输入输出 | 启动或触发方式 | 依赖/运行时 | 分类 | NexusAgent 处理方式 |
|---|---|---|---|---|---|---|---|
| OpenClaw | CLI 与原生进程入口 | `vendor/openclaw-main/package.json:22-24` 暴露 `openclaw` bin，`package.json:1792` 定义 `start: node openclaw.mjs` | OpenClaw 原生命令行、配置和本地运行时 | `openclaw` bin 或 `pnpm start` | Node/TypeScript，依赖从 `package.json:2027` 起声明 | 禁止 | 不作为 NexusAgent 对外或内部跨服务入口；P4 只能通过 OpenClaw provider sidecar 的平台代理协议调用 |
| OpenClaw | Channel inbound envelope | `docs/decisions/P0-openclaw-gateway-only.md:44` 记录 `src/channels/inbound-event/envelope.ts:19-47` | 渠道事件投影为 OpenClaw route envelope | 渠道 webhook、长连接或插件接入后触发 | OpenClaw channel/plugin 运行时 | 保留 | P4 复用为 gateway provider 的入站标准化候选；输出必须转成平台 `TaskRequest` |
| OpenClaw | Gateway chat/agent turn content phase | `docs/decisions/P0-openclaw-gateway-only.md:45` 记录 `agent-turn-service.ts:202-244` | 原生 chat 输入在 content phase 后可投影为平台 `TaskRequest` | gateway agent turn 链路 | OpenClaw gateway service | 隔离 | P4 将 handoff 固化为 adapter contract；不得继续进入原生 dispatch |
| OpenClaw | Native Agent dispatch | `docs/decisions/P0-openclaw-gateway-only.md:46-48` 记录 `prepareAgentRunDispatch` 与 `agentCommandFromGatewayIngress` | OpenClaw 原生 Agent admission/dispatch | content phase 后自动进入 | OpenClaw default runtime | 禁止 | 所有 Agent 执行必须由 NexusAgent Coordinator 发起，OpenClaw 不得自行启动 Agent |
| OpenClaw | Gateway visible tools | `docs/decisions/P0-openclaw-gateway-only.md:49-50` 记录 `tools.invoke` 可进入 `gatewayTool.execute` | core/plugin/channel/memory tool 调用 | gateway server methods | OpenClaw tools/plugin runtime | 禁止 | 直接 tools.invoke 必须拒绝；工具能力若需要复用，转成平台能力并经 Policy-Gate、Credential Center、Artifact Store |
| OpenClaw | Channel outbound transport | `docs/decisions/P0-openclaw-gateway-only.md:57` 标记为 P4 出站候选 | 平台执行结果回写渠道 | 平台事件触发出站 adapter | OpenClaw channel/plugin 运行时 | 保留候选 | P4 需重新锁定具体文件和回归测试；不得暴露原生 URL、错误码或 storage path |
| Hermes | Python package 与 CLI 入口 | `vendor/hermes-agent-main/pyproject.toml:372-375` 暴露 `hermes`、`hermes-agent`、`hermes-acp`，`pyproject.toml:422-445` 包含 CLI、gateway、plugins、providers | Hermes 原生命令行、ACP 和 gateway 模块 | Python console scripts | Python `>=3.11,<3.14`，见 `pyproject.toml:15` | 禁止 | 不作为 NexusAgent 对外入口；P3 只允许 planner sidecar/provider 接收平台请求 |
| Hermes | Planning conversation loop | `docs/decisions/P0-hermes-planner-only.md:44` 记录 `run_conversation` 是单轮入口，`docs/decisions/P0-hermes-planner-only.md:47` 记录 P0 guard 返回 `ExecutionPlan` | 输入为 Hermes 对话上下文；P0 输出平台 `ExecutionPlan` handoff | planner provider 调用 | Python agent core、LLM provider、skills 上下文 | 保留候选 | P3 复用规划推理，但输出必须满足平台 `ExecutionPlan` schema，不能返回最终自然语言回复 |
| Hermes | Native final response | `docs/decisions/P0-hermes-planner-only.md:46` 记录未隔离时会返回 `assistant_message.content` | 原生自然语言回复 | conversation loop 结束 | Hermes agent core | 禁止 | 最终用户回复由 NexusAgent 产品链路生成；Hermes 只产结构化计划 |
| Hermes | Native tool runtime | `docs/decisions/P0-hermes-planner-only.md:48-50` 记录并发/串行 tool executor 和 memory provider tool | Hermes tool call / memory provider tool result | 模型输出 tool call 后触发 | Python tool executor、context tools、memory provider | 禁止 | 工具执行必须交由 DSH executor，经 Coordinator、Policy-Gate、Credential Center 和 Artifact Store |
| Hermes | File memory | `docs/decisions/P0-hermes-planner-only.md:51-53` 记录 `MEMORY.md` / `USER.md` 读写路径和 P0 阻断点 | 本地文件记忆读写 | MemoryStore load/add/replace/remove/write | Hermes file storage | 禁止 | 平台唯一记忆入口是 Memory Gateway；生产隔离还需 P3/P6 文件权限和 sidecar 验证 |
| Hermes | Recurring loop | `docs/decisions/P0-hermes-planner-only.md:56-57` 记录 `/loop` 可持久化 recurring prompt 并注入 turn | 原生定时/循环任务 | CLI loop manager tick | Hermes CLI loop runtime | 禁止 | 长任务、继续、重做、调度和时钟统一由 NexusAgent Coordinator/clock 管理 |
| Hermes | Skills / MCP / planning plugins | `vendor/hermes-agent-main/pyproject.toml:166-185` 记录 extras，`pyproject.toml:256-267` 记录 MCP/computer-use extras，`docs/decisions/P0-hermes-planner-only.md:121` 标记为 planner provider 候选 | skills、Agent Plugins、MCP 和规划辅助能力 | planner sidecar 能力发现 | Python extras、plugins、MCP | 保留候选 | P3 可通过 Plugin Bridge 白名单复用；工具类插件只能输出平台 `ToolIntent` 或交由 DSH 执行 |
| DSH | CLI 与原生 profile boot | `vendor/deepseek-harness-master/apps/cli/package.json:14-16` 暴露 `dsh` bin，`package.json:19-45` 定义 build/test/web 脚本 | DSH 原生命令行、profile 和 browser UI alias | `dsh` bin 或 workspace scripts | Node `^22.19.0 || >=24.0.0`，见 `package.json:8-10` | 禁止 | 不作为 NexusAgent 对外入口；P2 只允许 executor provider sidecar 接收平台 `ExecutionRequest` |
| DSH | AgentLoop factory/create/resume | `docs/decisions/P0-dsh-executor-only.md:41-45` 记录 `ReactLoopAgent`、`ctx.agents.setFactory`、`create`、`createAgent`、`resume` | DSH 原生 agent-loop lifecycle | plugin 启动、agent factory 调用或 resume | Cordis plugin runtime、session persistence | 禁止 | P2/P6 必须证明外部和插件不能启动原生 DSH agent-loop |
| DSH | Tool execution boundary | `docs/decisions/P0-dsh-executor-only.md:46-48` 记录 `executeToolCalls`、scheduler 前 platform context 和原生 `tool/result` | P0 要求 `execution_id`、policy、allowlist；P2 应升级为 `ExecutionRequest` / `ExecutionResult` / `ExecutionEvent` | 平台 executor adapter 调用 | DSH tool runtime、Cordis services | 保留候选 | 仅在平台 execution context、sandbox policy、credential reference 和 artifact policy 校验后调用 |
| DSH | Cordis tool plugins | `vendor/deepseek-harness-master/pnpm-workspace.yaml:1-21` 记录 packages/vendor/native/apps/python 工作区，`docs/decisions/P0-dsh-executor-only.md:72` 标记 Cordis tool plugins 为候选 | 执行型工具插件能力 | provider 内能力发现和工具调度 | Cordis plugin runtime | 保留候选 | 通过 Plugin Bridge 白名单复用；默认不可信，必须有 hash、版本、权限、凭据需求和回滚记录 |
| DSH | Native session events | `docs/decisions/P0-dsh-executor-only.md:75` 记录 P2 需映射平台事件 | 原生 session event / `tool/result` | tool call 完成后追加 | DSH session log | 隔离 | 平台公共事件只用 `ExecutionEvent`、`ArtifactReference`、统一错误码和统一 ID |
| DSH | Landlock/native sandbox candidate | `vendor/deepseek-harness-master/pnpm-workspace.yaml:4-7` 将 `native/landlock-run` 作为工作区，`native/landlock-run/LICENSE:1-4` 显示 MIT | 原生 native sandbox 能力候选 | P2 executor provider 评估后决定 | native addon、Node/Cordis | 保留候选 | P2 必须补实际策略、平台兼容、OS 支持、失败语义和回滚测试；P0 不声明生产可用 |

## 4. 统一平台契约映射

| 平台契约 | 来源实验 | 当前证据 | P1/P2-P4 处理 |
|---|---|---|---|
| `TaskRequest` | OpenClaw gateway-only | `docs/decisions/P0-openclaw-gateway-only.md:8` 记录 channel/chat 输入投影为平台 `TaskRequest` | P1/P4 固化 schema、鉴权、租户映射、幂等键和渠道回写语义 |
| `ExecutionPlan` | Hermes planner-only | `docs/decisions/P0-hermes-planner-only.md:8` 记录 `ExecutionPlan` handoff，`platform/contracts/execution-plan.schema.json` 为 P0 schema | P1/P3 固化计划步骤、tool intent、memory context、错误码和 planner provider 协议 |
| `ExecutionEvent` | DSH executor-only | `docs/decisions/P0-dsh-executor-only.md:11` 记录平台可解析事件，`platform/contracts/execution-event.schema.json` 为 P0 schema | P1/P2 固化执行状态、artifact reference、stdout/stderr 脱敏、取消/超时和重试语义 |

## 5. 兼容性登记

| 上游 | 当前兼容风险 | 破坏性变更触发器 | 必须重跑的验证 | 回滚策略 |
|---|---|---|---|---|
| OpenClaw | gateway 文件路径、channel envelope、tools.invoke 或 plugin manifest 改动可能破坏 P4 接入 | `agent-turn-service.ts`、`agent-run-dispatch.ts`、`tools-invoke-shared.ts`、`src/channels/inbound-event/envelope.ts` 结构变化 | OpenClaw gateway-only targeted tests、P0/P4 smoke、渠道入站/出站 contract tests、防 native dispatch 测试 | 保留上一版 OpenClaw provider；关闭新 provider，回退到已批准版本；必要时走轻量化平台路线 |
| Hermes | Python 版本上限、conversation loop、tool executor、file memory、plugins/skills/MCP extras 改动可能破坏 P3 接入 | `conversation_loop.py`、`tool_executor.py`、`memory_manager.py`、`memory_tool.py`、`hermes_cli/loops.py` 或 `pyproject.toml` extras 变化 | Hermes planner-only targeted tests、ExecutionPlan contract tests、Memory Gateway 防直读直写测试、plugin 禁用测试 | 保留上一版 Hermes planner provider；禁用 planner 插件能力；必要时用轻量化无 Hermes 计划器 |
| DSH | 预览版 agent-loop、tool scheduler、session event、Cordis plugin 或 native sandbox 改动可能破坏 P2 接入 | `agent-loop/src/agent.ts`、`index.ts`、`tool-calls.ts`、`packages/core/agent/src/dispatch.ts`、`pnpm-workspace.yaml` 变化 | DSH executor-only targeted tests、ExecutionEvent contract tests、sandbox/artifact/credential leak tests、provider 回滚演练 | 保留上一版 DSH executor provider；禁用新 provider；必要时替换为自研轻量 executor 或其他沙箱 provider |

## 6. 已知泄漏点与阻断要求

| 泄漏点 | 来源 | 风险 | 阻断要求 |
|---|---|---|---|
| 原生品牌、URL、错误码出现在公共 API | 三个上游均有原生 CLI/package/repository 元数据 | 产品层暴露内部实现，后续替换困难 | P5 OpenAPI、SDK、Web 控制台只出现平台概念；错误码由 platform contracts 统一维护 |
| OpenClaw 原生 Agent dispatch | `docs/decisions/P0-openclaw-gateway-only.md:46-48` | 渠道消息绕过 Coordinator 和 Policy-Gate | P4 adapter 强制 gateway-only，直接 dispatch 和 tools.invoke 负向测试必须失败 |
| Hermes 原生工具和文件记忆 | `docs/decisions/P0-hermes-planner-only.md:48-53` | 工具、凭据、记忆绕过平台审计 | P3 planner-only 强制关闭 tool runtime 和 file memory，Memory Gateway 成为唯一入口 |
| DSH 原生 agent-loop 和 session event | `docs/decisions/P0-dsh-executor-only.md:41-48` | 执行器自行规划/执行，结果无法平台代理 | P2 executor-only 只能消费平台 `ExecutionRequest`，并只发布平台代理 `ExecutionEvent` / artifact reference |
| 第三方插件直接访问凭据或底层端口 | Plugin Bridge 规划与三平台插件生态 | 凭据泄漏、越权、审计缺口 | P3-P6 所有插件先进入 PluginInventory 和 AdmissionPolicy；默认 deny，按租户白名单启用 |

## 7. 许可证与再分发登记

| 范围 | 当前证据 | P0 结论 | 待办 |
|---|---|---|---|
| Hermes 根许可证 | `pyproject.toml:17-18` 和 `LICENSE:1-4` 为 MIT | 可作为内部 vendor 快照继续评估 | P8 前汇总第三方依赖 NOTICE、extras 中平台/渠道依赖许可证和再分发边界 |
| OpenClaw 根许可证 | `package.json:16` 和 `LICENSE:1-4` 为 MIT | 可作为内部 vendor 快照继续评估 | OpenClaw package 文件列出 `THIRD_PARTY_NOTICES.md`，P5/P8 需法务确认插件/渠道依赖再分发 |
| DSH 根许可证 | `package.json:4` 和 `LICENSE:1-4` 为 MIT | 可作为内部 vendor 快照继续评估 | DSH workspace、native addon、Python runtime 和 Cordis vendored packages 需 P8 统一 NOTICE 清单 |

## 8. 上游变更登记流程

每次更新 OpenClaw、Hermes 或 DSH vendor 快照时，必须新增一份基于 `scripts/upstream-tracking/upstream-change-record.template.md` 的记录，并同步更新本文件、`vendor/MANIFEST.yaml`、风险登记册、需求追踪矩阵和对应任务 ID 修改记录包。

最低登记字段：上游名称、旧版本、新版本、原始只读路径、vendor 路径、快照时间 UTC、上游 remote/commit 状态、变更摘要、受影响入口、兼容性判断、必须重跑测试、回滚方式、许可证/NOTICE 影响、未关闭【待确认问题】。

## 9. P0-05 验收状态

- 已把 OpenClaw、Hermes、DSH 的实际入口按保留、保留候选、隔离、禁止分类。
- 已登记版本、原始路径、vendor 路径、Git remote/commit 状态、许可证证据、依赖/运行时入口和 P0 实验引用。
- 未把无法确认的 upstream remote、release commit、fork 分支、生产沙箱后端、生产跨进程协议或第三方许可证结论写成事实。

## 10. 保留【待确认问题】

1. 三个原始上游目录对应的真实 Git remote、release commit 和 fork 分支仍待确认；当前本地目录不是 Git 仓库。
2. OpenClaw P0-02 本地补丁是否需要补登到 `vendor/MANIFEST.yaml` 的 `local_patches`，需在 P0 收口或 P4 前确认。
3. OpenClaw 首批正式渠道、渠道出站文件清单和 gateway-only 强制方式仍待 P4 架构评审。
4. Hermes 五层记忆正式层级、保留期、冲突策略、Memory Gateway 存储选型和 planner provider 跨进程协议仍待 P3 确认。
5. DSH P2 provider 固定版本、正式沙箱后端、文件/网络策略、取消语义和 artifact 归档策略仍待 P2/P6 确认。
6. 三个上游及其插件/依赖的 NOTICE、再分发条款和本地补丁维护边界仍需 P5/P8 或法务确认。
