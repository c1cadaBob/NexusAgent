# Hermes Memory Gateway 迁移与恢复说明

> 文档状态：P3-02 最小代理化基线。本文只记录 P3 内部 Memory Gateway proxy 语义，不开放公共 API，不声明生产数据库、向量检索、跨进程 sidecar 或 OS 级文件隔离已经完成。

## 1. P3-02 结论

- Hermes planner-only 模式下，`MemoryStore.load_from_disk()` 不再把 `MEMORY.md` / `USER.md` 作为事实源；快照通过 NexusAgent Memory Gateway proxy 获取。
- 受控写入 `add`、`replace`、`remove`、`batch` 通过 proxy 投影为平台 `snapshot | query | write` 语义；缺少平台 scope 或 proxy 不可用时 fail closed，且不创建 `memories/` 文件目录。
- P3-02 只启用 `session`、`user`、`agent_skill` 三层；`organization` 和 `audit_snapshot` 继续留给 P7/P8。
- `expected_version` 用于最小冲突检测；真实事务存储、保留期、检索排序和向量化留给 P3-03/P8。

## 2. 平台请求形态

内部 proxy schema 为 `nexus.hermes_memory_proxy.p3.v1`，只允许：

- `snapshot`：按 `tenant_id`、`user_id`、`agent_id`、`conversation_id` 读取授权 planner snapshot。
- `query`：在相同 scope 内查询三层 planner memory，返回 sanitized records。
- `write`：把 Hermes `memory` target 映射到 `agent_skill`，`user` 映射到 `user`，planner turn context 映射到 `session`。

所有请求必须经过 Coordinator 和 Policy-Gate 的 trusted invocation，由 `HermesMemoryGatewayAdapter` 校验 route kind、provider enabled、scope 一致性和非平台字段 denylist。

## 3. Vendor 迁移规则

- `NEXUS_HERMES_PLANNER_ONLY=1` 时，vendor helper `agent/nexus_memory_gateway_proxy.py` 要求 `NEXUS_HERMES_MEMORY_SCOPE_JSON` 提供平台 scope。
- 测试环境可注入 in-process proxy fixture；生产跨进程 transport 不在 P3-02 范围内。
- Snapshot 进入 planner 前会替换危险内容，包括原生记忆文件名、原生路径、URL、native session/error marker 和 secret-like token。
- 非 planner-only 路径保留原有文件 drift/read-failure 防护，外部修改 `MEMORY.md` / `USER.md` 仍会被拒绝覆盖并生成 `.bak` 恢复线索。

## 4. 恢复路径

- Proxy 不可用：保持 fail closed，返回 `NEXUS_HERMES_MEMORY_GATEWAY_SCOPE_REQUIRED` 或 `NEXUS_HERMES_MEMORY_GATEWAY_UNAVAILABLE`，不回退到原生文件。
- Provider 需要回滚：使用 `HermesProviderRegistry.disable()` 或 `rollbackDefault()`，再运行 `bash tests/smoke/P3.sh`。
- 文件漂移恢复：在非 planner-only 维护模式下读取 `.bak`，人工整理为干净 `§` 分隔 entry 后再由平台 Memory Gateway 重新导入。

## 5. 验证

- `tests/unit/memory-gateway-p3.test.mjs` 覆盖三层 scope、snapshot sanitizer、`expected_version` conflict 和 native field 拒绝。
- `tests/integration/hermes-memory-gateway-adapter.test.mjs` 覆盖 Coordinator + Policy-Gate trusted invocation、snapshot/query/write 和 disabled provider fail closed。
- `tests/security/hermes-memory-isolation.test.mjs` 覆盖越权 memory、原生路径、native session/error 和 secret-like 内容不进入 planner snapshot/result/event。
- `vendor/hermes-agent-main/tests/tools/test_nexus_memory_gateway_proxy.py` 覆盖 vendor proxy 读取、写入、缺 scope fail closed 和非 planner-only drift 回归。
