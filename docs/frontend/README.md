# Frontend 文档入口

这个目录是 Frontend / Hermes Studio 文档的统一存放位置。

## 项目入口

- [Frontend README](../../Frontend/README.md)
- [Frontend agent 指南](../../Frontend/AGENTS.md)
- [Frontend 架构指南](../../Frontend/ARCHITECTURE.md)
- [Frontend 开发指南](../../Frontend/DEVELOPMENT.md)

## 主要文档

- 部署与运行：[Docker](./docker.md)、[工作流](./workflow.md)
- 架构与协作：[app relay](./app-relay.md)、[agent runner](./agent-runner.md)、[CLI chat sessions](./cli-chat-sessions.md)
- 运行边界：[Hermes write gate](./hermes-write-gate.md)、[voice dialogue](./voice-dialogue.md)
- 验证与测试：[harness 目录](./harness/README.md)、[validation](./harness/validation.md)、[worktree runbook](./harness/worktree-runbook.md)、[PR review](./harness/pr-review.md)
- 规划记录：[planning](./planning/)、[chat chain changes](./chat-chain-changes/)
- 接口产物：[OpenAPI JSON](./openapi.json)

## 存放规则

- Frontend 专属文档放在 `docs/frontend/`
- 跨 Backend / Frontend 的部署、开发和架构文档放在根级主题目录
- `Frontend/docs/README.md` 只保留为旧路径兼容入口
