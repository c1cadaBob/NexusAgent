# NexusAgent 子 Agent 角色记忆

> 文档状态：P0-01 角色协作基线。
>
> 目的：把长期协作角色、责任边界和交接格式固化到仓库，避免上下文压缩、换人或子 agent 重启后丢失项目约束。

## 使用规则

- 每个子 agent 开工前必须先读取 `AGENTS.md`、本文件、对应角色文档和当前任务 ID 文档。
- 子 agent 默认只在 `/opt/project/NexusAgent` 内工作，禁止修改 `/opt/project/hermes-agent-main`、`/opt/project/openclaw-main`、`/opt/project/deepseek-harness-master` 原始上游目录。
- 子 agent 不得单独宣布任务完成；必须把证据、变更建议、测试结果和待确认问题交回主 agent 统一审计、提交和推送。
- 角色记忆只记录稳定职责、边界和交付格式；临时结论必须写回任务修改记录包、待确认问题台账、风险登记册或决策文档。
- 多个子 agent 并行时，必须按文件所有权拆分，避免同时编辑同一文件；需要共享结论时先输出审阅报告，再由主 agent 合并。

## 角色清单

| 角色文档 | 常驻职责 | 首批阶段 |
| --- | --- | --- |
| `roles/program-lead.md` | 总控排期、任务审计、跨角色交接和提交门禁。 | P0-P8 |
| `roles/upstream-snapshot-engineer.md` | vendor 快照、上游版本证据、provider 边界和补丁登记。 | P0-P4/P8 |
| `roles/platform-core-engineer.md` | 平台 contracts、Coordinator、Policy-Gate、事件、时钟和基础服务。 | P1-P6 |
| `roles/security-quality-engineer.md` | 防绕过、安全、冒烟、契约、故障注入和质量门禁。 | P0-P8 |
| `roles/product-delivery-engineer.md` | 对外 API、控制台、渠道管理、SDK、运维交付和用户可见边界。 | P5-P8 |

## 交接格式

每个子 agent 完成一个审阅或实现切片时，必须用以下格式回传：

```text
角色：<角色名>
任务：<任务ID或范围>
已读资料：<关键文档/源码路径>
变更文件：<如只读则写“无”>
证据摘要：<源码路径、行号或命令输出摘要>
风险与待确认问题：<OQ ID 或新增问题建议>
验证命令：<已运行或建议运行的命令>
建议下一步：<可由主 agent 合并执行的最小动作>
```

## P0-01 启动分工

- `program-lead`：确认当前分支、任务修改记录包、远端上传规则和 P0-01 是否与后续 P1 历史兼容。
- `upstream-snapshot-engineer`：核对 `vendor/MANIFEST.yaml`、快照脚本、版本 pin 和可复现 hash 口径。
- `security-quality-engineer`：核对 `git diff --check -- . ':!vendor/**'`、`bash tests/smoke/P0.sh` 和角色记忆 smoke 检查。
- `platform-core-engineer` 与 `product-delivery-engineer`：从 P1/P5 开始接力，P0-01 只需确认不引入生产业务代码和对外上游暴露。
