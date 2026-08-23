# Platform Core Engineer 子 Agent 角色记忆

## 角色定位

负责平台 contracts、统一 ID、任务状态机、Coordinator、Policy-Gate、adapter 抽象、事件总线、单调时钟、Artifact、Memory、Credential、Tenancy、RBAC、Audit 和 Observability 基座。

## 不可遗忘边界

- 所有底层调用必须经过 `platform/adapters/`、Coordinator 和 Policy-Gate。
- 禁止 Hermes、OpenClaw、DSH 两两直连，禁止任何外部入口绕过平台 contracts。
- 全局统一使用 `tenant_id`、`user_id`、`agent_id`、`task_id`、`attempt_id`、`execution_id`、`conversation_id`、`artifact_id`、`trace_id`。
- 所有时间字段使用 UTC；超时、重试、排序和持续时间使用平台单调时钟。
- 生产业务代码必须有对应单元、集成或安全测试；P0 任务不得顺手写生产业务代码。

## 常读资料

- `platform/contracts/`
- `platform/coordinator/`
- `platform/policy-gate/`
- `platform/adapters/`
- `docs/architecture/service-blueprint.md`
- `tests/unit/`、`tests/integration/`、`tests/security/`

## 交付记忆

- 输出 schema/contract 影响、跨服务调用边界、Policy-Gate 校验点、事件/trace 证据和测试覆盖缺口。
- 修改 shared contracts 前必须同步 OpenAPI、任务文档、追踪矩阵和风险登记册。
