# 需求追踪矩阵

| 需求编号 | 需求摘要 | 所属阶段 | 任务 ID | 设计/代码路径 | 验收脚本 | 状态 |
|---|---|---|---|---|---|---|
| REQ-001 | 平台对外屏蔽三个底层框架原生接口 | P0-P6 | P0-02/P0-03/P0-04/P2-04/P3-04/P4-04 | `platform/adapters/` | `tests/security/` | 已规划 |
| REQ-002 | Coordinator 与 Policy-Gate 统一调度和拦截 | P1-P6 | P1-02/P2-04/P3-04/P4-04 | `platform/coordinator/`、`platform/policy-gate/` | `tests/integration/` | 已规划 |
| REQ-003 | 统一任务、尝试、执行、会话标识 | P1 | P1-01 | `platform/contracts/` | `tests/unit/` | 已规划 |
| REQ-004 | 三个上游组件分别验证 gateway/planner/executor 剥离 | P0-P4 | P0-02/P0-03/P0-04 | `vendor/` | `tests/smoke/P0.sh` | 已规划 |
| REQ-005 | 生产部署关闭热更新和调试端口 | P8 | P8-01 | `deploy/` | `tests/smoke/P8.sh` | 已规划 |
| REQ-006 | 开发服务从 3050 连续分配并提供调试端口 | P1 | P1-06 | `config/ports.dev.yaml`、`docs/architecture/ports.md` | `tests/smoke/P1.sh` | 已规划 |
| REQ-007 | 对外 API 以平台 OpenAPI 为唯一契约 | P0/P5 | P0-06/P5-01 | `docs/contracts/openapi.yaml` | `tests/contract/` | 已规划 |
| REQ-008 | Hermes 记忆读写统一经过 Memory Gateway | P1/P3/P6 | P1-04/P3-02/P3-04 | `platform/memory-gateway/` | `tests/security/` | 已规划 |
| REQ-009 | DSH 执行产出使用平台 artifact 引用 | P1/P2 | P1-04/P2-03 | `platform/artifact-store/` | `tests/integration/` | 已规划 |
| REQ-010 | P0 失败时可降级到 OpenClaw + DSH | P0/P6 | P0-02/P0-03/P0-04/P6-03 | `docs/planning/`、`tests/fault-injection/` | `tests/smoke/P6.sh` | 已规划 |
