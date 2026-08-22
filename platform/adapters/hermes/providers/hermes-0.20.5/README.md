# Hermes 0.20.5 Provider

当前 vendor 快照对应的 Hermes provider 占位说明。

范围：

- planner-only：只生成平台 `ExecutionPlan` 和规划辅助信息。
- 插件复用优先级：skills、Agent Plugins v1、MCP server 声明和规划辅助插件。
- 记忆访问必须经过 Memory Gateway；插件不得直接读取或写入 `MEMORY.md`、`USER.md` 或任何原生存储路径。

禁止：

- 启动 Hermes 原生网关或工具 Runtime。
- 让 Hermes 插件直接执行本地工具、直接持有明文凭据或写原生记忆。
- 把 Hermes 原生错误码、URL、session 或文件路径透传到产品层。
