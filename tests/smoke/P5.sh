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
  product/channel-management/README.md
  product/sdk/package.json
  product/sdk/pnpm-lock.yaml
  product/sdk/tsconfig.json
  product/sdk/README.md
  product/sdk/src/index.ts
  product/sdk/examples/quickstart.mjs
  product/sdk/examples/memory-budget.mjs
  product/sdk/examples/channel-management.mjs
  product/sdk/examples/plugin-governance.mjs
  product/sdk/examples/support/inProcessFetch.mjs
  product/docs-site/package.json
  product/docs-site/pnpm-lock.yaml
  product/docs-site/index.html
  product/docs-site/vite.config.ts
  product/docs-site/tsconfig.json
  product/docs-site/README.md
  product/docs-site/src/catalog.ts
  product/docs-site/src/main.tsx
  product/docs-site/src/styles.css
  product/web-console/package.json
  product/web-console/pnpm-lock.yaml
  product/web-console/index.html
  product/web-console/vite.config.ts
  product/web-console/tsconfig.json
  product/web-console/README.md
  product/web-console/src/apiClient.ts
  product/web-console/src/viewModel.ts
  product/web-console/src/main.tsx
  product/web-console/src/styles.css
  platform/public-surface/index.ts
  platform/channel-management/index.ts
  platform/plugin-governance/index.ts
  tests/contract/p5-openapi-contract.test.mjs
  tests/contract/p5-channel-management-contract.test.mjs
  tests/contract/p5-sdk-openapi-contract.test.mjs
  tests/contract/docs-site-openapi-alignment.test.mjs
  tests/contract/web-console-openapi-alignment.test.mjs
  tests/integration/platform-api-rest.test.mjs
  tests/integration/channel-management-api.test.mjs
  tests/integration/sdk-typescript-client.test.mjs
  tests/integration/web-console-api-client.test.mjs
  tests/security/platform-api-leakage.test.mjs
  tests/security/channel-management-leakage.test.mjs
  tests/security/sdk-docs-leakage.test.mjs
  tests/security/plugin-governance-api.test.mjs
  tests/security/web-console-leakage.test.mjs
  docs/planning/task-prompts/P5/P5-01.md
  docs/planning/task-prompts/P5/P5-02.md
  docs/planning/task-prompts/P5/P5-03.md
  docs/planning/task-prompts/P5/P5-04.md
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

p5_04_audit_block="$(sed -n '/^# P5-04 修改记录包$/,/^## 完整提示词$/p' docs/planning/task-prompts/P5/P5-04.md)"
[[ -n "$p5_04_audit_block" ]] || fail 'P5-04 audit record package is missing'
if printf '%s\n' "$p5_04_audit_block" | rg -q '\.\.\.'; then
  fail 'P5-04 audit record package still contains placeholder ellipses'
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
  printf '%s\n' "$p5_04_audit_block" | rg -q "$audit_marker" || fail "P5-04 audit marker missing: $audit_marker"
done

p5_03_audit_block="$(sed -n '/^# P5-03 修改记录包$/,/^## 完整提示词$/p' docs/planning/task-prompts/P5/P5-03.md)"
[[ -n "$p5_03_audit_block" ]] || fail 'P5-03 audit record package is missing'
if printf '%s\n' "$p5_03_audit_block" | rg -q '\.\.\.'; then
  fail 'P5-03 audit record package still contains placeholder ellipses'
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
  printf '%s\n' "$p5_03_audit_block" | rg -q "$audit_marker" || fail "P5-03 audit marker missing: $audit_marker"
done

p5_02_audit_block="$(sed -n '/^# P5-02 修改记录包$/,/^## 完整提示词$/p' docs/planning/task-prompts/P5/P5-02.md)"
[[ -n "$p5_02_audit_block" ]] || fail 'P5-02 audit record package is missing'
if printf '%s\n' "$p5_02_audit_block" | rg -q '\.\.\.'; then
  fail 'P5-02 audit record package still contains placeholder ellipses'
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
  printf '%s\n' "$p5_02_audit_block" | rg -q "$audit_marker" || fail "P5-02 audit marker missing: $audit_marker"
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
  'nexus.sdk.p5.v1' \
  'NexusAgentClient' \
  'NexusAgentApiError' \
  'createTraceFactory' \
  'SDK_SCHEMA_VERSION' \
  'node product/sdk/examples/quickstart.mjs'; do
  rg -q "$marker" product/sdk tests/contract/p5-sdk-openapi-contract.test.mjs tests/integration/sdk-typescript-client.test.mjs || fail "P5 SDK marker missing: $marker"
done

for marker in \
  'nexus.docs_site.p5.v1' \
  'DOCS_ROUTE_MATRIX' \
  'SDK_METHOD_CATALOG' \
  'Tenant self-service third-party plugin installation is not supported in P5 Alpha' \
  'Yves Klein Blue' \
  'vite build'; do
  rg -q "$marker" product/docs-site tests/contract/docs-site-openapi-alignment.test.mjs || fail "P5 docs-site marker missing: $marker"
done

for marker in \
  'nexus.web_console.p5.v1' \
  'nexus.web_console.view_model.p5.v1' \
  'PlatformApiClient' \
  'DEV_PRINCIPALS' \
  'Channels' \
  'VITE_NEXUS_API_BASE_URL' \
  'React' \
  'vite build'; do
  rg -q "$marker" product/web-console tests/integration/web-console-api-client.test.mjs tests/contract/web-console-openapi-alignment.test.mjs || fail "P5 web console marker missing: $marker"
done

for marker in \
  'nexus.channel_management.p5.v1' \
  'LocalChannelManagement' \
  'CHANNEL_MANAGEMENT_ALLOWED_CHANNELS' \
  'credential_status' \
  'ChannelConnectionTestResult'; do
  rg -q "$marker" platform/channel-management/index.ts docs/contracts/openapi.yaml tests/integration/channel-management-api.test.mjs tests/security/channel-management-leakage.test.mjs || fail "P5 channel management marker missing: $marker"
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
  '/v1/channels:' \
  '/v1/channels/{channel_config_id}:' \
  '/v1/channels/{channel_config_id}/status:' \
  '/v1/channels/{channel_config_id}/test:' \
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

if rg -qi 'Hermes|OpenClaw|DeepSeek|\bDSH\b' product/channel-management product/api docs/contracts/openapi.yaml; then
  fail 'product channel management/API/OpenAPI leaked internal component naming'
fi

if rg -qi 'Hermes|OpenClaw|DeepSeek|\bDSH\b' product/web-console/src product/web-console/README.md product/web-console/index.html product/web-console/package.json; then
  fail 'web console public surface leaked internal component naming'
fi

if rg -qi 'Hermes|OpenClaw|DeepSeek|\bDSH\b|native_|raw_credential|credential_material|provider_binding|runtime' product/sdk/src product/sdk/examples product/sdk/README.md product/docs-site/src product/docs-site/README.md product/docs-site/index.html product/docs-site/package.json; then
  fail 'SDK or developer docs public surface leaked blocked implementation markers'
fi

if rg -n 'platform/adapters|vendor/' product/web-console/src product/web-console/README.md product/web-console/index.html product/web-console/package.json; then
  fail 'web console imported or referenced a non-product implementation path'
fi

if rg -n 'platform/adapters|vendor/' product/sdk/src product/sdk/examples product/sdk/README.md product/docs-site/src product/docs-site/README.md product/docs-site/index.html product/docs-site/package.json; then
  fail 'SDK or developer docs referenced a non-product implementation path'
fi

if rg -n 'platform/adapters|vendor/' product/channel-management product/api; then
  fail 'product API or channel management referenced a non-product implementation path'
fi

if rg -n 'Date\.now\(|datetime\.now\(' product/api platform/channel-management platform/plugin-governance platform/public-surface; then
  fail 'wall-clock duration helper detected in P5 API surface'
fi

if rg -n 'Date\.now\(|datetime\.now\(' product/web-console/src; then
  fail 'wall-clock duration helper detected in P5 web console surface'
fi

if rg -n 'Date\.now\(|datetime\.now\(' product/sdk/src product/sdk/examples product/docs-site/src; then
  fail 'wall-clock duration helper detected in P5 SDK or developer docs surface'
fi

node --test \
  tests/contract/p5-openapi-contract.test.mjs \
  tests/contract/p5-channel-management-contract.test.mjs \
  tests/contract/p5-sdk-openapi-contract.test.mjs \
  tests/contract/docs-site-openapi-alignment.test.mjs \
  tests/contract/web-console-openapi-alignment.test.mjs \
  tests/integration/platform-api-rest.test.mjs \
  tests/integration/channel-management-api.test.mjs \
  tests/integration/sdk-typescript-client.test.mjs \
  tests/integration/web-console-api-client.test.mjs \
  tests/security/platform-api-leakage.test.mjs \
  tests/security/channel-management-leakage.test.mjs \
  tests/security/sdk-docs-leakage.test.mjs \
  tests/security/plugin-governance-api.test.mjs \
  tests/security/web-console-leakage.test.mjs

corepack pnpm --dir product/sdk install --frozen-lockfile
corepack pnpm --dir product/sdk run build
node product/sdk/examples/quickstart.mjs
node product/sdk/examples/memory-budget.mjs
node product/sdk/examples/channel-management.mjs
node product/sdk/examples/plugin-governance.mjs

corepack pnpm --dir product/docs-site install --frozen-lockfile
corepack pnpm --dir product/docs-site run build

corepack pnpm --dir product/web-console install --frozen-lockfile
corepack pnpm --dir product/web-console run build

echo 'PASS: P5 platform REST API, Web console, TypeScript SDK, developer docs, channel management, OpenAPI contract, plugin governance, and public leakage gate'
