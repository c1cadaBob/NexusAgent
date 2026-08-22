# 远端上传与关键节点提交规则

> 文档状态：项目规则。本文定义任务完成或到达关键节点时的 Git 提交与远端上传要求。

## 1. 远端仓库

NexusAgent 的默认远端仓库为：

```text
https://github.com/c1cadaBob/NexusAgent
```

默认远端名为 `origin`。本地仓库若尚未配置远端，执行：

```bash
git remote add origin https://github.com/c1cadaBob/NexusAgent.git
```

如果 HTTPS 凭据不可用，但当前环境已具备 GitHub SSH 权限，可以保留 HTTPS 作为 fetch URL，并设置 SSH push URL：

```bash
git remote set-url --push origin git@github.com:c1cadaBob/NexusAgent.git
```

## 2. 必须上传的节点

以下情况必须提交并推送当前分支：

- 完成任一任务 ID。
- 阶段门禁或关键验收通过。
- vendor 快照、provider 版本、平台契约、OpenAPI、安全策略或任务提示词发生重要变化。
- 工作需要移交、评审或由下一位开发者/AI Agent 接续。

## 3. 标准流程

```bash
git status --short --branch
git diff --check -- . ':!vendor/**'
# 按任务运行对应 smoke/contract/security/evaluation 脚本
git add -A
git commit -m "<TASK-ID>: <summary>"
git push -u origin HEAD
```

如果当前分支已建立 upstream，后续可使用：

```bash
git push origin HEAD
```

## 4. 失败处理

如果远端认证、权限、网络或保护规则导致上传失败：

1. 不得声称已经上传。
2. 保留本地 commit。
3. 在完成报告中记录失败命令、错误摘要和需要用户处理的事项。
4. 用户修复权限或远端配置后，再执行 `git push -u origin HEAD`。
