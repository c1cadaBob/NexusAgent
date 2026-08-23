import assert from 'node:assert/strict';
import test from 'node:test';

import { Coordinator } from '../../platform/coordinator/index.ts';
import { PolicyGate } from '../../platform/policy-gate/index.ts';

const principal = Object.freeze({
  tenant_id: 'tenant_alpha01',
  user_id: 'user_alpha01',
  roles: ['operator'],
  permissions: ['task:submit', 'adapter:invoke'],
});

function taskRequest(overrides = {}) {
  return {
    schema_version: 'nexus.task_request.v1',
    tenant_id: 'tenant_alpha01',
    user_id: 'user_alpha01',
    agent_id: 'agent_alpha01',
    task_id: 'task_alpha01',
    attempt_id: 'attempt_alpha01',
    execution_id: 'exec_alpha01',
    conversation_id: 'conv_alpha01',
    trace_id: 'trace_alpha01',
    input: { kind: 'text', text: 'prepare a platform-only plan' },
    created_at_utc: '2026-08-23T00:00:00Z',
    monotonic_ms: 100,
    ...overrides,
  };
}

test('Coordinator admits task through Policy-Gate and records platform event', () => {
  const coordinator = new Coordinator(new PolicyGate());
  const result = coordinator.submitTask(taskRequest(), { principal });

  assert.equal(result.accepted, true);
  assert.equal(result.snapshot.state, 'admitted');
  assert.equal(result.snapshot.execution_id, 'exec_alpha01');
  assert.equal(result.snapshot.trace_id, 'trace_alpha01');
  assert.equal(result.event.event_type, 'task.state_changed');
  assert.equal(result.event.execution_id, 'exec_alpha01');
  assert.equal(result.event.trace_id, 'trace_alpha01');
  assert.equal(coordinator.events().length, 1);
});

test('Coordinator blocks task when Policy-Gate denies RBAC', () => {
  const coordinator = new Coordinator(new PolicyGate());
  const result = coordinator.submitTask(taskRequest(), {
    principal: { ...principal, permissions: [] },
  });

  assert.equal(result.accepted, false);
  assert.equal(result.snapshot.state, 'blocked');
  assert.equal(result.decision.code, 'PLATFORM_FORBIDDEN');
  assert.match(result.event.payload.reason, /missing permissions/);
});

test('Coordinator dispatches adapter only with trusted policy decision and platform IDs', async () => {
  const coordinator = new Coordinator(new PolicyGate());
  coordinator.registerAdapter({
    name: 'planner-mock',
    kind: 'planner',
    invoke(invocation) {
      assert.equal(invocation.execution_id, 'exec_alpha01');
      assert.equal(invocation.trace_id, 'trace_alpha01');
      assert.ok(invocation.policy_decision.allow);
      return {
        tenant_id: invocation.tenant_id,
        task_id: invocation.task_id,
        attempt_id: invocation.attempt_id,
        execution_id: invocation.execution_id,
        trace_id: invocation.trace_id,
        status: 'accepted',
        payload: { route: 'planner-mock' },
      };
    },
  });

  coordinator.submitTask(taskRequest(), { principal });
  const dispatch = await coordinator.dispatchToAdapter('task_alpha01', {
    adapter_name: 'planner-mock',
    principal,
    payload: { requested_at_utc: '2026-08-23T00:00:01Z', objective: 'plan' },
  });

  assert.equal(dispatch.decision.allow, true);
  assert.equal(dispatch.decision.action, 'adapter.invoke');
  assert.equal(dispatch.adapter_result.execution_id, 'exec_alpha01');
  assert.equal(dispatch.adapter_result.trace_id, 'trace_alpha01');
});

test('Coordinator rejects adapter results that mutate platform identity fields', async () => {
  const coordinator = new Coordinator(new PolicyGate());
  coordinator.registerAdapter({
    name: 'bad-adapter',
    kind: 'planner',
    invoke(invocation) {
      return {
        tenant_id: 'tenant_other01',
        task_id: invocation.task_id,
        attempt_id: invocation.attempt_id,
        execution_id: invocation.execution_id,
        trace_id: invocation.trace_id,
        status: 'accepted',
        payload: {},
      };
    },
  });

  coordinator.submitTask(taskRequest(), { principal });
  await assert.rejects(
    () => coordinator.dispatchToAdapter('task_alpha01', {
      adapter_name: 'bad-adapter',
      principal,
      payload: { requested_at_utc: '2026-08-23T00:00:01Z' },
    }),
    /Adapter result changed platform identity fields/,
  );
});
