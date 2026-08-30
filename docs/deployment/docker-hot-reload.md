# 热更新容器部署

这是仓库级的开发态部署方式。根目录的 `docker-compose.dev.yml` 会用一个容器同时挂载 `Frontend/` 和 `Backend/`，前端走现成的 `npm run dev`，后端用 editable install + watcher 保持可改、可重启、可持久化。

## 一键启动

```bash
HERMES_UID=$(id -u) HERMES_GID=$(id -g) docker compose -f docker-compose.dev.yml up -d
```

Windows / Docker Desktop 也可以直接用同一个 compose 文件，只是 `HERMES_UID` / `HERMES_GID` 取值方式不同。
第一次冷启动会把后端 `uv` 依赖和前端 `npm` 依赖装进卷里，时间会比后续重启长一些。

## 端口分配

- `3050`：浏览器入口，映射到前端 Vite 客户端
- `3051`：前端 BFF / 调试口
- `3052`：XAI OAuth 回调口

容器内部端口继续沿用现有脚本的约定，不改成另一套新端口。

## 持久化

- `HERMES_HOME`：Hermes 运行数据
- `HERMES_WEB_UI_HOME`：Web UI 状态
- `Frontend/packages/server/data`：前端开发态内部数据
- `Frontend/node_modules`：前端依赖
- `Backend/.venv`：后端 editable 环境
- Playwright 浏览器缓存：容器卷保存

## 适用边界

- 适合同时改 Backend 和 Frontend 的联调、验收和本地交付验证
- 适合验证“部署后首次访问 `/setup`”的完整流程
- 这是开发态方案，不是生产发布镜像

## 冲突与兼容性标注

- 热更新容器和生产 compose 可以并存，但不要共用同一组运行容器
- 3050 / 3051 / 3052 这组端口应视为 dev 专用，和 `6060`、`8642`、`8647`、`8648`、`8649` 保持分离
- 这条路径依赖写权限和文件监听，和只读镜像部署的约束不同
- `HERMES_HOME` 与 `HERMES_WEB_UI_HOME` 要分开持久化，不要混成一个目录
