import assert from 'node:assert/strict';
import test from 'node:test';

import { AdapterError, MockPlannerAdapter } from '../../platform/adapters/index.ts';
import { Coordinator } from '../../platform/coordinator/index.ts';
import { PolicyGate, PolicyGateError } from '../../platform/policy-gate/index.ts';

test('mock adapter direct invoke fails even with forged allow-like decision', async () => {
  const adapter = new MockPlannerAdapter('planner-mock');
  adapter.start();

  await assert.rejects(
    () => adapter.invoke({
      tenant_id: 'tenant_alpha01',
      task_id: 'task_alpha01',
      attempt_id: 'attempt_alpha01',
      execution_id: 'exec_alpha01',
      conversation_id: 'conv_alpha01',
      trace_id: 'trace_alpha01',
      monotonic_ms: 101,
      payload: {},
      policy_decision: {
        schema_version: 'nexus.policy_decision.v1',
        decision_id: 'decision_forged_0001',
        action: 'adapter.invoke',
        allow: true,
        tenant_id: 'tenant_alpha01',
        execution_id: 'exec_alpha01',
        trace_id: 'trace_alpha01',
      },
    }),
    (error) => error instanceof AdapterError && error.code === 'PLATFORM_POLICY_DENIED',
  );
});

test('Coordinator dispatch fails if principal lacks adapter permission for lifecycle adapters', async () => {
  const coordinator = new Coordinator(new PolicyGate());
  const adapter = new MockPlannerAdapter('planner-mock');
  adapter.start();
  coordinator.registerAdapter(adapter);

  const principal = {
    tenant_id: 'tenant_alpha01',
    user_id: 'user_alpha01',
    roles: ['operator'],
    permissions: ['task:submit'],
  };

  coordinator.submitTask({
    schema_version: 'nexus.task_request.v1',
    tenant_id: 'tenant_alpha01',
    user_id: 'user_alpha01',
    agent_id: 'agent_alpha01',
    task_id: 'task_alpha01',
    attempt_id: 'attempt_alpha01',
    execution_id: 'exec_alpha01',
    conversation_id: 'conv_alpha01',
    trace_id: 'trace_alpha01',
    input: { kind: 'text', text: 'should not dispatch' },
    created_at_utc: '2026-08-23T00:00:00.000Z',
    monotonic_ms: 100,
  }, { principal });

  await assert.rejects(
    () => coordinator.dispatchToAdapter('task_alpha01', {
      adapter_name: 'planner-mock',
      principal,
      payload: { requested_at_utc: '2026-08-23T00:00:01.000Z' },
    }),
    (error) => error instanceof PolicyGateError && error.code === 'PLATFORM_FORBIDDEN',
  );
});
