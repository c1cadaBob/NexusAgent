# 桌面发行版

这一条不是服务器部署，而是 Hermes Studio 的桌面发行路径。

它适合：

- 想要一个本地桌面应用
- 想要安装包自带运行时和自动更新
- 想同时拥有 GUI、CLI、内置服务和本机数据目录

## 入口

- 网站下载安装包
- `hermes-studio`
- `hermes-studio cli ...`
- `hermes-studio web ...`

## 这个路径会做什么

- 安装桌面壳和它自己的运行时
- 生成管理命令 shim
- 维护独立的 Studio 状态目录
- 通过桌面应用自己的更新机制拉取新版本

## 适用边界

- 更像发行版，不像后端服务器部署
- 适合单用户桌面体验
- 不适合拿来替代远程 shared backend

## 冲突与兼容性标注

- 桌面应用自己会起本地服务，和手动启动的 `hermes-web-ui start` / `hermes dashboard` 可能抢端口
- 如果你已经有远程 backend，就要分清“本地 bundled runtime”和“远程 backend”是谁在服务
- 桌面发行版的更新语义和 git / Docker / Nix 都不同
