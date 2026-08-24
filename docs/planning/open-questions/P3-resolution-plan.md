# P3 待确认问题处理计划

> 阶段目标：把 Hermes 固化为 planner-only provider，并把记忆读写、skills/MCP 和规划输出全部平台化。P3 不允许 Hermes 直接执行工具、直接读写原生记忆文件或向产品层返回最终自然语言回复。

## P3-01 同步状态

P3-01 已完成 Hermes planner-only provider 最小边界：`vendor/MANIFEST.yaml` 登记 `P3-01` 本地补丁，`platform/adapters/hermes/index.ts` 固定 `hermes-0.20.5` 默认 provider 并支持启用、禁用、默认切换和回滚；`vendor/hermes-agent-main/hermes_cli/gateway.py` 在 `NEXUS_HERMES_PLANNER_ONLY=1` 时返回平台化 blocked payload，阻断原生 gateway 启动。`OQ-UPSTREAM-001`、`OQ-MEMORY-001`、`OQ-MEMORY-002` 仍保持 `自动确认`：P3-01 只提供 provider baseline 和原生启动面阻断，不补真实 upstream remote、最终 Memory Gateway 存储/检索策略或正式 ExecutionPlan schema。

## OQ-UPSTREAM-001：Hermes 真实 remote、release commit 和 fork 分支

推荐处理：优先确认官方 remote/tag；如果当前快照来自 fork，则记录 fork remote、base commit、差异摘要和本地补丁。若仍无法确认来源，允许 P3 暂用本地快照，但必须保留来源不完整风险，禁止自动升级。

三平台影响：

- Hermes：provider 兼容矩阵、skills/MCP 复用和 memory patch 必须绑定真实来源。
- DSH：Hermes 只输出计划，不执行工具；因此 DSH provider 不依赖 Hermes 原生版本。
- OpenClaw：渠道上下文只通过平台 `TaskRequest` 进入 Hermes，不依赖 Hermes 原生 gateway。

关闭证据：`vendor/MANIFEST.yaml` 补 remote/tag/fork；P3 provider 兼容记录补版本；Hermes patch 和回滚方式登记。

## OQ-MEMORY-001：Memory Gateway 层级、保留期和冲突策略

推荐处理：P3 先交付三层最小实现，建议为 session、user、agent 三层；organization 和 audit snapshot 作为 P7/P8 扩展。保留期和冲突策略先按平台策略定义，不能沿用 Hermes 原生文件记忆。

三平台影响：

- Hermes：只能通过 Memory Gateway 读取受控上下文；不能直接读写 `MEMORY.md`、`USER.md` 或插件记忆文件。
- DSH：执行产物或工具输出若需要形成记忆，必须经 Artifact Store/Memory Gateway 策略处理，不能由 DSH 直接写记忆。
- OpenClaw：渠道消息可作为 conversation context 来源，但写入长期记忆前必须经过平台权限、来源和版本控制。

关闭证据：Memory Gateway schema、保留期、版本条件和冲突处理测试完成；Hermes 原生记忆直读失败；跨租户 memory 访问失败。

## OQ-MEMORY-002：Memory Gateway 存储和检索选型

推荐处理：P3 默认 PostgreSQL + pgvector，P8 复核是否切 Qdrant 或企业向量检索标准。PostgreSQL + pgvector 便于 P3 同时处理结构化 metadata、租户隔离、事务、备份和最小向量检索。

三平台影响：

- Hermes：planner context 从 Memory Gateway 检索，输入需带来源、版本和脱敏标识。
- DSH：执行结果沉淀为记忆时只传平台 artifact/memory reference，不传原生执行路径。
- OpenClaw：渠道会话内容进入记忆前必须有 tenant/user/conversation 绑定和审计。

关闭证据：P3 完成 pgvector provider ADR、检索延迟基线、备份恢复策略、租户隔离测试；P8 复核企业标准。
