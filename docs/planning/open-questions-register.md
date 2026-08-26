# NexusAgent 待确认问题集中台账

> 文档状态：P0-09 集中台账基线，已恢复为表格索引形式，并保留分阶段处理计划索引。
>
> 维护规则：本文件是【待确认问题】的状态索引，不替代架构、契约、风险、决策或任务文档。技术细节、推荐处理方式、默认解决方案、三大平台影响分析和关闭证据统一写入 `docs/planning/open-questions/` 对应确认文件；本台账只记录问题、状态、影响、责任工作流、最晚确认阶段、确认结论和解决说明文档位置。
>
> 最后更新UTC：2026-08-26。

## 1. 状态枚举

| 状态 | 含义 | 关闭要求 |
|---|---|---|
| 打开 | 新问题已登记，但尚未在 `docs/planning/open-questions/` 中生成推荐处理方式或默认解决方案 | 必须补充确认文件、影响、责任工作流和最晚确认阶段 |
| 自动确认 | 已结合 OpenClaw、Hermes、DSH 在确认文件中生成推荐处理方式；该推荐处理方式是默认解决方案，但尚未关闭 | 必须保留解决说明文档；关闭前还需补齐确认结论和关闭任务/commit |
| 人工确认 | 项目负责人或指定责任人已人工确认或覆盖默认解决方案；该状态可省略 | 必须写明人工确认结论和确认依据；关闭前还需补齐关闭任务/commit |
| 已关闭 | 确认结论、解决说明文档和关闭任务/commit 均已补齐，并已同步需求追踪矩阵、风险登记册和相关任务修改记录包 | 不再作为待处理问题；后续变更必须新建或重开 `OQ-*` |

## 2. 关闭规则

- 不直接删除问题；新问题先进入 `打开`。
- 新问题产生时，先写入本台账对应分类和阶段位置，再在 `docs/planning/open-questions/` 的对应阶段或对应问题确认文件中补充推荐处理方式。
- 本台账不展示候选方案，只作为状态索引；可行处理路线、推荐处理方式、默认解决方案、三平台影响和关闭证据统一维护在 `docs/planning/open-questions/`。
- 系统结合 OpenClaw、Hermes、DSH 生成推荐处理方式后，台账状态可从 `打开` 更新为 `自动确认`；若没有项目负责人另行确认，确认文件中的“推荐处理方式”即作为默认解决方案。
- `人工确认` 是可选状态：项目负责人或指定责任人需要覆盖默认解决方案时使用；接受默认解决方案时，可以从 `自动确认` 直接进入 `已关闭`。
- `自动确认` 和 `人工确认` 都不等于关闭；只有 `确认结论`、`解决说明文档` 和 `关闭任务/commit` 全部补齐后，才能把状态改为 `已关闭`。
- 如果问题解决需要进入开发排期，必须同步在 `docs/planning/task-prompts/` 的相应阶段文件夹添加或更新实施规划提示词。
- 如果确认结论影响任务范围、架构边界、测试门禁或排期，必须同步更新 `docs/traceability/requirements-matrix.md`、`docs/risks/risk-register.md` 和对应任务 ID 的修改记录包。
- 如果问题来自上游版本、插件或许可证，关闭前必须补充来源证据、hash/版本、许可证/NOTICE 影响和回滚方式。

## 3. 当前确认状态

| 指标 | 数量 | 说明 |
|---|---:|---|
| 待确认问题总数 | 23 | 来自当前 `OQ-*` 台账 |
| 打开 | 0 | 暂无仅登记但未生成推荐处理方式的问题 |
| 自动确认 | 19 | 已结合三大平台在确认文件中生成默认解决方案，但尚未关闭 |
| 人工确认 | 0 | 暂无人工覆盖默认解决方案的问题；该状态可省略 |
| 已关闭 | 4 | P0 门禁已关闭上游快照排除规则、资源容量、日历冻结窗口和首批渠道默认范围 |

当前 19 个问题仍为“自动确认”：即已结合 OpenClaw、Hermes、DSH 在 `docs/planning/open-questions/` 生成推荐处理方式，推荐处理方式即默认解决方案，但确认结论和关闭任务/commit 尚未补齐。P0 门禁已关闭 4 个最晚确认阶段属于 P0 的问题。

## 4. 人工确认（可省略）的问题

> 这里的“人工确认”指项目负责人，或由项目负责人指定的产品、SRE、安全、法务等最终拍板人，对默认解决方案进行人工确认或覆盖。若接受确认文件中的默认解决方案，可以省略本状态，直接在关闭时补齐确认结论和关闭任务/commit。

### 4.1 P1 前人工确认（可省略）

| 问题ID | 状态 | 分类 | 问题描述 | 最晚确认阶段 | 负责人/工作流 | 解决说明文档 |
| --- | --- | --- | --- | --- | --- | --- |
| OQ-UPSTREAM-004 | 已关闭 | 上游快照 | 是否允许长期排除上游构建产物、缓存、日志和依赖目录后作为正式交付快照。 | P0 门禁前。 | 架构/上游改造/SRE。 | `docs/planning/open-questions/P0-resolution-plan.md`。 |
| OQ-SCHEDULE-001 | 已关闭 | 排期资源 | 实际团队人数、角色和可投入比例是什么。 | P0 W1 结束前。 | 架构/产品。 | `docs/planning/open-questions/P0-resolution-plan.md`。 |
| OQ-SCHEDULE-002 | 已关闭 | 排期资源 | 地区节假日和公司发布冻结窗口是什么。 | P0 W1 结束前。 | 架构/产品/SRE。 | `docs/planning/open-questions/P0-resolution-plan.md`。 |
| OQ-CHANNEL-001 | 已关闭 | 渠道/插件 | 首批正式渠道是否为钉钉、飞书、Telegram，是否需要企业微信、Slack 等。 | P0 结束前。 | 渠道/产品/安全。 | `docs/planning/open-questions/P0-resolution-plan.md`、`docs/planning/open-questions/P4-resolution-plan.md`。 |
| OQ-INFRA-001 | 自动确认 | 基础设施 | Web/API 框架是否选择 Fastify、NestJS 或企业标准框架。 | P1 前。 | 平台内核/API/SRE。 | `docs/planning/open-questions/P1-resolution-plan.md`。 |

### 4.2 P2 前人工确认（可省略）

| 问题ID | 状态 | 分类 | 问题描述 | 最晚确认阶段 | 负责人/工作流 | 解决说明文档 |
| --- | --- | --- | --- | --- | --- | --- |
| OQ-API-001 | 自动确认 | API/产品 | 平台统一 REST 和 gRPC 是否要求同期交付。 | P1 结束前。 | API/SDK/产品。 | `docs/planning/open-questions/P1-resolution-plan.md`。 |
| OQ-INFRA-002 | 自动确认 | 基础设施 | Event Bus 生产底层选型是什么。 | P1 结束前，P8 发布前复核。 | 平台内核/SRE。 | `docs/planning/open-questions/P1-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 |
| OQ-INFRA-003 | 自动确认 | 基础设施 | Artifact Store 生产对象存储和备份策略是什么。 | P1 结束前，P8 发布前复核。 | 平台内核/SRE/安全。 | `docs/planning/open-questions/P1-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 |
| OQ-INFRA-004 | 自动确认 | 基础设施 | Credential Center 生产密钥后端是什么。 | P1 结束前，P8 发布前复核。 | 安全/SRE/平台内核。 | `docs/planning/open-questions/P1-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 |
| OQ-INFRA-005 | 自动确认 | 基础设施 | Observability 生产后端和告警标准是什么。 | P1 结束前，P8 发布前复核。 | SRE/平台内核/安全。 | `docs/planning/open-questions/P1-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 |
| OQ-DEPLOY-001 | 自动确认 | 部署交付 | 生产部署目标是单机 Docker Compose、Kubernetes，还是两者同时作为正式交付物。 | P8 前，建议 P1 结束前定方向。 | SRE/架构/产品。 | `docs/planning/open-questions/P1-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 |

### 4.3 P5 前人工确认（可省略）

| 问题ID | 状态 | 分类 | 问题描述 | 最晚确认阶段 | 负责人/工作流 | 解决说明文档 |
| --- | --- | --- | --- | --- | --- | --- |
| OQ-PLUGIN-001 | 自动确认 | 插件治理 | 插件市场是否仅管理员白名单，P7/P8 后是否开放租户自助安装。 | P5 前。 | 产品/安全/插件治理。 | `docs/planning/open-questions/P5-resolution-plan.md`、`docs/planning/open-questions/P6-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 |
| OQ-LEGAL-001 | 自动确认 | 许可证/法务 | 上游二次开发、第三方插件、extras、native addon、vendored packages 的许可证、NOTICE 和再分发条款是否需要法务确认。 | P5 前，P8 发布前复核。 | 法务/安全/上游改造。 | `docs/planning/open-questions/P5-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 |

### 4.4 P6/P8 前人工确认（可省略）

| 问题ID | 状态 | 分类 | 问题描述 | 最晚确认阶段 | 负责人/工作流 | 解决说明文档 |
| --- | --- | --- | --- | --- | --- | --- |
| OQ-PRODUCT-001 | 自动确认 | 产品范围 | P7 高级能力是否进入首版。 | P6 开始前。 | 产品/架构/评测。 | `docs/planning/open-questions/P6-resolution-plan.md`。 |

## 5. 自动确认的问题

> 这类问题可由后续任务通过源码证据、测试结果、实验记录、ADR 或阶段验收自动生成默认解决方案。若后续任务无法取证，或确认结论改变产品范围、企业标准、合规边界，则必须升级回第 4 节进入人工确认。

### 5.1 P2 前自动确认

| 问题ID | 状态 | 分类 | 问题描述 | 最晚确认阶段 | 负责人/工作流 | 解决说明文档 |
| --- | --- | --- | --- | --- | --- | --- |
| OQ-UPSTREAM-003 | 自动确认 | 上游版本 | DSH 真实 Git remote、release commit 和 fork 分支是什么。 | P2 前。 | 上游改造/执行器。 | `docs/planning/open-questions/P2-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 |
| OQ-DSH-001 | 自动确认 | DSH 执行器 | DSH 预览版是否固定为当前 `0.1.1-rc.2` provider，后续如何并存、禁用和回滚。 | P2 前。 | 上游改造/执行器/SRE。 | `docs/planning/open-questions/P2-resolution-plan.md`。 |
| OQ-DSH-002 | 自动确认 | DSH 执行器 | DSH 正式沙箱后端、文件/网络策略、取消语义和 artifact 归档策略是什么。 | P2 前。 | 上游改造/安全/SRE。 | `docs/planning/open-questions/P2-resolution-plan.md`。 |

### 5.2 P3 前自动确认

| 问题ID | 状态 | 分类 | 问题描述 | 最晚确认阶段 | 负责人/工作流 | 解决说明文档 |
| --- | --- | --- | --- | --- | --- | --- |
| OQ-UPSTREAM-001 | 自动确认 | 上游版本 | Hermes 真实 Git remote、release commit 和 fork 分支是什么。 | P3 前。 | 上游改造。 | `docs/planning/open-questions/P3-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 |
| OQ-MEMORY-001 | 自动确认 | Memory Gateway | Hermes Memory Gateway 的五层记忆具体层级、保留期和冲突策略是什么。 | P3 前。 | 平台内核/Hermes/产品。 | `docs/planning/open-questions/P3-resolution-plan.md`。 |
| OQ-MEMORY-002 | 自动确认 | Memory Gateway | Memory Gateway 生产检索和存储选型是什么。 | P3 前，P8 发布前复核。 | 平台内核/SRE/Hermes。 | `docs/planning/open-questions/P3-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 |

### 5.3 P4 前自动确认

| 问题ID | 状态 | 分类 | 问题描述 | 最晚确认阶段 | 负责人/工作流 | 解决说明文档 |
| --- | --- | --- | --- | --- | --- | --- |
| OQ-UPSTREAM-002 | 自动确认 | 上游版本 | OpenClaw 真实 Git remote、release commit 和 fork 分支是什么。 | P4 前。 | 上游改造/渠道。 | `docs/planning/open-questions/P4-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 |

### 5.4 P5/P6 前自动确认

| 问题ID | 状态 | 分类 | 问题描述 | 最晚确认阶段 | 负责人/工作流 | 解决说明文档 |
| --- | --- | --- | --- | --- | --- | --- |
| OQ-API-002 | 自动确认 | API/产品 | 生产鉴权方案、分页游标格式、审批动作全集、错误码最终枚举和事件出口是什么。 | P5 前。 | API/SDK/安全/产品。 | `docs/planning/open-questions/P5-resolution-plan.md`。 |
| OQ-INFRA-006 | 自动确认 | 基础设施 | 长任务编排是否引入 Temporal/Cadence 或继续自研状态机。 | P6 前。 | 平台内核/SRE/架构。 | `docs/planning/open-questions/P6-resolution-plan.md`。 |

## 6. 完整问题台账

> 本节保留完整审计字段。当前 19 条记录仍处于 `自动确认` 状态，4 条 P0 到期记录已补齐确认结论、解决说明文档和关闭任务/commit 占位。

| 问题ID | 状态 | 分类 | 来源文档 | 问题描述 | 影响 | 负责人/工作流 | 最晚确认阶段 | 确认结论 | 解决说明文档 | 关联需求/风险 | 关闭任务/commit | 最后更新UTC |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| OQ-UPSTREAM-001 | 自动确认 | 上游版本 | `vendor/MANIFEST.yaml`、`docs/architecture/upstream-interface-inventory.md`、`docs/risks/risk-register.md`。 | Hermes 真实 Git remote、release commit 和 fork 分支是什么。 | 影响 provider 兼容矩阵、补丁回滚、许可证追踪和上游升级判断。 | 上游改造。 | P3 前。 | 待补齐 | `docs/planning/open-questions/P3-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 | REQ-019/R-016。 | 待补齐 | 2026-08-23。 |
| OQ-UPSTREAM-002 | 自动确认 | 上游版本 | `vendor/MANIFEST.yaml`、`docs/decisions/P0-openclaw-gateway-only.md`、`docs/risks/risk-register.md`。 | OpenClaw 真实 Git remote、release commit 和 fork 分支是什么。 | 影响 gateway provider 升级、渠道插件兼容和 P4 强制模式评审。 | 上游改造/渠道。 | P4 前。 | 待补齐 | `docs/planning/open-questions/P4-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 | REQ-019/R-016。 | 待补齐 | 2026-08-23。 |
| OQ-UPSTREAM-003 | 自动确认 | 上游版本 | `vendor/MANIFEST.yaml`、`docs/architecture/dsh-versioning-and-replacement.md`、`docs/risks/risk-register.md`。 | DSH 真实 Git remote、release commit 和 fork 分支是什么。 | 影响 executor provider 固定、替换、回滚和预览版变更追踪。 | 上游改造/执行器。 | P2 前。 | 待补齐 | `docs/planning/open-questions/P2-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 | REQ-018/R-001/R-016。 | 待补齐 | 2026-08-23。 |
| OQ-UPSTREAM-004 | 已关闭 | 上游快照 | `docs/planning/integrated-platform-plan.md`、`scripts/bootstrap/vendor-snapshot.sh`、`scripts/source-manifest/create-manifest.sh`。 | 是否允许长期排除上游构建产物、缓存、日志和依赖目录后作为正式交付快照。 | 影响 vendor 可复现性、审计范围和交付体积。 | 架构/上游改造/SRE。 | P0 门禁前。 | 接受默认快照策略：长期排除构建产物、缓存、日志和依赖目录，以源码快照、排除规则和可复现 hash 作为交付口径。 | `docs/planning/open-questions/P0-resolution-plan.md`、`docs/planning/phase-gates/P0-gate-review.md`。 | REQ-004/R-015。 | 568014bebb2ae256b1d86a9618adde1abd6c24d1 | 2026-08-23。 |
| OQ-SCHEDULE-001 | 已关闭 | 排期资源 | `docs/planning/development-schedule.md`、`docs/risks/risk-register.md`。 | 实际团队人数、角色和可投入比例是什么。 | 影响 P2/P3/P4 是否并行、P5 控制台范围和 MVP 冻结日期。 | 架构/产品。 | P0 W1 结束前。 | 接受默认容量模型：采用 8-10 个核心角色基线，保留 4-5 人降级排期；实际容量变化触发后续重排。 | `docs/planning/open-questions/P0-resolution-plan.md`、`docs/planning/phase-gates/P0-gate-review.md`。 | REQ-014/R-009。 | 568014bebb2ae256b1d86a9618adde1abd6c24d1 | 2026-08-23。 |
| OQ-SCHEDULE-002 | 已关闭 | 排期资源 | `docs/planning/development-schedule.md`、`docs/risks/risk-register.md`。 | 地区节假日和公司发布冻结窗口是什么。 | 影响 W13-W18、MVP 冻结、P8 发布候选和生产发布日历。 | 架构/产品/SRE。 | P0 W1 结束前。 | 接受默认日历策略：按当前排期基线和冻结缓冲推进；真实节假日或发布冻结窗口变化触发后续重排。 | `docs/planning/open-questions/P0-resolution-plan.md`、`docs/planning/phase-gates/P0-gate-review.md`。 | REQ-014/R-009。 | 568014bebb2ae256b1d86a9618adde1abd6c24d1 | 2026-08-23。 |
| OQ-API-001 | 自动确认 | API/产品 | `docs/contracts/openapi.yaml`、`docs/planning/integrated-platform-plan.md`、`docs/risks/risk-register.md`。 | 平台统一 REST 和 gRPC 是否要求同期交付。 | 影响 P5 API/SDK 工期、契约测试和 streaming 设计。 | API/SDK/产品。 | P1 结束前。 | 接受默认 REST-first：P5-01 交付 REST MVP 和 OpenAPI contract gate，gRPC/protobuf/streaming 延后到 P5/P8 复核。 | `docs/planning/open-questions/P1-resolution-plan.md`。 | REQ-007/REQ-014。 | P5-01 本次提交，完成报告记录最终 commit hash。 | 2026-08-25。 |
| OQ-API-002 | 自动确认 | API/产品 | `docs/risks/risk-register.md`、`docs/contracts/openapi.yaml`。 | 生产鉴权方案、分页游标格式、审批动作全集、错误码最终枚举和事件出口是什么。 | 影响公共契约稳定性、SDK 生成和控制台一致性。 | API/SDK/安全/产品。 | P5 前。 | P5-01 固定 REST MVP、平台错误码、基础审批/预算和本地 dev bearer resolver；P5-02 固定控制台手动刷新 + 15 秒轮询；P5-03 固定渠道管理 REST routes 和 dry-run 连接测试；P5-04 固定 TypeScript-only SDK、可运行 examples 和 docs-site，事件出口使用 task events 轮询文档化；生产 IdP/SSO、真实渠道网络、webhook delivery、streaming 和其他 SDK 语言继续由 P8 或后续 SDK 批次关闭。 | `docs/planning/open-questions/P5-resolution-plan.md`。 | REQ-007/R-007。 | P5-01/P5-02/P5-03/P5-04，生产项仍待后续任务。 | 2026-08-26。 |
| OQ-CHANNEL-001 | 已关闭 | 渠道/插件 | `docs/planning/integrated-platform-plan.md`、`docs/architecture/upstream-versioning-and-plugin-bridge.md`、`docs/risks/risk-register.md`。 | 首批正式渠道是否为钉钉、飞书、Telegram，是否需要企业微信、Slack 等。 | 影响 P4 OpenClaw gateway adapter、P5 渠道管理和插件白名单测试。 | 渠道/产品/安全。 | P0 结束前。 | 接受默认首批渠道：钉钉、飞书、Telegram；企业微信、Slack 等新增渠道作为 P4/P5 范围变更处理。 | `docs/planning/open-questions/P0-resolution-plan.md`、`docs/planning/open-questions/P4-resolution-plan.md`、`docs/planning/phase-gates/P0-gate-review.md`。 | REQ-020/R-013/R-014。 | 568014bebb2ae256b1d86a9618adde1abd6c24d1 | 2026-08-23。 |
| OQ-PLUGIN-001 | 自动确认 | 插件治理 | `docs/architecture/upstream-versioning-and-plugin-bridge.md`、`docs/architecture/service-blueprint.md`。 | 插件市场是否仅管理员白名单，P7/P8 后是否开放租户自助安装。 | 影响 Plugin Bridge 产品范围、租户权限、恶意插件测试和许可证审核。 | 产品/安全/插件治理。 | P5 前。 | P5-01/P5-02/P5-04 接受默认管理员治理：平台管理员可通过 API、控制台和 TypeScript SDK examples 导入/批准/禁用/拒绝插件元数据，tenant admin/viewer 不显示治理入口且强制 API 调用 fail closed；开发者文档明确租户不得自助安装第三方插件。P6-02 补充“双格式覆盖”恶意插件隔离：平台中性 mock manifest/payload 与 Hermes/OpenClaw Plugin Bridge fixture 变体均无法注入 native agent/tool/memory/runtime、provider runtime、plugin subagent、env secret 或未批准 capability。 | `docs/planning/open-questions/P5-resolution-plan.md`、`docs/planning/open-questions/P6-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 | REQ-020/R-013/R-014。 | P5-01/P5-02/P5-04/P6-02，插件升级回滚、生产 sidecar/OS 隔离和许可证发布包仍待 P8。 | 2026-08-26。 |
| OQ-LEGAL-001 | 自动确认 | 许可证/法务 | `docs/risks/risk-register.md`、`docs/architecture/upstream-interface-inventory.md`。 | 上游二次开发、第三方插件、extras、native addon、vendored packages 的许可证、NOTICE 和再分发条款是否需要法务确认。 | 影响生产交付、插件启用、客户分发和补丁维护边界。 | 法务/安全/上游改造。 | P5 前，P8 发布前复核。 | P5-01 已要求插件导入携带 hash、license、notice_status、risk_level 和版本元数据；P5-04 SDK/docs 继续把这些字段作为管理员插件治理示例和开发者说明；法务确认、THIRD_PARTY/NOTICE 发布包仍待 P8。 | `docs/planning/open-questions/P5-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 | R-015/R-016/REQ-020。 | P5-01/P5-04 补 API 与 SDK/docs 元数据证据，最终关闭仍待 P8。 | 2026-08-26。 |
| OQ-INFRA-001 | 自动确认 | 基础设施 | `docs/architecture/service-blueprint.md`、`docs/planning/development-schedule.md`。 | Web/API 框架是否选择 Fastify、NestJS 或企业标准框架。 | 影响 P1 middleware、依赖注入、测试结构和 SDK/契约生成方式。 | 平台内核/API/SRE。 | P1 前。 | 待补齐 | `docs/planning/open-questions/P1-resolution-plan.md`。 | REQ-011/R-008。 | 待补齐 | 2026-08-23。 |
| OQ-INFRA-002 | 自动确认 | 基础设施 | `docs/architecture/service-blueprint.md`、`docs/planning/development-schedule.md`。 | Event Bus 生产底层选型是什么。 | 影响事件重放、顺序性、死信、容量规划和运维成本。 | 平台内核/SRE。 | P1 结束前，P8 发布前复核。 | 待补齐 | `docs/planning/open-questions/P1-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 | REQ-013/R-008。 | 待补齐 | 2026-08-23。 |
| OQ-INFRA-003 | 自动确认 | 基础设施 | `docs/architecture/service-blueprint.md`、`docs/planning/development-schedule.md`。 | Artifact Store 生产对象存储和备份策略是什么。 | 影响 artifact URL、生命周期、加密、备份恢复和越权测试。 | 平台内核/SRE/安全。 | P1 结束前，P8 发布前复核。 | 待补齐 | `docs/planning/open-questions/P1-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 | REQ-009/REQ-013/R-008。 | 待补齐 | 2026-08-23。 |
| OQ-INFRA-004 | 自动确认 | 基础设施 | `docs/architecture/service-blueprint.md`、`docs/planning/development-schedule.md`。 | Credential Center 生产密钥后端是什么。 | 影响凭据轮换、动态租约、审计、最小权限和明文泄漏测试。 | 安全/SRE/平台内核。 | P1 结束前，P8 发布前复核。 | 待补齐 | `docs/planning/open-questions/P1-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 | REQ-013/R-014。 | 待补齐 | 2026-08-23。 |
| OQ-INFRA-005 | 自动确认 | 基础设施 | `docs/architecture/service-blueprint.md`、`docs/planning/development-schedule.md`。 | Observability 生产后端和告警标准是什么。 | 影响 trace 存储、日志保留、指标命名、告警接入和控制台监控页。 | SRE/平台内核/安全。 | P1 结束前，P8 发布前复核。 | 待补齐 | `docs/planning/open-questions/P1-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 | REQ-013/R-008。 | 待补齐 | 2026-08-23。 |
| OQ-INFRA-006 | 自动确认 | 基础设施 | `docs/architecture/service-blueprint.md`。 | 长任务编排是否引入 Temporal/Cadence 或继续自研状态机。 | 影响恢复、人工信号、重试、补偿事务和部署复杂度。 | 平台内核/SRE/架构。 | P6 前。 | P6-01 接受默认 TaskState/Coordinator 路线：基础业务闭环已用 deterministic in-process E2E 证明同一 Coordinator、Policy-Gate、Event Bus、Memory Gateway、Artifact Store 和内部 adapters 可串联；P6-02 安全矩阵继续验证跳过审批/预算、伪造 Policy-Gate/trusted header、disabled/unknown provider 和直接 adapter invoke 均由 Coordinator/Policy-Gate fail closed 并保留 denied evidence；Temporal/Cadence 与 durable workflow 最终选型仍待 P6-03/P6 gate 或 P8 复核。 | `docs/planning/open-questions/P6-resolution-plan.md`。 | REQ-011/R-008。 | P6-01/P6-02 补闭环与安全矩阵证据，故障恢复与生产编排最终关闭仍待后续任务。 | 2026-08-26。 |
| OQ-MEMORY-001 | 自动确认 | Memory Gateway | `docs/planning/integrated-platform-plan.md`、`docs/architecture/service-blueprint.md`、`docs/decisions/P0-hermes-planner-only.md`。 | Hermes Memory Gateway 的五层记忆具体层级、保留期和冲突策略是什么。 | 影响 P3 planner context、并发写入、快照、冲突解决和审计。 | 平台内核/Hermes/产品。 | P3 前。 | 待补齐 | `docs/planning/open-questions/P3-resolution-plan.md`。 | REQ-008/R-005。 | 待补齐 | 2026-08-23。 |
| OQ-MEMORY-002 | 自动确认 | Memory Gateway | `docs/architecture/service-blueprint.md`、`docs/risks/risk-register.md`。 | Memory Gateway 生产检索和存储选型是什么。 | 影响检索延迟、一致性、租户隔离、备份和运维复杂度。 | 平台内核/SRE/Hermes。 | P3 前，P8 发布前复核。 | 待补齐 | `docs/planning/open-questions/P3-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 | REQ-008/REQ-013/R-005/R-008。 | 待补齐 | 2026-08-23。 |
| OQ-DSH-001 | 自动确认 | DSH 执行器 | `docs/architecture/dsh-versioning-and-replacement.md`、`docs/risks/risk-register.md`。 | DSH 预览版是否固定为当前 `0.1.1-rc.2` provider，后续如何并存、禁用和回滚。 | 影响 P2 provider registry、兼容 fixture、升级门禁和生产默认 executor 切换。 | 上游改造/执行器/SRE。 | P2 前。 | 待补齐 | `docs/planning/open-questions/P2-resolution-plan.md`。 | REQ-018/R-001/R-016。 | 待补齐 | 2026-08-23。 |
| OQ-DSH-002 | 自动确认 | DSH 执行器 | `docs/decisions/P0-dsh-executor-only.md`、`docs/risks/risk-register.md`。 | DSH 正式沙箱后端、文件/网络策略、取消语义和 artifact 归档策略是什么。 | 影响 executor-only 改造、安全测试、产物入库、取消/超时和故障注入。 | 上游改造/安全/SRE。 | P2 前。 | 待补齐 | `docs/planning/open-questions/P2-resolution-plan.md`。 | REQ-009/REQ-018/R-001/R-004。 | 待补齐 | 2026-08-23。 |
| OQ-DEPLOY-001 | 自动确认 | 部署交付 | `docs/planning/integrated-platform-plan.md`、`docs/planning/development-schedule.md`。 | 生产部署目标是单机 Docker Compose、Kubernetes，还是两者同时作为正式交付物。 | 影响 P8 编排、CI/CD、运维手册、备份恢复和发布门禁。 | SRE/架构/产品。 | P8 前，建议 P1 结束前定方向。 | 待补齐 | `docs/planning/open-questions/P1-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 | REQ-005/REQ-014/R-008。 | 待补齐 | 2026-08-23。 |
| OQ-PRODUCT-001 | 自动确认 | 产品范围 | `docs/planning/development-schedule.md`、`docs/planning/integrated-platform-plan.md`。 | P7 高级能力是否进入首版。 | 影响 W15-W18 是否需要额外冻结窗口、资源预算和 MVP 范围。 | 产品/架构/评测。 | P6 开始前。 | P6-01 接受默认裁剪：P7 高级能力不进入 MVP 基础闭环，当前只验证渠道入站、任务、memory/planning、execution/artifact、outbound send intent 和 audit timeline；P6-02 只补安全攻击矩阵和恶意插件隔离，不新增 streaming、自动评测、高级记忆策略、真实业务评测集或用户可见产品能力；真实业务评测集、资源阈值和最终 P7 裁剪清单仍待 P6 gate 或后续评测任务确认。 | `docs/planning/open-questions/P6-resolution-plan.md`。 | REQ-014/R-009。 | P6-01/P6-02 补基础闭环、防绕过和默认延期证据，最终 MVP/P7 裁剪关闭仍待 P6 gate。 | 2026-08-26。 |

## 7. 当前关闭摘要

| 状态 | 数量 | 说明 |
|---|---:|---|
| 打开 | 0 | 暂无 |
| 自动确认 | 19 | 已生成默认解决方案，尚未关闭 |
| 人工确认 | 0 | 暂无；可省略 |
| 已关闭 | 4 | P0 门禁已关闭 4 个到期问题 |
