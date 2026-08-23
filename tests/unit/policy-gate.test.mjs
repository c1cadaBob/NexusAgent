import assert from 'node:assert/strict';
import test from 'node:test';

import { PolicyGate, PolicyGateError, withPolicyGate } from '../../platform/policy-gate/index.ts';

const principal = Object.freeze({
  tenant_id: 'tenant_alpha01',
  user_id: 'user_alpha01',
  roles: ['operator'],
  permissions: ['task:submit', 'adapter:invoke', 'planner:invoke', 'credential:resolve'],
});

function policyRequest(overrides = {}) {
  return {
    action: 'adapter.invoke',
    tenant_id: 'tenant_alpha01',
    task_id: 'task_alpha01',
    attempt_id: 'attempt_alpha01',
    execution_id: 'exec_alpha01',
    conversation_id: 'conv_alpha01',
    trace_id: 'trace_alpha01',
    monotonic_ms: 100,
    requested_at_utc: '2026-08-23T00:00:00Z',
    principal,
    route: {
      adapter_kind: 'planner',
      adapter_name: 'planner-mock',
    },
    ...overrides,
  };
}

test('allows request with matching tenant, trace, execution, RBAC, budget, and approval', async () => {
  const gate = new PolicyGate();
  const decision = gate.evaluate(policyRequest({
    budget: { requested_units: 5, remaining_units: 10, max_units_per_attempt: 8 },
    approval: { required: true, status: 'approved' },
  }));

  assert.equal(decision.schema_version, 'nexus.policy_decision.v1');
  assert.equal(decision.allow, true);
  assert.equal(decision.execution_id, 'exec_alpha01');
  assert.equal(decision.trace_id, 'trace_alpha01');
  assert.equal(gate.decisionLog().length, 1);
  assert.equal(JSON.stringify(gate.decisionLog()).includes('secret'), false);

  const result = await withPolicyGate(gate, policyRequest(), (allowedDecision) => allowedDecision.decision_id);
  assert.match(result, /^decision_alpha01_/);
});

test('denies cross-tenant principal before adapter invocation', () => {
  const gate = new PolicyGate();
  const decision = gate.evaluate(policyRequest({
    principal: { ...principal, tenant_id: 'tenant_other01' },
  }));

  assert.equal(decision.allow, false);
  assert.equal(decision.code, 'PLATFORM_CROSS_TENANT_ID');
  assert.throws(
    () => gate.assertAllowedDecision(decision, {
      action: 'adapter.invoke',
      tenant_id: 'tenant_alpha01',
      execution_id: 'exec_alpha01',
      trace_id: 'trace_alpha01',
    }),
    (error) => error instanceof PolicyGateError && error.code === 'PLATFORM_CROSS_TENANT_ID',
  );
});

test('denies missing RBAC permission and budget overrun', () => {
  const gate = new PolicyGate();
  const decision = gate.evaluate(policyRequest({
    principal: { ...principal, permissions: ['task:submit'] },
    budget: { requested_units: 11, remaining_units: 3 },
  }));

  assert.equal(decision.allow, false);
  assert.equal(decision.code, 'PLATFORM_FORBIDDEN');
  assert.match(decision.reasons.join('; '), /missing permissions/);
  assert.match(decision.reasons.join('; '), /budget remaining_units/);
});

test('returns approval_required when policy needs human approval', () => {
  const gate = new PolicyGate();
  const decision = gate.evaluate(policyRequest({
    approval: { required: true, status: 'pending' },
  }));

  assert.equal(decision.allow, false);
  assert.equal(decision.outcome, 'approval_required');
  assert.equal(decision.code, 'PLATFORM_APPROVAL_REQUIRED');
});

test('rejects missing or malformed execution_id and trace_id', () => {
  const gate = new PolicyGate();
  assert.throws(
    () => gate.evaluate(policyRequest({ execution_id: 'execution_alpha01' })),
    /Invalid platform identifier: execution_id/,
  );
  assert.throws(
    () => gate.evaluate(policyRequest({ trace_id: 'native_trace_alpha01' })),
    /Invalid platform identifier: trace_id/,
  );
});

test('rejects forged decisions even when fields look valid', () => {
  const gate = new PolicyGate();
  const forgedDecision = {
    schema_version: 'nexus.policy_decision.v1',
    decision_id: 'decision_forged_0001',
    action: 'adapter.invoke',
    allow: true,
    tenant_id: 'tenant_alpha01',
    execution_id: 'exec_alpha01',
    trace_id: 'trace_alpha01',
  };

  assert.throws(
    () => gate.assertAllowedDecision(forgedDecision, {
      action: 'adapter.invoke',
      tenant_id: 'tenant_alpha01',
      execution_id: 'exec_alpha01',
      trace_id: 'trace_alpha01',
    }),
    (error) => error instanceof PolicyGateError && error.code === 'PLATFORM_POLICY_DENIED',
  );
});
