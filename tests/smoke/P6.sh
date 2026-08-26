#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

required_files=(
  tests/integration/p6-business-closed-loop.test.mjs
  tests/smoke/P6.sh
  docs/planning/task-prompts/P6/P6-01.md
  docs/planning/open-questions/P6-resolution-plan.md
  docs/planning/open-questions-register.md
  docs/traceability/requirements-matrix.md
  docs/risks/risk-register.md
  docs/README.md
  tests/smoke/README.md
)

for file in "${required_files[@]}"; do
  [[ -f "$file" ]] || fail "missing P6 required file: $file"
done

p6_01_audit_block="$(sed -n '/^# P6-01 修改记录包$/,/^## 完整提示词$/p' docs/planning/task-prompts/P6/P6-01.md)"
[[ -n "$p6_01_audit_block" ]] || fail 'P6-01 audit record package is missing'
if printf '%s\n' "$p6_01_audit_block" | rg -q '\.\.\.'; then
  fail 'P6-01 audit record package still contains placeholder ellipses'
fi
for audit_marker in \
  '任务与验收条件' \
  '源码证据' \
  '基线测试' \
  '影响面分析' \
  '修改计划与回滚' \
  '待确认问题' \
  '实际变更文件' \
  '关键改动点' \
  '新增测试' \
  '测试结果' \
  '防绕过测试' \
  '回滚验证'; do
  printf '%s\n' "$p6_01_audit_block" | rg -q "$audit_marker" || fail "P6-01 audit marker missing: $audit_marker"
done

for marker in \
  'P6 business closed loop' \
  'ManualClock' \
  'InMemoryEventBus' \
  'PolicyGate' \
  'Coordinator' \
  'LocalMemoryGateway' \
  'LocalArtifactStore' \
  'OpenClawGatewayAdapter' \
  'HermesExecutionPlanAdapter' \
  'HermesMemoryGatewayAdapter' \
  'DshExecutorAdapter' \
  'channel_send_intent' \
  'artifact.created' \
  'execution.completed' \
  'audit.recorded'; do
  rg -q "$marker" tests/integration/p6-business-closed-loop.test.mjs || fail "P6 closed-loop marker missing: $marker"
done

for marker in \
  'P6-01' \
  'deterministic in-process' \
  'OQ-INFRA-006' \
  'OQ-PRODUCT-001' \
  'TaskState/Coordinator' \
  'P7 高级能力'; do
  rg -q "$marker" docs/planning/task-prompts/P6/P6-01.md docs/planning/open-questions/P6-resolution-plan.md docs/planning/open-questions-register.md docs/traceability/requirements-matrix.md docs/risks/risk-register.md docs/README.md tests/smoke/README.md || fail "P6 documentation marker missing: $marker"
done

if rg -n 'Date\.now\(|datetime\.now\(' tests/integration/p6-business-closed-loop.test.mjs tests/smoke/P6.sh; then
  fail 'wall-clock duration helper detected in P6 closed-loop smoke surface'
fi

node --test tests/integration/p6-business-closed-loop.test.mjs

echo 'PASS: P6-01 platform E2E closed-loop, ID/event correlation, artifact metadata, audit timeline, and smoke checks'
