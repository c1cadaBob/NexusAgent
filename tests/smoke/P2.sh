#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

cleanup_vendor_dependency_dirs() {
  find vendor/deepseek-harness-master -depth -type d \
    \( -name node_modules -o -name .pnpm-store -o -name .cache \) \
    -exec rm -rf {} +
  chmod 644 vendor/deepseek-harness-master/vendor/cordis/bin.js 2>/dev/null || true
}

trap cleanup_vendor_dependency_dirs EXIT

required_files=(
  platform/adapters/dsh/index.ts
  platform/adapters/dsh/providers/dsh-0.1.1-rc.2/index.ts
  platform/adapters/dsh/providers/README.md
  platform/adapters/dsh/providers/dsh-0.1.1-rc.2/README.md
  platform/contracts/execution-event.schema.json
  platform/contracts/execution-request.schema.json
  platform/contracts/execution-result.schema.json
  tests/unit/dsh-adapter-contracts.test.mjs
  tests/unit/dsh-execution-policy.test.mjs
  tests/unit/dsh-provider-registry.test.mjs
  tests/integration/dsh-adapter.test.mjs
  tests/integration/dsh-artifact-events.test.mjs
  tests/integration/dsh-adapter-failover.test.mjs
  tests/security/dsh-adapter-leakage.test.mjs
  tests/security/dsh-bypass.test.mjs
  tests/security/dsh-network-isolation.test.mjs
  tests/security/dsh-sandbox-credential.test.mjs
  vendor/MANIFEST.yaml
  vendor/deepseek-harness-master/packages/core/agent-loop/src/agent.ts
  vendor/deepseek-harness-master/packages/core/agent-loop/src/constants.ts
  vendor/deepseek-harness-master/packages/core/agent-loop/src/index.ts
  vendor/deepseek-harness-master/packages/core/agent-loop/src/nexus-executor-only-experiment.ts
  vendor/deepseek-harness-master/packages/core/agent-loop/src/runtime-context.ts
  vendor/deepseek-harness-master/packages/core/agent-loop/src/tool-calls.ts
  vendor/deepseek-harness-master/packages/core/agent-loop/tests/nexus-executor-only-experiment.spec.ts
  vendor/deepseek-harness-master/packages/core/agent-loop/tests/nexus-executor-only-provider.spec.ts
  vendor/deepseek-harness-master/packages/core/agent/src/dispatch.ts
  docs/architecture/dsh-versioning-and-replacement.md
  docs/planning/open-questions/P2-resolution-plan.md
  docs/planning/task-prompts/P2/P2-01.md
  docs/planning/task-prompts/P2/P2-02.md
  docs/planning/task-prompts/P2/P2-03.md
  docs/planning/task-prompts/P2/P2-04.md
  docs/traceability/requirements-matrix.md
  docs/risks/risk-register.md
)

for file in "${required_files[@]}"; do
  [[ -f "$file" ]] || fail "missing P2-01 required file: $file"
done

p2_02_audit_block="$(sed -n '/^# P2-02 修改记录包$/,/^## 完整提示词$/p' docs/planning/task-prompts/P2/P2-02.md)"
[[ -n "$p2_02_audit_block" ]] || fail 'P2-02 audit record package is missing'
if printf '%s\n' "$p2_02_audit_block" | rg -q '\.\.\.'; then
  fail 'P2-02 audit record package still contains placeholder ellipses'
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
  printf '%s\n' "$p2_02_audit_block" | rg -q "$audit_marker" || fail "P2-02 audit marker missing: $audit_marker"
done

p2_03_audit_block="$(sed -n '/^# P2-03 修改记录包$/,/^## 完整提示词$/p' docs/planning/task-prompts/P2/P2-03.md)"
[[ -n "$p2_03_audit_block" ]] || fail 'P2-03 audit record package is missing'
if printf '%s\n' "$p2_03_audit_block" | rg -q '\.\.\.'; then
  fail 'P2-03 audit record package still contains placeholder ellipses'
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
  printf '%s\n' "$p2_03_audit_block" | rg -q "$audit_marker" || fail "P2-03 audit marker missing: $audit_marker"
done

p2_04_audit_block="$(sed -n '/^# P2-04 修改记录包$/,/^## 完整提示词$/p' docs/planning/task-prompts/P2/P2-04.md)"
[[ -n "$p2_04_audit_block" ]] || fail 'P2-04 audit record package is missing'
if printf '%s\n' "$p2_04_audit_block" | rg -q '\.\.\.'; then
  fail 'P2-04 audit record package still contains placeholder ellipses'
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
  printf '%s\n' "$p2_04_audit_block" | rg -q "$audit_marker" || fail "P2-04 audit marker missing: $audit_marker"
done

p2_audit_block="$(sed -n '/^# P2-01 修改记录包$/,/^## 完整提示词$/p' docs/planning/task-prompts/P2/P2-01.md)"
[[ -n "$p2_audit_block" ]] || fail 'P2-01 audit record package is missing'
if printf '%s\n' "$p2_audit_block" | rg -q '\.\.\.'; then
  fail 'P2-01 audit record package still contains placeholder ellipses'
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
  printf '%s\n' "$p2_audit_block" | rg -q "$audit_marker" || fail "P2-01 audit marker missing: $audit_marker"
done

for marker in \
  'task_id: P2-01' \
  'NexusAgent P2 DSH executor-only provider boundary hardening' \
  'nexus-executor-only-provider.spec.ts' \
  'platform/adapters/dsh/index.ts'; do
  rg -q "$marker" vendor/MANIFEST.yaml || fail "vendor manifest missing P2-01 marker: $marker"
done

for marker in \
  'task_id: P2-02' \
  'NexusAgent P2 DSH anti-corruption adapter' \
  'tests/integration/dsh-adapter.test.mjs' \
  'platform/contracts/execution-request.schema.json'; do
  rg -q "$marker" vendor/MANIFEST.yaml || fail "vendor manifest missing P2-02 marker: $marker"
done

for marker in \
  'task_id: P2-03' \
  'NexusAgent P2 DSH sandbox artifact event controls' \
  'tests/integration/dsh-artifact-events.test.mjs' \
  'tests/security/dsh-sandbox-credential.test.mjs'; do
  rg -q "$marker" vendor/MANIFEST.yaml || fail "vendor manifest missing P2-03 marker: $marker"
done

for marker in \
  'task_id: P2-04' \
  'NexusAgent P2 DSH integration bypass and failover checks' \
  'tests/security/dsh-bypass.test.mjs' \
  'tests/integration/dsh-adapter-failover.test.mjs'; do
  rg -q "$marker" vendor/MANIFEST.yaml || fail "vendor manifest missing P2-04 marker: $marker"
done

for marker in \
  'NEXUS_DSH_DEFAULT_PROVIDER_ID' \
  'NEXUS_DSH_PROVIDER_DISABLED' \
  'NEXUS_DSH_EXECUTION_CANCELLED' \
  'nexus.execution_event.p2.v1' \
  'buildNexusProviderExecutionEvent'; do
  rg -q "$marker" vendor/deepseek-harness-master/packages/core/agent-loop/src/nexus-executor-only-experiment.ts \
    vendor/deepseek-harness-master/packages/core/agent-loop/src/constants.ts || fail "P2 DSH guard marker missing: $marker"
done

rg -q "ReactLoopAgent.constructor" vendor/deepseek-harness-master/packages/core/agent-loop/src/agent.ts || fail 'ReactLoopAgent constructor guard missing'
rg -q "RuntimeContextProjection.constructor" vendor/deepseek-harness-master/packages/core/agent-loop/src/runtime-context.ts || fail 'runtime context guard missing'
rg -q "agentEvents" vendor/deepseek-harness-master/packages/core/agent/src/dispatch.ts || fail 'agent dispatch guard missing'
rg -q "assertNexusExecutionNotCancelled" vendor/deepseek-harness-master/packages/core/agent-loop/src/tool-calls.ts || fail 'tool-call cancellation guard missing'
rg -q 'nexus.execution_event.p0.v1' platform/contracts/execution-event.schema.json || fail 'execution event schema lost P0 compatibility marker'
rg -q 'nexus.execution_event.p2.v1' platform/contracts/execution-event.schema.json || fail 'execution event schema missing P2 provider marker'
rg -q 'DshProviderRegistry' platform/adapters/dsh/index.ts tests/unit/dsh-provider-registry.test.mjs || fail 'DshProviderRegistry implementation/test missing'
rg -q 'provider-disable' platform/adapters/dsh/index.ts || fail 'provider disable capability missing'
rg -q 'rollbackDefault' platform/adapters/dsh/index.ts tests/unit/dsh-provider-registry.test.mjs || fail 'provider rollback path missing'
for marker in \
  'DshExecutorAdapter' \
  'validateDshExecutionRequest' \
  'sanitizeDshExecutionResult' \
  'nexus.execution_request.p2.v1' \
  'nexus.execution_result.p2.v1'; do
  rg -q "$marker" platform/adapters/dsh/index.ts platform/contracts/execution-request.schema.json platform/contracts/execution-result.schema.json || fail "P2-02 adapter marker missing: $marker"
done
for marker in \
  'resource_budget' \
  'normalizeDshProviderExecutionResult' \
  'sandbox.denied' \
  'artifact_candidates' \
  'redactExecutionText'; do
  rg -q "$marker" platform/adapters/dsh/index.ts platform/contracts/execution-request.schema.json platform/event-bus/index.ts platform/contracts/event-envelope.schema.json tests/unit/dsh-execution-policy.test.mjs tests/integration/dsh-artifact-events.test.mjs tests/security/dsh-sandbox-credential.test.mjs || fail "P2-03 sandbox/artifact/event marker missing: $marker"
done
for marker in \
  'credential_material' \
  'raw_credential' \
  'dsh-adapter dev compose exposure is loopback-only' \
  'rolls back from a failing canary provider'; do
  rg -q "$marker" platform/adapters/dsh/index.ts tests/security/dsh-bypass.test.mjs tests/security/dsh-network-isolation.test.mjs tests/integration/dsh-adapter-failover.test.mjs || fail "P2-04 bypass/failover marker missing: $marker"
done

if rg -qi 'Hermes|OpenClaw|DeepSeek|DSH' docs/contracts/openapi.yaml platform/contracts/platform-error.schema.json product; then
  fail 'public API/error/product surface leaked upstream native naming'
fi
if rg -n 'Date\.now\(|datetime\.now\(' platform/adapters/dsh vendor/deepseek-harness-master/packages/core/agent-loop/src/nexus-executor-only-experiment.ts; then
  fail 'wall-clock duration helper detected in P2 DSH provider boundary'
fi

node --test \
  tests/unit/dsh-provider-registry.test.mjs \
  tests/unit/dsh-adapter-contracts.test.mjs \
  tests/unit/dsh-execution-policy.test.mjs \
  tests/integration/dsh-adapter.test.mjs \
  tests/integration/dsh-artifact-events.test.mjs \
  tests/integration/dsh-adapter-failover.test.mjs \
  tests/security/dsh-adapter-leakage.test.mjs \
  tests/security/dsh-bypass.test.mjs \
  tests/security/dsh-network-isolation.test.mjs \
  tests/security/dsh-sandbox-credential.test.mjs

(
  cd vendor/deepseek-harness-master
  corepack pnpm exec vitest run \
    packages/core/agent-loop/tests/nexus-executor-only-experiment.spec.ts \
    packages/core/agent-loop/tests/nexus-executor-only-provider.spec.ts
)

echo 'PASS: P2 DSH executor-only provider guard, registry, anti-corruption adapter, sandbox/artifact/event controls, bypass/failover checks, smoke checks, and public leakage guard'
