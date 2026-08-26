# 阶段冒烟脚本

每个阶段提供 `P<阶段号>.sh` 一键脚本，脚本必须输出可读的 `PASS` 或 `FAIL`，并检查该阶段的核心产物、依赖连通性和关键接口。P0/P1/P2/P3/P4/P5 脚本已随阶段任务交付；P6 已交付 P6-01 基础业务闭环门禁和 P6-02 防腐层/防绕过/恶意插件隔离门禁，P7-P8 随各阶段继续补齐。

- `P0.sh`：检查仓库结构、vendor manifest、任务提示词、P0 决策记录和公共契约基线。
- `P1.sh`：检查平台 contracts、Coordinator/Policy-Gate、数据服务、开发 Compose、端口和平台错误码。
- `P2.sh`：检查 DSH executor-only provider guard、provider registry、anti-corruption adapter、vendor patch 登记、P2 审计记录和公共泄漏防护。
- `P3.sh`：检查 Hermes planner-only provider registry、原生 gateway/tool/loop/memory guard、vendor patch 登记、P3-01 审计记录和公共泄漏防护。
- `P4.sh`：检查 OpenClaw gateway-only provider registry、channel anti-corruption adapter、continue/redo/cancel command mapping、approved channel routing、集中防绕过、Plugin Bridge 白名单与 ClawHub/npm inventory、vendor guard、P4-01/P4-02/P4-03/P4-04 审计记录、dev/prod 端口隔离和公共泄漏防护。
- `P5.sh`：检查 P5-01 平台 REST API、P5-02 Web 控制台、P5-03 渠道接入管理、P5-04 TypeScript SDK 和开发者文档站、P5 阶段门禁报告、OpenAPI runtime alignment、管理员插件治理投影、P5-01/P5-02/P5-03/P5-04 审计记录、产品 API/控制台/渠道管理/SDK/docs 上游术语泄漏防护、P5 targeted contract/integration/security tests、SDK/docs examples 和 Vite build。
- `P6.sh`：检查 P6-01 deterministic in-process business closed loop、P6-02 anti-corruption attack matrix、tenant/data-spine authorization、双格式覆盖恶意插件隔离、TaskState/Coordinator 默认路线、OQ-PLUGIN-001/OQ-INFRA-006/OQ-PRODUCT-001 同步、P7 高级能力延后、P6-01/P6-02 审计记录、`policy.denied`/`api.request.denied` 证据、Date.now 禁用扫描和 targeted E2E/security tests；故障注入、降级路线、真实业务评测集和生产 sidecar/OS 隔离继续由 P6-03/P6 gate/P8 扩展。
