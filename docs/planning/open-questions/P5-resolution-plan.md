# P5 待确认问题处理计划

> 阶段目标：交付平台公共 API、Web 控制台、SDK、渠道管理和管理员插件治理入口。P5 产品层不得出现 Hermes、OpenClaw、DSH 原生类型、原生 URL、原生错误码、原生 session 或原生存储路径。

## OQ-API-002：鉴权、分页、审批动作、错误码和事件出口

推荐处理：P5 先固定 REST 最小集：任务提交/查询/取消、attempt/execution 查询、artifact/memory 查询、审批基础动作、租户/RBAC、插件治理基础动作。分页统一 cursor-based；事件出口优先 SSE/WebSocket，gRPC streaming 留到 P8/SDK 批次复核。

三平台影响：

- OpenClaw：渠道管理 API 只暴露平台 channel/capability，不暴露 OpenClaw URL 或原生插件配置。
- Hermes：planner 错误映射为平台错误码，如 `PLANNER_UNAVAILABLE`、`PLAN_SCHEMA_INVALID`。
- DSH：execution 错误映射为平台错误码，如 `EXECUTOR_UNAVAILABLE`、`SANDBOX_DENIED`、`ARTIFACT_PERSIST_FAILED`。

关闭证据：OpenAPI 更新、SDK 生成通过、API contract tests 通过、产品层上游术语泄漏扫描通过。

P5-01 进展：已按 REST-first 默认结论交付 `product/api/` 本地 REST MVP，覆盖任务提交/查询/取消/重试、memory search/write、租户/users/permissions、审批、预算和管理员插件治理；`docs/contracts/openapi.yaml` 已对齐 runtime `exec_`、`conv_`、`cap_` 标识和 TaskState enum；`tests/contract/p5-openapi-contract.test.mjs`、`tests/integration/platform-api-rest.test.mjs`、`tests/security/platform-api-leakage.test.mjs` 与 `tests/smoke/P5.sh` 已验证公共响应不含上游原生字段。SDK 生成、控制台实时刷新和生产 IdP/SSO 仍由 P5-02/P5-04/P8 承接。

P5-02 进展：已按默认方案新增 `product/web-console/` React/Vite 控制台 Alpha，使用 P5-01 dev principal resolver 和 `/v1/*` 平台 API client；控制台实时体验为手动刷新 + 15 秒轮询，不实现 SSE/WebSocket/gRPC streaming；多语言、企业 SSO、生产 IdP 和 SDK 生成继续留给 P5-04/P8。`tests/integration/web-console-api-client.test.mjs`、`tests/security/web-console-leakage.test.mjs`、`tests/contract/web-console-openapi-alignment.test.mjs` 与 `tests/smoke/P5.sh` 验证控制台 API route 与 OpenAPI 对齐、权限不足 fail closed、view-model 不含上游原生字段。

## OQ-PLUGIN-001：插件市场和租户自助安装范围

推荐处理：P5 首版仅允许平台管理员导入、扫描、批准、启用、禁用和升级插件；租户只能使用已经批准且对其可见的能力，不允许直接从 ClawHub/npm/PyPI/GitHub 自助安装任意插件。P7/P8 后再评估租户自助市场。

三平台影响：

- OpenClaw：优先复用 ClawHub/npm 渠道插件，但必须进入 PluginInventory 和 PluginAdmissionPolicy。
- Hermes：skills、Agent Plugins v1 和 MCP 只能作为 planner hint 或 ToolIntent 来源，不能直接执行工具或读写记忆。
- DSH：Cordis 工具插件只能在 executor provider 内运行，且必须经 Policy-Gate、Credential Center、Artifact Store 和 Event Bus。

关闭证据：PluginInventory、CapabilityDescriptor、PluginAdmissionPolicy、NativeHostBinding 契约完成；未批准插件、伪造 manifest 和越权插件测试失败。

P5-01 进展：已新增平台中性 `platform/plugin-governance/`，把 P3/P4 Plugin Bridge 证据投影为 public inventory/capability；`/v1/admin/plugins`、`/v1/admin/plugins/import` 和 `/v1/admin/plugins/{plugin_id}/admission` 仅允许 `dev-platform-admin` 本地角色访问，tenant admin/viewer 均 fail closed；公共响应不返回 source_ref、provider binding、runtime、URL/path/session 或 secret material。完整恶意插件运行时、生产 sidecar 和升级回滚矩阵仍由 P6/P8 继续验证。

P5-02 进展：控制台插件治理页面仅对 platform admin dev principal 展示导入与准入操作，tenant admin/viewer 导航不显示插件治理入口且强制 API 调用仍由 P5-01 返回 403；页面和 view-model 只展示 plugin ID、display name、source kind、version、SHA-256、license、notice status、risk、allowlist status 和 capability IDs，不展示原生来源、provider binding、runtime、session、URL/path 或 secret material。租户自助安装、恶意插件运行时、升级回滚矩阵和生产 sidecar 仍由 P6/P8 继续验证。

## OQ-LEGAL-001：许可证、NOTICE 和再分发法务确认

推荐处理：P5 建立许可证/NOTICE 检查流程，P8 发布前复核。首版只启用来源、hash、版本、许可证、NOTICE、权限和回滚记录完整的插件；许可证有疑义的上游补丁或第三方插件不得进入生产启用清单。

三平台影响：

- OpenClaw：ClawHub/npm/Git 渠道插件必须记录来源、许可证和再分发状态。
- Hermes：skills、Agent Plugins、MCP server 需要区分内置、社区、客户私有和第三方许可证。
- DSH：Cordis 工具插件、native addon、vendored packages 和 executor 替代 provider 必须进入许可证清单。

关闭证据：`vendor/MANIFEST.yaml`、PluginInventory 和第三方声明文档补齐许可证字段；法务或指定负责人确认；P8 交付包包含 NOTICE/THIRD_PARTY 声明。

P5-01 进展：管理员插件导入 API 已强制 `expected_sha256`、`license`、`notice_status`、`risk_level` 和版本元数据，缺失或带 URL/path/credential/manifest 绕过字段的导入请求 fail closed。法务确认、第三方声明文档和发布包 NOTICE/THIRD_PARTY 仍保留为 P8 关闭证据。
