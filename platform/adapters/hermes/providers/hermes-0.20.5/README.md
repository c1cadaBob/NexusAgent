# Hermes 0.20.5 Provider

当前 vendor 快照对应的 Hermes provider 占位说明。

P3-01 已将该快照登记为默认 planner-only provider：provider contract 为 `nexus.hermes_provider.p3.v1`，当前可生成的计划 schema 仍沿用 P0 兼容的 `nexus.execution_plan.p0.v1`，最终平台 ExecutionPlan schema 留给 P3-03/P3-04 冻结。

P3-02 已将该 provider 的 planner memory 访问代理到 NexusAgent Memory Gateway：provider 外只看见 `nexus.hermes_memory_proxy.p3.v1`、sanitized snapshot/query/write 结果和平台 audit 事件；vendor 内 `MemoryStore` 在 planner-only 下不再读取或写入 `MEMORY.md` / `USER.md`。

范围：

- planner-only：只生成平台 `ExecutionPlan` 和规划辅助信息。
- 插件复用优先级：skills、Agent Plugins v1、MCP server 声明和规划辅助插件。
- 记忆访问必须经过 Memory Gateway；插件不得直接读取或写入 `MEMORY.md`、`USER.md` 或任何原生存储路径。

禁止：

- 启动 Hermes 原生网关或工具 Runtime。
- 让 Hermes 插件直接执行本地工具、直接持有明文凭据或写原生记忆。
- 把 Hermes 原生错误码、URL、session 或文件路径透传到产品层。

验证：`tests/unit/hermes-provider-registry.test.mjs` 覆盖启用、禁用、默认切换和回滚；`tests/unit/memory-gateway-p3.test.mjs`、`tests/integration/hermes-memory-gateway-adapter.test.mjs` 和 `tests/security/hermes-memory-isolation.test.mjs` 覆盖 Memory Gateway proxy；`vendor/hermes-agent-main/tests/hermes_cli/test_nexus_planner_only_gateway.py` 和 `vendor/hermes-agent-main/tests/tools/test_nexus_memory_gateway_proxy.py` 覆盖 planner-only 下原生 gateway 不启动且记忆读写不落原生文件。
