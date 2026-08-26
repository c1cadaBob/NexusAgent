# 风险登记册

完整风险表维护在 [实施规划第 12 节](../planning/integrated-platform-plan.md#12-风险登记册)。本文件作为执行期间的变更记录入口，每个阶段验收时更新状态、负责人、触发证据和回退决定。

| 风险 ID | 风险 | 当前等级 | 状态 | 责任阶段 |
|---|---|---|---|---|
| R-001 | DSH 预览版接口破坏性变更 | 极高 | P0-04 已记录 executor-only opt-in guard 和 `ExecutionEvent` P0 schema；P2-01 已固定 `dsh-0.1.1-rc.2` 默认 provider、provider registry、启用/禁用/回滚语义和 P2 targeted smoke；P2-02 已新增平台 request/result schema、provider fixture 复用和 anti-corruption adapter；P2-03 已新增 `resource_budget`、sandbox/network policy、artifact/event normalization 和 provider raw output fixture；P2-04 已新增失败/disabled canary provider 回滚集成测试；真实 provider 故障注入、升级兼容矩阵和生产切换仍需 P6/P8 验证 | P0/P2/P6/P8 |
| R-002 | 三种剥离实验失败 | 极高 | OpenClaw gateway-only、Hermes planner-only、DSH executor-only 均已完成 P0 opt-in 实验；P2 已完成 DSH executor provider 最小强制边界；P3-01 已完成 Hermes planner provider registry 和原生 gateway 阻断基线；P4-01 已完成 OpenClaw gateway-only provider registry、最小 channel adapter、vendor native payload guard 和 Plugin Bridge allowlist 基线；P4-02 已补 channel inbound/outbound 防腐契约和平台最终结果出站发送意图；P4-03 已补 continue/redo/cancel 到平台 task/attempt 语义、幂等重放和 cancel event；P4-04 已补 approved channel routing 与集中防绕过门禁；真实厂商出站回写、生产 sidecar 和故障注入仍待 P5/P6/P8 | P0/P2-P4/P6/P8 |
| R-003 | 原生 API/记忆/Agent 能力泄漏 | 极高 | P0-03 已验证 Hermes 原生 final response、tool、file memory、loop 实验阻断；P0-04 已验证 DSH native agent-loop 和无策略 tool-call 阻断；P1-05 已新增审计/观测接口且仅记录平台 ID、平台动作和平台 trace；P2-01 已扩大 DSH native constructor、runtime context、agent dispatch、provider disabled 和无上下文 tool-call 阻断；P2-04 已覆盖 DSH 直接调用、伪造 trusted invocation、native-like payload、raw credential material 和 dev/prod 端口静态隔离；P3-01 已验证 Hermes planner-only 下原生 gateway 不启动，provider 状态视图不暴露原生 URL/session/path/error；P3-02 已验证 planner memory snapshot/write 只经 Memory Gateway proxy 且结果/事件不含原生文件路径、native session/error、secret-like 内容或未授权 memory text；P3-03 已验证当前 ExecutionPlan 不含解释字段、自然语言 final response、原生 URL/session/path/error、raw credential 或原生记忆文件名；P3-04 已新增 Memory Gateway direct-read payload 拒绝、Hermes/Memory dev 端口 loopback-only 和 Plugin Bridge 未批准/原生插件 fail-closed 测试；P4-01 已验证 OpenClaw native Agent/tools/memory/plugin subagent/raw native payload 和 dev/prod 端口直连面 fail closed；P4-02 已验证 channel inbound/outbound result/event/error 不含 native URL/session/path/error/raw credential 或原生 manifest；P4-03 已验证 command mapping 和 Coordinator command API 拒绝原生 cancel/task/tool/memory、raw credential、native URL/path/session/error 和 plugin subagent payload；P4-04 已集中验证 native Agent/tool/memory/task/cancel、raw credential、native URL/path/session/error、plugin subagent 和未批准 manifest fail closed；生产 sidecar 和 OS 隔离仍待 P6/P8 | P1-P6 |
| R-004 | 防腐适配器绕过平台内核 | 极高 | P0-04 已证明 DSH 进程内 guard 可阻断 native loop 和缺少平台策略的工具调度；P1 已新增 Policy-Gate、adapter lifecycle、Coordinator/Event Bus 和 Tenancy/RBAC/Audit/Observability 负向测试；P2-01 已新增 DSH provider registry 禁用/回滚测试和 scheduler 前 cancellation/context/provider 校验；P2-02 已新增 `DshExecutorAdapter` 可信 invocation、Policy-Gate route、provider disabled 和 allowlist block 集成测试；P2-03 已在 provider 调用前阻断越权文件/网络请求并验证 sandbox.denied 事件；P2-04 已验证伪造决策、伪造 header、非法 execution_id、tenant mismatch、失败/disabled canary provider 均不能绕过平台内核；P3-01 已新增 Hermes provider registry 禁用/回滚测试并把 gateway 原生入口阻断到启动 guard 前；P3-02 已新增 `HermesMemoryGatewayAdapter` trusted invocation、memory route、provider disabled 和 scope mismatch 测试；P3-03 已新增 `HermesExecutionPlanAdapter` trusted invocation、planner route 和 strict schema validator 测试；P3-04 已用同一 Coordinator/Policy-Gate 组合验证 planner+memory adapter，direct invoke、伪造 decision、disabled provider 和 identity mismatch 均 fail closed；P4-01 已新增 `OpenClawGatewayAdapter` trusted invocation、channel route、provider disabled、tenant mismatch 和 forged decision 负向测试；P4-02 已用同一 adapter 覆盖 inbound/outbound operation、direct invoke、伪造 decision、disabled provider、未知 channel 和 tenant/conversation mismatch fail closed；P4-03 已新增 `Coordinator.submitTaskCommand()`，验证 continue/redo/cancel 都必须经过 Policy-Gate、TaskState 和幂等存储，adapter 只产生命令映射、不直接改变状态；P4-04 已将 `markTrustedAdapterInvocation` 收敛为私有 helper，并验证伪造 trusted header/decision 无法绕过 lifecycle wrapper；P5-03 已将渠道连接测试封装为平台 dry-run，通过 Coordinator/Policy-Gate/Event Bus 后只返回 queued send-intent 摘要，operator/viewer 写入和跨租户测试均 fail closed | P1-P6 |
| R-005 | 记忆快照、并发写入和脏数据 | 高 | P0-03 已验证实验模式拒绝原生文件记忆直读直写；P1-04 已新增本地 Memory Gateway、五层 memory scope、版本和租户隔离测试；P3-02 已新增三层 planner snapshot sanitizer、`expected_version` 冲突检测、跨用户/租户过滤、vendor proxy fail-closed 和非 planner-only drift 回归测试；长期保留、真实存储、检索排序和生产迁移仍待 P3/P6/P8 | P1/P3/P6 |
| R-006 | 跨栈联调、性能或 Token 超标 | 高 | P1-06 已新增 10 服务开发 Compose、健康占位服务和 P1 smoke 编排校验，降低本地联调端口/健康检查漂移风险；真实跨栈性能、Token 和上游 provider 联调仍待 P2-P7 | P1-P7 |
| R-007 | 服务边界不清导致上游原生概念泄漏到产品层 | 极高 | P0-02/P0-03/P0-04 已记录 OpenClaw、Hermes、DSH 原生入口阻断证据；P0-05 已把已知入口登记为保留/隔离/禁止；P0-06/P1-06 已新增公共 OpenAPI 与平台错误码泄漏检查；P2-01 smoke 增加公共 API/error/product surface 上游命名扫描；P2-02 已新增 DSH adapter 原生 URL/session/path/error/secret 字段清洗测试；P2-03 已验证 stdout/stderr/artifact/event/error 不泄漏原生 URL/path/session/credential；P2-04 已新增 native/raw credential request denylist 和 dev/prod 编排隔离测试；P3-01 smoke 继续扫描公共 API/error/product surface，并验证 Hermes provider status view 不含原生 URL/session/path/error；P3-02 smoke 增加 Memory Gateway proxy marker 与 public surface 泄漏扫描；P3-03 smoke 增加 strict ExecutionPlan schema/validator/security marker，验证 plan 和 validator error 不泄漏解释字段、原生路径/session/error 或 raw credential；P3-04 smoke 增加 Plugin Bridge、memory bypass 和 network isolation marker；P4-01 smoke 增加 OpenClaw provider、gateway event、plugin allowlist、network isolation 和 public surface 泄漏扫描；P4-02 smoke 增加 channel inbound/outbound schema、send intent、PluginInventory 和泄漏测试 marker；P4-03 smoke 增加 command mapping、task command idempotency、cancel event 和 command bypass marker；P4-04 smoke 增加 channel-routing、openclaw-bypass 和私有 trusted marker 防绕过 marker；P5-01 已新增 `product/api/` REST MVP、`platform/public-surface/` request/response guard、OpenAPI runtime alignment 和 P5 contract/integration/security smoke，验证产品 API 与公共契约不暴露上游原生命名、URL/path/session/error 或 secret material；P5-02 已新增 `product/web-console/` API client、view-model 泄漏扫描、OpenAPI route alignment 和 Vite build smoke，验证控制台只调用平台 `/v1/*` API 且不展示上游原生字段；P5-03 已新增渠道管理 API/控制台/README 和 P5 smoke 扫描，验证 `/v1/channels*`、OpenAPI、产品渠道文档和控制台 Channels 页面不暴露上游原生命名、原生 URL/path/session/error、provider binding、runtime 或凭据引用值；P5-04 已新增 TypeScript SDK、examples、developer docs-site、SDK/docs leakage tests 和 P5 smoke 扫描，验证 SDK/docs 只调用平台 `/v1/*` API、不展示上游原生命名、原生 URL/path/session/error、provider binding、runtime、raw credential 或真实 secret；其他 SDK 语言和发布包仍待 P8 或后续批次验证 | P0-P6 |
| R-008 | 外部基础设施选型过早锁死导致 P1/P8 返工 | 高 | P0-07 已把 Temporal/OPA/NATS/Kafka/MinIO/S3/Vault/KMS/Keycloak/OpenTelemetry/Grafana/pgvector/Qdrant 标记为候选或可借鉴项目；P1-01/P1-03/P1-04 仅固定平台抽象、schema、状态机、Clock、内存 Event Bus、本地 Artifact/Memory/Credential；P1-05 仅固定本地 RBAC、hash-chain Audit 和 Observability 接口；P1-06 仅固定开发 Compose、Node health 占位、端口和 smoke，不锁死生产 IdP、OPA、审计存储、观测后端或 Kubernetes/Compose 最终生产形态，生产选型仍待 P1/P8 | P0/P1/P8 |
| R-009 | 实际团队容量低于排期基线导致关键路径延后 | 高 | P0 门禁已关闭 `OQ-SCHEDULE-001` 和 `OQ-SCHEDULE-002`，默认采用 8-10 核心角色容量模型、4-5 人降级排期和当前日历冻结缓冲；真实容量或冻结窗口变化由自动重排触发器处理 | P0-P8 |
| R-010 | AI 自动生成排期时遗漏只读目录、上游不可见、防绕过或验收命令等高危约束 | 高 | P0-10 生成器已默认执行 `--check`，校验只读目录、差异化角色、集中台账、确认文件目录、阶段历史问题回扫和验收命令；显式 `--write --overwrite` 才允许覆盖已有提示词 | P0-P8 |
| R-011 | 任务提示词文档与实施规划任务表不同步 | 中 | P0-10 已校验 45 个任务 ID 均有单独提示词文档，并把生成器检查纳入 P0 smoke；后续任务变更仍需同步运行生成器 `--check` | P0-P8 |
| R-012 | 任务实现缺少修改前、修改过程、修改后验证审计记录 | 高 | P0-09 修改记录包纳入 P0 smoke 检查；P1-01/P1-02/P1-03/P1-04/P1-05/P1-06 已按实时规划规则先填写修改前分析并补过程/验证记录；P1 门禁报告已回扫 P0/P1 任务审计记录和仍为自动确认的问题；P2 门禁报告已回扫 P0/P1/P2 任务审计记录、修复 P1 审计文本占位式三点分支记号，并确认 P2-01/P2-02/P2-03/P2-04 修改记录包无占位；集中台账关闭项必须引用关闭任务/commit，后续阶段门禁仍需持续拒绝空白审计记录 | P0-P8 |
| R-013 | 第三方插件绕过平台权限或直接调用原生宿主 | 极高 | P3-01 已把 Hermes provider 能力限定为 planner-only、ExecutionPlan、Memory Gateway required 和 native gateway/tool/loop block；P3-03 已把工具类规划输出限制为平台 ToolIntent 和 `platform_executor_required` executor_policy，不允许原生工具名、URL、session、path、raw credential 或解释文本进入计划；P3-04 已新增内部 `nexus.hermes_plugin_bridge.p3.v1` 最小准入 guard，approved skill/MCP 只能投影为 planner hint，unapproved/disabled/native tool/direct memory/MCP secret 候选全部 fail closed；P4-01 已新增内部 `nexus.openclaw_plugin_bridge.p4.v1` 最小准入 guard，approved channel/message/MCP capability 只能投影为 gateway descriptor，unapproved/disabled/native agent/native tool/direct memory/raw URL/path/session/secret-like 候选全部 fail closed；P4-02 已将 ClawHub/npm manifest candidate 映射为平台 PluginInventory/CapabilityDescriptor 并拒绝 Git/local/native runtime manifest；P4-04 已集中验证 unapproved manifest、native capability、secret/transport plugin payload 和 plugin subagent 均不能绕过平台边界；P5-01 已新增管理员插件治理 REST API，tenant admin/viewer 无法导入或审批插件，URL/path/credential/manifest 绕过 payload fail closed；P5-02 已新增管理员插件治理控制台入口，tenant admin/viewer 隐藏插件治理导航且强制调用 admin API 仍 fail closed；P5-04 SDK 和开发者文档明确插件治理为平台管理员操作，租户不得自助安装第三方插件，SDK examples 只调用管理员平台 API；完整租户启用、真实侧车和恶意插件演练仍待 P6/P8 | P3-P8 |
| R-014 | 第三方插件凭据、artifact 或日志泄漏 | 极高 | P1-04 已新增本地 Credential Center 引用/短租约元数据、Artifact Store metadata-only 事件、credential material 不进入 reference/audit/event 的安全测试；P2-03 已验证 DSH executor stdout/stderr/artifact candidates 入库前脱敏，artifact/event 只暴露 metadata；P3-04 已验证 Hermes Plugin Bridge 拒绝 MCP env secret、raw credential、URL/path/session 和明文 token-like 配置，批准 capability 只返回 `credential_ref`；P4-01 已验证 OpenClaw Plugin Bridge 拒绝 secret-like MCP env、raw credential、URL/path/session 和 native plugin payload，批准 channel capability 只返回 `credential_ref`；P4-02 已验证 outbound send intent、Event Bus 审计 payload 和 PluginInventory 投影不含明文 secret/native path/session/error；P4-04 已验证 raw credential、native URL/path/session/error 和 secret/transport manifest 失败错误只暴露平台 code 与脱敏 details；P5-01 公共 plugin governance inventory/capability 不返回 credential refs、source_ref、runtime、URL/path/session 或 secret material，导入请求含 credential/raw/manifest 绕过字段时 fail closed；P5-02 控制台插件 view-model 只投影公共插件元数据且 security test 拒绝 source/native/provider/session/path/secret markers；P5-03 渠道配置请求仅接受凭据引用，公共响应和控制台 view-model 只显示 `credential_status`，raw credential、native URL/path/session/error、provider binding、manifest 和 plugin subagent 绕过字段均 fail closed；第三方插件运行时恶意泄漏仍待 P6/P8 | P3-P8 |
| R-015 | 第三方插件许可证、NOTICE 或再分发条款不清 | 高 | P0-05 已确认三大上游根许可证为 MIT；P5-01 已要求管理员插件导入提供 `expected_sha256`、`license`、`notice_status`、`risk_level` 和版本元数据，并用 P5 security tests 验证缺失或含 URL/path/credential/manifest 绕过字段的导入失败；P5-04 SDK examples 和开发者文档继续展示 hash/license/notice_status/risk_level 元数据入口，并用 SDK/docs leakage tests 验证公共文档不携带原生来源或 secret material；插件、extras、native addon、vendored packages 和 THIRD_PARTY_NOTICE 法务确认仍需 P8 | P0/P5/P8 |
| R-016 | 插件更新破坏 OpenClaw/Hermes/DSH provider 兼容性 | 高 | P2-01 已为 DSH 建立 provider registry、默认 provider、启用/禁用/回滚和 targeted fixture；P2-02 已证明默认 provider 与候选 fixture provider 可复用同一平台 execution contract；P2-03 已把 provider raw output 约束在 `ArtifactReference`/Event Bus/平台错误码归一化边界内；P2-04 已用 canary fixture 验证失败 provider、disabled provider 和 rollback 恢复路径；P3-01 已为 Hermes 建立 provider registry、默认 provider、启用/禁用/回滚和 P3 smoke；P3-03 已新增 P3 ExecutionPlan schema、validator 和 provider fixture 复用，保留 P0 marker 仅作历史证据；P4-01 已为 OpenClaw 建立 provider registry、默认 provider、启用/禁用/回滚和 P4 smoke；真实插件升级矩阵仍待 P8 | P2-P4/P8 |

## R-001 执行要求

DSH 不作为稳定平台契约，只作为内部 executor provider。P2 必须实现 provider 隔离和新旧 provider contract fixture；P6 必须验证 DSH provider 不可用、超时、破坏性返回结构和回滚路径；P8 必须把 DSH 上游追踪、升级门禁、默认 provider 切换和回滚手册纳入发布流程。详细规则见 [DSH 版本兼容与替换策略](../architecture/dsh-versioning-and-replacement.md)。

## 插件生态执行要求

三大平台社区插件默认不可信，只能通过 Plugin Bridge 白名单复用。P3/P4 必须证明 Hermes/OpenClaw 原生插件不能绕过 planner-only/gateway-only 边界；P5 只能开放管理员插件治理 API 和控制台，不开放租户自助安装；P6 必须模拟恶意插件访问凭据、artifact、memory、底层端口和原生 agent-loop 并验证失败；P8 必须交付插件升级、禁用、兼容矩阵和回滚手册。详细规则见 [上游版本适配与社区插件复用桥接策略](../architecture/upstream-versioning-and-plugin-bridge.md)。

## P6-02 防腐层、防绕过和越权测试更新

- R-003/R-007：P6-02 新增 `tests/security/p6-anti-corruption-bypass.test.mjs`、`tests/security/p6-tenant-data-spine-authorization.test.mjs` 和 `tests/security/p6-plugin-isolation.test.mjs`，断言 direct invoke、伪造 trust/header、native URL/path/session/error、provider runtime、raw credential、真实网络 URL 和 `/opt/` 路径不能进入公共响应、事件或 audit payload。
- R-004：Coordinator 对 denied task submit、task command 和 adapter dispatch 发布 sanitized `policy.denied` event；Platform API 对已认证失败请求写入内部 `api.request.denied` audit record，防绕过失败证据包含 `trace_id` 与拒绝原因。
- R-005/R-014：跨租户 artifact/memory/credential 读取、credential resolve、审批跳过和预算不足均 fail closed，错误响应不回显 credential material、secret-like 字段或 native/provider runtime marker。
- R-013/R-014：恶意插件 fixture 采用“双格式覆盖”，即平台中性 mock manifest/payload + Hermes/OpenClaw Plugin Bridge fixture 变体；Hermes/OpenClaw bridge 输入侧 denylist 已补 `provider_runtime`、`native_agent`、`native_tool`、`native_memory`、`native_runtime`、`plugin_subagent`、env secret、raw/native manifest 和 source/path/url marker。
- R-012：`tests/smoke/P6.sh` 已扩展 P6-02 required files、审计无占位、attack matrix marker、dual-format malicious plugin marker、denied audit/trace marker、Date.now 禁用扫描和 targeted security tests。
- 遗留风险：P6-02 不关闭故障注入、降级路线、生产 sidecar/OS 隔离、真实插件运行时、真实业务评测集、真实渠道网络、生产 durable workflow 或插件升级回滚矩阵；这些继续由 P6-03、P6 gate 和 P8 关闭。

## P6-01 内部业务闭环更新

- R-003/R-007：P6-01 新增 deterministic in-process `tests/integration/p6-business-closed-loop.test.mjs`，断言 closed-loop Event Bus/audit timeline 不含 raw credential、native URL/path/session/error、provider runtime、真实网络 URL 或 `/opt/` 路径；公共 API、SDK、控制台和 OpenAPI 未在本任务变更。
- R-004：P6-01 使用同一 `PolicyGate`、`Coordinator`、`InMemoryEventBus` 和受控 adapter dispatch 串联 OpenClaw inbound/outbound、Hermes memory/planning 与 DSH execution，证明基础业务闭环不需要 adapters 两两直连或绕过平台 TaskState/Coordinator。
- R-005/R-014：P6-01 在闭环中验证 Hermes memory write/snapshot 经 `LocalMemoryGateway`，DSH artifact 内容只进入 `LocalArtifactStore`，`artifact.created` 与 `execution.completed` 事件只保留 metadata-only 引用。
- R-006：P6-01 将跨栈联调的首个基础成功标准固定为 deterministic in-process 100% 通过；真实多服务性能、Token 预算、故障注入和长任务恢复仍由 P6-03/P7/P8 承接。
- R-012：P6-01 修改记录包已补修改前分析、过程记录和验证总结字段，并由 `tests/smoke/P6.sh` 检查审计无占位、OQ/风险/追踪同步和 targeted E2E。
- 遗留风险：P6-01 不关闭恶意插件运行时、真实 sidecar/OS 隔离、生产 durable workflow、真实渠道网络、故障注入或 OpenClaw + DSH 降级路线；这些继续由 P6-02、P6-03 和 P8 关闭。

## P4-01/P4-02/P4-03/P4-04 OpenClaw gateway-only provider、channel 防腐、命令语义与防绕过更新

- R-002/R-016：`platform/adapters/openclaw/index.ts` 已固定 `openclaw-2026.8.1` 默认 gateway-only provider，`OpenClawProviderRegistry` 覆盖启用、禁用、默认切换和回滚，`tests/unit/openclaw-provider-registry.test.mjs` 与 `tests/smoke/P4.sh` 验证 provider view 不泄漏 vendor path、native session、URL 或原生错误。
- R-003/R-004/R-007：`OpenClawGatewayAdapter` 只接受 Coordinator/Policy-Gate trusted invocation 和 channel route；`tests/integration/openclaw-gateway-adapter.test.mjs` 与 `tests/security/openclaw-gateway-bypass.test.mjs` 覆盖 direct invoke、伪造决策、disabled provider、tenant mismatch、native Agent/tools/memory/plugin subagent/raw credential/native URL/path/session/error payload fail closed。
- R-013/R-014：`platform/adapters/openclaw/plugin-bridge.ts` 已新增 `nexus.openclaw_plugin_bridge.p4.v1` 最小准入，钉钉、飞书、Telegram channel fixture 和 message transform 可被发现为 sanitized gateway descriptor，未批准/禁用/native agent/native tool/direct memory/secret-like MCP 配置均拒绝。
- R-002/R-004/R-007：P4-02 新增 `nexus.openclaw_channel_inbound.p4.v1` / `nexus.openclaw_channel_outbound.p4.v1`，验证 approved inbound 可映射为平台 `TaskRequest`，平台最终结果只生成 queued channel send intent，出站不执行真实厂商发送、不支持流式 chunk。
- R-013/R-014：P4-02 将 ClawHub/npm manifest candidate 投影为平台 `PluginInventory` 与 `CapabilityDescriptor`，并验证 Git/local、未批准、禁用、native runtime、raw URL/path/session/secret-like manifest 均拒绝。
- R-002/R-004/R-007：P4-03 新增 `nexus.openclaw_command_mapping.p4.v1` 与 `nexus.task_command.p4.v1`，验证 continue 保持当前 attempt、redo 只从 blocked/failed/cancelled 重开 attempt、cancel 产生 `task.state_changed` cancelled event，且同一 channel message replay 不重复执行。
- R-003/R-013/R-014：P4-03 命令路径拒绝 raw credential、native session/url/path/error、OpenClaw 原生 task/cancel/tool/memory 和 plugin subagent payload；adapter 只产生命令映射，不直接改变平台任务状态。
- R-002/R-004/R-007：P4-04 新增 `tests/integration/channel-routing.test.mjs`，用同一 Coordinator、Policy-Gate、Event Bus 和 `OpenClawGatewayAdapter` 验证 approved inbound text、command mapping、平台 `TaskCommand`、outbound queued send intent 和 enabled provider 正向路径。
- R-003/R-004/R-013/R-014：P4-04 新增 `tests/security/openclaw-bypass.test.mjs`，集中验证 direct invoke、伪造 trust/header、未知渠道、identity mismatch、native Agent/tool/memory/task/cancel、raw credential、native URL/path/session/error、plugin subagent 和未批准 manifest fail closed。
- 遗留风险：P4-04 不实现真实 IM/WebSocket 厂商发送、流式输出、生产持久化幂等存储、真实 sidecar 网络策略或插件升级矩阵；这些继续由 P5/P6/P8 关闭。

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

## P2-01 DSH executor provider 边界更新

- R-001：P2-01 已把当前 `0.1.1-rc.2` 快照登记为默认 executor provider，并用 `DshProviderRegistry` 提供启用、禁用、默认切换和回滚入口；上游真实 commit/remote 仍按 `OQ-UPSTREAM-003` 保留为未关闭风险。
- R-003/R-004：vendor guard 已在 executor-only 模式下阻断 `ReactLoopAgent` 构造、runtime context projection、agent-scoped dispatch、native `create/createAgent/resume` 和缺少平台 context/provider 的 tool-call；取消请求会在 native scheduler 前失败。
- R-007：P2 smoke 已检查公共 OpenAPI、平台错误码和产品层不出现三大上游原生命名；provider 内部仍允许内部 provider ID 和 vendor 路径，但不得穿透到产品层。
- R-016：DSH provider 兼容 fixture 已覆盖默认 provider、禁用、回滚和 unknown provider 拒绝；真实插件更新、跨版本 provider 并存和故障注入仍待 P2-04/P6/P8。

## P2-02 DSH 防腐适配器更新

- R-001：P2-02 已新增 `platform/contracts/execution-request.schema.json`、`platform/contracts/execution-result.schema.json` 和 provider contract fixture，证明默认 provider 与候选 fixture provider 可复用平台 contract；真实升级矩阵仍待 P8。
- R-004：`DshExecutorAdapter` 只在 Coordinator/Policy-Gate 可信 invocation 下执行，直接调用、provider disabled、身份不匹配和 tool allowlist block 都有 Node 测试覆盖；直接端口、伪造 header 和 sidecar 网络隔离仍待 P2-04/P6。
- R-007/R-014：`tests/security/dsh-adapter-leakage.test.mjs` 模拟 provider 返回 native URL、session、path、native error 和 plaintext 字段，adapter 输出会清洗为平台错误和平台 payload；stdout/stderr 真实脱敏与 artifact 入库仍待 P2-03。
- R-016：P2 smoke 已纳入 P2-02 required files、审计记录、contract/integration/security 测试和 `vendor/MANIFEST.yaml` P2-02 patch 登记检查。

## P2-03 DSH 沙箱、Artifact 与执行事件更新

- R-001/R-016：`platform/adapters/dsh/index.ts` 已在平台 `ExecutionRequest` 中新增 `resource_budget`，provider fixture 可产生 raw stdout/stderr/artifact candidates，但 provider 外统一归一化为平台 `ExecutionResult`、`ArtifactReference` 和 P2 execution events。
- R-004：`tests/unit/dsh-execution-policy.test.mjs` 验证 `deny_by_default` 文件/网络策略在 provider runner 前阻断，`workspace_readonly` 仅允许只读相对 workspace 引用，timeout/stdout/stderr/artifact budget 映射为平台错误。
- R-007/R-014：`tests/integration/dsh-artifact-events.test.mjs` 和 `tests/security/dsh-sandbox-credential.test.mjs` 验证 stdout/stderr/artifact 入库为 metadata-only `artifact.created` 事件，result/event/error/artifact content 不泄漏 credential ref、明文 secret、原生 URL/path/session/native error。
- 遗留风险：P2-03 是平台最小门禁，不证明真实容器/内核级生产 sandbox、直接端口隔离、sidecar 权限或 provider 故障注入，这些仍由 P2-04/P6/P8 关闭。

## P2-04 DSH 集成、防绕过与回滚更新

- R-001/R-016：`tests/integration/dsh-adapter-failover.test.mjs` 已用 baseline 与 canary fixture provider 验证失败 canary 映射为平台错误、disabled canary 不触发 provider runner，`rollbackDefault()` 恢复上一可用 provider 后正常平台请求成功。
- R-003/R-004：`tests/security/dsh-bypass.test.mjs` 已覆盖直接 adapter 调用、伪造 allow-like decision/header、伪造 trusted invocation、native-like payload、非法 execution_id、tenant mismatch 和 raw credential material 注入均失败。
- R-007：`tests/security/dsh-network-isolation.test.mjs` 静态校验 `dsh-adapter` dev Compose 服务端口和 debug 端口仅绑定 loopback、`NEXUS_PUBLIC=false`、只接入 internal network，并确认 prod Compose 不含 DSH dev port、debug、`--inspect` 或 hot reload。
- 遗留风险：P2-04 关闭 P2 最小防绕过、静态端口隔离和回滚证据，不代表真实容器/内核 sandbox、sidecar 权限、跨进程网络策略或生产故障注入已关闭；这些继续由 P6/P8 验证。

## P2 阶段门禁收口更新

- R-012：`docs/planning/phase-gates/P2-gate-review.md` 已回扫 P0-01 至 P2-04 任务文档、P0/P1 门禁、OQ 台账、需求追踪矩阵、风险登记册和 P0/P1/P2 smoke；P1-01 至 P1-05 审计记录中的旧三点分支记号已改为非占位描述。
- R-001/R-004/R-016：P2 门禁确认 P2-01 至 P2-04 均通过，DSH provider registry、防腐 adapter、sandbox/artifact/event controls、防绕过、静态端口隔离和 fixture rollback 证据齐备。
- 遗留风险：P2 自身收口不关闭 P3/P4 provider、P6 故障注入或 P8 生产基础设施风险；`OQ-UPSTREAM-003`、`OQ-DSH-001`、`OQ-DSH-002` 继续保持自动确认并由 P6/P8 关闭。

## P3-01 Hermes planner provider 边界更新

- R-003/R-004：`vendor/hermes-agent-main/hermes_cli/gateway.py` 已在 `run_gateway()` 入口最前方接入 `NEXUS_HERMES_PLANNER_ONLY` guard，返回 `NEXUS_HERMES_PLANNER_ONLY_GATEWAY_BLOCKED`，不会进入原生 gateway guard 或 `start_gateway()`。
- R-007/R-016：`platform/adapters/hermes/index.ts` 新增 `HermesProviderRegistry`，固定 `hermes-0.20.5` 默认 planner-only provider，并覆盖启用、禁用、默认切换、回滚和清洗后的 status view；`tests/smoke/P3.sh` 纳入公共泄漏扫描。
- 遗留风险：P3-01 不关闭最终 ExecutionPlan schema、Memory Gateway 生产检索/写入、skills/MCP 白名单执行、Hermes 完整防腐 adapter 或生产 sidecar/OS 隔离；`OQ-UPSTREAM-001`、`OQ-MEMORY-001`、`OQ-MEMORY-002` 继续保持自动确认。

## P3-02 Hermes Memory Gateway 代理化更新

- R-003/R-005：`platform/memory-gateway/index.ts` 已新增 P3 planner snapshot、query/write proxy、三层 scope 过滤、`expected_version` 冲突检测和 unsafe memory placeholder；`tests/security/hermes-memory-isolation.test.mjs` 验证原生文件名、路径、native session/error、secret-like 内容和越权 memory 不进入 planner snapshot/result/event。
- R-004：`HermesMemoryGatewayAdapter` 只接受 Coordinator/Policy-Gate trusted invocation、memory route 和 enabled provider；直接调用、伪造 decision、provider disabled、conversation mismatch 和 native-like payload 均有集成/安全测试覆盖。
- R-007/R-013：vendor `agent/nexus_memory_gateway_proxy.py` 与 `tools/memory_tool.py` 在 planner-only 下通过 platform proxy 获取 snapshot/write，缺 scope/proxy fail closed 且不创建 `memories/`，插件或原生 memory 文件不能成为 planner-only 事实源。
- 遗留风险：P3-02 不证明真实跨进程 Memory Gateway transport、生产数据库/向量检索、保留期、sidecar 文件权限或完整 Plugin Bridge 白名单；这些继续由 P3-04/P6/P8 关闭。

## P3-03 Hermes ExecutionPlan 标准化更新

- R-003/R-007：`platform/contracts/execution-plan.schema.json` 已将当前 planner 输出升级为 `nexus.execution_plan.p3.v1`，P0 marker 仅作历史证据；`tests/security/hermes-execution-plan-leakage.test.mjs` 验证 plan 和 validator error 不含解释字段、自然语言 final response、原生 URL/session/path/error、raw credential 或原生记忆文件名。
- R-004/R-016：`platform/adapters/hermes/index.ts` 新增 `HermesExecutionPlanAdapter`、`validateHermesExecutionPlan()` 和 provider fixture 复用；`tests/integration/hermes-execution-plan-adapter.test.mjs` 验证 planner adapter 必须经 Coordinator/Policy-Gate trusted invocation 和 planner route，schema drift、缺平台 ID、无效依赖和 unknown tool step 均 fail closed。
- R-013/R-014：vendor `agent/nexus_planner_only_experiment.py` 的 `build_execution_plan()` 现在要求完整平台 context，并只输出平台 ToolIntent、budget、dependencies、risks、memory_context 和平台中性 trace；工具类插件不能把原生工具名、URL、session、path 或明文凭据带入计划。
- 遗留风险：P3-03 不实现真实 planner LLM 调用、Plugin Bridge 白名单、最终用户回复编排或生产 sidecar 隔离；这些继续由 P3-04/P5/P6/P8 关闭。

## P3-04 Hermes 集成和防直读验证更新

- R-003/R-005/R-007：`tests/security/hermes-memory-bypass.test.mjs` 已验证 `MEMORY.md`、`USER.md`、路径穿越、原生 URL/session/error、raw credential、api key、password 和 token-like payload 不能进入 Memory Gateway proxy；`tests/security/hermes-network-isolation.test.mjs` 静态验证 Hermes adapter 与 Memory Gateway dev 端口只绑定 loopback，生产 Compose 不含 dev-only debug/hot reload 或原生 gateway 配置。
- R-004：`tests/integration/hermes-adapter.test.mjs` 在同一 Coordinator/Policy-Gate 下组合验证 planner 与 memory adapter 正向路径，并覆盖 direct invoke、伪造 Policy-Gate decision、disabled provider、tenant/conversation mismatch fail closed。
- R-013/R-014/R-016：`platform/adapters/hermes/plugin-bridge.ts` 与 `tests/security/hermes-plugin-bypass.test.mjs` 已提供最小 `nexus.hermes_plugin_bridge.p3.v1` discovery/admission guard；approved skill/MCP 只投影为 sanitized planner hint，未批准/禁用插件、原生工具执行、直接记忆读取、MCP env secret、raw URL/path/session 和明文凭据全部拒绝。
- 遗留风险：P3-04 不实现真实插件 runtime、公共插件治理 API、控制台、许可证审核、生产 sidecar 绑定、OS 级文件隔离或 Memory Gateway 生产存储/检索；这些继续由 P5/P6/P8 关闭。

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
- P0 门禁关闭：`OQ-SCHEDULE-001` 和 `OQ-SCHEDULE-002` 已接受默认容量/日历策略；后续真实容量、地区节假日或发布冻结窗口变化不阻塞 P0，按自动重排触发器和风险复盘处理。
- 保留【待确认问题】：gRPC 是否同期交付、生产基础设施标准和 P7 是否进入首版。

## P0-09 待确认问题集中台账更新

- R-010：新增 `docs/planning/open-questions-register.md` 和 `docs/planning/open-questions/` 确认文件目录，把上游版本、排期资源、API 产品、渠道插件、基础设施、Memory/DSH、部署、产品范围和许可证问题统一登记为 `OQ-*` ID；集中台账以表格维护状态索引，确认文件按 P0/P1/P2/P3/P4/P5/P6/P8 写明推荐处理方式、默认解决方案、三平台影响和关闭证据。需要加入排期的问题必须同步更新 `docs/planning/task-prompts/` 对应阶段提示词，后续 AI 排期必须优先读取集中台账与确认文件。
- R-011：`docs/planning/ai-schedule-prompt-template.md` 已要求自动填充保留 `OQ-*` ID、状态、责任工作流、最晚确认阶段和解决说明文档，减少散落文档与任务提示词漂移。
- R-012：P0 smoke 新增 P0-09 修改记录包和集中台账检查；台账关闭规则要求 `已关闭` 项必须填写确认结论、解决说明文档和关闭任务/commit。
- R-012：P0-11 新增实时规划提示词执行规则，要求任务开始前先填写“修改前分析”，如存在未处理待确认问题必须先处理再进入实现；修改过程中持续补充“修改过程记录”，验证完成后补齐“修改后验证与总结”。
- R-012：每个阶段结束前必须回扫当前阶段及其之前阶段的 `OQ-*`、任务修改记录包、风险登记册、需求追踪矩阵和专业文档；若仍有未处理或未同步问题，必须先修复或创建后续实时规划提示词，不能直接进入下一阶段。
- R-010/R-011：P0-10 已将 `scripts/planning/generate-task-prompts.py` 升级为安全生成器，默认 `--check` 不覆盖人工优化文档，显式 `--write` 只创建缺失文档，`--write --overwrite` 才覆盖已有文档；P0 smoke 已运行生成器检查并阻止脚本缓存目录进入工作树。
- R-012：P0-11 已把 P0-01 至 P0-08 的历史待确认问题回写为 `OQ-*`、状态和确认文件引用；P0 门禁关闭 4 个到期问题后，仍有 19 个问题未关闭，后续阶段门禁必须继续补齐确认结论和关闭任务/commit。

## P0 阶段门禁收口更新

- R-009：P0 门禁关闭 `OQ-SCHEDULE-001` 和 `OQ-SCHEDULE-002`，默认容量模型与日历冻结缓冲已成为后续排期基线；实际资源变化继续触发重排。
- R-013/R-014：P0 门禁关闭 `OQ-CHANNEL-001`，默认首批渠道为钉钉、飞书、Telegram；新增企业微信、Slack 等渠道必须进入 P4/P5 范围变更，并补渠道插件、凭据和防绕过测试。
- R-015：P0 门禁关闭 `OQ-UPSTREAM-004`，确认 vendor 快照长期排除构建产物、缓存、日志和依赖目录；后续上游升级仍需记录版本、hash、许可证/NOTICE 和回滚方式。
- 保留【待确认问题】：当前 19 个问题仍为 `自动确认`，表示已结合三大平台生成默认解决方案，但仍未关闭；后续必须按最晚确认阶段补齐确认结论和关闭任务/commit。
