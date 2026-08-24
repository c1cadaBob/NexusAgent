# 上游版本适配与社区插件复用桥接策略

> 文档状态：P0 架构补充。本文定义 OpenClaw、Hermes、DeepSeek Harness（DSH）的上游版本适配、原生宿主侧车、社区插件复用和平台治理边界；不把任何未完成 P0-P4 源码验证的上游行为写成既定事实。

## 1. 核心结论

NexusAgent 不重写三大平台已有社区生态，也不把三大平台的原生插件 API 暴露给用户。首版采用“平台内置白名单 + 原生宿主侧车 + OpenClaw 渠道插件优先”的方案：插件尽量运行在 OpenClaw、Hermes、DSH 各自原生宿主中，NexusAgent 只负责能力发现、白名单准入、租户授权、凭据引用、事件代理、artifact 入库、审计和观测。

平台稳定面包括：平台 API、任务状态机、统一 ID、Policy-Gate 决策、Credential Center 引用、Artifact Store 引用、Event Bus 信封、审计事件、平台错误码和控制台展示字段。OpenClaw/Hermes/DSH 的 provider 版本、原生插件 manifest、原生错误码、原生 URL、session id、文件路径和运行时对象都必须终止在 adapter/provider 内部。

## 2. 三平台 provider 模型

```text
platform/adapters/
├── openclaw/
│   └── providers/openclaw-2026.8.1/
├── hermes/
│   └── providers/hermes-0.20.5/
└── dsh/
    └── providers/dsh-0.1.1-rc.2/
```

- OpenClaw provider：只承载 gateway-only 能力，优先复用 ClawHub/npm 渠道插件、消息插件、MCP 声明和 manifest 元数据；禁止启动 OpenClaw 原生 Agent、工具执行和独立记忆路径。
- Hermes provider：只承载 planner-only 能力，优先复用 skills、Agent Plugins v1、MCP 和规划辅助插件；Hermes 工具类插件只能转成平台 `ToolIntent` 或交由 DSH executor 执行，禁止 Hermes 原生工具 Runtime、原生 gateway 和记忆直读。P3-01 已将 `hermes-0.20.5` 固定为默认 planner provider，并提供 provider 启用、禁用和回滚基线；P3-02 已把 planner memory 读写代理到内部 Memory Gateway proxy，`MEMORY.md` / `USER.md` 不再作为 planner-only 事实源。
- DSH provider：沿用 [DSH 版本兼容与替换策略](dsh-versioning-and-replacement.md)，只承载 executor-only 能力，复用 Cordis 工具插件和执行型工具；执行必须经过 Policy-Gate、Credential Center、Artifact Store 和 Event Bus。

每个 provider 都必须支持版本标识、启用/禁用、兼容 fixture、升级门禁和回滚路径。P5 之后的产品 API、SDK 和控制台不能依赖具体 provider 版本。

## 3. Plugin Bridge 平台抽象

Plugin Bridge 是治理层，不是新的通用插件运行时。首版只维护平台元数据、准入状态和能力映射：

| 平台抽象 | 作用 | 必填字段 |
|---|---|---|
| `PluginInventory` | 记录原生插件包、来源和准入状态 | `plugin_id`、`source_type`、`source_ref`、`version`、`sha256`、`native_host`、`license`、`risk_level`、`allowlist_status`、`reviewer`、`trace_id` |
| `CapabilityDescriptor` | 把原生能力转成平台可治理能力 | `capability_id`、`capability_type`、`display_name`、`native_host`、`plugin_id`、`required_credentials`、`required_permissions`、`tenant_visibility` |
| `PluginAdmissionPolicy` | 管理安装、启用、升级和租户可见性 | `allowed_sources`、`allowed_capability_types`、`credential_policy`、`network_policy`、`sandbox_policy`、`tenant_scope`、`approval_state` |
| `NativeHostBinding` | 记录能力运行在哪个原生宿主侧车 | `binding_id`、`native_host`、`provider_version`、`capability_id`、`host_endpoint_ref`、`health_status`、`rollback_target` |

能力类型首版限定为 `channel`、`message_transform`、`skill`、`mcp_server`、`tool`、`planner_hint`、`provider_metadata`、`hook_metadata`。原生 UI/dashboard 插件、原生记忆后端、原生 secret manager 和绕过平台凭据/审计/模型调用的插件暂不支持。

平台契约落点：`platform/contracts/plugin-inventory.schema.json`、`platform/contracts/capability-descriptor.schema.json`、`platform/contracts/plugin-admission-policy.schema.json`、`platform/contracts/native-host-binding.schema.json`。P5 对外 API 只能暴露这些契约的平台化投影，不能把原生宿主 URL、原生错误码、session 或存储路径透传给租户。

provider 占位落点：`platform/adapters/openclaw/providers/openclaw-2026.8.1/`、`platform/adapters/hermes/providers/hermes-0.20.5/`、`platform/adapters/dsh/providers/dsh-0.1.1-rc.2/`。这些目录当前只保留边界说明，P2-P4 实现前不得写入未验证的生产逻辑。

## 4. 准入与启用流程

1. 管理员导入插件来源：OpenClaw ClawHub/npm/Git、本地 vendor 包、Hermes skills/Agent Plugins v1/MCP、DSH Cordis 工具包。
2. Plugin Bridge 做静态扫描：manifest、版本、hash、许可证、能力类型、声明凭据、网络/文件需求、原生宿主和已知兼容窗口。
3. Policy-Gate 根据 `PluginAdmissionPolicy` 判定是否允许进入平台白名单；默认拒绝未知来源、未知许可证、需要明文凭据、直接访问原生存储或声明 UI/dashboard 注入的插件。
4. 管理员批准后，插件能力进入 `approved` 状态；租户只能启用已批准的 `CapabilityDescriptor`，不能直接安装第三方插件。
5. 启用时只写平台配置和原生宿主侧车配置；平台不改写插件主体代码，不把原生对象透传到产品层。
6. 升级时必须保留上一版 `PluginInventory` 和 `NativeHostBinding`，通过兼容门禁后再切换默认能力；失败时回滚上一版绑定。

## 5. 三平台生态复用规则

| 生态来源 | 首版复用方式 | 禁止事项 |
|---|---|---|
| OpenClaw 渠道/消息插件 | 直接在 OpenClaw gateway sidecar 中运行；平台只接收标准入站事件和出站结果 | 渠道插件绕过 Coordinator、启动原生 Agent、直接读取凭据或向外暴露 OpenClaw URL |
| Hermes skills / Agent Plugins v1 / MCP | skills 和 MCP 可作为 planner 上下文或工具意图来源；MCP 调用必须经平台策略和执行链路 | Hermes 插件直接执行本地工具、直接读写 `MEMORY.md`/`USER.md`、把 MCP env 当秘密存储 |
| DSH Cordis 工具插件 | 在 DSH executor provider 内执行；输出统一转成平台 execution event 和 artifact reference | 工具插件绕过 sandbox policy、返回原生错误码、把 stdout/stderr 明文凭据写入事件或 artifact |
| 三方 model/provider 插件 | 首版只读取 manifest/provider metadata，实际模型凭据和调用仍由平台 Credential Center/Policy-Gate 控制 | 插件自带 secret manager、绕过平台模型策略或在产品层暴露原生 provider id |

## 6. 安全与治理边界

- 第三方插件默认不可信，启用前必须有来源、hash、版本、许可证、权限、凭据需求、风险等级、负责人和回滚目标。
- 所有凭据只以 `credential_ref` 进入原生宿主；禁止在插件 config、事件、日志、artifact、MCP env 或出站消息中传递明文 secret。
- 插件产生的文件、日志和结果必须进入 Artifact Store 或 Event Bus 的平台信封；禁止返回原生文件路径。
- 插件执行、渠道入站、MCP 调用和工具调用都必须带 `tenant_id`、`task_id`、`attempt_id`、`execution_id`、`trace_id` 中的相关字段。
- 控制台只展示平台能力名、状态、风险、授权范围、审计和健康，不展示原生插件 URL、原生错误码、原生 session id 或原生存储路径。

## 7. 阶段落地

P3-01 已完成 Hermes provider 最小基线：`platform/adapters/hermes/index.ts` 暴露 `HermesProviderRegistry`、`hermes-0.20.5` 默认 provider、`nexus.hermes_provider.p3.v1` contract、禁用/启用、默认切换和 `rollbackDefault()`；vendor guard 在 `NEXUS_HERMES_PLANNER_ONLY=1` 时阻断原生 gateway、tool runtime、recurring loop 和文件记忆直读直写。P3-02 已新增 `HermesMemoryGatewayAdapter` 和 vendor proxy helper，固定内部 `nexus.hermes_memory_proxy.p3.v1` / `nexus.memory_snapshot.p3.v1`，只启用 `session`、`user`、`agent_skill` 三层，并用 tests/smoke/P3.sh 验证 trusted invocation、scope 过滤、sanitizer、缺 scope fail-closed 和非 planner-only drift 回归。最终 ExecutionPlan schema、生产存储/检索和 skills/MCP 白名单继续由 P3-03/P3-04/P8 处理。

- P3：实现 Hermes provider 白名单、skills/MCP 发现、planner-only 插件限制和记忆防直读测试。
- P4：实现 OpenClaw provider 白名单、ClawHub/manifest 扫描、渠道插件复用和 gateway-only 防绕过测试。
- P5：实现管理员插件治理 API、控制台入口和 SDK/开发者文档；首版不开放租户自助安装。
- P6：实现三平台插件防绕过、越权、凭据泄漏、原生宿主回滚、插件禁用和恶意插件场景测试。
- P8：实现 OpenClaw/Hermes/DSH 上游兼容矩阵、插件升级门禁、插件禁用演练和回滚手册。

## 8. 待确认问题

- OpenClaw ClawHub、npm、Git 和本地包的首批允许来源清单是什么？
- Hermes skills tap、Agent Plugins v1 和 MCP server 是否允许租户级启用，还是只能平台管理员全局启用？
- 第三方插件许可证、NOTICE、再分发和商业使用是否需要法务逐项确认？
- 插件风险等级是否采用内置规则，还是后续接入企业安全扫描系统？
