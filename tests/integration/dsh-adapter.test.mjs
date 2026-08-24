import assert from 'node:assert/strict';
import test from 'node:test';

import { AdapterError } from '../../platform/adapters/index.ts';
import {
  buildDshExecutionRequestFixture,
  DSH_BASELINE_PROVIDER_ID,
  DshExecutorAdapter,
  DshProviderRegistry,
} from '../../platform/adapters/dsh/index.ts';
import { Coordinator } from '../../platform/coordinator/index.ts';
import { PolicyGate } from '../../platform/policy-gate/index.ts';

const principal = Object.freeze({
  tenant_id: 'tenant_alpha01',
  user_id: 'user_alpha01',
  roles: ['operator'],
  permissions: ['task:submit', 'adapter:invoke'],
});

function taskRequest() {
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
    input: { kind: 'command', text: 'run approved executor fixture' },
    created_at_utc: '2026-08-24T00:00:00Z',
    monotonic_ms: 100,
  };
}

function coordinatorWithAdapter(adapter = new DshExecutorAdapter()) {
  adapter.start();
  const coordinator = new Coordinator(new PolicyGate());
  coordinator.registerAdapter(adapter);
  coordinator.submitTask(taskRequest(), { principal });
  return { coordinator, adapter };
}

test('Coordinator dispatches DshExecutorAdapter only through Policy-Gate and returns platform ExecutionResult', async () => {
  const { coordinator } = coordinatorWithAdapter();
  const dispatch = await coordinator.dispatchToAdapter('task_alpha01', {
    adapter_name: 'dsh-executor',
    principal,
    payload: buildDshExecutionRequestFixture({ requested_at_utc: '2026-08-24T00:00:01Z' }),
  });

  assert.equal(dispatch.decision.allow, true);
  assert.equal(dispatch.adapter_result.status, 'completed');
  assert.equal(dispatch.adapter_result.payload.schema_version, 'nexus.execution_result.p2.v1');
  assert.equal(dispatch.adapter_result.payload.provider_id, DSH_BASELINE_PROVIDER_ID);
  assert.equal(dispatch.adapter_result.payload.execution_outcome, 'completed');
  assert.equal(dispatch.adapter_result.payload.events.some((event) => event.event_type === 'tool.result'), true);
});

test('direct DshExecutorAdapter invocation fails without trusted Coordinator invocation', async () => {
  const adapter = new DshExecutorAdapter();
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
      payload: buildDshExecutionRequestFixture(),
      policy_decision: { action: 'adapter.invoke', allow: true },
    }),
    (error) => error instanceof AdapterError && error.code === 'PLATFORM_POLICY_DENIED',
  );
});

test('disabled provider fails before provider fixture execution', async () => {
  const registry = new DshProviderRegistry();
  registry.disable(DSH_BASELINE_PROVIDER_ID, 'P2-02 disabled provider integration test');
  const { coordinator } = coordinatorWithAdapter(new DshExecutorAdapter({ registry }));

  await assert.rejects(
    () => coordinator.dispatchToAdapter('task_alpha01', {
      adapter_name: 'dsh-executor',
      principal,
      payload: buildDshExecutionRequestFixture(),
    }),
    (error) => error.code === 'PLATFORM_SERVICE_UNHEALTHY',
  );
});

test('tool outside the platform allowlist returns blocked platform outcome', async () => {
  const { coordinator } = coordinatorWithAdapter();
  const request = buildDshExecutionRequestFixture();
  const dispatch = await coordinator.dispatchToAdapter('task_alpha01', {
    adapter_name: 'dsh-executor',
    principal,
    payload: {
      ...request,
      policy: { ...request.policy, allowed_tools: ['python'] },
    },
  });

  assert.equal(dispatch.adapter_result.status, 'failed');
  assert.equal(dispatch.adapter_result.payload.execution_outcome, 'blocked');
  assert.equal(dispatch.adapter_result.payload.execution_result.error.code, 'PLATFORM_POLICY_DENIED');
});
