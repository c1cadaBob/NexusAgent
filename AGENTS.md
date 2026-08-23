# NexusAgent 项目执行规则

本文件是 NexusAgent 仓库内 AI Agent 和开发者执行任务时必须遵守的项目规则。所有工作默认发生在 `/opt/project/NexusAgent`。

## 1. 任务完成与关键节点上传规则

完成任一任务，或到达关键节点时，必须将当前分支提交并上传到远端仓库：

```text
https://github.com/c1cadaBob/NexusAgent
```

默认远端名为 `origin`。若远端不存在，先执行：

```bash
git remote add origin https://github.com/c1cadaBob/NexusAgent.git
```

如果当前环境无法使用 HTTPS 凭据，但已通过 GitHub SSH 认证，则保留 HTTPS fetch URL，并设置 SSH push URL：

```bash
git remote set-url --push origin git@github.com:c1cadaBob/NexusAgent.git
```

首次推送当前分支时执行：

```bash
git push -u origin HEAD
```

后续推送当前分支时执行：

```bash
git push origin HEAD
```

## 2. 关键节点定义

以下情况都视为必须上传的关键节点：

- 单个任务 ID 完成，例如 `P0-01`、`P1-03`、`P6-02`。
- 阶段门禁完成，例如 P0/P1/P2 阶段验收通过。
- 上游 vendor 快照、provider 版本、平台契约、OpenAPI 或安全边界发生变化。
- 完成一轮冒烟、契约、安全、防绕过或故障注入验证。
- 准备把工作交给其他开发者、AI Agent 或进入评审前。

## 3. 上传前必须完成

上传远端前必须完成以下动作：

1. 更新对应任务文档中的“修改记录包”。
2. 运行任务要求的验收命令；P0-01 这类 vendor 快照任务至少运行：

   ```bash
   git diff --check -- . ':!vendor/**'
   bash tests/smoke/P0.sh
   ```

3. 确认未提交明文凭据、`.env`、本地配置、依赖缓存或构建产物。
4. 使用包含任务 ID 的提交信息，例如：

   ```bash
   git commit -m "P0-01: refresh vendor snapshots and planning docs"
   ```

5. 推送当前分支到 `origin`，并在完成报告中写明 commit hash 和 push 结果。

## 4. 待确认问题处理规则

所有待确认问题必须按以下流程处理：

1. 产生新问题时，先写入 `docs/planning/open-questions-register.md` 对应分类和阶段位置。
2. 集中台账只作为状态索引，记录 `OQ-*` ID、状态、影响、负责人/工作流、最晚确认阶段、确认结论和解决说明文档；不得在集中台账中维护候选方案正文。
3. 所有确认内容、推荐处理方式、三大平台影响分析、默认解决方案和关闭证据，必须写入 `docs/planning/open-questions/` 下对应阶段或对应问题的确认文件。
4. 结合 OpenClaw、Hermes、DSH 分析问题时，必须分别说明 gateway-only、planner-only、executor-only 边界影响。
5. 若没有项目负责人另行确认，`docs/planning/open-questions/` 中的“推荐处理方式”即作为默认解决方案，但集中台账状态仍保持 `Open`，直到确认结论、解决说明文档和关闭任务/commit 补齐。
6. 如果某个问题的解决需要进入开发排期，必须在 `docs/planning/task-prompts/` 的相应阶段文件夹中添加或更新对应实施规划提示词。
7. 问题被确认后，必须回写 `docs/planning/open-questions-register.md` 的状态、确认结论、解决说明文档和关闭任务/commit，并同步需求追踪矩阵、风险登记册和相关任务修改记录包。

## 5. 禁止事项

- 禁止在未获得明确授权时 `git push --force` 或覆盖远端历史。
- 禁止直接向 `main` 推送未经评审的任务分支变更。
- 禁止在测试失败、审计记录缺失或验收条件未核对时声称任务完成。
- 禁止把推送失败说成已经上传；如果认证、网络或权限失败，必须记录错误和下一步补救。
- 禁止修改 `/opt/project/hermes-agent-main`、`/opt/project/openclaw-main`、`/opt/project/deepseek-harness-master` 原始上游目录。
