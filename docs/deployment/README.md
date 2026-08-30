# 部署方式总览

这个目录整理 NexusAgent 仓库里可见的所有部署、安装和发行路径。

基本原则很简单：

- 部署阶段只负责基础设施，业务配置延后到首次访问 `/setup`
- 冲突只做标注，不作为排除某种部署方式的决定性条件
- Backend 和 Frontend 可以分别部署，也可以按融合栈一起部署

## 方式一览

| 方式 | 入口 | 适用场景 | 主要备注 |
| --- | --- | --- | --- |
| 脚本一键部署 | [Backend 脚本安装](./script-one-click.md) | 快速安装到裸机、服务器或工作站 | Linux/macOS/WSL2/Termux 用 `install.sh`，Windows 用 `install.ps1` |
| npm CLI 部署 | [Frontend npm CLI](./npm-cli-web-ui.md) | 轻量 Web UI、本机服务、已有 Node 环境 | 适合单机或远程客户端接入 |
| 拉取镜像部署 | [镜像部署](./docker-image-pull.md) | 生产、准生产、最少本地依赖 | 通过 `docker pull` 或 `WEBUI_IMAGE=...` 使用预构建镜像 |
| 源码构建容器 | [Compose 源码构建](./docker-compose-source-build.md) | 想改 Dockerfile、验证本地源码或做可重复构建 | 仍然是容器部署，但镜像来自本地构建 |
| 热更新容器 | [热更新容器](./docker-hot-reload.md) | 开发、联调、频繁改代码 | 对应根级 `docker-compose.dev.yml`，这是开发态部署，不是生产发布形态 |
| 本地源码开发 | [本地开发](./local-source-dev.md) | 代码开发、调试、测试 | 不依赖容器，最直接 |
| 桌面发行版 | [桌面包](./desktop-package.md) | 本地桌面客户端、单用户体验 | 更像发行版，不是服务器部署 |
| Nix / NixOS | [Nix 部署](./nix-nixos.md) | 偏好声明式安装或已在用 Nix | 当前是 best-effort 路径 |

## 通用说明

- 新装后，第一次真正的业务配置统一走 `/setup`
- 模型、管理员、Gateway、平台账号等都不在部署步骤里填写
- 部署文档只描述端口、卷、镜像、运行模式、更新路径和冲突标注
- 如果你要做一套融合前后端的交付方案，优先先看镜像部署和源码构建容器，再看热更新容器
- 热更新容器的正式入口是仓库根目录的 `docker-compose.dev.yml`

## 参考来源

- [根仓库 README](../../README.md)
- [Backend README](../../Backend/README.md)
- [Frontend README](../../Frontend/README.md)
- [Backend 安装文档](../../Backend/website/docs/getting-started/installation.md)
- [Frontend Docker 文档](../frontend/docker.md)
