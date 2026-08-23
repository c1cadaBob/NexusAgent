# NexusAgent 待确认问题集中台账

> 文档状态：P0-09 集中台账基线，已恢复为表格索引形式，并保留分阶段处理计划索引。
>
> 维护规则：本文件是【待确认问题】的状态索引，不替代架构、契约、风险、决策或任务文档。技术细节和处理路线仍写在专业文档中，本台账只记录问题、影响、责任工作流、最晚确认阶段、确认结论和解决说明文档位置。分阶段处理计划维护在 `docs/planning/open-questions/`。
>
> 最后更新UTC：2026-08-23。

## 1. 状态枚举

| 状态 | 含义 | 关闭要求 |
|---|---|---|
| Open | 尚未确认，不能作为事实写入实现或对外文档 | 保留影响、责任工作流、最晚确认阶段和解决说明文档 |
| Confirmed | 已确认并完成文档落点 | 必须填写确认结论、解决说明文档、关闭任务/commit |
| Deferred | 已确认延后，不阻塞当前阶段 | 必须说明延后到哪个阶段以及不阻塞原因 |
| Superseded | 被新的问题或决策替代 | 必须引用替代问题 ID 或决策记录 |
| Blocked | 无法由当前团队单独确认 | 必须写明外部依赖、阻塞影响和下一步补救 |

## 2. 关闭规则

- 不直接删除问题；关闭时把状态改为 `Confirmed`、`Deferred` 或 `Superseded`。
- 本台账不展示候选方案，只作为状态索引；可行处理路线、三平台影响和关闭证据统一维护在 `docs/planning/open-questions/`。
- 状态为 `Confirmed` 时，`确认结论`、`解决说明文档` 和 `关闭任务/commit` 必须非空。
- 如果确认结论影响任务范围、架构边界、测试门禁或排期，必须同步更新 `docs/traceability/requirements-matrix.md`、`docs/risks/risk-register.md` 和对应任务 ID 的修改记录包。
- 如果问题来自上游版本、插件或许可证，关闭前必须补充来源证据、hash/版本、许可证/NOTICE 影响和回滚方式。

## 3. 当前确认状态

| 指标 | 数量 | 说明 |
|---|---:|---|
| 待确认问题总数 | 23 | 来自当前 `OQ-*` 台账 |
| Open | 23 | 尚未完成正式确认，不能作为已关闭事实 |
| Confirmed | 0 | 当前没有已完成确认的问题 |
| 已有阶段处理计划 | 23 | 每个问题均已落到 `docs/planning/open-questions/` 的阶段计划 |

当前这些问题还没有完成确认。已经完成的是“逐项登记”和“阶段处理计划落点”；还没有完成的是把状态改为 `Confirmed`，并写入确认结论、关闭任务/commit 和同步后的专业文档证据。

## 4. 需要负责人确认的问题

> 这里的“负责人”指项目负责人，或由项目负责人指定的产品、SRE、安全、法务等最终拍板人。这类问题通常涉及范围、资源、交付目标、企业标准或合规边界，后续任务不能自行假设为事实。

### 4.1 P1 前需要确认

| 问题ID | 状态 | 分类 | 问题描述 | 最晚确认阶段 | 负责人/工作流 | 解决说明文档 |
| --- | --- | --- | --- | --- | --- | --- |
| OQ-UPSTREAM-004 | Open | 上游快照 | 是否允许长期排除上游构建产物、缓存、日志和依赖目录后作为正式交付快照。 | P0 门禁前。 | 架构/上游改造/SRE。 | `docs/planning/open-questions/P0-resolution-plan.md`。 |
| OQ-SCHEDULE-001 | Open | 排期资源 | 实际团队人数、角色和可投入比例是什么。 | P0 W1 结束前。 | 架构/产品。 | `docs/planning/open-questions/P0-resolution-plan.md`。 |
| OQ-SCHEDULE-002 | Open | 排期资源 | 地区节假日和公司发布冻结窗口是什么。 | P0 W1 结束前。 | 架构/产品/SRE。 | `docs/planning/open-questions/P0-resolution-plan.md`。 |
| OQ-CHANNEL-001 | Open | 渠道/插件 | 首批正式渠道是否为钉钉、飞书、Telegram，是否需要企业微信、Slack 等。 | P0 结束前。 | 渠道/产品/安全。 | `docs/planning/open-questions/P0-resolution-plan.md`、`docs/planning/open-questions/P4-resolution-plan.md`。 |
| OQ-INFRA-001 | Open | 基础设施 | Web/API 框架是否选择 Fastify、NestJS 或企业标准框架。 | P1 前。 | 平台内核/API/SRE。 | `docs/planning/open-questions/P1-resolution-plan.md`。 |

### 4.2 P2 前需要确认

| 问题ID | 状态 | 分类 | 问题描述 | 最晚确认阶段 | 负责人/工作流 | 解决说明文档 |
| --- | --- | --- | --- | --- | --- | --- |
| OQ-API-001 | Open | API/产品 | 平台统一 REST 和 gRPC 是否要求同期交付。 | P1 结束前。 | API/SDK/产品。 | `docs/planning/open-questions/P1-resolution-plan.md`。 |
| OQ-INFRA-002 | Open | 基础设施 | Event Bus 生产底层选型是什么。 | P1 结束前，P8 发布前复核。 | 平台内核/SRE。 | `docs/planning/open-questions/P1-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 |
| OQ-INFRA-003 | Open | 基础设施 | Artifact Store 生产对象存储和备份策略是什么。 | P1 结束前，P8 发布前复核。 | 平台内核/SRE/安全。 | `docs/planning/open-questions/P1-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 |
| OQ-INFRA-004 | Open | 基础设施 | Credential Center 生产密钥后端是什么。 | P1 结束前，P8 发布前复核。 | 安全/SRE/平台内核。 | `docs/planning/open-questions/P1-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 |
| OQ-INFRA-005 | Open | 基础设施 | Observability 生产后端和告警标准是什么。 | P1 结束前，P8 发布前复核。 | SRE/平台内核/安全。 | `docs/planning/open-questions/P1-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 |
| OQ-DEPLOY-001 | Open | 部署交付 | 生产部署目标是单机 Docker Compose、Kubernetes，还是两者同时作为正式交付物。 | P8 前，建议 P1 结束前定方向。 | SRE/架构/产品。 | `docs/planning/open-questions/P1-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 |

### 4.3 P5 前需要确认

| 问题ID | 状态 | 分类 | 问题描述 | 最晚确认阶段 | 负责人/工作流 | 解决说明文档 |
| --- | --- | --- | --- | --- | --- | --- |
| OQ-PLUGIN-001 | Open | 插件治理 | 插件市场是否仅管理员白名单，P7/P8 后是否开放租户自助安装。 | P5 前。 | 产品/安全/插件治理。 | `docs/planning/open-questions/P5-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 |
| OQ-LEGAL-001 | Open | 许可证/法务 | 上游二次开发、第三方插件、extras、native addon、vendored packages 的许可证、NOTICE 和再分发条款是否需要法务确认。 | P5 前，P8 发布前复核。 | 法务/安全/上游改造。 | `docs/planning/open-questions/P5-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 |

### 4.4 P6/P8 前需要确认

| 问题ID | 状态 | 分类 | 问题描述 | 最晚确认阶段 | 负责人/工作流 | 解决说明文档 |
| --- | --- | --- | --- | --- | --- | --- |
| OQ-PRODUCT-001 | Open | 产品范围 | P7 高级能力是否进入首版。 | P6 开始前。 | 产品/架构/评测。 | `docs/planning/open-questions/P6-resolution-plan.md`。 |

## 5. 后续自动确认的问题

> 这类问题可由后续任务通过源码证据、测试结果、实验记录、ADR 或阶段验收自动关闭。若后续任务无法取证，或确认结论改变产品范围、企业标准、合规边界，则必须升级回第 4 节由负责人确认。

### 5.1 P2 前自动确认

| 问题ID | 状态 | 分类 | 问题描述 | 最晚确认阶段 | 负责人/工作流 | 解决说明文档 |
| --- | --- | --- | --- | --- | --- | --- |
| OQ-UPSTREAM-003 | Open | 上游版本 | DSH 真实 Git remote、release commit 和 fork 分支是什么。 | P2 前。 | 上游改造/执行器。 | `docs/planning/open-questions/P2-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 |
| OQ-DSH-001 | Open | DSH 执行器 | DSH 预览版是否固定为当前 `0.1.1-rc.2` provider，后续如何并存、禁用和回滚。 | P2 前。 | 上游改造/执行器/SRE。 | `docs/planning/open-questions/P2-resolution-plan.md`。 |
| OQ-DSH-002 | Open | DSH 执行器 | DSH 正式沙箱后端、文件/网络策略、取消语义和 artifact 归档策略是什么。 | P2 前。 | 上游改造/安全/SRE。 | `docs/planning/open-questions/P2-resolution-plan.md`。 |

### 5.2 P3 前自动确认

| 问题ID | 状态 | 分类 | 问题描述 | 最晚确认阶段 | 负责人/工作流 | 解决说明文档 |
| --- | --- | --- | --- | --- | --- | --- |
| OQ-UPSTREAM-001 | Open | 上游版本 | Hermes 真实 Git remote、release commit 和 fork 分支是什么。 | P3 前。 | 上游改造。 | `docs/planning/open-questions/P3-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 |
| OQ-MEMORY-001 | Open | Memory Gateway | Hermes Memory Gateway 的五层记忆具体层级、保留期和冲突策略是什么。 | P3 前。 | 平台内核/Hermes/产品。 | `docs/planning/open-questions/P3-resolution-plan.md`。 |
| OQ-MEMORY-002 | Open | Memory Gateway | Memory Gateway 生产检索和存储选型是什么。 | P3 前，P8 发布前复核。 | 平台内核/SRE/Hermes。 | `docs/planning/open-questions/P3-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 |

### 5.3 P4 前自动确认

| 问题ID | 状态 | 分类 | 问题描述 | 最晚确认阶段 | 负责人/工作流 | 解决说明文档 |
| --- | --- | --- | --- | --- | --- | --- |
| OQ-UPSTREAM-002 | Open | 上游版本 | OpenClaw 真实 Git remote、release commit 和 fork 分支是什么。 | P4 前。 | 上游改造/渠道。 | `docs/planning/open-questions/P4-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 |

### 5.4 P5/P6 前自动确认

| 问题ID | 状态 | 分类 | 问题描述 | 最晚确认阶段 | 负责人/工作流 | 解决说明文档 |
| --- | --- | --- | --- | --- | --- | --- |
| OQ-API-002 | Open | API/产品 | 生产鉴权方案、分页游标格式、审批动作全集、错误码最终枚举和事件出口是什么。 | P5 前。 | API/SDK/安全/产品。 | `docs/planning/open-questions/P5-resolution-plan.md`。 |
| OQ-INFRA-006 | Open | 基础设施 | 长任务编排是否引入 Temporal/Cadence 或继续自研状态机。 | P6 前。 | 平台内核/SRE/架构。 | `docs/planning/open-questions/P6-resolution-plan.md`。 |

## 6. 完整问题台账

> 本节保留完整审计字段。所有记录当前仍保持 `Open` 状态；关闭时必须补充确认结论、解决说明文档和关闭任务/commit。

| 问题ID | 状态 | 分类 | 来源文档 | 问题描述 | 影响 | 负责人/工作流 | 最晚确认阶段 | 确认结论 | 解决说明文档 | 关联需求/风险 | 关闭任务/commit | 最后更新UTC |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| OQ-UPSTREAM-001 | Open | 上游版本 | `vendor/MANIFEST.yaml`、`docs/architecture/upstream-interface-inventory.md`、`docs/risks/risk-register.md`。 | Hermes 真实 Git remote、release commit 和 fork 分支是什么。 | 影响 provider 兼容矩阵、补丁回滚、许可证追踪和上游升级判断。 | 上游改造。 | P3 前。 | 待确认。 | `docs/planning/open-questions/P3-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 | REQ-019/R-016。 | 待确认。 | 2026-08-23。 |
| OQ-UPSTREAM-002 | Open | 上游版本 | `vendor/MANIFEST.yaml`、`docs/decisions/P0-openclaw-gateway-only.md`、`docs/risks/risk-register.md`。 | OpenClaw 真实 Git remote、release commit 和 fork 分支是什么。 | 影响 gateway provider 升级、渠道插件兼容和 P4 强制模式评审。 | 上游改造/渠道。 | P4 前。 | 待确认。 | `docs/planning/open-questions/P4-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 | REQ-019/R-016。 | 待确认。 | 2026-08-23。 |
| OQ-UPSTREAM-003 | Open | 上游版本 | `vendor/MANIFEST.yaml`、`docs/architecture/dsh-versioning-and-replacement.md`、`docs/risks/risk-register.md`。 | DSH 真实 Git remote、release commit 和 fork 分支是什么。 | 影响 executor provider 固定、替换、回滚和预览版变更追踪。 | 上游改造/执行器。 | P2 前。 | 待确认。 | `docs/planning/open-questions/P2-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 | REQ-018/R-001/R-016。 | 待确认。 | 2026-08-23。 |
| OQ-UPSTREAM-004 | Open | 上游快照 | `docs/planning/integrated-platform-plan.md`、`scripts/bootstrap/vendor-snapshot.sh`、`scripts/source-manifest/create-manifest.sh`。 | 是否允许长期排除上游构建产物、缓存、日志和依赖目录后作为正式交付快照。 | 影响 vendor 可复现性、审计范围和交付体积。 | 架构/上游改造/SRE。 | P0 门禁前。 | 待确认。 | `docs/planning/open-questions/P0-resolution-plan.md`。 | REQ-004/R-015。 | 待确认。 | 2026-08-23。 |
| OQ-SCHEDULE-001 | Open | 排期资源 | `docs/planning/development-schedule.md`、`docs/risks/risk-register.md`。 | 实际团队人数、角色和可投入比例是什么。 | 影响 P2/P3/P4 是否并行、P5 控制台范围和 MVP 冻结日期。 | 架构/产品。 | P0 W1 结束前。 | 待确认。 | `docs/planning/open-questions/P0-resolution-plan.md`。 | REQ-014/R-009。 | 待确认。 | 2026-08-23。 |
| OQ-SCHEDULE-002 | Open | 排期资源 | `docs/planning/development-schedule.md`、`docs/risks/risk-register.md`。 | 地区节假日和公司发布冻结窗口是什么。 | 影响 W13-W18、MVP 冻结、P8 发布候选和生产发布日历。 | 架构/产品/SRE。 | P0 W1 结束前。 | 待确认。 | `docs/planning/open-questions/P0-resolution-plan.md`。 | REQ-014/R-009。 | 待确认。 | 2026-08-23。 |
| OQ-API-001 | Open | API/产品 | `docs/contracts/openapi.yaml`、`docs/planning/integrated-platform-plan.md`、`docs/risks/risk-register.md`。 | 平台统一 REST 和 gRPC 是否要求同期交付。 | 影响 P5 API/SDK 工期、契约测试和 streaming 设计。 | API/SDK/产品。 | P1 结束前。 | 待确认。 | `docs/planning/open-questions/P1-resolution-plan.md`。 | REQ-007/REQ-014。 | 待确认。 | 2026-08-23。 |
| OQ-API-002 | Open | API/产品 | `docs/risks/risk-register.md`、`docs/contracts/openapi.yaml`。 | 生产鉴权方案、分页游标格式、审批动作全集、错误码最终枚举和事件出口是什么。 | 影响公共契约稳定性、SDK 生成和控制台一致性。 | API/SDK/安全/产品。 | P5 前。 | 待确认。 | `docs/planning/open-questions/P5-resolution-plan.md`。 | REQ-007/R-007。 | 待确认。 | 2026-08-23。 |
| OQ-CHANNEL-001 | Open | 渠道/插件 | `docs/planning/integrated-platform-plan.md`、`docs/architecture/upstream-versioning-and-plugin-bridge.md`、`docs/risks/risk-register.md`。 | 首批正式渠道是否为钉钉、飞书、Telegram，是否需要企业微信、Slack 等。 | 影响 P4 OpenClaw gateway adapter、P5 渠道管理和插件白名单测试。 | 渠道/产品/安全。 | P0 结束前。 | 待确认。 | `docs/planning/open-questions/P0-resolution-plan.md`、`docs/planning/open-questions/P4-resolution-plan.md`。 | REQ-020/R-013/R-014。 | 待确认。 | 2026-08-23。 |
| OQ-PLUGIN-001 | Open | 插件治理 | `docs/architecture/upstream-versioning-and-plugin-bridge.md`、`docs/architecture/service-blueprint.md`。 | 插件市场是否仅管理员白名单，P7/P8 后是否开放租户自助安装。 | 影响 Plugin Bridge 产品范围、租户权限、恶意插件测试和许可证审核。 | 产品/安全/插件治理。 | P5 前。 | 待确认。 | `docs/planning/open-questions/P5-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 | REQ-020/R-013/R-014。 | 待确认。 | 2026-08-23。 |
| OQ-LEGAL-001 | Open | 许可证/法务 | `docs/risks/risk-register.md`、`docs/architecture/upstream-interface-inventory.md`。 | 上游二次开发、第三方插件、extras、native addon、vendored packages 的许可证、NOTICE 和再分发条款是否需要法务确认。 | 影响生产交付、插件启用、客户分发和补丁维护边界。 | 法务/安全/上游改造。 | P5 前，P8 发布前复核。 | 待确认。 | `docs/planning/open-questions/P5-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 | R-015/R-016/REQ-020。 | 待确认。 | 2026-08-23。 |
| OQ-INFRA-001 | Open | 基础设施 | `docs/architecture/service-blueprint.md`、`docs/planning/development-schedule.md`。 | Web/API 框架是否选择 Fastify、NestJS 或企业标准框架。 | 影响 P1 middleware、依赖注入、测试结构和 SDK/契约生成方式。 | 平台内核/API/SRE。 | P1 前。 | 待确认。 | `docs/planning/open-questions/P1-resolution-plan.md`。 | REQ-011/R-008。 | 待确认。 | 2026-08-23。 |
| OQ-INFRA-002 | Open | 基础设施 | `docs/architecture/service-blueprint.md`、`docs/planning/development-schedule.md`。 | Event Bus 生产底层选型是什么。 | 影响事件重放、顺序性、死信、容量规划和运维成本。 | 平台内核/SRE。 | P1 结束前，P8 发布前复核。 | 待确认。 | `docs/planning/open-questions/P1-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 | REQ-013/R-008。 | 待确认。 | 2026-08-23。 |
| OQ-INFRA-003 | Open | 基础设施 | `docs/architecture/service-blueprint.md`、`docs/planning/development-schedule.md`。 | Artifact Store 生产对象存储和备份策略是什么。 | 影响 artifact URL、生命周期、加密、备份恢复和越权测试。 | 平台内核/SRE/安全。 | P1 结束前，P8 发布前复核。 | 待确认。 | `docs/planning/open-questions/P1-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 | REQ-009/REQ-013/R-008。 | 待确认。 | 2026-08-23。 |
| OQ-INFRA-004 | Open | 基础设施 | `docs/architecture/service-blueprint.md`、`docs/planning/development-schedule.md`。 | Credential Center 生产密钥后端是什么。 | 影响凭据轮换、动态租约、审计、最小权限和明文泄漏测试。 | 安全/SRE/平台内核。 | P1 结束前，P8 发布前复核。 | 待确认。 | `docs/planning/open-questions/P1-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 | REQ-013/R-014。 | 待确认。 | 2026-08-23。 |
| OQ-INFRA-005 | Open | 基础设施 | `docs/architecture/service-blueprint.md`、`docs/planning/development-schedule.md`。 | Observability 生产后端和告警标准是什么。 | 影响 trace 存储、日志保留、指标命名、告警接入和控制台监控页。 | SRE/平台内核/安全。 | P1 结束前，P8 发布前复核。 | 待确认。 | `docs/planning/open-questions/P1-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 | REQ-013/R-008。 | 待确认。 | 2026-08-23。 |
| OQ-INFRA-006 | Open | 基础设施 | `docs/architecture/service-blueprint.md`。 | 长任务编排是否引入 Temporal/Cadence 或继续自研状态机。 | 影响恢复、人工信号、重试、补偿事务和部署复杂度。 | 平台内核/SRE/架构。 | P6 前。 | 待确认。 | `docs/planning/open-questions/P6-resolution-plan.md`。 | REQ-011/R-008。 | 待确认。 | 2026-08-23。 |
| OQ-MEMORY-001 | Open | Memory Gateway | `docs/planning/integrated-platform-plan.md`、`docs/architecture/service-blueprint.md`、`docs/decisions/P0-hermes-planner-only.md`。 | Hermes Memory Gateway 的五层记忆具体层级、保留期和冲突策略是什么。 | 影响 P3 planner context、并发写入、快照、冲突解决和审计。 | 平台内核/Hermes/产品。 | P3 前。 | 待确认。 | `docs/planning/open-questions/P3-resolution-plan.md`。 | REQ-008/R-005。 | 待确认。 | 2026-08-23。 |
| OQ-MEMORY-002 | Open | Memory Gateway | `docs/architecture/service-blueprint.md`、`docs/risks/risk-register.md`。 | Memory Gateway 生产检索和存储选型是什么。 | 影响检索延迟、一致性、租户隔离、备份和运维复杂度。 | 平台内核/SRE/Hermes。 | P3 前，P8 发布前复核。 | 待确认。 | `docs/planning/open-questions/P3-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 | REQ-008/REQ-013/R-005/R-008。 | 待确认。 | 2026-08-23。 |
| OQ-DSH-001 | Open | DSH 执行器 | `docs/architecture/dsh-versioning-and-replacement.md`、`docs/risks/risk-register.md`。 | DSH 预览版是否固定为当前 `0.1.1-rc.2` provider，后续如何并存、禁用和回滚。 | 影响 P2 provider registry、兼容 fixture、升级门禁和生产默认 executor 切换。 | 上游改造/执行器/SRE。 | P2 前。 | 待确认。 | `docs/planning/open-questions/P2-resolution-plan.md`。 | REQ-018/R-001/R-016。 | 待确认。 | 2026-08-23。 |
| OQ-DSH-002 | Open | DSH 执行器 | `docs/decisions/P0-dsh-executor-only.md`、`docs/risks/risk-register.md`。 | DSH 正式沙箱后端、文件/网络策略、取消语义和 artifact 归档策略是什么。 | 影响 executor-only 改造、安全测试、产物入库、取消/超时和故障注入。 | 上游改造/安全/SRE。 | P2 前。 | 待确认。 | `docs/planning/open-questions/P2-resolution-plan.md`。 | REQ-009/REQ-018/R-001/R-004。 | 待确认。 | 2026-08-23。 |
| OQ-DEPLOY-001 | Open | 部署交付 | `docs/planning/integrated-platform-plan.md`、`docs/planning/development-schedule.md`。 | 生产部署目标是单机 Docker Compose、Kubernetes，还是两者同时作为正式交付物。 | 影响 P8 编排、CI/CD、运维手册、备份恢复和发布门禁。 | SRE/架构/产品。 | P8 前，建议 P1 结束前定方向。 | 待确认。 | `docs/planning/open-questions/P1-resolution-plan.md`、`docs/planning/open-questions/P8-resolution-plan.md`。 | REQ-005/REQ-014/R-008。 | 待确认。 | 2026-08-23。 |
| OQ-PRODUCT-001 | Open | 产品范围 | `docs/planning/development-schedule.md`、`docs/planning/integrated-platform-plan.md`。 | P7 高级能力是否进入首版。 | 影响 W15-W18 是否需要额外冻结窗口、资源预算和 MVP 范围。 | 产品/架构/评测。 | P6 开始前。 | 待确认。 | `docs/planning/open-questions/P6-resolution-plan.md`。 | REQ-014/R-009。 | 待确认。 | 2026-08-23。 |

## 7. 当前关闭摘要

| 状态 | 数量 | 说明 |
|---|---:|---|
| Open | 23 | 仍待负责人确认或后续任务取证 |
| Confirmed | 0 | 暂无 |
| Deferred | 0 | 暂无 |
| Superseded | 0 | 暂无 |
| Blocked | 0 | 暂无 |
