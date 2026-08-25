# OpenClaw 2026.8.1 Provider

当前 vendor 快照对应的 P4 gateway-only provider。P4-01 固定该版本为默认 provider，并通过平台 registry 支持禁用、恢复默认和回滚。

范围：

- gateway-only：只承接渠道入站、消息转换、继续/重做/取消语义映射和出站适配。
- 插件复用优先级：ClawHub 渠道插件、npm 渠道插件、消息插件、MCP 声明和 manifest 元数据。
- 所有渠道能力必须注册为平台 `CapabilityDescriptor`，并经过 `PluginAdmissionPolicy` 批准。
- P4-01 最小事件：`nexus.openclaw_gateway_event.p4.v1`，只表示已归一化 channel message / gateway handoff。
- P4-02 防腐契约：`nexus.openclaw_channel_inbound.p4.v1` 映射为平台 `nexus.task_request.v1`，`nexus.openclaw_channel_outbound.p4.v1` 映射平台最终结果为 queued channel send intent。
- P4-03 命令语义：`nexus.openclaw_command_mapping.p4.v1` 只把明确 continue/redo/cancel 命令映射为平台 `nexus.task_command.p4.v1`；幂等、取消和 redo attempt 由 Coordinator 处理。
- 首批默认渠道 fixture：钉钉、飞书、Telegram；新增渠道必须进入 P4/P5 范围变更。
- 首批 PluginInventory 来源：ClawHub + npm；Git、本地包和完整插件治理留给 P5/P8。

禁止：

- 启动或暴露 OpenClaw 原生 Agent。
- 渠道插件绕过 Coordinator、Policy-Gate、Credential Center、Artifact Store 或 Event Bus。
- 在产品 API、SDK、控制台或公共日志中暴露原生插件 API、URL、错误码或存储路径。

验证：

- `tests/unit/openclaw-provider-registry.test.mjs`
- `tests/unit/openclaw-channel-contracts.test.mjs`
- `tests/unit/openclaw-command-mapping.test.mjs`
- `tests/integration/openclaw-gateway-adapter.test.mjs`
- `tests/integration/openclaw-channel-adapter.test.mjs`
- `tests/integration/openclaw-command-routing.test.mjs`
- `tests/security/openclaw-gateway-bypass.test.mjs`
- `tests/security/openclaw-channel-leakage.test.mjs`
- `tests/security/openclaw-command-bypass.test.mjs`
- `tests/security/openclaw-plugin-bypass.test.mjs`
- `tests/smoke/P4.sh`
