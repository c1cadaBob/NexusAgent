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

## 4. 禁止事项

- 禁止在未获得明确授权时 `git push --force` 或覆盖远端历史。
- 禁止直接向 `main` 推送未经评审的任务分支变更。
- 禁止在测试失败、审计记录缺失或验收条件未核对时声称任务完成。
- 禁止把推送失败说成已经上传；如果认证、网络或权限失败，必须记录错误和下一步补救。
- 禁止修改 `/opt/project/hermes-agent-main`、`/opt/project/openclaw-main`、`/opt/project/deepseek-harness-master` 原始上游目录。
