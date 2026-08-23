# 上游变更登记记录模板

> 复制本模板后填写。不能确认的字段必须写【待确认问题】，并说明影响、候选方案和最晚确认阶段。

## 1. 基本信息

| 字段 | 内容 |
|---|---|
| 登记 ID | `UPSTREAM-YYYYMMDD-<upstream>-<seq>` |
| 关联任务 ID | 例如 `P2-01` / `P3-01` / `P4-01` / `P8-02` |
| 上游名称 | OpenClaw / Hermes / DSH |
| 平台内部角色 | gateway-only / planner-only / executor-only |
| 旧版本 |  |
| 新版本 |  |
| 原始只读路径 | `/opt/project/...` |
| vendor 路径 | `/opt/project/NexusAgent/vendor/...` |
| 快照时间 UTC |  |
| 上游 remote | 【待确认问题】 |
| 上游 commit / tag / fork 分支 | 【待确认问题】 |
| 文件清单 SHA-256 |  |
| 登记人 |  |

## 2. 变更摘要

- 上游 release note 或源码差异摘要：
- NexusAgent 本地补丁是否需要重放：
- provider 兼容性结论：兼容 / 条件兼容 / 不兼容 / 【待确认问题】
- 是否触发生产回滚或轻量化路线评审：

## 3. 受影响入口

| 入口 | 旧分类 | 新分类 | 源码证据 | 影响 | 处理动作 |
|---|---|---|---|---|---|
|  | 保留/隔离/禁止 | 保留/隔离/禁止 | 路径:行号 |  |  |

## 4. 契约与数据影响

- 平台公共 API / OpenAPI：
- 平台 JSON Schema / Protobuf：
- 统一 ID：`tenant_id`、`user_id`、`agent_id`、`task_id`、`attempt_id`、`execution_id`、`conversation_id`、`artifact_id`、`trace_id`：
- 事件、状态机、错误码、artifact、credential、memory、审计影响：
- 是否暴露原生类型、URL、错误码或存储路径：

## 5. 安全与插件影响

- Policy-Gate / RBAC / 租户隔离：
- Credential Center：
- Artifact Store：
- Memory Gateway：
- Plugin Bridge / 第三方插件白名单：
- 防绕过负向测试：

## 6. 许可证与再分发

- 根许可证变化：
- 第三方 NOTICE 变化：
- 新增依赖许可证：
- 本地补丁再分发影响：
- 是否需要法务确认：是 / 否 / 【待确认问题】

## 7. 验证记录

| 命令 | 结果 | 说明 |
|---|---|---|
| `git diff --check -- . ':!vendor/**'` |  |  |
| `bash tests/smoke/P0.sh` 或对应阶段 smoke |  |  |
| targeted provider tests |  |  |
| security / fault-injection tests |  |  |

## 8. 回滚计划

- 可回滚版本：
- 回滚命令或操作：
- 回滚后必须重跑测试：
- 数据迁移或 schema 回退影响：
- 回滚验证结果：

## 9. 未关闭问题

| 问题 | 影响 | 候选方案 | 最晚确认阶段 | 负责人 |
|---|---|---|---|---|
| 【待确认问题】 |  |  |  |  |
