# Hermes 0.20.5 Provider

当前 vendor 快照对应的 Hermes provider 占位说明。

P3-01 已将该快照登记为默认 planner-only provider：provider contract 为 `nexus.hermes_provider.p3.v1`，当前可生成的计划 schema 仍沿用 P0 兼容的 `nexus.execution_plan.p0.v1`，最终平台 ExecutionPlan schema 留给 P3-02/P3-03 冻结。

范围：

- planner-only：只生成平台 `ExecutionPlan` 和规划辅助信息。
- 插件复用优先级：skills、Agent Plugins v1、MCP server 声明和规划辅助插件。
- 记忆访问必须经过 Memory Gateway；插件不得直接读取或写入 `MEMORY.md`、`USER.md` 或任何原生存储路径。

禁止：

- 启动 Hermes 原生网关或工具 Runtime。
- 让 Hermes 插件直接执行本地工具、直接持有明文凭据或写原生记忆。
- 把 Hermes 原生错误码、URL、session 或文件路径透传到产品层。

验证：`tests/unit/hermes-provider-registry.test.mjs` 覆盖启用、禁用、默认切换和回滚；`vendor/hermes-agent-main/tests/hermes_cli/test_nexus_planner_only_gateway.py` 覆盖 planner-only 下原生 gateway 不会启动。
