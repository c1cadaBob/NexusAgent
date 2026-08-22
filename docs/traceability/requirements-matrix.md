# 需求追踪矩阵

| 需求编号 | 需求摘要 | 所属阶段 | 任务 ID | 设计/代码路径 | 验收脚本 | 状态 |
|---|---|---|---|---|---|---|
| REQ-001 | 平台对外屏蔽三个底层框架原生接口 | P0-P6 | P0-02/P0-03/P0-04/P2-04/P3-04/P4-04 | `platform/adapters/`、`vendor/openclaw-main/src/gateway/agent-turn/nexus-gateway-only-experiment.ts`、`docs/decisions/P0-openclaw-gateway-only.md` | `tests/security/`、`vendor/openclaw-main/src/gateway/agent-turn/nexus-gateway-only-experiment.test.ts`、`vendor/openclaw-main/src/gateway/nexus-gateway-only-tools-invoke.test.ts` | P0-02 已实验验证 OpenClaw native Agent/tool 阻断；Hermes/DSH 待 P0-03/P0-04 |
| REQ-002 | Coordinator 与 Policy-Gate 统一调度和拦截 | P1-P6 | P1-02/P2-04/P3-04/P4-04 | `platform/coordinator/`、`platform/policy-gate/` | `tests/integration/` | 已规划 |
| REQ-003 | 统一任务、尝试、执行、会话标识 | P1 | P1-01 | `platform/contracts/` | `tests/unit/` | 已规划 |
| REQ-004 | 三个上游组件分别验证 gateway/planner/executor 剥离 | P0-P4 | P0-02/P0-03/P0-04 | `vendor/`、`docs/decisions/P0-openclaw-gateway-only.md` | `tests/smoke/P0.sh`、OpenClaw gateway-only targeted tests | OpenClaw gateway-only 已完成 P0 实验；Hermes/DSH 待验证 |
| REQ-005 | 生产部署关闭热更新和调试端口 | P8 | P8-01 | `deploy/` | `tests/smoke/P8.sh` | 已规划 |
| REQ-006 | 开发服务从 3050 连续分配并提供调试端口 | P1 | P1-06 | `config/ports.dev.yaml`、`docs/architecture/ports.md` | `tests/smoke/P1.sh` | 已规划 |
| REQ-007 | 对外 API 以平台 OpenAPI 为唯一契约 | P0/P5 | P0-06/P5-01/P0-02 | `docs/contracts/openapi.yaml`、`vendor/openclaw-main/src/gateway/agent-turn/nexus-gateway-only-experiment.ts` | `tests/contract/`、`vendor/openclaw-main/src/gateway/agent-turn/nexus-gateway-only-experiment.test.ts` | P0-02 已按 OpenAPI `TaskRequest` 最小字段投影；完整 API 契约测试待 P5 |
| REQ-008 | Hermes 记忆读写统一经过 Memory Gateway | P1/P3/P6 | P1-04/P3-02/P3-04 | `platform/memory-gateway/` | `tests/security/` | 已规划 |
| REQ-009 | DSH 执行产出使用平台 artifact 引用 | P1/P2 | P1-04/P2-03 | `platform/artifact-store/` | `tests/integration/` | 已规划 |
| REQ-010 | P0 失败时可降级到 OpenClaw + DSH | P0/P6 | P0-02/P0-03/P0-04/P6-03 | `docs/planning/`、`tests/fault-injection/` | `tests/smoke/P6.sh` | 已规划 |
| REQ-011 | 明确十个基础服务的功能需求、技术栈和整合边界 | P0/P1 | P0-07/P1-01/P1-06 | `docs/architecture/service-blueprint.md`、`platform/contracts/`、`config/ports.dev.yaml` | `tests/smoke/P0.sh`、`tests/smoke/P1.sh` | 已规划 |
| REQ-012 | 明确哪些能力复用 OpenClaw/Hermes/DSH，哪些必须平台自研 | P0-P4 | P0-02/P0-03/P0-04/P0-07/P2-02/P3-03/P4-02 | `docs/architecture/service-blueprint.md`、`platform/adapters/`、`vendor/` | `tests/security/`、`tests/integration/` | 已规划 |
| REQ-013 | 评估 Event Bus、Credential、Observability、Artifact、Memory 等外部参考项目 | P0-P8 | P0-07/P1-03/P1-04/P1-05/P8-03 | `docs/architecture/service-blueprint.md`、`docs/risks/risk-register.md` | `tests/smoke/P1.sh`、`tests/smoke/P8.sh` | 已规划 |
| REQ-014 | 建立开发日历、阶段门禁、并行工作流和资源排期基线 | P0-P8 | P0-08/P1-06/P6-01/P8-04 | `docs/planning/development-schedule.md`、`docs/planning/integrated-platform-plan.md` | `tests/smoke/P0.sh`、阶段门禁评审 | 已规划 |
| REQ-015 | 建立可自动填充的 AI 排期提示词模板，覆盖阶段、任务、周计划、延期和门禁评审 | P0-P8 | P0-09/P1-06/P6-01/P8-04 | `docs/planning/ai-schedule-prompt-template.md`、`docs/planning/development-schedule.md` | `tests/smoke/P0.sh`、阶段门禁评审 | 已规划 |
| REQ-016 | 为每个任务 ID 生成单独完整的实施规划提示词文档 | P0-P8 | P0-10/P1-06/P6-01/P8-04 | `scripts/planning/generate-task-prompts.py`、`docs/planning/task-prompts/` | `tests/smoke/P0.sh`、任务提示词覆盖率检查 | 已规划 |
| REQ-017 | 每个任务 ID 文档必须包含修改记录包，用于记录修改前分析、过程记录和修改后验证 | P0-P8 | P0-10/P1-06/P6-01/P8-04 | `docs/planning/task-prompts/`、`scripts/planning/generate-task-prompts.py` | `tests/smoke/P0.sh`、阶段门禁评审 | 已规划 |
| REQ-018 | DSH 作为可替换 executor provider，平台契约不随 DSH 版本变化 | P2/P6/P8 | P2-01/P2-02/P2-04/P6-03/P8-02/P8-04 | `platform/adapters/dsh/`、`docs/architecture/dsh-versioning-and-replacement.md` | `tests/integration/`、`tests/security/`、`tests/fault-injection/`、`tests/smoke/P8.sh` | 已规划 |
| REQ-019 | OpenClaw/Hermes 作为可替换 provider，平台契约不随上游版本变化 | P3/P4/P6/P8 | P3-01/P3-04/P4-01/P4-04/P6-03/P8-02/P8-04 | `platform/adapters/openclaw/providers/`、`platform/adapters/hermes/providers/`、`docs/architecture/upstream-versioning-and-plugin-bridge.md` | `tests/integration/`、`tests/security/`、`tests/fault-injection/`、`tests/smoke/P8.sh` | 已规划 |
| REQ-020 | 三大平台社区插件通过 Plugin Bridge 白名单复用，不要求重复开发改造 | P3-P8 | P3-01/P3-03/P4-01/P4-02/P5-01/P5-02/P6-02/P8-04 | `docs/architecture/upstream-versioning-and-plugin-bridge.md`、`platform/contracts/plugin-inventory.schema.json`、`platform/contracts/capability-descriptor.schema.json`、`product/api/`、`product/web-console/` | `tests/security/`、`tests/contract/`、`tests/smoke/P6.sh` | 已规划 |
