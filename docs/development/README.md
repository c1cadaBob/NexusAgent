# 开发入口

请在代码所属的项目目录里运行命令。

## Backend

```bash
cd Backend
uv sync
source .venv/bin/activate
python run_agent.py --help
```

后端参考：

- [Backend README](../../Backend/README.md)
- [Backend 贡献指南](../../Backend/CONTRIBUTING.md)
- [Backend agent 指南](../../Backend/AGENTS.md)
- [Backend 文档入口](../backend/README.md)

## Frontend

```bash
cd Frontend
npm install
npm run dev
```

前端参考：

- [Frontend README](../../Frontend/README.md)
- [Frontend 开发指南](../../Frontend/DEVELOPMENT.md)
- [Frontend 架构](../../Frontend/ARCHITECTURE.md)
- [Frontend agent 指南](../../Frontend/AGENTS.md)
- [Frontend 文档入口](../frontend/README.md)

## 验证

验证方式按项目分别执行：

- 后端：按 `Backend/CONTRIBUTING.md` 和 `Backend/scripts/run_tests.sh` 的说明执行测试与 lint。
- 前端：按改动需要使用 `npm run harness:check`、`npm run test`、`npm run test:e2e` 和 `npm run build`。

不要运行依赖单一共享环境的根级命令。根 git 仓库只负责版本控制，各子项目各自管理运行时和包工具链。
