# npm CLI 部署

这一条是 Frontend / Hermes Studio 的轻量本机部署路径。

它适合：

- 想快速起一个 Web UI
- 机器上已经有可用的 Node.js 环境
- 不想先写 Docker Compose

## 入口命令

```bash
npm install -g hermes-web-ui
hermes-web-ui start
```

常见的配套命令还有：

- `hermes-web-ui client`：远程客户端模式
- `hermes-web-ui restart`
- `hermes-web-ui stop`
- `hermes-web-ui status`
- `hermes-web-ui update` / `upgrade`

## 默认运行方式

- 默认端口：`8648`
- 默认绑定：`0.0.0.0`
- 前端状态目录：`HERMES_WEB_UI_HOME`，默认 `~/.hermes-web-ui`
- Hermes 数据目录：`HERMES_HOME`
- 认证令牌：`AUTH_TOKEN`，首次运行可自动生成
- JWT 密钥：`AUTH_JWT_SECRET`

这个模式会把 Hermes Studio 当成一个本机服务来跑，适合单机、开发机或小型私有部署。

## 首次访问

启动后直接打开浏览器访问对应地址即可。

第一次真正进入业务前，仍然会先经过 `/setup` 完成：

- 管理员初始化
- 模型配置
- 必要的 Gateway / 平台选择

也就是说，npm CLI 部署只解决“把服务跑起来”，不负责把业务内容在部署过程中一次性填完。

## 适用边界

- 适合轻量本机部署或已经有 Node 的环境
- 适合不想管理 Docker 镜像和容器编排的用户
- 适合把 Hermes Studio 当成单独的 Web 服务来运行

## 冲突与兼容性标注

- 如果同一台机器上已经有 `hermes dashboard`、Docker Compose 或其他 Web UI 服务，先确认端口没有冲突
- 如果你要连远程 Hermes backend，要明确由谁负责 gateway 生命周期，必要时关闭自动启动
- `HERMES_WEB_UI_HOME` 和 `HERMES_HOME` 是两类不同状态目录，部署文档里不要混成一个目录
- 这个路径不是镜像部署，也不是容器热更新部署
