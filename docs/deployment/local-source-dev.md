# 本地源码开发

这是最直接的开发态运行方式：在宿主机上直接跑 Backend 和 Frontend 的开发命令。

## Backend

```bash
cd Backend
uv sync
source .venv/bin/activate
python run_agent.py --help
```

如果你要进入更完整的后台运行环境，通常还会配合：

- `hermes setup`
- `hermes gateway setup`
- `hermes gateway start`
- `hermes dashboard`

## Frontend

```bash
cd Frontend
npm install
npm run dev
```

Frontend 的 `dev` 会同时启动开发服务器和本地 API 代理链路。

## 适用边界

- 适合做代码开发、调试、单测和本地联调
- 适合先确认功能，再决定要不要容器化
- 不适合直接拿来做公网暴露的生产部署

## 冲突与兼容性标注

- 本地 dev 端口和 Docker Compose 默认端口可能冲突
- 本地源码树和镜像构建树的更新路径不同，不能把两者的更新方式混着写
- 如果你在同一台机器上同时跑后端、前端和桌面壳，要明确各自监听的端口和状态目录
