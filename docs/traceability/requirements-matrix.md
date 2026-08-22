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
| REQ-011 | 明确十个基础服务的功能需求、技术栈和整合边界 | P0/P1 | P0-07/P1-01/P1-06 | `docs/architecture/service-blueprint.md`、`platform/contracts/`、`config/ports.dev.yaml` | `tests/smoke/P0.sh`、`tests/smoke/P1.sh` | 已规划 |
| REQ-012 | 明确哪些能力复用 OpenClaw/Hermes/DSH，哪些必须平台自研 | P0-P4 | P0-02/P0-03/P0-04/P0-07/P2-02/P3-03/P4-02 | `docs/architecture/service-blueprint.md`、`platform/adapters/`、`vendor/` | `tests/security/`、`tests/integration/` | 已规划 |
| REQ-013 | 评估 Event Bus、Credential、Observability、Artifact、Memory 等外部参考项目 | P0-P8 | P0-07/P1-03/P1-04/P1-05/P8-03 | `docs/architecture/service-blueprint.md`、`docs/risks/risk-register.md` | `tests/smoke/P1.sh`、`tests/smoke/P8.sh` | 已规划 |
| REQ-014 | 建立开发日历、阶段门禁、并行工作流和资源排期基线 | P0-P8 | P0-08/P1-06/P6-01/P8-04 | `docs/planning/development-schedule.md`、`docs/planning/integrated-platform-plan.md` | `tests/smoke/P0.sh`、阶段门禁评审 | 已规划 |
| REQ-015 | 建立可自动填充的 AI 排期提示词模板，覆盖阶段、任务、周计划、延期和门禁评审 | P0-P8 | P0-09/P1-06/P6-01/P8-04 | `docs/planning/ai-schedule-prompt-template.md`、`docs/planning/development-schedule.md` | `tests/smoke/P0.sh`、阶段门禁评审 | 已规划 |
