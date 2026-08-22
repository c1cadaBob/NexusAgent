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
  docs/planning/ai-schedule-prompt-template.md
  docs/planning/task-prompts/README.md
  docs/decisions/P0-openclaw-gateway-only.md
  docs/decisions/P0-hermes-planner-only.md
  docs/decisions/P0-dsh-executor-only.md
  docs/contracts/openapi.yaml
  platform/contracts/execution-plan.schema.json
  platform/contracts/execution-event.schema.json
  docs/traceability/requirements-matrix.md
  scripts/planning/generate-task-prompts.py
)

for path in "${required_paths[@]}"; do
  [[ -e "$path" ]] || fail "missing required path: $path"
done

rg -q 'version: "0\.20\.5"' vendor/MANIFEST.yaml || fail 'Hermes version missing from manifest'
rg -q 'version: "2026\.8\.1"' vendor/MANIFEST.yaml || fail 'OpenClaw version missing from manifest'
rg -q 'version: "0\.1\.1-rc\.2"' vendor/MANIFEST.yaml || fail 'DSH version missing from manifest'
rg -q 'upstream_commit: "【待确认问题】"' vendor/MANIFEST.yaml || fail 'unknown upstream commit must remain explicit'

for section in {0..14}; do
  rg -q "^## ${section}\." docs/planning/integrated-platform-plan.md || fail "planning section ${section} missing"
done

[[ -x scripts/planning/generate-task-prompts.py ]] || fail 'task prompt generator is not executable'
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

for endpoint in '/v1/tasks:' '/v1/skills:' '/v1/memory/search:' '/v1/tenants:' '/v1/approvals:'; do
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

git diff --check -- . ':!vendor/**' || fail 'whitespace errors found outside vendor snapshot'
printf 'PASS: P0 structure, vendor manifest, plan sections, OpenAPI placeholders, task prompts, audit templates, and exclusions\n'
