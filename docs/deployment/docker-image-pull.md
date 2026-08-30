# 拉取镜像部署

这是最接近“拿到一个固定发布件，直接跑起来”的部署方式。

它分成两类：

- Backend 官方镜像：`nousresearch/hermes-agent`
- Frontend / Hermes Studio 预构建镜像：`ekkoye8888/hermes-web-ui`

## Backend 官方镜像

### 交互式 CLI

```bash
docker run -it --rm \
  -v ~/.hermes:/opt/data \
  nousresearch/hermes-agent
```

### 长驻 gateway

```bash
docker run -d \
  --name hermes \
  --restart unless-stopped \
  -v ~/.hermes:/opt/data \
  -p 8642:8642 \
  nousresearch/hermes-agent gateway run
```

### dashboard

```bash
docker run -d \
  --name hermes \
  --restart unless-stopped \
  -v ~/.hermes:/opt/data \
  -p 8642:8642 \
  -p 9119:9119 \
  -e HERMES_DASHBOARD=1 \
  nousresearch/hermes-agent gateway run
```

### 更新方式

- 拉取新镜像：`docker pull nousresearch/hermes-agent:latest`
- 如果用 tag / digest 固定版本，就改成新的 tag / digest 后重建容器

## Frontend / Hermes Studio 预构建镜像

```bash
WEBUI_IMAGE=ekkoye8888/hermes-web-ui docker compose up -d
docker compose logs -f hermes-webui
```

这个 compose 路径会同时带上 Hermes Agent 运行能力，适合不想本地构建镜像的场景。

### 主要数据目录

- Hermes 运行数据：`./hermes_data`
- Hermes Studio 自己的数据：`./hermes_data/hermes-web-ui`

### 更新方式

- 如果只是拉新版本：`docker compose pull && docker compose up -d`
- 如果你固定了镜像 tag / digest，就用同样的固定值重新拉取

## 首次访问

- Web UI 部署后第一次访问时，业务配置走 `/setup`
- Backend dashboard 若启用了非 loopback 绑定，必须先有可用的认证提供器

## 适用边界

- 这是生产 / 准生产最常见的路径
- 适合把运行环境固定在镜像里，而不是依赖宿主机现成的 Python / Node
- 适合做回滚：只要换回旧 tag 或旧 digest 就能回退

## 冲突与兼容性标注

- 镜像管理的安装不应该再走 `hermes update` 的源码更新逻辑
- Backend Linux compose 的 `network_mode: host` 和 Windows Docker Desktop 不兼容，所以 Windows 需要单独的端口映射方案
- 不要让多个 gateway 容器同时写同一个 Hermes 数据目录
- 镜像里的应用树应该看作不可变，业务状态只放在挂载卷里
