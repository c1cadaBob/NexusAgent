# DSH 版本兼容与替换策略

> 文档状态：P0 架构补充。本文只定义 DeepSeek Harness（DSH）作为内部执行后端的兼容、升级、回滚和替换边界；不确认任何未实测的 DSH 上游行为。

## 1. 核心结论

DSH 后续版本不假设天然兼容。NexusAgent 必须保证平台对外契约稳定，并把 DSH 变化限制在 `platform/adapters/dsh/` 和 `vendor/deepseek-harness-master/` 的本地补丁范围内。

平台稳定面包括：`ExecutionRequest`、`ExecutionResult`、`ExecutionEvent`、`ArtifactReference`、`CredentialReference`、`SandboxPolicy`、取消/超时/重试语义、平台错误码和统一 ID。产品 API、SDK、Web 控制台、公共日志和公共错误码不得依赖或暴露 DSH 原生类型。

## 2. Provider 隔离模型

P2 实现 DSH adapter 时必须预留 provider 边界：

```text
platform/adapters/dsh/
├── contracts/              # 平台侧 ExecutionRequest/Result/Event 映射校验
├── providers/
│   ├── dsh-0.1.1-rc.2/      # 当前 vendor 快照 provider
│   └── README.md            # 后续 provider 接入规则
├── provider-registry.*      # provider 选择、版本标识、灰度和回滚入口
└── index.*                  # 只导出平台 adapter，不导出 DSH 原生对象
```

Provider 内部可以适配 DSH 当前版本的函数、类、session、tool-call、sandbox 或 artifact 细节；provider 外部只能看见平台 schema。Coordinator、Policy-Gate、product API、SDK 和控制台禁止直接 import DSH provider 或 vendor 源码。

## 3. 升级接入流程

每次接入 DSH 新版本必须按以下顺序执行：

1. 新版本先作为新的 vendor 快照或 provider 候选接入，不直接覆盖已验证 provider。
2. 更新 `vendor/MANIFEST.yaml`，记录版本、快照时间、SHA-256、上游 commit/remote 状态和本地补丁记录。
3. 对 agent-loop、tool-call、runtime context、sandbox、artifact 和 dispatch 入口重新做源码证据摸底。
4. 新增或更新 `platform/adapters/dsh/providers/{version}/`，只在 provider 内处理 DSH 原生差异。
5. 同时保留上一版 provider，允许配置选择、灰度、回滚和 A/B 验证。
6. 跑 adapter contract、sandbox、artifact、credential leak、防绕过和故障注入测试。
7. 通过门禁后才允许切换默认 provider；失败时回滚到上一版 provider，并更新风险登记册和修改记录包。

## 4. 必过门禁

DSH 新版本或替代执行后端上线前，至少通过以下检查：

- 平台 `ExecutionRequest` 可执行，并返回平台 `ExecutionResult` 和标准 `ExecutionEvent`。
- 直接调用 DSH 原生 agent-loop、原生 URL、原生命令入口或伪造内部 header 必须失败。
- `stdout`、`stderr`、事件、日志和 artifact 不包含明文凭据。
- artifact 必须进入平台 Artifact Store，只返回 `artifact_id` 或平台 artifact reference。
- 超时、取消、重试和沙箱拒绝必须映射为平台状态机和平台错误码。
- 新旧 provider 至少跑同一组 contract fixture；fixture 只使用平台 schema。

## 5. 替换路线

如果 DSH 破坏性变更导致 executor-only 目标无法维护，平台允许替换执行后端，但不得改变北向 API。替代后端可以是 DSH 新稳定版、自研轻量 executor、容器隔离执行器、gVisor/Firecracker 类沙箱，或其他经 P2/P6/P8 门禁验证的 provider。

替换时必须保留：平台统一 ID、Policy-Gate 前置校验、Credential Center 引用协议、Artifact Store 入库、Event Bus 事件信封、审计和可观测性语义。

## 6. 禁止事项

- 禁止把 DSH 原生类型、错误码、URL、session id、文件路径或品牌名传到产品层。
- 禁止让 P5 之后的公共 API、SDK 或控制台依赖 DSH provider 版本。
- 禁止在 provider 之外处理 DSH 原生对象。
- 禁止用“升级后手工确认可用”替代 contract、sandbox、防绕过和凭据泄漏测试。
- 禁止在没有上一版 provider 回滚路径时切换默认执行后端。

## 7. 待确认问题

- DSH 上游真实 Git remote、release commit 和 fork 分支是什么？
- DSH 新版本接入时是否允许并存多个 vendor 快照，还是只能通过 provider patch 管理？
- 生产默认执行后端是否必须是 DSH，还是允许把 DSH 降为候选 provider？
- 替代沙箱后端的企业标准是容器、gVisor、Firecracker，还是由后续 P8 基础设施选型确认？
