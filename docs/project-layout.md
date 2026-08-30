# 仓库布局

仓库围绕两个独立维护的项目和一个统一文档根目录组织：

```text
/
├── Backend/   # Hermes Agent runtime, CLI, gateway, plugins, cron, and scripts
├── Frontend/  # Hermes Studio web UI, server, desktop shell, tests, and packages
└── docs/      # Unified documentation entry for Backend, Frontend, and cross-project topics
```

## 归属

| 路径 | 责任 |
| --- | --- |
| `Backend/` | 后端运行时、agent 循环、CLI、gateway、cron、工具、插件和脚本。 |
| `Frontend/` | Web UI、服务端、桌面壳、共享前端包、测试和发布工具。 |
| `docs/` | 后端、前端、部署、开发、仓库布局和跨项目流程的统一文档根目录。 |

## 当前文档归属

- 后端文档放在 `docs/backend/`。
- 前端文档放在 `docs/frontend/`。
- 跨项目文档放在根级主题目录，例如 `docs/deployment/` 或 `docs/development/`。
- `Backend/docs/README.md` 和 `Frontend/docs/README.md` 只保留为兼容跳转页。

## 维护规则

后续所有项目文档都放在 `docs/` 下。像 `README.md`、`AGENTS.md`、
`CONTRIBUTING.md`、`DEVELOPMENT.md`、`ARCHITECTURE.md` 这类贴近代码的
入口文件，只在它们确实承担工具或贡献者入口作用时才保留在代码旁边。
