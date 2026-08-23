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
  platform/clock/index.ts
  platform/event-bus/index.ts
  platform/adapters/index.ts
  platform/artifact-store/index.ts
  platform/memory-gateway/index.ts
  platform/credentials/index.ts
  platform/tenancy/index.ts
  platform/rbac/index.ts
  platform/audit/index.ts
  platform/observability/index.ts
  tests/unit/task-state.test.mjs
  tests/unit/policy-gate.test.mjs
  tests/unit/clock.test.mjs
  tests/unit/event-bus.test.mjs
  tests/unit/adapters.test.mjs
  tests/unit/artifact-store.test.mjs
  tests/unit/memory-gateway.test.mjs
  tests/unit/credentials.test.mjs
  tests/unit/tenancy.test.mjs
  tests/unit/rbac.test.mjs
  tests/unit/audit.test.mjs
  tests/unit/observability.test.mjs
  tests/contract/p1-contracts.test.mjs
  tests/integration/coordinator-policy-gate.test.mjs
  tests/integration/coordinator-adapter-event-bus.test.mjs
  tests/integration/data-spine-event-bus.test.mjs
  tests/integration/tenancy-rbac-audit-trace.test.mjs
  tests/security/policy-gate-bypass.test.mjs
  tests/security/adapter-bypass.test.mjs
  tests/security/data-spine-isolation.test.mjs
  tests/security/tenant-rbac-audit-guards.test.mjs
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
rg -q 'ManualClock' platform/clock/index.ts tests/unit/clock.test.mjs || fail 'manual platform clock missing'
rg -q 'InMemoryEventBus' platform/event-bus/index.ts tests/unit/event-bus.test.mjs || fail 'in-memory event bus missing'
rg -q 'AdapterRegistry' platform/adapters/index.ts tests/unit/adapters.test.mjs || fail 'adapter registry missing'
rg -q 'MockPlannerAdapter' platform/adapters/index.ts tests/integration/coordinator-adapter-event-bus.test.mjs || fail 'mock planner adapter missing'
rg -q 'deadLetter' platform/event-bus/index.ts tests/unit/event-bus.test.mjs || fail 'event bus dead-letter behavior missing'
rg -q 'LocalArtifactStore' platform/artifact-store/index.ts tests/unit/artifact-store.test.mjs || fail 'artifact store implementation missing'
rg -q 'LocalMemoryGateway' platform/memory-gateway/index.ts tests/unit/memory-gateway.test.mjs || fail 'memory gateway implementation missing'
rg -q 'LocalCredentialCenter' platform/credentials/index.ts tests/unit/credentials.test.mjs || fail 'credential center implementation missing'
rg -q 'secret_scan_required' platform/contracts/credential-reference.schema.json platform/credentials/index.ts || fail 'credential redaction policy missing'
rg -q 'LocalTenantRegistry' platform/tenancy/index.ts tests/unit/tenancy.test.mjs || fail 'tenant registry implementation missing'
rg -q 'LocalRbacPolicy' platform/rbac/index.ts tests/unit/rbac.test.mjs || fail 'rbac policy implementation missing'
rg -q 'LocalAuditLog' platform/audit/index.ts tests/unit/audit.test.mjs || fail 'audit log implementation missing'
rg -q 'PLATFORM_AUDIT_CHAIN_BROKEN' platform/contracts/platform-error.schema.json platform/audit/index.ts tests/unit/audit.test.mjs || fail 'audit chain error code missing'
rg -q 'LocalObservability' platform/observability/index.ts tests/unit/observability.test.mjs || fail 'observability implementation missing'
rg -q 'Tenancy, RBAC, Policy-Gate, Audit, and Observability' tests/integration/tenancy-rbac-audit-trace.test.mjs || fail 'tenancy/rbac/audit/trace integration test missing'

if rg -n 'Date\.now\(|datetime\.now\(' platform/task-state platform/contracts platform/policy-gate platform/coordinator platform/clock platform/event-bus platform/adapters platform/artifact-store platform/memory-gateway platform/credentials platform/tenancy platform/rbac platform/audit platform/observability; then
  fail 'wall-clock duration helper detected in P1 contracts or core service code'
fi

if rg -n 'Hermes|OpenClaw|DeepSeek|DSH|hermes|openclaw|deepseek' \
  platform/task-state \
  platform/policy-gate \
  platform/coordinator \
  platform/clock \
  platform/event-bus \
  platform/adapters/index.ts \
  platform/artifact-store \
  platform/memory-gateway \
  platform/credentials \
  platform/tenancy \
  platform/rbac \
  platform/audit \
  platform/observability \
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
  tests/unit/clock.test.mjs \
  tests/unit/event-bus.test.mjs \
  tests/unit/adapters.test.mjs \
  tests/unit/artifact-store.test.mjs \
  tests/unit/memory-gateway.test.mjs \
  tests/unit/credentials.test.mjs \
  tests/unit/tenancy.test.mjs \
  tests/unit/rbac.test.mjs \
  tests/unit/audit.test.mjs \
  tests/unit/observability.test.mjs \
  tests/contract/p1-contracts.test.mjs \
  tests/integration/coordinator-policy-gate.test.mjs \
  tests/integration/coordinator-adapter-event-bus.test.mjs \
  tests/integration/data-spine-event-bus.test.mjs \
  tests/integration/tenancy-rbac-audit-trace.test.mjs \
  tests/security/policy-gate-bypass.test.mjs \
  tests/security/adapter-bypass.test.mjs \
  tests/security/data-spine-isolation.test.mjs \
  tests/security/tenant-rbac-audit-guards.test.mjs

echo 'PASS: P1 contracts, task-state, Policy-Gate, Coordinator, Clock, Event Bus, adapters, data services, tenancy/RBAC/audit/observability, and bypass guards'
