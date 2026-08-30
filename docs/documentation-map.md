# 文档归属映射

仓库现在只有一个统一文档根目录：`docs/`。

## 统一文档根目录

根级 `docs/` 目录承载全部项目文档：

- 仓库布局
- 后端与前端的职责边界
- 跨项目开发流程
- 文档规范
- 跨项目部署与发布流程
- 后端设计、运维与契约
- 前端架构、运维、规划与验证

当前根入口：

- `docs/README.md`
- `docs/project-layout.md`
- `docs/architecture/repository-boundaries.md`
- `docs/development/README.md`
- `docs/deployment/README.md`
- `docs/backend/README.md`
- `docs/frontend/README.md`

## 后端文档

后端专属文档放在 `docs/backend/`：

- `docs/backend/README.md` 是后端文档入口
- `docs/backend/` 存放后端设计、运维、安全、可观测性和 RFC 文档
- `Backend/README*.md`、`Backend/AGENTS.md`、`Backend/CONTRIBUTING*.md` 仍保留在代码旁边，作为产品、agent 和贡献者入口

`Backend/docs/README.md` 只保留为新位置的兼容跳转页。

## 前端文档

前端专属文档放在 `docs/frontend/`：

- `docs/frontend/README.md` 是前端文档入口
- `docs/frontend/` 存放前端架构、Docker、harness、规划、OpenAPI 和运维文档
- `Frontend/README*.md`、`Frontend/AGENTS.md`、`Frontend/ARCHITECTURE.md`、`Frontend/DEVELOPMENT.md` 仍保留在代码旁边，作为产品、agent、架构和开发入口

`Frontend/docs/README.md` 只保留为新位置的兼容跳转页。

## 新增文档

在创建文档前，先判断它应该归属哪个根级文档区域：

1. 只属于后端的文档，放到 `docs/backend/`。
2. 只属于前端的文档，放到 `docs/frontend/`。
3. 跨项目文档，放到对应的根级主题目录，例如 `docs/deployment/` 或 `docs/development/`。

优先链接已有文档，不要把同一份内容复制到多个地方。
