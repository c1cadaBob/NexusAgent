# OpenClaw 2026.8.1 Provider

当前 vendor 快照对应的 OpenClaw provider 占位说明。

范围：

- gateway-only：只承接渠道入站、消息转换、继续/重做/取消语义映射和出站适配。
- 插件复用优先级：ClawHub 渠道插件、npm 渠道插件、消息插件、MCP 声明和 manifest 元数据。
- 所有渠道能力必须注册为平台 `CapabilityDescriptor`，并经过 `PluginAdmissionPolicy` 批准。

禁止：

- 启动或暴露 OpenClaw 原生 Agent。
- 渠道插件绕过 Coordinator、Policy-Gate、Credential Center、Artifact Store 或 Event Bus。
- 在产品 API、SDK、控制台或公共日志中暴露原生插件 API、URL、错误码或存储路径。
