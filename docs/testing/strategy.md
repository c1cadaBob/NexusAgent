# 测试策略

## 质量门禁

- TypeScript：`tsc --noEmit`、`eslint`、目标包单元测试。
- Python：`ruff`、适用范围内的 `mypy`、目标模块单元测试。
- 核心模块覆盖率不低于 80%。
- P5 起所有对外 API 必须运行 OpenAPI 契约测试。
- 每个阶段必须运行 `tests/smoke/P<阶段>.sh` 并归档输出。

## 测试层次

| 层次 | 目录 | 关注点 |
|---|---|---|
| 单元 | `tests/unit/` | ID、状态机、错误码、预算、映射和策略 |
| 契约 | `tests/contract/` | OpenAPI、JSON Schema、事件信封、SDK 示例 |
| 集成 | `tests/integration/` | Coordinator、适配器、事件、artifact、memory 和渠道 |
| 安全 | `tests/security/` | 跨租户、越权、明文凭据、原生 API 和端口绕过 |
| 故障注入 | `tests/fault-injection/` | 超时、重试、重复事件、组件不可用、数据漂移 |
| 业务评测 | `tests/evaluation/` | 规划质量、任务完成率、Token/延迟和降级表现 |

## 最小验收命令

```sh
bash tests/smoke/P0.sh
git diff --check
git status --short --branch
```

阶段实现后再按技术栈运行对应 `tsc`、`eslint`、`ruff`、`mypy` 和目标测试，不在 P0 虚构未存在的服务命令。
