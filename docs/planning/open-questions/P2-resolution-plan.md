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

P2-01 进展：`platform/adapters/dsh/index.ts` 已新增 `DshProviderRegistry`，固定 `dsh-0.1.1-rc.2` 为默认 provider，并覆盖列出、启用、禁用、切换默认 provider、回滚到上一默认 provider和未知 provider 拒绝；`tests/unit/dsh-provider-registry.test.mjs` 与 `tests/smoke/P2.sh` 已作为关闭证据入口。

P2-04 进展：`tests/integration/dsh-adapter-failover.test.mjs` 已用 baseline + canary fixture provider 验证正常平台请求 PASS、失败 canary 不绕过 Policy-Gate、disabled canary 不触发 provider runner，且 `rollbackDefault()` 可恢复上一可用 provider 后再次执行成功。P6 仍需做真实 provider 故障注入和生产切换演练后再把该 OQ 从集中台账关闭。

## OQ-DSH-002：沙箱、文件/网络、取消和 artifact 策略

推荐处理：P2 默认使用容器隔离作为基线，同时评估 Landlock/native sandbox、gVisor/Firecracker 或企业沙箱作为 P8 强化候选。所有执行必须带 sandbox policy、resource budget、credential_ref 和 artifact policy。

三平台影响：

- DSH：executor 是唯一可执行工具的上游，必须强制 sandbox policy、文件/网络 deny-by-default、取消/超时和 artifact 入库。
- Hermes：Hermes 工具类插件只能输出 `ToolIntent`，实际执行交给 DSH；这避免 planner 直接拿文件/网络权限。
- OpenClaw：渠道命令不能直接变成 DSH 原生命令，必须先过平台任务状态机和 Policy-Gate。

关闭证据：文件/网络越权测试失败、取消语义可追踪、artifact 入库成功、stdout/stderr 无明文凭据、直接调用 DSH 原生 agent-loop 失败。

P2-01 进展：vendor guard 已在 scheduler 前校验平台取消请求，`nexus.execution_event.p2.v1` 可表达 `execution.cancelled`；`nexus-executor-only-provider.spec.ts` 覆盖取消不进入 native tool dispatch。正式文件/网络 deny-by-default、artifact 入库和 stdout/stderr 脱敏仍由 P2-03/P2-04 关闭。

P2-03 进展：`platform/adapters/dsh/index.ts` 已在平台 `ExecutionRequest` 中新增 `resource_budget`，并在 provider runner 前强制 `deny_by_default` 文件/网络策略；provider raw stdout/stderr/artifact candidates 经 adapter 脱敏、资源预算校验并入库为 `ArtifactReference`，`tests/unit/dsh-execution-policy.test.mjs`、`tests/integration/dsh-artifact-events.test.mjs` 和 `tests/security/dsh-sandbox-credential.test.mjs` 已作为最小关闭证据入口。生产级容器/内核沙箱、直接端口隔离、sidecar 权限和故障注入仍由 P2-04/P6/P8 继续关闭，因此该问题在集中台账中仍保持自动确认状态。

P2-04 进展：`tests/security/dsh-bypass.test.mjs` 已覆盖直接 `DshExecutorAdapter.invoke()`、伪造 allow-like decision/header、伪造 trusted invocation、native-like payload、非法 execution_id、tenant mismatch 和 raw credential material 注入均失败；`tests/security/dsh-network-isolation.test.mjs` 已静态验证 dev Compose 中 `dsh-adapter` 服务端口和 debug 端口仅绑定 loopback、`NEXUS_PUBLIC=false`、只接入 internal network，并验证生产 Compose 不含 DSH dev port、debug、`--inspect` 或 hot reload。该证据只关闭 P2 最小防绕过和静态编排面；生产 sandbox 后端、sidecar 权限和故障注入仍保持自动确认，等待 P6/P8 关闭。
