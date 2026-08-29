# 开发热更新与局域网访问

本地开发的真实 API、Web Console 和平台内部服务可通过 Compose 覆盖层启动。基础 `deploy/docker-compose.dev.yml` 仍保留 P1 健康占位服务契约；LAN profile 是独立的真实运行路径。

## 启动

```bash
docker compose \
  -p nexusagent-dev-lan \
  -f deploy/docker-compose.dev.yml \
  -f deploy/docker-compose.dev.lan.yml \
  up -d
```

默认访问地址：

- 平台 API：`http://<开发机局域网地址>:3050/v1/health`
- Web Console：`http://<开发机局域网地址>:3051/`

宿主机也可以使用 `127.0.0.1:3050` 和 `127.0.0.1:3051` 访问。绑定地址可通过 `NEXUS_LAN_BIND_ADDRESS` 调整；默认是 `0.0.0.0`，不会硬编码具体局域网 IP。

## 运行边界

- 只有 `platform-api` 和 `web-console` 对局域网发布端口。
- adapter、Memory、Artifact、Event、Credential、Observability 只在 Docker internal network 和宿主机 loopback 可见。
- inspector 端口保持宿主机 loopback 绑定。
- Console 默认使用相对 `/v1/*` 请求，Vite 将请求代理到 Docker 内的 `platform-api:8080`，因此浏览器不会把 `localhost` 解析到客户端电脑。
- `NEXUS_RUNTIME_MODE=distributed` 让平台 API 通过 `/internal/v1/*` 调用真实内部服务；内部请求要求开发 service token 和 caller service。
- 内部 HTTP 接口不属于公共 OpenAPI、SDK 或 Console route catalog。

## 热更新与状态

平台 TypeScript 服务使用 Node watch 模式，Console 使用 Vite HMR。平台服务源码通过 Compose bind mount 提供给容器；Console 使用 package/config 文件和 `src/` 目录的精确挂载，不继承整个 `product` 根目录。Console 的 `node_modules` 和 pnpm store 都安装在命名卷 `nexusagent-dev-lan-web-console-node-modules` 中，不写入仓库源码。

内部服务当前使用 local/in-memory alpha 存储。容器重启会清空任务、Memory、Artifact、Event、Credential 和 Observability 的进程内状态；生产持久化、消息后端和密钥后端不由该开发 profile 提供。

本 profile 不连接真实渠道网络、不使用真实凭据、不运行生产 provider sidecar，也不改变生产 Compose/Kubernetes 模板。

## 停止与回滚

```bash
docker compose -p nexusagent-dev-lan \
  -f deploy/docker-compose.dev.yml \
  -f deploy/docker-compose.dev.lan.yml down
```

回滚到原有开发健康占位服务：

```bash
docker compose -f deploy/docker-compose.dev.yml up -d
```

单进程测试仍使用 `createPlatformApi()` 或 `NEXUS_RUNTIME_MODE=in_process`。如果需要清理 Console 依赖卷，可执行：

```bash
docker volume rm nexusagent-dev-lan-web-console-node-modules
```
