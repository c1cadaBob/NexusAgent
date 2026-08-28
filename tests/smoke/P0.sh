#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$project_root"

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

required_paths=(
  vendor/hermes-agent-main
  vendor/openclaw-main
  vendor/deepseek-harness-master
  vendor/MANIFEST.yaml
  platform/coordinator
  platform/policy-gate
  platform/adapters/hermes
  platform/adapters/openclaw
  platform/adapters/dsh
  product/api
  product/web-console
  deploy/docker-compose.dev.yml
  docs/planning/integrated-platform-plan.md
  docs/planning/development-schedule.md
  docs/planning/open-questions-register.md
  docs/planning/phase-gates/P0-gate-review.md
  docs/planning/ai-schedule-prompt-template.md
  docs/planning/task-prompts/README.md
  docs/agents/README.md
  docs/agents/roles/program-lead.md
  docs/agents/roles/upstream-snapshot-engineer.md
  docs/agents/roles/platform-core-engineer.md
  docs/agents/roles/security-quality-engineer.md
  docs/agents/roles/product-delivery-engineer.md
  docs/decisions/P0-openclaw-gateway-only.md
  docs/decisions/P0-hermes-planner-only.md
  docs/decisions/P0-dsh-executor-only.md
  docs/contracts/openapi.yaml
  platform/contracts/execution-plan.schema.json
  platform/contracts/execution-event.schema.json
  platform/contracts/platform-error.schema.json
  docs/architecture/upstream-interface-inventory.md
  docs/traceability/requirements-matrix.md
  docs/risks/risk-register.md
  scripts/planning/generate-task-prompts.py
  scripts/upstream-tracking/README.md
  scripts/upstream-tracking/upstream-change-record.template.md
)

for path in "${required_paths[@]}"; do
  [[ -e "$path" ]] || fail "missing required path: $path"
done

for agent_marker in \
  '角色记忆' \
  '交接格式' \
  'Program Lead' \
  'Upstream Snapshot Engineer' \
  'Platform Core Engineer' \
  'Security Quality Engineer' \
  'Product Delivery Engineer'; do
  rg -q "$agent_marker" docs/agents || fail "agent role memory marker missing: $agent_marker"
done

for role_doc in docs/agents/roles/*.md; do
  rg -q '不可遗忘边界' "$role_doc" || fail "role doc missing boundary memory: $role_doc"
  rg -q '常读资料' "$role_doc" || fail "role doc missing reading list: $role_doc"
  rg -q '交付记忆' "$role_doc" || fail "role doc missing delivery memory: $role_doc"
done

rg -q 'version: "0\.20\.5"' vendor/MANIFEST.yaml || fail 'Hermes version missing from manifest'
rg -q 'version: "2026\.8\.1"' vendor/MANIFEST.yaml || fail 'OpenClaw version missing from manifest'
rg -q 'version: "0\.1\.1-rc\.2"' vendor/MANIFEST.yaml || fail 'DSH version missing from manifest'
rg -q 'upstream_commit: "【待确认问题】"' vendor/MANIFEST.yaml || fail 'unknown upstream commit must remain explicit'

for section in {0..14}; do
  rg -q "^## ${section}\." docs/planning/integrated-platform-plan.md || fail "planning section ${section} missing"
done

[[ -x scripts/planning/generate-task-prompts.py ]] || fail 'task prompt generator is not executable'
scripts/planning/generate-task-prompts.py --check >/dev/null || fail 'task prompt generator check failed'
for generator_marker in \
  'Safe default' \
  '--write' \
  '--overwrite' \
  'role_profile' \
  'open-questions-register.md' \
  'docs/planning/open-questions/' \
  '阶段历史问题回扫' \
  'git diff --check -- .'; do
  rg -q -- "$generator_marker" scripts/planning/generate-task-prompts.py || fail "task prompt generator marker missing: $generator_marker"
done
bash -n scripts/bootstrap/vendor-snapshot.sh || fail 'vendor snapshot script has syntax errors'
bash -n scripts/source-manifest/create-manifest.sh || fail 'source manifest script has syntax errors'
rg -q 'upstream version drift' scripts/bootstrap/vendor-snapshot.sh || fail 'vendor snapshot script must guard pinned upstream versions'
rg -q 'vendor version drift' scripts/source-manifest/create-manifest.sh || fail 'manifest script must guard pinned vendor versions'

for manifest_marker in \
  'snapshot_policy:' \
  'upstream_name: Hermes' \
  'upstream_name: OpenClaw' \
  'upstream_name: DSH' \
  'vendor_name: hermes-agent-main' \
  'vendor_name: openclaw-main' \
  'vendor_name: deepseek-harness-master' \
  'file_manifest_sha256:'; do
  rg -q "$manifest_marker" vendor/MANIFEST.yaml || fail "manifest marker missing: $manifest_marker"
done

mapfile -t task_ids < <(rg -o '^\| P[0-8]-[0-9]{2} \|' docs/planning/integrated-platform-plan.md | awk '{print $2}' | sort -u)
[[ "${#task_ids[@]}" -gt 0 ]] || fail 'no task IDs found in planning document'
for task_id in "${task_ids[@]}"; do
  phase="${task_id%%-*}"
  prompt_path="docs/planning/task-prompts/${phase}/${task_id}.md"
  [[ -f "$prompt_path" ]] || fail "missing task prompt document: $prompt_path"
  rg -q "任务ID：${task_id}" "$prompt_path" || fail "task prompt missing task ID marker: $prompt_path"
  rg -q '原始上游目录只读' "$prompt_path" || fail "task prompt missing readonly upstream constraint: $prompt_path"
  rg -q '最低验收命令' "$prompt_path" || fail "task prompt missing acceptance command section: $prompt_path"
  rg -q "^# ${task_id} 修改记录包" "$prompt_path" || fail "task prompt missing audit record package: $prompt_path"
  rg -q '^## 1\. 修改前分析' "$prompt_path" || fail "task prompt missing pre-change audit section: $prompt_path"
  rg -q '^## 2\. 修改过程记录' "$prompt_path" || fail "task prompt missing change-process audit section: $prompt_path"
  rg -q '^## 3\. 修改后验证与总结' "$prompt_path" || fail "task prompt missing post-change audit section: $prompt_path"
done

p0_02_prompt="docs/planning/task-prompts/P0/P0-02.md"
p0_02_audit_block="$(sed -n '/^# P0-02 修改记录包$/,/^## 完整提示词$/p' "$p0_02_prompt")"
[[ -n "$p0_02_audit_block" ]] || fail 'P0-02 audit record package is missing'
if printf '%s\n' "$p0_02_audit_block" | rg -q '\.\.\.'; then
  fail 'P0-02 audit record package still contains placeholder ellipses'
fi
rg -q 'NEXUS_OPENCLAW_GATEWAY_ONLY=1' docs/decisions/P0-openclaw-gateway-only.md || fail 'P0-02 decision record missing gateway-only experiment flag'
rg -q 'agentCommandFromGatewayIngress' docs/decisions/P0-openclaw-gateway-only.md || fail 'P0-02 decision record missing native Agent dispatch evidence'

p0_03_prompt="docs/planning/task-prompts/P0/P0-03.md"
p0_03_audit_block="$(sed -n '/^# P0-03 修改记录包$/,/^## 完整提示词$/p' "$p0_03_prompt")"
[[ -n "$p0_03_audit_block" ]] || fail 'P0-03 audit record package is missing'
if printf '%s\n' "$p0_03_audit_block" | rg -q '\.\.\.'; then
  fail 'P0-03 audit record package still contains placeholder ellipses'
fi
rg -q 'NEXUS_HERMES_PLANNER_ONLY=1' docs/decisions/P0-hermes-planner-only.md || fail 'P0-03 decision record missing planner-only experiment flag'
rg -q 'ExecutionPlan' docs/decisions/P0-hermes-planner-only.md || fail 'P0-03 decision record missing ExecutionPlan evidence'
rg -q 'nexus.execution_plan.p0.v1' platform/contracts/execution-plan.schema.json || fail 'ExecutionPlan schema missing P0 schema version'

p0_04_prompt="docs/planning/task-prompts/P0/P0-04.md"
p0_04_audit_block="$(sed -n '/^# P0-04 修改记录包$/,/^## 完整提示词$/p' "$p0_04_prompt")"
[[ -n "$p0_04_audit_block" ]] || fail 'P0-04 audit record package is missing'
if printf '%s\n' "$p0_04_audit_block" | rg -q '\.\.\.'; then
  fail 'P0-04 audit record package still contains placeholder ellipses'
fi
rg -q 'NEXUS_DSH_EXECUTOR_ONLY=1' docs/decisions/P0-dsh-executor-only.md || fail 'P0-04 decision record missing executor-only experiment flag'
rg -q 'execution_id' docs/decisions/P0-dsh-executor-only.md || fail 'P0-04 decision record missing platform execution_id evidence'
rg -q 'nexus.execution_event.p0.v1' platform/contracts/execution-event.schema.json || fail 'ExecutionEvent schema missing P0 schema version'

p0_05_prompt="docs/planning/task-prompts/P0/P0-05.md"
p0_05_audit_block="$(sed -n '/^# P0-05 修改记录包$/,/^## 完整提示词$/p' "$p0_05_prompt")"
[[ -n "$p0_05_audit_block" ]] || fail 'P0-05 audit record package is missing'
if printf '%s\n' "$p0_05_audit_block" | rg -q '\.\.\.'; then
  fail 'P0-05 audit record package still contains placeholder ellipses'
fi
for inventory_marker in \
  '接口分类总表' \
  'OpenClaw' \
  'Hermes' \
  'DSH' \
  '保留' \
  '隔离' \
  '禁止' \
  'upstream-change-record.template.md'; do
  rg -q "$inventory_marker" docs/architecture/upstream-interface-inventory.md || fail "P0-05 inventory marker missing: $inventory_marker"
done
rg -q '上游变更登记记录模板' scripts/upstream-tracking/upstream-change-record.template.md || fail 'P0-05 upstream change template missing title'

p0_06_prompt="docs/planning/task-prompts/P0/P0-06.md"
p0_06_audit_block="$(sed -n '/^# P0-06 修改记录包$/,/^## 完整提示词$/p' "$p0_06_prompt")"
[[ -n "$p0_06_audit_block" ]] || fail 'P0-06 audit record package is missing'
if printf '%s\n' "$p0_06_audit_block" | rg -q '\.\.\.'; then
  fail 'P0-06 audit record package still contains placeholder ellipses'
fi
for openapi_marker in \
  'openapi: 3.1.0' \
  '/v1/health:' \
  'bearerAuth:' \
  'PlatformErrorCode:' \
  'PLATFORM_POLICY_DENIED' \
  'TaskRequest:'; do
  rg -q "$openapi_marker" docs/contracts/openapi.yaml || fail "P0-06 OpenAPI marker missing: $openapi_marker"
done
if rg -qi 'Hermes|OpenClaw|DeepSeek|DSH|MEMORY\.md|USER\.md|原生|native' docs/contracts/openapi.yaml; then
  fail 'P0-06 OpenAPI exposes an upstream/native term'
fi
rg -q 'PLATFORM_INTERNAL_ERROR' platform/contracts/platform-error.schema.json || fail 'P0-06 platform error schema missing error code draft'

p0_07_prompt="docs/planning/task-prompts/P0/P0-07.md"
p0_07_audit_block="$(sed -n '/^# P0-07 修改记录包$/,/^## 完整提示词$/p' "$p0_07_prompt")"
[[ -n "$p0_07_audit_block" ]] || fail 'P0-07 audit record package is missing'
if printf '%s\n' "$p0_07_audit_block" | rg -q '\.\.\.'; then
  fail 'P0-07 audit record package still contains placeholder ellipses'
fi
for blueprint_marker in \
  'P0-07 架构基线' \
  '服务输入输出与 P1 最小交付' \
  '选型状态声明' \
  'P1 工作包拆分' \
  'P0-07 验收状态' \
  '平台统一 API' \
  'Web 管理控制台' \
  'Memory Gateway' \
  'Artifact Store' \
  'Credential Center' \
  'Observability'; do
  rg -q "$blueprint_marker" docs/architecture/service-blueprint.md || fail "P0-07 service blueprint marker missing: $blueprint_marker"
done
rg -q 'P0-07 的 \[服务功能与整合蓝图\]' docs/README.md || fail 'docs README missing P0-07 baseline summary'

p0_08_prompt="docs/planning/task-prompts/P0/P0-08.md"
p0_08_audit_block="$(sed -n '/^# P0-08 修改记录包$/,/^## 完整提示词$/p' "$p0_08_prompt")"
[[ -n "$p0_08_audit_block" ]] || fail 'P0-08 audit record package is missing'
if printf '%s\n' "$p0_08_audit_block" | rg -q '\.\.\.'; then
  fail 'P0-08 audit record package still contains placeholder ellipses'
fi
for schedule_marker in \
  'P0-08 排期基线' \
  '基线边界' \
  'P0-P6 MVP 主线' \
  'P7 高级能力' \
  'P8 生产交付' \
  '角色容量模型' \
  '阶段门禁与验收命令' \
  '自动重排触发器' \
  'P0-08 验收状态'; do
  rg -q "$schedule_marker" docs/planning/development-schedule.md || fail "P0-08 schedule marker missing: $schedule_marker"
done
rg -q 'P0-08 的 \[开发排期基线\]' docs/README.md || fail 'docs README missing P0-08 baseline summary'
rg -q 'P0-08 已交付 P0-P8 日历排期' docs/traceability/requirements-matrix.md || fail 'REQ-014 missing P0-08 delivery status'
rg -q 'P0-08 开发排期基线更新' docs/risks/risk-register.md || fail 'risk register missing P0-08 update'

p0_09_prompt="docs/planning/task-prompts/P0/P0-09.md"
p0_09_audit_block="$(sed -n '/^# P0-09 修改记录包$/,/^## 完整提示词$/p' "$p0_09_prompt")"
[[ -n "$p0_09_audit_block" ]] || fail 'P0-09 audit record package is missing'
if printf '%s\n' "$p0_09_audit_block" | rg -q '\.\.\.'; then
  fail 'P0-09 audit record package still contains placeholder ellipses'
fi
for p0_09_marker in \
  '集中台账以表格索引维护' \
  '推荐处理方式统一保存到 `docs/planning/open-questions/`' \
  '集中台账不包含候选推荐方案' \
  '阶段历史问题回扫' \
  '当前 20 个问题仍为 `自动确认`'; do
  rg -q "$p0_09_marker" "$p0_09_prompt" || fail "P0-09 current workflow marker missing: $p0_09_marker"
done
if rg -q '方案 A|方案 B|方案 C|每个问题提供至少 3|从表格改为|卡片形式' "$p0_09_prompt"; then
  fail 'P0-09 prompt must not preserve obsolete card-style candidate option workflow'
fi
p0_10_prompt="docs/planning/task-prompts/P0/P0-10.md"
p0_10_audit_block="$(sed -n '/^# P0-10 修改记录包$/,/^## 完整提示词$/p' "$p0_10_prompt")"
[[ -n "$p0_10_audit_block" ]] || fail 'P0-10 audit record package is missing'
if printf '%s\n' "$p0_10_audit_block" | rg -q '\.\.\.'; then
  fail 'P0-10 audit record package still contains placeholder ellipses'
fi
for p0_10_marker in \
  '默认安全 `--check` 模式' \
  '显式 `--write` 才创建缺失文档' \
  '`--write --overwrite` 才覆盖已有文档' \
  'tasks=45' \
  '阶段历史问题回扫' \
  'scripts/planning/generate-task-prompts.py --check'; do
  rg -q "$p0_10_marker" "$p0_10_prompt" || fail "P0-10 implementation marker missing: $p0_10_marker"
done
p0_11_prompt="docs/planning/task-prompts/P0/P0-11.md"
[[ -f "$p0_11_prompt" ]] || fail 'P0-11 realtime planning prompt is missing'
p0_11_audit_block="$(sed -n '/^# P0-11 修改记录包$/,/^## 完整提示词$/p' "$p0_11_prompt")"
[[ -n "$p0_11_audit_block" ]] || fail 'P0-11 audit record package is missing'
if printf '%s\n' "$p0_11_audit_block" | rg -q '待填写|\.\.\.'; then
  fail 'P0-11 audit record package still contains placeholders'
fi
for p0_11_marker in \
  '实时规划提示词' \
  'P0 已自动确认问题同步修复' \
  'P0-01 至 P0-08' \
  'P0-11 同步结果矩阵' \
  '先处理待确认问题，再进入下一步' \
  '自动确认` 不等于 `已关闭`' \
  '阶段门禁补充' \
  '每个阶段结束前必须回扫当前阶段及其之前阶段' \
  '历史问题回扫结果' \
  '如果仍有未处理问题，必须创建或更新后续实时规划提示词' \
  '最低验收命令'; do
  rg -q "$p0_11_marker" "$p0_11_prompt" || fail "P0-11 realtime planning marker missing: $p0_11_marker"
done
for p0_sync_id in P0-01 P0-02 P0-03 P0-04 P0-05 P0-06 P0-07 P0-08; do
  p0_sync_prompt="docs/planning/task-prompts/P0/${p0_sync_id}.md"
  rg -q 'P0-11 待确认问题同步状态' "$p0_sync_prompt" || fail "${p0_sync_id} missing P0-11 OQ sync section"
  rg -q '自动确认' "$p0_sync_prompt" || fail "${p0_sync_id} missing auto-confirmed OQ status"
  rg -q 'docs/planning/open-questions/' "$p0_sync_prompt" || fail "${p0_sync_id} missing open questions confirmation file reference"
  rg -q '已关闭' "$p0_sync_prompt" || fail "${p0_sync_id} missing closed-status guard"
done
for p0_sync_marker in \
  'OQ-UPSTREAM-004' \
  'OQ-CHANNEL-001' \
  'OQ-MEMORY-001' \
  'OQ-DSH-001' \
  'OQ-API-001' \
  'OQ-INFRA-001' \
  'OQ-SCHEDULE-001'; do
  rg -q "$p0_sync_marker" docs/planning/task-prompts/P0/P0-0{1,2,3,4,5,6,7,8}.md || fail "P0-11 sync marker missing from P0-01..P0-08: $p0_sync_marker"
done
for open_question_marker in \
  'NexusAgent 待确认问题集中台账' \
  '状态枚举' \
  '打开' \
  '自动确认' \
  '人工确认' \
  '已关闭' \
  '解决说明文档' \
  '最后更新UTC' \
  '3. 当前确认状态' \
  '4. 人工确认（可省略）的问题' \
  '4.1 P1 前人工确认（可省略）' \
  '4.2 P2 前人工确认（可省略）' \
  '4.3 P5 前人工确认（可省略）' \
  '4.4 P6/P8 前人工确认（可省略）' \
  '5. 自动确认的问题' \
  '5.1 P2 前自动确认' \
  '5.2 P3 前自动确认' \
  '5.3 P4 前自动确认' \
  '5.4 P5/P6 前自动确认' \
  '5.5 P7 前自动确认' \
  '6. 完整问题台账' \
  '7. 当前关闭摘要' \
  '本台账不展示候选方案' \
  '当前 19 个问题仍为“自动确认”' \
  'P8-01 已关闭 `OQ-DEPLOY-001`' \
  'OQ-UPSTREAM-001' \
  'OQ-SCHEDULE-001' \
  'OQ-DSH-001' \
  'OQ-INFRA-001' \
  'OQ-API-001' \
  'OQ-CHANNEL-001' \
  'OQ-MEMORY-001' \
  'OQ-PLUGIN-001' \
  'OQ-LEGAL-001' \
  'OQ-BUDGET-001'; do
  rg -q "$open_question_marker" docs/planning/open-questions-register.md || fail "open questions register marker missing: $open_question_marker"
done
rg -F -q '| 问题ID | 状态 | 分类 | 问题描述 | 最晚确认阶段 | 负责人/工作流 | 解决说明文档 |' docs/planning/open-questions-register.md || fail 'open questions register missing summary table header'
rg -F -q '| 问题ID | 状态 | 分类 | 来源文档 | 问题描述 | 影响 | 负责人/工作流 | 最晚确认阶段 | 确认结论 | 解决说明文档 | 关联需求/风险 | 关闭任务/commit | 最后更新UTC |' docs/planning/open-questions-register.md || fail 'open questions register missing full table header'
rg -F -q '| 自动确认 | 19 | 已结合三大平台在确认文件中生成默认解决方案，但尚未关闭 |' docs/planning/open-questions-register.md || fail 'open questions register must show 19 auto-confirmed items'
rg -F -q '| 已关闭 | 5 | P0 门禁已关闭上游快照排除规则、资源容量、日历冻结窗口和首批渠道默认范围；P8-01 已关闭生产部署目标问题 |' docs/planning/open-questions-register.md || fail 'open questions register must show five closed items after P8-01'
for closed_oq in OQ-UPSTREAM-004 OQ-SCHEDULE-001 OQ-SCHEDULE-002 OQ-CHANNEL-001; do
  rg -F -q "| ${closed_oq} | 已关闭 |" docs/planning/open-questions-register.md || fail "P0 gate OQ must be closed in register: ${closed_oq}"
  rg -q "${closed_oq}" docs/planning/phase-gates/P0-gate-review.md || fail "P0 gate report missing closed OQ: ${closed_oq}"
done
rg -F -q '| OQ-DEPLOY-001 | 已关闭 |' docs/planning/open-questions-register.md || fail 'P8-01 deploy OQ must be closed in register'
for still_auto_oq in OQ-UPSTREAM-001 OQ-UPSTREAM-002 OQ-UPSTREAM-003 OQ-INFRA-001 OQ-API-001 OQ-DSH-001 OQ-MEMORY-001 OQ-PLUGIN-001 OQ-LEGAL-001 OQ-PRODUCT-001 OQ-BUDGET-001; do
  rg -F -q "| ${still_auto_oq} | 自动确认 |" docs/planning/open-questions-register.md || fail "non-P0 OQ must remain auto-confirmed: ${still_auto_oq}"
done
for p0_gate_marker in \
  'P0 阶段门禁报告' \
  '门禁结论' \
  '已关闭的 P0 问题' \
  '仍为自动确认的问题' \
  '历史问题回扫' \
  '当前阶段及之前阶段不存在 `打开` 问题' \
  '20 个问题仍为 `自动确认`' \
  '568014bebb2ae256b1d86a9618adde1abd6c24d1'; do
  rg -q "$p0_gate_marker" docs/planning/phase-gates/P0-gate-review.md || fail "P0 gate report marker missing: $p0_gate_marker"
done
if rg -q '待回填|P0-GATE-COMMIT-1' docs/planning/open-questions-register.md docs/planning/phase-gates/P0-gate-review.md docs/planning/open-questions/P0-resolution-plan.md; then
  fail 'P0 gate closure records must not contain placeholder commit markers'
fi
if rg -q '方案 A|方案 B|方案 C|可另提方案' docs/planning/open-questions-register.md; then
  fail 'open questions register must not include candidate recommendation options'
fi
for open_question_workflow_marker in \
  '推荐处理方式、默认解决方案、三大平台影响分析和关闭证据统一写入 `docs/planning/open-questions/`' \
  '新问题产生时，先写入本台账对应分类和阶段位置' \
  '台账状态可从 `打开` 更新为 `自动确认`' \
  '自动确认` 和 `人工确认` 都不等于关闭' \
  '推荐处理方式”即作为默认解决方案' \
  '如果问题解决需要进入开发排期，必须同步在 `docs/planning/task-prompts/`'; do
  rg -q "$open_question_workflow_marker" docs/planning/open-questions-register.md || fail "open question workflow marker missing from register: $open_question_workflow_marker"
done
for agents_open_question_marker in \
  '所有待确认问题必须按以下流程处理' \
  '所有确认内容、推荐处理方式、三大平台影响分析、默认解决方案和关闭证据' \
  '集中台账状态更新为 `自动确认`' \
  '人工确认` 是可选状态' \
  '实时规划提示词用于承接' \
  '开始实现任务前，先填写对应任务文档中的“修改前分析”' \
  '如果任务结束时仍存在未处理的待确认问题' \
  '如果某个问题的解决需要进入开发排期' \
  '阶段结束前历史问题回扫规则' \
  '每个阶段结束前，必须确认当前阶段及其之前所有阶段是否仍存在未处理、未同步或需要修复的问题' \
  '阶段门禁报告必须列出'; do
  rg -q "$agents_open_question_marker" AGENTS.md || fail "AGENTS open question workflow marker missing: $agents_open_question_marker"
done
rg -q 'P0-09 的 \[待确认问题集中台账\]' docs/README.md || fail 'docs README missing P0-09 open questions summary'
rg -q '待确认问题确认文件' docs/README.md || fail 'docs README missing open questions confirmation file summary'
rg -q 'open-questions-register.md' docs/planning/ai-schedule-prompt-template.md || fail 'AI schedule prompt template missing open questions register reference'
rg -q 'docs/planning/open-questions/' docs/planning/ai-schedule-prompt-template.md || fail 'AI schedule prompt template missing phased open questions plan reference'
rg -q 'OQ-\*' docs/planning/ai-schedule-prompt-template.md || fail 'AI schedule prompt template missing OQ ID requirement'
rg -q '实时规划提示词执行顺序' docs/planning/ai-schedule-prompt-template.md || fail 'AI schedule prompt template missing realtime prompt workflow'
rg -q '如果存在 `打开`、缺少确认文件、或已 `自动确认` 但尚未同步修复的问题' docs/planning/ai-schedule-prompt-template.md || fail 'AI schedule prompt template missing pre-analysis OQ handling rule'
rg -q '阶段历史问题回扫' docs/planning/ai-schedule-prompt-template.md || fail 'AI schedule prompt template missing stage history sweep rule'
rg -q '当前阶段及之前阶段历史问题回扫结果' docs/planning/ai-schedule-prompt-template.md || fail 'AI schedule prompt template missing stage history sweep output'
rg -q 'P0-09 已新增待确认问题集中台账' docs/traceability/requirements-matrix.md || fail 'REQ-015 missing P0-09 open questions status'
rg -q 'P0-09 待确认问题集中台账更新' docs/risks/risk-register.md || fail 'risk register missing P0-09 update'
rg -q 'P0-11 已新增实时规划提示词' docs/traceability/requirements-matrix.md || fail 'REQ-015 missing P0-11 realtime prompt status'
rg -q 'P0-11 新增实时规划提示词执行规则' docs/risks/risk-register.md || fail 'risk register missing P0-11 realtime prompt update'
rg -q 'P0-11 已补充阶段结束前历史问题回扫要求' docs/traceability/requirements-matrix.md || fail 'REQ-014 missing P0-11 stage history sweep status'
rg -q 'P0-11 已把 P0-01 至 P0-08 的历史待确认问题同步为 OQ ID' docs/traceability/requirements-matrix.md || fail 'REQ-015 missing P0-11 sync completion status'
rg -q '每个阶段结束前必须回扫当前阶段及其之前阶段' docs/risks/risk-register.md || fail 'risk register missing stage history sweep risk rule'
rg -q 'P0-11 已把 P0-01 至 P0-08 的历史待确认问题回写为 `OQ-\*`' docs/risks/risk-register.md || fail 'risk register missing P0-11 sync completion status'
rg -q '每个阶段结束前必须回扫当前阶段及其之前阶段' docs/README.md || fail 'docs README missing stage history sweep rule'
rg -q 'P0-11 的 \[实时规划提示词\].*P0-01 至 P0-08 已 `自动确认`' docs/README.md || fail 'docs README missing P0-11 sync completion summary'

for open_questions_plan in \
  docs/planning/open-questions/README.md \
  docs/planning/open-questions/P0-resolution-plan.md \
  docs/planning/open-questions/P1-resolution-plan.md \
  docs/planning/open-questions/P2-resolution-plan.md \
  docs/planning/open-questions/P3-resolution-plan.md \
  docs/planning/open-questions/P4-resolution-plan.md \
  docs/planning/open-questions/P5-resolution-plan.md \
  docs/planning/open-questions/P6-resolution-plan.md \
  docs/planning/open-questions/P8-resolution-plan.md; do
  [[ -f "$open_questions_plan" ]] || fail "open questions phased plan missing: $open_questions_plan"
done
for open_questions_readme_marker in \
  '确认文件与处理计划存放位置' \
  '默认解决方案' \
  '台账状态可进入 `自动确认`' \
  '人工确认` 是可选状态' \
  'docs/planning/task-prompts/' \
  '新问题产生后，必须先写入'; do
  rg -q "$open_questions_readme_marker" docs/planning/open-questions/README.md || fail "open questions README workflow marker missing: $open_questions_readme_marker"
done
for oq_id in \
  OQ-UPSTREAM-001 OQ-UPSTREAM-002 OQ-UPSTREAM-003 OQ-UPSTREAM-004 \
  OQ-SCHEDULE-001 OQ-SCHEDULE-002 OQ-API-001 OQ-API-002 \
  OQ-CHANNEL-001 OQ-PLUGIN-001 OQ-LEGAL-001 \
  OQ-INFRA-001 OQ-INFRA-002 OQ-INFRA-003 OQ-INFRA-004 OQ-INFRA-005 OQ-INFRA-006 \
  OQ-MEMORY-001 OQ-MEMORY-002 OQ-DSH-001 OQ-DSH-002 \
  OQ-DEPLOY-001 OQ-PRODUCT-001; do
  rg -q "$oq_id" docs/planning/open-questions || fail "open questions phased plans missing OQ coverage: $oq_id"
  rg -q "^## ${oq_id}" docs/planning/open-questions || fail "open questions phased plans missing OQ section heading: $oq_id"
  rg -q "$oq_id" docs/planning/open-questions-register.md || fail "open questions register missing OQ coverage: $oq_id"
done
rg -q 'docs/planning/open-questions/P1-resolution-plan.md' docs/planning/open-questions-register.md || fail 'open questions register missing P1 plan linkage'
rg -q 'docs/planning/open-questions/P8-resolution-plan.md' docs/planning/open-questions-register.md || fail 'open questions register missing P8 plan linkage'

for endpoint in '/v1/health:' '/v1/tasks:' '/v1/skills:' '/v1/memory/search:' '/v1/tenants:' '/v1/approvals:'; do
  rg -q "^  ${endpoint}" docs/contracts/openapi.yaml || fail "OpenAPI endpoint missing: ${endpoint}"
done

if find vendor -type d \( \
  -name node_modules -o \
  -name .pnpm-store -o \
  -name .cache -o \
  -name .turbo -o \
  -name .next -o \
  -name .vite -o \
  -name .venv -o \
  -name venv -o \
  -name __pycache__ -o \
  -name .pytest_cache -o \
  -name .ruff_cache -o \
  -name .mypy_cache \
\) -print -quit | grep -q .; then
  fail 'excluded dependency/cache directory found in vendor snapshot'
fi

if find . -path ./.git -prune -o -path ./vendor -prune -o -type d \( \
  -name node_modules -o \
  -name .pnpm-store -o \
  -name .cache -o \
  -name .turbo -o \
  -name .next -o \
  -name .vite -o \
  -name .venv -o \
  -name venv -o \
  -name __pycache__ -o \
  -name .pytest_cache -o \
  -name .ruff_cache -o \
  -name .mypy_cache \
\) -print -quit | grep -q .; then
  fail 'excluded dependency/cache directory found outside vendor snapshot'
fi

git diff --check -- . ':!vendor/**' || fail 'whitespace errors found outside vendor snapshot'
printf 'PASS: P0 structure, vendor manifest, plan sections, OpenAPI placeholders, task prompts, agent role memory, phase gate, audit templates, and exclusions\n'
