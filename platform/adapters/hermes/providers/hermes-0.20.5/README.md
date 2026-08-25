# Hermes 0.20.5 Provider

当前 vendor 快照对应的 Hermes provider 占位说明。

P3-01 已将该快照登记为默认 planner-only provider：provider contract 为 `nexus.hermes_provider.p3.v1`，提供启用、禁用、默认切换和回滚基线。

P3-02 已将该 provider 的 planner memory 访问代理到 NexusAgent Memory Gateway：provider 外只看见 `nexus.hermes_memory_proxy.p3.v1`、sanitized snapshot/query/write 结果和平台 audit 事件；vendor 内 `MemoryStore` 在 planner-only 下不再读取或写入 `MEMORY.md` / `USER.md`。

P3-03 已将该 provider 当前输出的计划 schema 升级为 `nexus.execution_plan.p3.v1`：vendor `build_execution_plan()` 必须收到完整 `tenant_id/user_id/agent_id/task_id/attempt_id/execution_id/conversation_id/trace_id` 平台 context，生成严格结构化 steps、ToolIntent、budget、dependencies、risks、memory_context 和平台中性 trace；缺任一 ID、schema drift、依赖无效、解释字段或原生 URL/session/path/error/raw credential 会 fail closed。

P3-04 已补最小 Plugin Bridge 发现与准入验证：批准的 skill/MCP 候选只会作为平台 `CapabilityDescriptor` 和 planner hint 暴露，执行语义固定为 `planner_only`、`memory_gateway_required` 和 `tool_intent_only`；未批准/禁用插件、原生工具 runtime、直接记忆读取、MCP env secret、raw URL/path/session 和明文凭据全部拒绝。

范围：

- planner-only：只生成平台 `ExecutionPlan` 和规划辅助信息。
- strict-plan：不输出自然语言 `final_response`、`explanation`、`reasoning` 或上游原生字段。
- 插件复用优先级：skills、Agent Plugins v1、MCP server 声明和规划辅助插件；P3-04 仅允许通过平台白名单准入后的 planner hint，不运行插件。
- 记忆访问必须经过 Memory Gateway；插件不得直接读取或写入 `MEMORY.md`、`USER.md` 或任何原生存储路径。

禁止：

- 启动 Hermes 原生网关或工具 Runtime。
- 让 Hermes 插件直接执行本地工具、直接持有明文凭据或写原生记忆。
- 把 Hermes 原生错误码、URL、session 或文件路径透传到产品层。

验证：`tests/unit/hermes-provider-registry.test.mjs` 覆盖启用、禁用、默认切换和回滚；`tests/unit/hermes-execution-plan-contract.test.mjs`、`tests/integration/hermes-execution-plan-adapter.test.mjs` 和 `tests/security/hermes-execution-plan-leakage.test.mjs` 覆盖 P3 ExecutionPlan 契约、Coordinator/Policy-Gate planner adapter 和泄漏拒绝；`tests/unit/memory-gateway-p3.test.mjs`、`tests/integration/hermes-memory-gateway-adapter.test.mjs` 和 `tests/security/hermes-memory-isolation.test.mjs` 覆盖 Memory Gateway proxy；`tests/integration/hermes-adapter.test.mjs`、`tests/security/hermes-memory-bypass.test.mjs`、`tests/security/hermes-network-isolation.test.mjs` 和 `tests/security/hermes-plugin-bypass.test.mjs` 覆盖 P3-04 组合、防直读、端口隔离和 Plugin Bridge 防绕过；`vendor/hermes-agent-main/tests/hermes_cli/test_nexus_planner_only_gateway.py` 和 `vendor/hermes-agent-main/tests/tools/test_nexus_memory_gateway_proxy.py` 覆盖 planner-only 下原生 gateway 不启动且记忆读写不落原生文件。
