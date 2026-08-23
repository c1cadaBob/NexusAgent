# P2 待确认问题处理计划

> 阶段目标：把 DSH 固化为 executor-only provider，并证明执行、沙箱、artifact、凭据和事件都受平台治理。P2 不允许把 DSH 原生 agent-loop、原生 URL、原生 session 或原生错误码暴露到产品层。

## OQ-UPSTREAM-003：DSH 真实 remote、release commit 和 fork 分支

推荐处理：优先确认官方 remote/tag；如果当前快照来自 fork，则记录 fork remote、base commit、差异摘要和本地补丁。若仍无法确认来源，允许 P2 暂时继续使用本地快照，但必须升级风险并禁止默认 provider 升级。

三平台影响：

- DSH：这是 executor provider 兼容矩阵的根问题，必须记录每次升级、回滚和替代 provider 的来源。
- Hermes：planner 只生成 `ExecutionPlan`，不依赖 DSH 原生版本；但 P3 输出的 `ToolIntent` 需要与 DSH provider contract fixture 对齐。
- OpenClaw：渠道命令最终通过 Coordinator 触发 DSH，不依赖 DSH 原生命令入口。

关闭证据：`vendor/MANIFEST.yaml` 补 remote/tag/fork；`docs/architecture/dsh-versioning-and-replacement.md` 更新兼容矩阵；P2 provider fixture 记录当前版本。

## OQ-DSH-001：DSH provider 固定、并存和回滚策略

推荐处理：固定当前 `0.1.1-rc.2` 为 P2 基线 provider，同时建立 provider registry，预留新旧 provider 并存和禁用/回滚能力。P2 不主动扩大到替代 executor，除非当前 provider 无法通过 executor-only 门禁。

三平台影响：

- DSH：所有原生差异必须封装在 `platform/adapters/dsh/providers/dsh-0.1.1-rc.2/` 内。
- Hermes：只依赖平台 `ExecutionPlan` 和 `ToolIntent` schema，不依赖 DSH provider 内部类型。
- OpenClaw：渠道取消、重做、继续最终转为平台 attempt/execution，不直接触发 DSH provider。

关闭证据：provider registry 可列出、启用、禁用和回滚；P2 smoke 验证默认 provider；P6 故障注入验证 provider 回滚。

## OQ-DSH-002：沙箱、文件/网络、取消和 artifact 策略

推荐处理：P2 默认使用容器隔离作为基线，同时评估 Landlock/native sandbox、gVisor/Firecracker 或企业沙箱作为 P8 强化候选。所有执行必须带 sandbox policy、resource budget、credential_ref 和 artifact policy。

三平台影响：

- DSH：executor 是唯一可执行工具的上游，必须强制 sandbox policy、文件/网络 deny-by-default、取消/超时和 artifact 入库。
- Hermes：Hermes 工具类插件只能输出 `ToolIntent`，实际执行交给 DSH；这避免 planner 直接拿文件/网络权限。
- OpenClaw：渠道命令不能直接变成 DSH 原生命令，必须先过平台任务状态机和 Policy-Gate。

关闭证据：文件/网络越权测试失败、取消语义可追踪、artifact 入库成功、stdout/stderr 无明文凭据、直接调用 DSH 原生 agent-loop 失败。
