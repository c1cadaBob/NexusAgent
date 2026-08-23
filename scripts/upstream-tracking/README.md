# 上游变更登记工作区

本目录保存 OpenClaw、Hermes、DSH vendor 快照更新时使用的登记模板。P0-05 不实现自动同步脚本，只固定人工或后续自动化必须填写的审计字段，避免上游升级时丢失接口、许可证和回滚证据。

## 使用规则

1. 每次更新任一上游快照前，复制 `upstream-change-record.template.md` 到同目录下的新文件，命名建议为 `<UTC日期>-<upstream>-<旧版本>-to-<新版本>.md`。
2. 填写旧版本、新版本、原始只读路径、vendor 路径、快照时间 UTC、remote/commit 状态、影响入口、测试结果、许可证/NOTICE 影响和回滚方式。
3. 同步更新 `docs/architecture/upstream-interface-inventory.md`、`vendor/MANIFEST.yaml`、`docs/risks/risk-register.md`、`docs/traceability/requirements-matrix.md` 和对应任务 ID 修改记录包。
4. 不得把 NexusAgent 父仓库 commit 当作 OpenClaw/Hermes/DSH 上游 commit；若原始目录不是 Git 仓库，必须继续标记为【待确认问题】。
5. 变更完成后运行任务指定 smoke、契约、安全或 targeted tests，并按项目规则提交推送当前分支。
