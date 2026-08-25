#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

cleanup_vendor_openclaw_dirs() {
  find vendor/openclaw-main -depth -type d \
    \( -name node_modules -o -name .pnpm-store -o -name .cache -o -name .turbo -o -name .vite -o -name coverage -o -name __pycache__ -o -name .pytest_cache -o -name .ruff_cache -o -name .mypy_cache \) \
    -exec rm -rf {} +
  chmod 644 vendor/openclaw-main/openclaw.mjs 2>/dev/null || true
}

trap cleanup_vendor_openclaw_dirs EXIT

required_files=(
  platform/adapters/openclaw/index.ts
  platform/adapters/openclaw/command-mapping.ts
  platform/adapters/openclaw/plugin-bridge.ts
  platform/adapters/openclaw/providers/README.md
  platform/adapters/openclaw/providers/openclaw-2026.8.1/README.md
  tests/unit/openclaw-provider-registry.test.mjs
  tests/unit/openclaw-channel-contracts.test.mjs
  tests/unit/openclaw-command-mapping.test.mjs
  tests/integration/openclaw-gateway-adapter.test.mjs
  tests/integration/openclaw-channel-adapter.test.mjs
  tests/integration/openclaw-command-routing.test.mjs
  tests/security/openclaw-gateway-bypass.test.mjs
  tests/security/openclaw-channel-leakage.test.mjs
  tests/security/openclaw-command-bypass.test.mjs
  tests/security/openclaw-network-isolation.test.mjs
  tests/security/openclaw-plugin-bypass.test.mjs
  vendor/openclaw-main/src/gateway/agent-turn/nexus-gateway-only-experiment.ts
  vendor/openclaw-main/src/gateway/agent-turn/nexus-gateway-only-experiment.test.ts
  vendor/openclaw-main/src/gateway/agent-turn/agent-request-routing.ts
  vendor/openclaw-main/src/gateway/agent-turn/agent-run-dispatch.ts
  vendor/openclaw-main/src/gateway/agent-turn/agent-run-execution-phase.ts
  vendor/openclaw-main/src/gateway/agent-turn/agent-turn-service.ts
  vendor/openclaw-main/src/channels/inbound-event/envelope.ts
  vendor/openclaw-main/src/channels/inbound-event/envelope.test.ts
  docs/planning/open-questions/P4-resolution-plan.md
  docs/planning/task-prompts/P4/P4-01.md
  docs/planning/task-prompts/P4/P4-03.md
  docs/architecture/upstream-versioning-and-plugin-bridge.md
  docs/traceability/requirements-matrix.md
  docs/risks/risk-register.md
  docs/README.md
  tests/smoke/README.md
  vendor/MANIFEST.yaml
)

for file in "${required_files[@]}"; do
  [[ -f "$file" ]] || fail "missing P4 required file: $file"
done

p4_01_audit_block="$(sed -n '/^# P4-01 修改记录包$/,/^## 完整提示词$/p' docs/planning/task-prompts/P4/P4-01.md)"
[[ -n "$p4_01_audit_block" ]] || fail 'P4-01 audit record package is missing'
if printf '%s\n' "$p4_01_audit_block" | rg -q '\.\.\.'; then
  fail 'P4-01 audit record package still contains placeholder ellipses'
fi
for audit_marker in \
  '任务与验收条件' \
  '源码证据' \
  '基线测试' \
  '影响面分析' \
  '修改计划与回滚' \
  '待确认问题' \
  '实际变更文件' \
  '测试结果' \
  '回滚验证'; do
  printf '%s\n' "$p4_01_audit_block" | rg -q "$audit_marker" || fail "P4-01 audit marker missing: $audit_marker"
done

p4_02_audit_block="$(sed -n '/^# P4-02 修改记录包$/,/^## 完整提示词$/p' docs/planning/task-prompts/P4/P4-02.md)"
[[ -n "$p4_02_audit_block" ]] || fail 'P4-02 audit record package is missing'
if printf '%s\n' "$p4_02_audit_block" | rg -q '\.\.\.'; then
  fail 'P4-02 audit record package still contains placeholder ellipses'
fi
for audit_marker in \
  '任务与验收条件' \
  '源码证据' \
  '基线测试' \
  '影响面分析' \
  '修改计划与回滚' \
  '待确认问题' \
  '实际变更文件' \
  '测试结果' \
  '回滚验证'; do
  printf '%s\n' "$p4_02_audit_block" | rg -q "$audit_marker" || fail "P4-02 audit marker missing: $audit_marker"
done

p4_03_audit_block="$(sed -n '/^# P4-03 修改记录包$/,/^## 完整提示词$/p' docs/planning/task-prompts/P4/P4-03.md)"
[[ -n "$p4_03_audit_block" ]] || fail 'P4-03 audit record package is missing'
if printf '%s\n' "$p4_03_audit_block" | rg -q '\.\.\.'; then
  fail 'P4-03 audit record package still contains placeholder ellipses'
fi
for audit_marker in \
  '任务与验收条件' \
  '源码证据' \
  '基线测试' \
  '影响面分析' \
  '修改计划与回滚' \
  '待确认问题' \
  '实际变更文件' \
  '测试结果' \
  '回滚验证'; do
  printf '%s\n' "$p4_03_audit_block" | rg -q "$audit_marker" || fail "P4-03 audit marker missing: $audit_marker"
done

for marker in \
  'task_id: P4-01' \
  'NexusAgent P4 OpenClaw gateway-only provider boundary hardening' \
  'platform/adapters/openclaw/index.ts' \
  'openclaw-gateway-bypass.test.mjs'; do
  rg -q "$marker" vendor/MANIFEST.yaml || fail "vendor manifest missing P4-01 marker: $marker"
done

for marker in \
  'task_id: P4-02' \
  'nexus.openclaw_channel_inbound.p4.v1' \
  'nexus.openclaw_channel_outbound.p4.v1' \
  'openclaw-channel-contracts.test.mjs' \
  'openclaw-channel-adapter.test.mjs' \
  'openclaw-channel-leakage.test.mjs'; do
  rg -q "$marker" vendor/MANIFEST.yaml platform/adapters/openclaw/index.ts tests/smoke/P4.sh || fail "P4-02 marker missing: $marker"
done

for marker in \
  'task_id: P4-03' \
  'nexus.openclaw_command_mapping.p4.v1' \
  'nexus.task_command.p4.v1' \
  'submitTaskCommand' \
  'command-attempt-semantics' \
  'openclaw-command-mapping.test.mjs' \
  'openclaw-command-routing.test.mjs' \
  'openclaw-command-bypass.test.mjs'; do
  rg -q "$marker" vendor/MANIFEST.yaml platform/adapters/openclaw/command-mapping.ts platform/adapters/openclaw/index.ts platform/coordinator/index.ts tests/smoke/P4.sh || fail "P4-03 command marker missing: $marker"
done

for marker in \
  'OPENCLAW_BASELINE_PROVIDER_ID' \
  'nexus.openclaw_provider.p4.v1' \
  'OpenClawProviderRegistry' \
  'OpenClawGatewayAdapter' \
  'rollbackDefault' \
  'native-agent-block' \
  'plugin-bridge-allowlist'; do
  rg -q "$marker" platform/adapters/openclaw/index.ts tests/unit/openclaw-provider-registry.test.mjs tests/integration/openclaw-gateway-adapter.test.mjs || fail "OpenClaw provider marker missing: $marker"
done

for marker in \
  'nexus.openclaw_gateway_event.p4.v1' \
  'NEXUS_OPENCLAW_GATEWAY_ONLY' \
  'NEXUS_GATEWAY_ONLY_NATIVE_PAYLOAD_BLOCKED_MESSAGE' \
  'assertNexusGatewayOnlyPlatformContext' \
  'assertNexusGatewayOnlyNoNativePayload'; do
  rg -q "$marker" vendor/openclaw-main/src/gateway/agent-turn/nexus-gateway-only-experiment.ts vendor/openclaw-main/src/gateway/agent-turn/nexus-gateway-only-experiment.test.ts platform/adapters/openclaw/index.ts || fail "OpenClaw gateway-only guard marker missing: $marker"
done

for marker in \
  'nexus.openclaw_plugin_bridge.p4.v1' \
  'OPENCLAW_PLUGIN_BRIDGE_SCHEMA_VERSION' \
  'discoverOpenClawGatewayCapabilities' \
  'plugin_bridge_allowlist_required' \
  'OpenClawPluginBridgeError'; do
  rg -q "$marker" platform/adapters/openclaw/plugin-bridge.ts tests/security/openclaw-plugin-bypass.test.mjs platform/adapters/openclaw/index.ts || fail "OpenClaw Plugin Bridge marker missing: $marker"
done

for marker in \
  'plugin_inventory' \
  'mapOpenClawPluginInventory' \
  'P4-02 ClawHub/npm allowlist' \
  'channel-outbound-anti-corruption' \
  'delivery_outcome'; do
  rg -q "$marker" platform/adapters/openclaw/plugin-bridge.ts platform/adapters/openclaw/index.ts tests/security/openclaw-plugin-bypass.test.mjs || fail "P4-02 channel/plugin marker missing: $marker"
done

for marker in \
  'openclaw-adapter' \
  '127.0.0.1' \
  'NEXUS_PUBLIC' \
  '9252' \
  'production compose does not expose OpenClaw dev ports'; do
  rg -q "$marker" deploy/docker-compose.dev.yml tests/security/openclaw-network-isolation.test.mjs || fail "OpenClaw network isolation marker missing: $marker"
done

for marker in \
  'P4-01' \
  'OQ-UPSTREAM-002' \
  'OQ-CHANNEL-001' \
  'OQ-PLUGIN-001' \
  'gateway-only provider'; do
  rg -q "$marker" docs/planning/open-questions/P4-resolution-plan.md docs/traceability/requirements-matrix.md docs/risks/risk-register.md docs/README.md || fail "P4 documentation marker missing: $marker"
done

if rg -qi 'Hermes|OpenClaw|DeepSeek|DSH' docs/contracts/openapi.yaml platform/contracts/platform-error.schema.json product; then
  fail 'public API/error/product surface leaked upstream native naming'
fi

node --test \
  tests/unit/openclaw-provider-registry.test.mjs \
  tests/unit/openclaw-channel-contracts.test.mjs \
  tests/unit/openclaw-command-mapping.test.mjs \
  tests/integration/openclaw-gateway-adapter.test.mjs \
  tests/integration/openclaw-channel-adapter.test.mjs \
  tests/integration/openclaw-command-routing.test.mjs \
  tests/security/openclaw-gateway-bypass.test.mjs \
  tests/security/openclaw-channel-leakage.test.mjs \
  tests/security/openclaw-command-bypass.test.mjs \
  tests/security/openclaw-network-isolation.test.mjs \
  tests/security/openclaw-plugin-bypass.test.mjs

if [[ ! -x vendor/openclaw-main/node_modules/.bin/vitest ]]; then
  corepack pnpm --dir vendor/openclaw-main install --frozen-lockfile
fi

corepack pnpm --dir vendor/openclaw-main exec vitest run \
  src/gateway/agent-turn/nexus-gateway-only-experiment.test.ts \
  src/gateway/nexus-gateway-only-tools-invoke.test.ts \
  src/channels/inbound-event/envelope.test.ts

echo 'PASS: P4 OpenClaw gateway-only provider boundary, plugin allowlist, network isolation, smoke checks, and public leakage guard'
