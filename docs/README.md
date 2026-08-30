# 项目文档

这个仓库包含两个共享同一个 git 根目录的产品：

- `Backend/` - Hermes Agent 运行时、CLI、gateway、cron、工具、插件和配套文档
- `Frontend/` - Hermes Studio Web UI、服务端、桌面壳、测试和配套文档

这个目录是两个项目的统一文档入口。

## 从这里开始

- [仓库布局](./project-layout.md)
- [项目边界](./architecture/repository-boundaries.md)
- [开发入口](./development/README.md)
- [部署方式](./deployment/README.md)
- [文档归属映射](./documentation-map.md)
- [后端文档入口](./backend/README.md)
- [前端文档入口](./frontend/README.md)

## 文档规则

- 后端专属文档放到 `docs/backend/`。
- 前端专属文档放到 `docs/frontend/`。
- 跨项目文档放到根级 `docs/` 的对应主题目录。
- `Backend/docs/` 和 `Frontend/docs/` 只保留为兼容入口。
