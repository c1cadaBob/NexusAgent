#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

required_files=(
  product/api/index.ts
  product/api/server.mjs
  product/api/README.md
  platform/public-surface/index.ts
  platform/plugin-governance/index.ts
  tests/contract/p5-openapi-contract.test.mjs
  tests/integration/platform-api-rest.test.mjs
  tests/security/platform-api-leakage.test.mjs
  tests/security/plugin-governance-api.test.mjs
  docs/planning/task-prompts/P5/P5-01.md
  docs/planning/open-questions/P5-resolution-plan.md
  docs/planning/open-questions-register.md
  docs/contracts/openapi.yaml
  docs/traceability/requirements-matrix.md
  docs/risks/risk-register.md
  docs/README.md
  tests/smoke/README.md
)

for file in "${required_files[@]}"; do
  [[ -f "$file" ]] || fail "missing P5 required file: $file"
done

p5_01_audit_block="$(sed -n '/^# P5-01 修改记录包$/,/^## 完整提示词$/p' docs/planning/task-prompts/P5/P5-01.md)"
[[ -n "$p5_01_audit_block" ]] || fail 'P5-01 audit record package is missing'
if printf '%s\n' "$p5_01_audit_block" | rg -q '\.\.\.'; then
  fail 'P5-01 audit record package still contains placeholder ellipses'
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
  printf '%s\n' "$p5_01_audit_block" | rg -q "$audit_marker" || fail "P5-01 audit marker missing: $audit_marker"
done

for marker in \
  'nexus.platform_api.p5.v1' \
  'createPlatformApi' \
  'dev-platform-admin' \
  'dev-operator-alpha' \
  'PLATFORM_API_SCHEMA_VERSION'; do
  rg -q "$marker" product/api/index.ts product/api/README.md tests/integration/platform-api-rest.test.mjs || fail "P5 API marker missing: $marker"
done

for marker in \
  'nexus.plugin_governance.p5.v1' \
  'LocalPluginGovernance' \
  'notice_status' \
  'expected_sha256' \
  'source_ref'; do
  rg -q "$marker" platform/plugin-governance/index.ts docs/contracts/openapi.yaml tests/security/plugin-governance-api.test.mjs || fail "P5 plugin governance marker missing: $marker"
done

for route in \
  '/v1/memory:' \
  '/v1/tenants/{tenant_id}/users:' \
  '/v1/permissions:' \
  '/v1/budget/check:' \
  '/v1/admin/plugins/import:'; do
  rg -F -q "$route" docs/contracts/openapi.yaml || fail "P5 OpenAPI route missing: $route"
done

for marker in \
  "pattern: '^exec_" \
  "pattern: '^conv_" \
  "pattern: '^cap_" \
  'received' \
  'cancelled' \
  'archived'; do
  rg -F -q "$marker" docs/contracts/openapi.yaml || fail "P5 OpenAPI runtime-alignment marker missing: $marker"
done

if rg -qi 'Hermes|OpenClaw|DeepSeek|\bDSH\b' product/api docs/contracts/openapi.yaml; then
  fail 'product API or public OpenAPI leaked internal component naming'
fi

if rg -n 'Date\.now\(|datetime\.now\(' product/api platform/plugin-governance platform/public-surface; then
  fail 'wall-clock duration helper detected in P5 API surface'
fi

node --test \
  tests/contract/p5-openapi-contract.test.mjs \
  tests/integration/platform-api-rest.test.mjs \
  tests/security/platform-api-leakage.test.mjs \
  tests/security/plugin-governance-api.test.mjs

echo 'PASS: P5 platform REST API, OpenAPI contract, plugin governance, and public leakage gate'
