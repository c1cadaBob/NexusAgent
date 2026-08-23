import assert from 'node:assert/strict';
import test from 'node:test';

import { Coordinator, invokeSecuredAdapter } from '../../platform/coordinator/index.ts';
import { PolicyGate, PolicyGateError } from '../../platform/policy-gate/index.ts';

const policyGate = new PolicyGate();

const adapter = Object.freeze({
  name: 'executor-mock',
  kind: 'executor',
  invoke(invocation) {
    return {
      tenant_id: invocation.tenant_id,
      task_id: invocation.task_id,
      attempt_id: invocation.attempt_id,
      execution_id: invocation.execution_id,
      trace_id: invocation.trace_id,
      status: 'accepted',
      payload: {},
    };
  },
});

const invocation = Object.freeze({
  tenant_id: 'tenant_alpha01',
  task_id: 'task_alpha01',
  attempt_id: 'attempt_alpha01',
  execution_id: 'exec_alpha01',
  trace_id: 'trace_alpha01',
  monotonic_ms: 101,
  payload: {},
});

test('direct adapter invocation wrapper fails without Policy-Gate decision', async () => {
  await assert.rejects(
    () => invokeSecuredAdapter(policyGate, adapter, invocation),
    (error) => error instanceof PolicyGateError && error.code === 'PLATFORM_POLICY_DENIED',
  );
});

test('direct adapter invocation wrapper fails with forged decision object', async () => {
  await assert.rejects(
    () => invokeSecuredAdapter(policyGate, adapter, {
      ...invocation,
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
    (error) => error instanceof PolicyGateError && error.code === 'PLATFORM_POLICY_DENIED',
  );
});

test('Coordinator refuses dispatch when adapter invoke permission is missing', async () => {
  const coordinator = new Coordinator(new PolicyGate());
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
    input: { kind: 'text', text: 'execute guarded adapter' },
    created_at_utc: '2026-08-23T00:00:00Z',
    monotonic_ms: 100,
  }, { principal });

  await assert.rejects(
    () => coordinator.dispatchToAdapter('task_alpha01', {
      adapter_name: 'executor-mock',
      principal,
      payload: { requested_at_utc: '2026-08-23T00:00:01Z' },
    }),
    (error) => error instanceof PolicyGateError && error.code === 'PLATFORM_FORBIDDEN',
  );
});
