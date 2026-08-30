# Nix / NixOS 部署

这是 Hermes Agent 的 best-effort 声明式部署路径。

它适合：

- 已经在用 Nix / NixOS
- 希望把安装和升级纳入声明式管理
- 接受某些功能属于 Tier 2 / best-effort 维护边界

## 常见入口

- `nix run`
- `nix profile install`
- `nix profile upgrade`
- `nix flake update`
- NixOS module / container mode

## 这个路径的特点

- 安装和升级由 Nix 生态负责
- 版本回滚靠 Nix generation / profile rollback
- 适合和系统级配置一起管理

## 适用边界

- 这是可用部署方式，但不是 Hermes Agent 的最强承诺路径
- 更适合熟悉 Nix 的用户
- 和 git installer、Docker、npm CLI 都是不同的更新模型

## 冲突与兼容性标注

- 不能把 `hermes update` 当成 Nix 的标准升级方式
- 声明式配置和 `/setup` 的首次业务配置要分清职责
- 如果你在 NixOS 上同时启用容器模式和本机模式，要明确哪一层拥有端口与数据目录
