# P6 待确认问题处理计划

> 阶段目标：完成端到端闭环、安全、防绕过、故障注入、provider/插件回滚和 MVP 冻结判定。P6 是确认高级能力是否进入首版、长任务编排是否升级以及轻量化路线是否启动的关键阶段。

## OQ-INFRA-006：长任务编排是否引入 Temporal/Cadence

推荐处理：P1-P6 默认沿用平台自研任务状态机，不在 MVP 前引入 Temporal/Cadence；P6 通过故障注入和长任务恢复评估是否在 P8/P7+ 引入 durable workflow 后端。若企业已有 workflow 平台，可作为 provider 候选，但不能改变平台 TaskState contract。

三平台影响：

- OpenClaw：继续/重做/取消语义先映射到平台 attempt/execution，不由渠道直接操作底层执行。
- Hermes：planner timeout、degraded 和 retry 由 Coordinator 管理，不让 Hermes 自己决定长期任务生命周期。
- DSH：execution cancellation、timeout、retry 和 provider rollback 由平台状态机控制，DSH 不拥有最终任务状态。

关闭证据：P6 故障注入证明当前状态机能覆盖任务恢复、取消、重试和降级；若不足，新增 ADR 评估 Temporal/Cadence 或企业 workflow。

P6-01 证据：`tests/integration/p6-business-closed-loop.test.mjs` 已用 deterministic in-process fixture 复用同一 `ManualClock`、`InMemoryEventBus`、`PolicyGate`、`Coordinator`、Memory Gateway、Artifact Store 和三个内部 adapter，验证渠道入站、任务提交、Hermes memory/planning、DSH execution/artifact、OpenClaw outbound queued send intent 与 audit timeline 可用平台 `TaskState/Coordinator` 串联。P6-01 不引入 Temporal/Cadence，不关闭故障恢复和 durable workflow 最终选型；P6-03/P6 gate 继续补取消、重试、失败恢复和降级证据。

P6-02 证据：`tests/security/p6-anti-corruption-bypass.test.mjs` 与 `tests/security/p6-tenant-data-spine-authorization.test.mjs` 继续沿用自研 `TaskState/Coordinator` 路线，验证跳过审批、预算不足、伪造 Policy-Gate/trusted header、disabled/unknown provider 和直接 adapter invoke 均 fail closed，并通过 sanitized `policy.denied` event、Policy-Gate decision log 和内部 `api.request.denied` audit record 保留 `trace_id` 与拒绝原因。该证据不关闭故障恢复、durable workflow 或 Temporal/Cadence 最终选型，P6-03/P6 gate 继续评估。

## OQ-PLUGIN-001：P6 恶意插件隔离证据

推荐处理：P6-02 仍沿用 P5 默认结论，即平台管理员白名单治理、租户不得自助安装第三方插件；恶意插件 fixture 采用“双格式覆盖”：平台中性 mock manifest/payload + Hermes/OpenClaw Plugin Bridge fixture 变体。P6 只验证恶意 fixture 不能穿透凭据、memory、artifact、provider runtime 或原生 agent/tool/memory/runtime，不运行真实插件包、不联网、不引入生产 sidecar。

三平台影响：

- OpenClaw：gateway-only 插件只能投影 approved `channel`、`message_transform`、`mcp_server` 能力；native agent/tool/direct memory、plugin subagent、provider runtime 和 raw/native manifest 均必须 fail closed。
- Hermes：planner-only 插件只能投影 approved skill/MCP planner hint；native agent/tool/direct memory、env secret、provider runtime 和 vendor/source path 均必须 fail closed。
- DSH：P6-02 不新增 DSH 插件运行时；executor-only 边界继续通过 direct adapter invoke、artifact/credential 跨租户和 provider/native payload 防绕过测试证明不可被插件绕过。

关闭证据：P6-02 提供恶意插件隔离和防绕过证据，但 `OQ-PLUGIN-001` 仍不最终关闭；真实 sidecar/OS 隔离、插件升级/禁用/兼容矩阵、许可证发布包和生产回滚手册继续由 P8 关闭。

P6-02 证据：`tests/security/p6-plugin-isolation.test.mjs` 验证平台中性 mock 恶意 manifest/payload、Hermes Plugin Bridge 变体和 OpenClaw Plugin Bridge 变体均无法注入 `native_agent`、`native_tool`、`native_memory`、`provider_runtime`、`plugin_subagent`、env secret、raw/native manifest 或未批准 capability；`platform/adapters/hermes/plugin-bridge.ts` 与 `platform/adapters/openclaw/plugin-bridge.ts` 已补输入侧 denylist，内部只读 bridge hint 仍保持平台内投影，不进入产品公共面。

## OQ-PRODUCT-001：P7 高级能力是否进入首版

推荐处理：默认 P7 全部延后，不阻塞 MVP；只允许项目负责人明确指定的单项高级能力进入首版，并且必须具备独立开关、指标、回退路径和资源预算。高级能力不得重新引入 Hermes 原生执行或绕过平台 contracts。

三平台影响：

- Hermes：元认知、主动遗忘、技能自动评测和记忆冲突等能力价值高，但也最容易扩大 P3/P7 范围，默认不进 MVP。
- DSH：完整 Token 预算、长期任务和自动评测会增加 executor 压力，必须先有 P6 资源预算证据。
- OpenClaw：渠道侧高级交互不应阻塞首版渠道入站/出站闭环。

关闭证据：P6 MVP 验收报告明确 P7 裁剪清单；若某项进入首版，必须有任务 ID、测试、开关、告警和回滚说明。

P6-01 证据：基础业务闭环只覆盖 MVP 主链路，未引入 P7 高级能力、真实业务评测集、流式交互、自动评测或高级记忆策略。`tests/smoke/P6.sh` 将 P6-01 deterministic in-process E2E 纳入阶段门禁，并保留 P7 高级能力默认延后结论；最终 P7 裁剪清单仍由 P6 gate 或项目负责人明确覆盖。

P6-02 证据：安全攻击矩阵只补防腐层、防绕过、越权和恶意插件隔离，不新增 P7 高级能力、真实业务评测集、streaming、自动评测、高级记忆策略或用户可见产品能力。P7 高级能力继续默认延后，最终 MVP 裁剪清单仍由 P6 gate 或项目负责人确认。
