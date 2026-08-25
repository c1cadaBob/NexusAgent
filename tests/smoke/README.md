# 阶段冒烟脚本

每个阶段提供 `P<阶段号>.sh` 一键脚本，脚本必须输出可读的 `PASS` 或 `FAIL`，并检查该阶段的核心产物、依赖连通性和关键接口。P0/P1/P2/P3/P4 脚本已随阶段任务交付；P5-P8 随各阶段继续补齐。

- `P0.sh`：检查仓库结构、vendor manifest、任务提示词、P0 决策记录和公共契约基线。
- `P1.sh`：检查平台 contracts、Coordinator/Policy-Gate、数据服务、开发 Compose、端口和平台错误码。
- `P2.sh`：检查 DSH executor-only provider guard、provider registry、anti-corruption adapter、vendor patch 登记、P2 审计记录和公共泄漏防护。
- `P3.sh`：检查 Hermes planner-only provider registry、原生 gateway/tool/loop/memory guard、vendor patch 登记、P3-01 审计记录和公共泄漏防护。
- `P4.sh`：检查 OpenClaw gateway-only provider registry、channel anti-corruption adapter、continue/redo/cancel command mapping、Plugin Bridge 白名单与 ClawHub/npm inventory、vendor guard、P4-01/P4-02/P4-03 审计记录、dev/prod 端口隔离和公共泄漏防护。
