# 风险登记册

完整风险表维护在 [实施规划第 12 节](../planning/integrated-platform-plan.md#12-风险登记册)。本文件作为执行期间的变更记录入口，每个阶段验收时更新状态、负责人、触发证据和回退决定。

| 风险 ID | 风险 | 当前等级 | 状态 | 责任阶段 |
|---|---|---|---|---|
| R-001 | DSH 预览版接口破坏性变更 | 极高 | P0-04 已记录 executor-only opt-in guard 和 `ExecutionEvent` P0 schema；正式 provider 兼容、回滚和替换仍需 P2/P6/P8 验证 | P0/P2/P6/P8 |
| R-002 | 三种剥离实验失败 | 极高 | OpenClaw gateway-only、Hermes planner-only、DSH executor-only 均已完成 P0 opt-in 实验；生产强制隔离仍待 P2-P4/P6 | P0 |
| R-003 | 原生 API/记忆/Agent 能力泄漏 | 极高 | P0-03 已验证 Hermes 原生 final response、tool、file memory、loop 实验阻断；P0-04 已验证 DSH native agent-loop 和无策略 tool-call 阻断；生产隔离待 P2/P3/P6 | P1-P6 |
| R-004 | 防腐适配器绕过平台内核 | 极高 | P0-04 已证明 DSH 进程内 guard 可阻断 native loop 和缺少平台策略的工具调度；正式 adapter、防端口绕过和 sidecar 隔离待 P1/P2/P6 | P1-P6 |
| R-005 | 记忆快照、并发写入和脏数据 | 高 | P0-03 已验证实验模式拒绝 `MEMORY.md`/`USER.md` 直读直写；Memory Gateway 并发和冲突策略待 P3/P6 | P1/P3/P6 |
| R-006 | 跨栈联调、性能或 Token 超标 | 高 | 未验证 | P1-P7 |
| R-007 | 服务边界不清导致上游原生概念泄漏到产品层 | 极高 | P0-02/P0-03/P0-04 已记录 OpenClaw、Hermes、DSH 原生入口阻断证据；P2-P5 仍需持续验证公共 API、SDK 和控制台不泄漏原生概念 | P0-P6 |
| R-008 | 外部基础设施选型过早锁死导致 P1/P8 返工 | 高 | 未验证 | P0/P1/P8 |
| R-009 | 实际团队容量低于排期基线导致关键路径延后 | 高 | 未验证 | P0-P8 |
| R-010 | AI 自动生成排期时遗漏只读目录、上游不可见、防绕过或验收命令等高危约束 | 高 | 未验证 | P0-P8 |
| R-011 | 任务提示词文档与实施规划任务表不同步 | 中 | 未验证 | P0-P8 |
| R-012 | 任务实现缺少修改前、修改过程、修改后验证审计记录 | 高 | 未验证 | P0-P8 |
| R-013 | 第三方插件绕过平台权限或直接调用原生宿主 | 极高 | 未验证 | P3-P8 |
| R-014 | 第三方插件凭据、artifact 或日志泄漏 | 极高 | 未验证 | P3-P8 |
| R-015 | 第三方插件许可证、NOTICE 或再分发条款不清 | 高 | 未验证 | P0/P5/P8 |
| R-016 | 插件更新破坏 OpenClaw/Hermes/DSH provider 兼容性 | 高 | 监控 | P3/P4/P8 |

## R-001 执行要求

DSH 不作为稳定平台契约，只作为内部 executor provider。P2 必须实现 provider 隔离和新旧 provider contract fixture；P6 必须验证 DSH provider 不可用、超时、破坏性返回结构和回滚路径；P8 必须把 DSH 上游追踪、升级门禁、默认 provider 切换和回滚手册纳入发布流程。详细规则见 [DSH 版本兼容与替换策略](../architecture/dsh-versioning-and-replacement.md)。

## 插件生态执行要求

三大平台社区插件默认不可信，只能通过 Plugin Bridge 白名单复用。P3/P4 必须证明 Hermes/OpenClaw 原生插件不能绕过 planner-only/gateway-only 边界；P5 只能开放管理员插件治理 API 和控制台，不开放租户自助安装；P6 必须模拟恶意插件访问凭据、artifact、memory、底层端口和原生 agent-loop 并验证失败；P8 必须交付插件升级、禁用、兼容矩阵和回滚手册。详细规则见 [上游版本适配与社区插件复用桥接策略](../architecture/upstream-versioning-and-plugin-bridge.md)。

## P0-02 OpenClaw gateway-only 更新

- R-002：OpenClaw 的 P0 gateway-only 实验已通过 opt-in guard 验证 channel/chat 输入可投影为平台 `TaskRequest`，原生 Agent dispatch 和 `tools.invoke` 路径可被拒绝；Hermes planner-only 与 DSH executor-only 仍需 P0-03/P0-04 关闭。
- R-007：P0-02 决策记录已列出 OpenClaw 原生入口、阻断点和回归测试清单；P4 生产 provider 化前仍不得把实验环境开关视为正式安全边界。
- 保留【待确认问题】：OpenClaw upstream remote/release commit/fork 分支、首批正式渠道清单，以及 P4 gateway-only 强制模式的配置形态。

## P0-03 Hermes planner-only 更新

- R-002：Hermes 的 P0 planner-only 实验已通过 opt-in guard 验证 `run_conversation` 可返回结构化 `ExecutionPlan` handoff，并阻断原生 final response、tool runtime、file memory 和 recurring loop；DSH executor-only 仍需 P0-04 关闭。
- R-003：P0-03 决策记录已列出 Hermes 原生入口、阻断点和回归测试清单；P3 生产 provider 化前仍不得把实验环境开关视为正式安全边界。
- R-005：P0-03 只证明 Hermes 进程内不读写 `MEMORY.md`/`USER.md`，外部进程和容器层面的文件隔离仍需 P3/P6 用 sidecar 挂载、权限和安全测试证明。
- R-007：P0-03 新增 `platform/contracts/execution-plan.schema.json` 的 P0 experimental schema；P3 仍需正式冻结 ExecutionPlan、错误码、Memory Gateway 边界和插件复用限制。
- 保留【待确认问题】：Hermes upstream remote/release commit/fork 分支、Hermes 五层记忆正式策略、P3 planner provider 跨进程协议和 Memory Gateway 生产存储选型。

## P0-04 DSH executor-only 更新

- R-001：P0-04 已证明当前 DSH `0.1.1-rc.2` 快照可以用 `NEXUS_DSH_EXECUTOR_ONLY=1` opt-in guard 阻断 native agent-loop，并用平台 `ExecutionEvent` P0 schema 固定最小解析面；由于 DSH 仍为预览版，P2 必须把 provider registry、contract fixtures 和回滚流程作为强制门禁。
- R-002：三种剥离实验在 P0 均已完成最小 opt-in 证据；任一生产化阶段若无法把实验 guard 迁移到 adapter/sidecar/Policy-Gate 强制边界，仍触发轻量化路线评审。
- R-003：P0-04 已验证 `AgentLoop.create`、`createAgent`、`resume`、配置启动 agent、`ReactLoopAgent.send`、`runMaintenance`、`wakeDriver` 以及缺少平台 execution context 的 `executeToolCalls` 可被阻断。
- R-004：P0-04 只证明进程内 TypeScript guard，不证明端口、容器网络、插件宿主或 OS 文件权限层面的不可绕过；P1/P2/P6 必须继续补防绕过、安全和故障注入测试。
- R-007：P0-04 新增 `platform/contracts/execution-event.schema.json` 的 P0 experimental schema；P2 仍需正式冻结 `ExecutionRequest`、`ExecutionResult`、`ExecutionEvent`、`ArtifactReference`、错误码和取消/超时语义。
- 保留【待确认问题】：DSH upstream remote/release commit/fork 分支、P2 provider 固定版本、正式沙箱后端、文件/网络策略、取消语义和 artifact 归档策略。
