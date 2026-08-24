# DSH 0.1.1-rc.2 Provider

当前 vendor 快照对应的 DeepSeek Harness provider 说明。P2-01 将该快照固定为 `platform/adapters/dsh/index.ts` 中的默认 executor-only provider，并通过 `vendor/deepseek-harness-master/packages/core/agent-loop/src/nexus-executor-only-experiment.ts` 校验平台 execution context、provider metadata、取消状态和工具 allowlist。P2-02 在本目录新增 provider 内部映射，把平台 `nexus.execution_request.p2.v1` 转成 DSH guard request fixture，并只返回平台 `nexus.execution_result.p2.v1`、P2 execution event 和平台错误码。P2-03 继续保持 provider 内部 raw output fixture，仅由 adapter 将 stdout/stderr/artifact candidates 脱敏、预算校验并上传为平台 `ArtifactReference`。

范围：

- executor-only：只承接平台批准后的执行请求、沙箱策略、工具调用、artifact 输出和执行事件。
- 插件复用优先级：Cordis 工具插件、执行型工具和 provider metadata。
- 所有 stdout/stderr、文件、日志和结果必须转换为平台事件或 `ArtifactReference`。
- provider registry：当前 provider 可被 `DshProviderRegistry.disable()` 禁用，可在候选 provider 切换后通过 `rollbackDefault()` 回到上一默认 provider。
- execution event：P0 `nexus.execution_event.p0.v1` 继续兼容，P2 使用 `nexus.execution_event.p2.v1` 携带 `provider_id` 与平台状态。
- anti-corruption fixture：`index.ts` 仅接收平台 request、tool allowlist、sandbox/network/artifact policy 标记和 `credential_ref`，不导出 DSH 原生类型、session、URL、路径或错误码。
- sandbox/artifact fixture：`index.ts` 可在测试输入启用 provider raw output candidates，但 provider 外只返回 adapter 归一化后的 artifact references、execution events 和平台错误。

禁止：

- 绕过 Policy-Gate 直接执行工具或命令。
- 让工具插件读取明文凭据、绕过 sandbox policy 或返回原生错误码。
- 在公共 API、SDK、控制台或日志中暴露 DSH 原生调用细节。

遗留到后续任务：

- P2-04/P6：直接端口、伪造 header、sidecar 权限、真实生产沙箱后端和 provider 故障注入验证。
