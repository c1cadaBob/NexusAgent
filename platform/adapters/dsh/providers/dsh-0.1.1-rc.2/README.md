# DSH 0.1.1-rc.2 Provider

当前 vendor 快照对应的 DeepSeek Harness provider 占位说明。

范围：

- executor-only：只承接平台批准后的执行请求、沙箱策略、工具调用、artifact 输出和执行事件。
- 插件复用优先级：Cordis 工具插件、执行型工具和 provider metadata。
- 所有 stdout/stderr、文件、日志和结果必须转换为平台事件或 `ArtifactReference`。

禁止：

- 绕过 Policy-Gate 直接执行工具或命令。
- 让工具插件读取明文凭据、绕过 sandbox policy 或返回原生错误码。
- 在公共 API、SDK、控制台或日志中暴露 DSH 原生调用细节。
