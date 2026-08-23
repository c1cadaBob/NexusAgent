# 风险登记册

完整风险表维护在 [实施规划第 12 节](../planning/integrated-platform-plan.md#12-风险登记册)。本文件作为执行期间的变更记录入口，每个阶段验收时更新状态、负责人、触发证据和回退决定。

| 风险 ID | 风险 | 当前等级 | 状态 | 责任阶段 |
|---|---|---|---|---|
| R-001 | DSH 预览版接口破坏性变更 | 极高 | P0-04 已记录 executor-only opt-in guard 和 `ExecutionEvent` P0 schema；正式 provider 兼容、回滚和替换仍需 P2/P6/P8 验证 | P0/P2/P6/P8 |
| R-002 | 三种剥离实验失败 | 极高 | OpenClaw gateway-only、Hermes planner-only、DSH executor-only 均已完成 P0 opt-in 实验；生产强制隔离仍待 P2-P4/P6 | P0 |
| R-003 | 原生 API/记忆/Agent 能力泄漏 | 极高 | P0-03 已验证 Hermes 原生 final response、tool、file memory、loop 实验阻断；P0-04 已验证 DSH native agent-loop 和无策略 tool-call 阻断；生产隔离待 P2/P3/P6 | P1-P6 |
| R-004 | 防腐适配器绕过平台内核 | 极高 | P0-04 已证明 DSH 进程内 guard 可阻断 native loop 和缺少平台策略的工具调度；P1-01 已新增平台事件信封、统一状态机和跨租户拒绝单元测试；P1-02 已新增可信 Policy-Gate 决策和 `invokeSecuredAdapter` 防绕过测试；P1-03 已新增 adapter lifecycle、mock adapter 直接调用失败和 Coordinator/Event Bus 集成测试，正式端口和 sidecar 隔离仍待 P2-P6 | P1-P6 |
| R-005 | 记忆快照、并发写入和脏数据 | 高 | P0-03 已验证实验模式拒绝原生文件记忆直读直写；P1-04 已新增本地 Memory Gateway、五层 memory scope、版本和租户隔离测试；并发冲突、快照、长期保留和真实存储仍待 P3/P6 | P1/P3/P6 |
| R-006 | 跨栈联调、性能或 Token 超标 | 高 | 未验证 | P1-P7 |
| R-007 | 服务边界不清导致上游原生概念泄漏到产品层 | 极高 | P0-02/P0-03/P0-04 已记录 OpenClaw、Hermes、DSH 原生入口阻断证据；P0-05 已把已知入口登记为保留/隔离/禁止；P0-06 已新增公共 OpenAPI 泄漏检查；P2-P5 仍需持续验证 SDK 和控制台不泄漏原生概念 | P0-P6 |
| R-008 | 外部基础设施选型过早锁死导致 P1/P8 返工 | 高 | P0-07 已把 Temporal/OPA/NATS/Kafka/MinIO/S3/Vault/KMS/Keycloak/OpenTelemetry/Grafana/pgvector/Qdrant 标记为候选或可借鉴项目；P1-01/P1-03/P1-04 仅固定平台抽象、schema、状态机、Clock、内存 Event Bus、本地 Artifact/Memory/Credential，不锁死生产消息、对象存储、密钥或观测后端，生产选型仍待 P1/P8 | P0/P1/P8 |
| R-009 | 实际团队容量低于排期基线导致关键路径延后 | 高 | P0-08 已建立容量模型、4-5 人/8-10 人调整规则和自动重排触发器；实际团队人数、节假日和冻结窗口仍待确认 | P0-P8 |
| R-010 | AI 自动生成排期时遗漏只读目录、上游不可见、防绕过或验收命令等高危约束 | 高 | P0-10 生成器已默认执行 `--check`，校验只读目录、差异化角色、集中台账、确认文件目录、阶段历史问题回扫和验收命令；显式 `--write --overwrite` 才允许覆盖已有提示词 | P0-P8 |
| R-011 | 任务提示词文档与实施规划任务表不同步 | 中 | P0-10 已校验 45 个任务 ID 均有单独提示词文档，并把生成器检查纳入 P0 smoke；后续任务变更仍需同步运行生成器 `--check` | P0-P8 |
| R-012 | 任务实现缺少修改前、修改过程、修改后验证审计记录 | 高 | P0-09 修改记录包纳入 P0 smoke 检查；P1-01/P1-02/P1-03/P1-04 已按实时规划规则先填写修改前分析并补过程/验证记录，集中台账关闭项必须引用关闭任务/commit，阶段门禁仍需持续拒绝空白审计记录 | P0-P8 |
| R-013 | 第三方插件绕过平台权限或直接调用原生宿主 | 极高 | 未验证 | P3-P8 |
| R-014 | 第三方插件凭据、artifact 或日志泄漏 | 极高 | P1-04 已新增本地 Credential Center 引用/短租约元数据、Artifact Store metadata-only 事件、credential material 不进入 reference/audit/event 的安全测试；第三方插件恶意泄漏仍待 P3-P8 | P3-P8 |
| R-015 | 第三方插件许可证、NOTICE 或再分发条款不清 | 高 | P0-05 已确认三大上游根许可证为 MIT，但插件、extras、native addon、vendored packages 和 THIRD_PARTY_NOTICE 仍需 P5/P8 或法务确认 | P0/P5/P8 |
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

## P0-05 上游接口摸底更新

- R-001：`docs/architecture/upstream-interface-inventory.md` 已把 DSH CLI、AgentLoop、tool execution、Cordis tool plugins、native session events 和 Landlock/native sandbox candidate 分开登记；DSH 版本漂移后必须用 `scripts/upstream-tracking/upstream-change-record.template.md` 新增兼容性记录。
- R-002：P0-05 汇总了 OpenClaw gateway-only、Hermes planner-only、DSH executor-only 的保留、隔离和禁止入口；P0 剥离证据已可供 P0-06/P0-07/P1 使用，但生产强制边界仍待 P2-P4/P6。
- R-007：P0-05 明确 OpenClaw CLI/native dispatch/tools、Hermes CLI/final response/tool runtime/file memory/recurring loop、DSH CLI/native agent-loop/native session events 不得进入公共 API、SDK、控制台或跨服务接口。
- R-015：P0-05 只确认三大上游根许可证为 MIT；第三方依赖、插件、extras、native addon、vendored packages、NOTICE 和再分发条款仍是 P5/P8 待确认项。
- R-016：P0-05 新增上游变更登记模板，后续 provider 或插件升级必须记录旧版本、新版本、入口影响、验证命令、许可证影响和回滚计划。
- 保留【待确认问题】：三个上游真实 remote/commit/fork 分支、OpenClaw P0-02 manifest 补丁登记、OpenClaw 首批渠道、Hermes Memory Gateway 策略、DSH 沙箱和 artifact 策略、三平台第三方依赖 NOTICE。

## P0-06 平台 OpenAPI 初稿更新

- R-007：`docs/contracts/openapi.yaml` 已重写为平台 REST OpenAPI 3.1 初稿，只暴露 tasks、skills、capabilities、memory、tenants、approvals、plugin governance 和 health；P0 smoke 新增公共契约上游术语泄漏检查。
- R-012：`docs/planning/task-prompts/P0/P0-06.md` 的修改记录包已补齐修改前、过程和验证字段，P0 smoke 会拒绝 P0-06 审计占位。
- 新增风险：REST 与 gRPC 是否同期交付仍未确认；若 P5 要求双协议同步交付，需要把 OpenAPI 资源模型同步投影到 Protobuf 并新增契约测试。
- 保留【待确认问题】：生产鉴权方案、分页游标格式、审批动作全集、记忆层级字段、错误码最终枚举、SSE/gRPC streaming 事件出口。

## P0-07 服务蓝图更新

- R-008：`docs/architecture/service-blueprint.md` 已新增选型状态声明，明确外部项目只作为候选或借鉴来源；任何生产依赖都需要 ADR、许可证/NOTICE、运维负责人、容量假设、回滚方式和阶段验收脚本。
- R-011：P0-07 已把十个服务的功能、技术栈、输入输出、P1 最小交付和后续约束写入服务蓝图，后续任务提示词必须引用该基线，避免排期文档与架构蓝图漂移。
- R-012：P0-07 修改记录包由 P0 smoke 检查，缺少修改前、过程或验证总结时不得通过 P0 冒烟。
- R-013/R-014：Plugin Bridge 在服务蓝图中仍限定为管理员白名单与原生宿主侧车治理能力，不开放租户自助安装；凭据、artifact、memory、事件和观测必须由平台服务承接。
- 保留【待确认问题】：企业 API 框架、消息系统、对象存储、凭据后端、记忆检索、观测后端、长任务编排、首批渠道和插件市场开放范围。

## P0-08 开发排期基线更新

- R-009：`docs/planning/development-schedule.md` 已把 P0-P8 人天估算转换为日历、W1-W18 周计划、关键路径、角色容量模型和自动重排触发器；团队实际人数、投入比例、节假日和冻结窗口仍是【待确认问题】，不能视为已验证容量。
- R-010：P0-08 在排期门禁中要求各阶段保留 smoke、契约、安全、防绕过、故障注入和文档更新命令；P0-09 必须把这些约束写入自动填充提示词，避免 AI 排期遗漏高危边界。
- R-011：需求追踪矩阵已把 REQ-014 更新为 P0-08 已交付状态，并把 REQ-015 的输入依赖指向当前排期基线；后续任务提示词变更仍需同步检查。
- R-012：P0 smoke 会检查 `docs/planning/task-prompts/P0/P0-08.md` 的修改记录包不含空占位，后续阶段仍需把同类审计检查扩展到 P1-P8。
- 保留【待确认问题】：团队人数、角色投入、地区节假日、公司发布冻结窗口、gRPC 是否同期交付、首批渠道范围、生产基础设施标准和 P7 是否进入首版。

## P0-09 待确认问题集中台账更新

- R-010：新增 `docs/planning/open-questions-register.md` 和 `docs/planning/open-questions/` 确认文件目录，把上游版本、排期资源、API 产品、渠道插件、基础设施、Memory/DSH、部署、产品范围和许可证问题统一登记为 `OQ-*` ID；集中台账以表格维护状态索引，确认文件按 P0/P1/P2/P3/P4/P5/P6/P8 写明推荐处理方式、默认解决方案、三平台影响和关闭证据。需要加入排期的问题必须同步更新 `docs/planning/task-prompts/` 对应阶段提示词，后续 AI 排期必须优先读取集中台账与确认文件。
- R-011：`docs/planning/ai-schedule-prompt-template.md` 已要求自动填充保留 `OQ-*` ID、状态、责任工作流、最晚确认阶段和解决说明文档，减少散落文档与任务提示词漂移。
- R-012：P0 smoke 新增 P0-09 修改记录包和集中台账检查；台账关闭规则要求 `已关闭` 项必须填写确认结论、解决说明文档和关闭任务/commit。
- R-012：P0-11 新增实时规划提示词执行规则，要求任务开始前先填写“修改前分析”，如存在未处理待确认问题必须先处理再进入实现；修改过程中持续补充“修改过程记录”，验证完成后补齐“修改后验证与总结”。
- R-012：每个阶段结束前必须回扫当前阶段及其之前阶段的 `OQ-*`、任务修改记录包、风险登记册、需求追踪矩阵和专业文档；若仍有未处理或未同步问题，必须先修复或创建后续实时规划提示词，不能直接进入下一阶段。
- R-010/R-011：P0-10 已将 `scripts/planning/generate-task-prompts.py` 升级为安全生成器，默认 `--check` 不覆盖人工优化文档，显式 `--write` 只创建缺失文档，`--write --overwrite` 才覆盖已有文档；P0 smoke 已运行生成器检查并阻止脚本缓存目录进入工作树。
- R-012：P0-11 已把 P0-01 至 P0-08 的历史待确认问题回写为 `OQ-*`、`自动确认` 状态和确认文件引用，并明确 23 个问题仍未关闭；后续阶段门禁必须继续补齐确认结论和关闭任务/commit。
- 保留【待确认问题】：当前 23 个问题均为 `自动确认`，表示已结合三大平台生成默认解决方案，但仍未关闭；后续必须补齐确认结论和关闭任务/commit。
