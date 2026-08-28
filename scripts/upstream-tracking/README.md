# 上游变更登记工作区

本目录保存 OpenClaw、Hermes、DSH vendor 快照更新时使用的登记模板。P0-05 不实现自动同步脚本，只固定人工或后续自动化必须填写的审计字段，避免上游升级时丢失接口、许可证和回滚证据。

P8-02 增加发布前上游追踪和兼容矩阵门禁：`validate-provider-compatibility.mjs` 校验 provider/plugin 矩阵、`weekly-upstream-check.mjs` 执行默认静态与可选远端检查、`generate-release-manifest.mjs` 生成 candidate release manifest。默认上游检查模式为 `optional_remote`；没有真实 remote/commit 时不得编造来源，脚本会输出 `UPSTREAM_IDENTITY_UNCONFIRMED` 并保持生产 default promotion 暂停。

## 使用规则

1. 每次更新任一上游快照前，复制 `upstream-change-record.template.md` 到同目录下的新文件，命名建议为 `<UTC日期>-<upstream>-<旧版本>-to-<新版本>.md`。
2. 填写旧版本、新版本、原始只读路径、vendor 路径、快照时间 UTC、remote/commit 状态、影响入口、测试结果、许可证/NOTICE 影响和回滚方式。
3. 同步更新 `docs/architecture/upstream-interface-inventory.md`、`vendor/MANIFEST.yaml`、`docs/risks/risk-register.md`、`docs/traceability/requirements-matrix.md` 和对应任务 ID 修改记录包。
4. 不得把 NexusAgent 父仓库 commit 当作 OpenClaw/Hermes/DSH 上游 commit；若原始目录不是 Git 仓库，必须继续标记为【待确认问题】。
5. 变更完成后运行任务指定 smoke、契约、安全或 targeted tests，并按项目规则提交推送当前分支。

## P8-02 命令

```bash
node scripts/upstream-tracking/validate-provider-compatibility.mjs
node scripts/upstream-tracking/weekly-upstream-check.mjs
NEXUS_UPSTREAM_REMOTE_CHECK=1 node scripts/upstream-tracking/weekly-upstream-check.mjs --remote
node scripts/upstream-tracking/generate-release-manifest.mjs
```

`--strict` 只用于生产提升上下文；本地 smoke 不依赖网络。P8-02 的 GHCR tag 发布只把当前仓库内真实 runtime 支撑的 `platform-api` 和 `web-console` 作为 candidate image 发布，内部 adapters 和数据服务继续通过生产部署模板中的显式外部镜像引用治理。
