# DSH Provider Directory

本目录只放 DSH executor-only provider 的版本隔离实现和验证材料。P2 之前不得在这里写生产业务逻辑。

必须遵守：

- provider 外部只能暴露平台执行请求、执行事件、artifact 引用、凭据引用和健康状态。
- Cordis 工具插件和执行型工具只能在 Policy-Gate、Credential Center、Artifact Store 和 Event Bus 约束下运行。
- 每个 provider 版本都必须保留上一版回滚目标，并通过同一组平台 contract fixture。
- 禁止 DSH 原生类型、错误码、URL、session、路径或 tool-call 对象进入产品层。
