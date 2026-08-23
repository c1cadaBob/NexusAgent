import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AdapterError,
  AdapterRegistry,
  MockExecutorAdapter,
  MockPlannerAdapter,
} from '../../platform/adapters/index.ts';
import { PolicyGate } from '../../platform/policy-gate/index.ts';

const principal = Object.freeze({
  tenant_id: 'tenant_alpha01',
  user_id: 'user_alpha01',
  roles: ['operator'],
  permissions: ['adapter:invoke'],
});

function policyDecision(gate) {
  return gate.evaluate({
    action: 'adapter.invoke',
    tenant_id: 'tenant_alpha01',
    task_id: 'task_alpha01',
    attempt_id: 'attempt_alpha01',
    execution_id: 'exec_alpha01',
    conversation_id: 'conv_alpha01',
    trace_id: 'trace_alpha01',
    monotonic_ms: 100,
    requested_at_utc: '2026-08-23T00:00:00.000Z',
    principal,
  });
}

function invocation(decision) {
  return {
    tenant_id: 'tenant_alpha01',
    task_id: 'task_alpha01',
    attempt_id: 'attempt_alpha01',
    execution_id: 'exec_alpha01',
    conversation_id: 'conv_alpha01',
    trace_id: 'trace_alpha01',
    monotonic_ms: 101,
    payload: { requested_at_utc: '2026-08-23T00:00:01.000Z' },
    policy_decision: decision,
  };
}

test('AdapterRegistry rejects duplicate adapter names and reports lifecycle health', async () => {
  const registry = new AdapterRegistry();
  const planner = new MockPlannerAdapter('planner-mock');

  registry.register(planner);
  assert.throws(
    () => registry.register(new MockPlannerAdapter('planner-mock')),
    (error) => error instanceof AdapterError && error.code === 'PLATFORM_CONFLICT',
  );
  assert.equal(registry.health('planner-mock').status, 'created');
  await registry.start('planner-mock');
  assert.equal(registry.health('planner-mock').status, 'started');
  await registry.stop('planner-mock');
  assert.equal(registry.health('planner-mock').status, 'stopped');
});

test('Mock adapters reject direct invocation before Coordinator/Policy-Gate trust marker', async () => {
  const adapter = new MockExecutorAdapter('executor-mock');
  adapter.start();
  await assert.rejects(
    () => adapter.invoke(invocation({ allow: true })),
    (error) => error instanceof AdapterError && error.code === 'PLATFORM_POLICY_DENIED',
  );
});

test('AdapterRegistry invokes started adapter through Policy-Gate decision', async () => {
  const gate = new PolicyGate();
  const decision = policyDecision(gate);
  const registry = new AdapterRegistry();
  const adapter = new MockPlannerAdapter('planner-mock');
  registry.register(adapter);
  await registry.start('planner-mock');

  const result = await registry.invoke('planner-mock', gate, invocation(decision));
  assert.equal(result.status, 'completed');
  assert.equal(result.execution_id, 'exec_alpha01');
  assert.equal(result.trace_id, 'trace_alpha01');
  assert.equal(result.payload.adapter_kind, 'planner');
});

test('AdapterRegistry rejects invocation before adapter is started', async () => {
  const gate = new PolicyGate();
  const registry = new AdapterRegistry();
  registry.register(new MockExecutorAdapter('executor-mock'));

  await assert.rejects(
    () => registry.invoke('executor-mock', gate, invocation(policyDecision(gate))),
    (error) => error instanceof AdapterError && error.code === 'PLATFORM_POLICY_DENIED',
  );
});
