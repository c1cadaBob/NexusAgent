# 需求追踪矩阵

| 需求编号 | 需求摘要 | 所属阶段 | 任务 ID | 设计/代码路径 | 验收脚本 | 状态 |
|---|---|---|---|---|---|---|
| REQ-001 | 平台对外屏蔽三个底层框架原生接口 | P0-P6 | 待分解 | `platform/adapters/` | `tests/security/` | 待深化 |
| REQ-002 | Coordinator 与 Policy-Gate 统一调度和拦截 | P1-P6 | 待分解 | `platform/coordinator/`、`platform/policy-gate/` | `tests/integration/` | 待深化 |
| REQ-003 | 统一任务、尝试、执行、会话标识 | P1 | 待分解 | `platform/contracts/` | `tests/unit/` | 待深化 |
| REQ-004 | 三个上游组件分别验证 gateway/planner/executor 剥离 | P0-P4 | 待分解 | `vendor/` | `tests/smoke/P0.sh` | 待深化 |
| REQ-005 | 生产部署关闭热更新和调试端口 | P8 | 待分解 | `deploy/` | `tests/smoke/P8.sh` | 待深化 |
