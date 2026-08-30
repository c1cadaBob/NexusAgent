# 源码构建容器

这条路径仍然是容器部署，但镜像不是拉取成品，而是从当前源码构建出来。

它适合：

- 想修改 Dockerfile
- 想验证本地分支改动后的镜像构建
- 想把部署和源码版本锁在同一个 git 状态上

## Backend 构建式 Compose

Linux / macOS / WSL2 常见启动方式：

```bash
cd Backend
HERMES_UID=$(id -u) HERMES_GID=$(id -g) docker compose up -d
```

Windows Docker Desktop：

```bash
cd Backend
docker compose -f docker-compose.windows.yml up -d
```

Backend 的 compose 文件会直接从当前目录构建镜像，默认镜像名是 `hermes-agent`。

## Frontend 构建式 Compose

```bash
cd Frontend
docker compose up -d --build
```

Frontend 的 compose 文件默认使用本地构建镜像 `hermes-web-ui-local:latest`，也可以通过 `WEBUI_IMAGE` 切换成预构建镜像。

## 运行时数据

Backend：

- Hermes 数据挂载到 `/opt/data`

Frontend：

- Hermes 数据挂载到 `/home/agent/.hermes`
- Hermes Studio 自己的数据挂载到 `/home/agent/.hermes-web-ui`

## 适用边界

- 更适合需要改 Dockerfile 的人
- 更适合希望“源码改了就重新 build 一个固定镜像”的交付
- 更适合发布前做镜像级验证

## 冲突与兼容性标注

- 源码构建和镜像拉取都能完成部署，但更新语义不同
- Linux 版 Backend compose 使用 host network，Windows 版改成了端口映射，所以它们是同一部署方式下的两个平台变体
- 如果 compose 同时启用了多个服务，要明确谁拥有端口 6060 / 8642 / 9119
- `docker compose up -d --build` 会重新构建镜像，不等于热更新
