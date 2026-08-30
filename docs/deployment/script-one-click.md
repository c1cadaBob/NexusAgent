# 脚本一键部署

这是一条典型的“打开终端，运行一条安装脚本，然后进入 `hermes setup`”的路径。

它适合：

- 想快速把 Hermes Agent 装到一台机器上
- 希望后续通过 `hermes update` 管理源码安装
- 需要按平台自动处理 Python、Node.js、ripgrep、ffmpeg、浏览器依赖等前置项

## 入口命令

### Linux / macOS / WSL2 / Termux

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
```

### Windows

```powershell
iex (irm https://hermes-agent.nousresearch.com/install.ps1)
```

## 安装后会得到什么

- git 管理的 Hermes Agent 源码
- 对应平台可用的 `hermes` 命令
- 独立的 Hermes 数据目录
- 交互式 `hermes setup` 向导

Linux / macOS / WSL2 默认把代码装到 `~/.hermes/hermes-agent/`，数据放在 `~/.hermes/`。
Windows 默认把代码装到 `%LOCALAPPDATA%\hermes\hermes-agent`，数据放在 `%LOCALAPPDATA%\hermes`。

## 常用选项

两个安装脚本的参数语义基本一致，常见组合如下：

- 跳过首次向导：`--skip-setup`
- 跳过浏览器依赖：`--skip-browser` / `--no-playwright`
- 跳过 Computer Use：`--skip-computer-use`
- 关闭 bundled skills：`--no-skills`
- 切换分支：`--branch <name>`
- 固定到某个 commit：`--commit <sha>`
- 指定安装目录：`--dir <path>`
- 指定数据目录：`--hermes-home <path>`
- 额外构建桌面包：`--include-desktop`
- 仅安装指定依赖：`--ensure node,browser,ripgrep,ffmpeg`

Windows 版还支持 `-Tag`、`-ForceCommit`、`-ShowResolvedPaths`、`-IncludeDesktop` 这类更偏发行/安装器驱动的参数。

## 安装后流程

```bash
source ~/.bashrc   # 或 source ~/.zshrc
hermes setup
```

如果你想先连上 Nous Portal，可以直接用：

```bash
hermes setup --portal
```

后续常用运维命令是：

- `hermes model`
- `hermes tools`
- `hermes gateway setup`
- `hermes update`
- `hermes doctor`

## 适用边界

- 这是源码 / git 管理路径，不是容器镜像路径
- 适合想长期跟随 `hermes update` 的安装
- 适合需要本机完全控制依赖和源码目录的场景

## 冲突与兼容性标注

- 它和 Docker 镜像部署不是一回事；镜像管理的安装不应该用 `hermes update` 直接原地更新
- Windows 和 Unix 的安装目录、PATH、权限模型不同，但都属于同一类“一键脚本部署”
- root 模式和普通用户模式会得到不同的落盘路径，但都属于脚本安装
- 这个路径会在首次安装时跑 `hermes setup`，但那是业务初始化，不是部署阶段的必填项
