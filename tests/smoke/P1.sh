#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

required_files=(
  platform/contracts/common-identifiers.schema.json
  platform/contracts/task-request.schema.json
  platform/contracts/task-state.schema.json
  platform/contracts/event-envelope.schema.json
  platform/contracts/artifact-reference.schema.json
  platform/contracts/credential-reference.schema.json
  platform/contracts/platform-error.schema.json
  platform/task-state/index.ts
  platform/policy-gate/index.ts
  platform/coordinator/index.ts
  tests/unit/task-state.test.mjs
  tests/unit/policy-gate.test.mjs
  tests/contract/p1-contracts.test.mjs
  tests/integration/coordinator-policy-gate.test.mjs
  tests/security/policy-gate-bypass.test.mjs
)

for file in "${required_files[@]}"; do
  [[ -f "$file" ]] || fail "missing P1-01 required file: $file"
done

rg -q 'nexus.task_state.v1' platform/contracts/task-state.schema.json || fail 'task-state schema missing version'
rg -q 'nexus.event_envelope.v1' platform/contracts/event-envelope.schema.json || fail 'event-envelope schema missing version'
rg -q 'PLATFORM_INVALID_STATE_TRANSITION' platform/contracts/platform-error.schema.json platform/task-state/index.ts || fail 'state transition error code missing'
rg -q 'PLATFORM_CROSS_TENANT_ID' platform/contracts/platform-error.schema.json platform/task-state/index.ts || fail 'cross-tenant error code missing'
rg -q 'TASK_STATE_LAYERS' platform/task-state/index.ts || fail 'task-state layers missing'
rg -q 'task.state_transition_rejected' platform/contracts/event-envelope.schema.json || fail 'event envelope missing rejected transition type'
rg -q 'PolicyGate' platform/policy-gate/index.ts || fail 'Policy-Gate implementation missing'
rg -q 'Coordinator' platform/coordinator/index.ts || fail 'Coordinator implementation missing'
rg -q 'assertAllowedDecision' platform/policy-gate/index.ts platform/coordinator/index.ts || fail 'Policy-Gate guard missing'
rg -q 'invokeSecuredAdapter' platform/coordinator/index.ts tests/security/policy-gate-bypass.test.mjs || fail 'secured adapter invocation missing'

if rg -n 'Date\.now\(|datetime\.now\(' platform/task-state platform/contracts platform/policy-gate platform/coordinator; then
  fail 'wall-clock duration helper detected in P1 contracts or core state/policy/coordinator code'
fi

if rg -n 'Hermes|OpenClaw|DeepSeek|DSH|hermes|openclaw|deepseek' \
  platform/task-state \
  platform/policy-gate \
  platform/coordinator \
  platform/contracts/common-identifiers.schema.json \
  platform/contracts/task-request.schema.json \
  platform/contracts/task-state.schema.json \
  platform/contracts/event-envelope.schema.json \
  platform/contracts/artifact-reference.schema.json \
  platform/contracts/credential-reference.schema.json; then
  fail 'P1 public contracts leaked native upstream naming'
fi

node --test \
  tests/unit/task-state.test.mjs \
  tests/unit/policy-gate.test.mjs \
  tests/contract/p1-contracts.test.mjs \
  tests/integration/coordinator-policy-gate.test.mjs \
  tests/security/policy-gate-bypass.test.mjs

echo 'PASS: P1 contracts, task-state, Policy-Gate, Coordinator, and bypass guards'
