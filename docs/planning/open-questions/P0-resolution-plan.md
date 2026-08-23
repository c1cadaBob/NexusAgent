# P0 待确认问题处理计划

> 阶段目标：在 P0 门禁前把上游快照、资源假设、日历假设和首批渠道方向固化为后续 P1-P4 可执行输入。P0 不把尚未验证的 OpenClaw、Hermes、DSH 行为写成事实，只关闭可由项目负责人确认或已有脚本证明的问题。
>
> P0 门禁结论：本文件中的 4 个 P0 到期问题已按默认推荐方案关闭，关闭任务/commit 为 P0-GATE-COMMIT-1（待回填）。

## OQ-UPSTREAM-004：上游快照排除规则

推荐处理：选择“继续排除构建产物、缓存、日志和依赖目录，并记录可复现 hash”。这是当前最适合 NexusAgent 的交付口径，因为 OpenClaw、Hermes、DSH 都会带来大量依赖缓存、构建输出和运行时临时文件；把这些内容纳入 Git 会放大审计噪音，也会让 vendor 快照难以复现。

三平台影响：

- OpenClaw：保留源码、manifest、插件/渠道入口和必要配置，排除 `node_modules`、构建产物和日志；P4 真实 gateway provider 接入时再按 provider 清单补充必要运行依赖。
- Hermes：保留 Python 源码、skills、配置样例和 planner/memory 相关入口，排除虚拟环境、缓存和运行日志；P3 用受控 Python 环境重建依赖。
- DSH：保留 monorepo 源码、Cordis vendor 源、native sandbox 源码和包 manifest，排除构建产物、缓存、临时 session 和日志。

关闭证据：重新运行 vendor snapshot 和 manifest 脚本后 hash 稳定；`vendor/MANIFEST.yaml` 记录排除规则、快照时间、版本、hash；P0 smoke 检查 vendor 中不存在依赖缓存目录。

落点文档：`vendor/MANIFEST.yaml`、`scripts/bootstrap/vendor-snapshot.sh`、`scripts/source-manifest/create-manifest.sh`、`docs/planning/integrated-platform-plan.md`。

确认结论：已关闭。P0 门禁接受该默认快照策略，并要求后续 provider 升级继续保留排除规则、版本 pin、tree hash、`local_patches` 和回滚说明。关闭证据同步见 `docs/planning/phase-gates/P0-gate-review.md`。

## OQ-SCHEDULE-001：团队人数、角色和投入比例

推荐处理：默认采用 8-10 个核心角色的基线排期，同时保留 4-5 人降级排期。当前 P2/P3/P4 计划并行接入 DSH、Hermes、OpenClaw；如果实际资源不足，应把 Hermes 高级记忆和 P5 控制台高级页延后，而不是压缩安全、防绕过和 provider 回滚测试。

三平台影响：

- DSH：资源不足时仍优先保障 P2 executor-only，因为执行闭环是 MVP 必需项。
- OpenClaw：至少保留一个渠道的 gateway-only 验证，渠道范围可降级。
- Hermes：planner-only 和 Memory Gateway 可降级，必要时走 OpenClaw + DSH 轻量路线。

关闭证据：项目负责人提供团队人数、角色、投入比例和可并行工作流；`docs/planning/development-schedule.md` 更新对应日历；风险登记册更新资源风险状态。

落点文档：`docs/planning/development-schedule.md`、`docs/risks/risk-register.md`。

确认结论：已关闭。P0 门禁接受 8-10 个核心角色基线和 4-5 人降级排期作为默认容量模型；真实团队容量变化不重开本问题，改由 `docs/planning/development-schedule.md` 的自动重排触发器处理。

## OQ-SCHEDULE-002：地区节假日和发布冻结窗口

推荐处理：选择“扣除已知地区节假日并重排 W13-W18”，并保留发布冻结缓冲。P6/P8 包含安全闭环、备份恢复、provider/插件回滚和生产交付，不适合被节假日或冻结窗口挤压。

三平台影响：

- OpenClaw：渠道凭据、外部平台审批和插件测试常受工作日影响，P4/P5 需要提前准备测试账号。
- Hermes：P3/P6 的 Python 环境、skills/MCP 白名单和记忆策略验证需要完整测试窗口。
- DSH：P2/P6 的沙箱、防绕过、凭据泄漏和 artifact 测试不可压缩。

关闭证据：项目负责人提供地区日历、公司发布冻结窗口和关键评审日；排期基线重算；P8 发布候选日期更新。

落点文档：`docs/planning/development-schedule.md`、`docs/planning/open-questions-register.md`。

确认结论：已关闭。P0 门禁接受当前排期基线和冻结缓冲作为默认日历策略；真实节假日或冻结窗口变化不阻塞 P0，后续通过排期重算和风险复盘处理。

## OQ-CHANNEL-001：首批正式渠道清单

推荐处理：默认首批选择钉钉、飞书、Telegram；若首个客户场景明确需要企业微信或 Slack，则把新增渠道纳入 P4/P5 范围并同步调增测试工作量。首版不建议同时打开太多渠道，避免 P4 gateway-only 防绕过和 P5 渠道管理分散。

三平台影响：

- OpenClaw：首批渠道直接决定 P4 provider 白名单、ClawHub/npm 插件扫描、channel envelope fixture 和出站回写测试。
- Hermes：渠道只影响 planner 的 conversation context，不允许 Hermes 直接接管渠道入口。
- DSH：渠道附件或命令最终只能经平台任务和执行链路进入 DSH，不允许渠道插件直接触发 executor。

关闭证据：项目负责人确认首批渠道；P4 任务提示词和渠道测试 fixture 更新；P5 渠道管理页面/API 范围更新。

落点文档：`docs/planning/open-questions/P4-resolution-plan.md`、`docs/planning/integrated-platform-plan.md`、`docs/architecture/upstream-versioning-and-plugin-bridge.md`。

确认结论：已关闭。P0 门禁接受钉钉、飞书、Telegram 为首批默认渠道；企业微信、Slack 等新增渠道作为 P4/P5 范围变更和测试工作量调整处理。
