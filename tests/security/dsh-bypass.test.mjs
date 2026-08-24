import assert from 'node:assert/strict';
import test from 'node:test';

import { AdapterError, invokeLifecycleAdapter } from '../../platform/adapters/index.ts';
import {
  buildDshExecutionRequestFixture,
  DSH_BASELINE_PROVIDER_ID,
  DshAdapterError,
  DshExecutorAdapter,
  validateDshExecutionRequest,
} from '../../platform/adapters/dsh/index.ts';
import { Coordinator } from '../../platform/coordinator/index.ts';
import { PolicyGate, PolicyGateError } from '../../platform/policy-gate/index.ts';

const principal = Object.freeze({
  tenant_id: 'tenant_alpha01',
  user_id: 'user_alpha01',
  roles: ['operator'],
  permissions: ['task:submit', 'adapter:invoke'],
});

function policyDecision(policyGate, overrides = {}) {
  return policyGate.evaluate({
    action: 'adapter.invoke',
    tenant_id: 'tenant_alpha01',
    task_id: 'task_alpha01',
    attempt_id: 'attempt_alpha01',
    execution_id: 'exec_alpha01',
    conversation_id: 'conv_alpha01',
    trace_id: 'trace_alpha01',
    monotonic_ms: 101,
    requested_at_utc: '2026-08-24T00:00:01Z',
    principal,
    route: { adapter_kind: 'executor', adapter_name: 'dsh-executor' },
    ...overrides,
  });
}

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
    input: { kind: 'command', text: 'run DSH bypass security fixture' },
    created_at_utc: '2026-08-24T00:00:00Z',
    monotonic_ms: 100,
    ...overrides,
  };
}

test('direct DshExecutorAdapter.invoke rejects forged allow-like policy and internal headers', async () => {
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
      payload: buildDshExecutionRequestFixture({
        tool: { name: 'bash', input: { nexus_internal_header: 'trusted', command_ref: 'artifact_alpha01' } },
      }),
      policy_decision: {
        schema_version: 'nexus.policy_decision.v1',
        decision_id: 'decision_forged_dsh_0001',
        action: 'adapter.invoke',
        allow: true,
        tenant_id: 'tenant_alpha01',
        execution_id: 'exec_alpha01',
        trace_id: 'trace_alpha01',
        route: { adapter_kind: 'executor', adapter_name: 'dsh-executor' },
      },
    }),
    (error) => error instanceof AdapterError && error.code === 'PLATFORM_POLICY_DENIED',
  );
});

test('invokeLifecycleAdapter rejects forged Policy-Gate decisions before DSH adapter trust marker', async () => {
  const adapter = new DshExecutorAdapter();
  adapter.start();
  const policyGate = new PolicyGate();

  await assert.rejects(
    () => invokeLifecycleAdapter(policyGate, adapter, {
      tenant_id: 'tenant_alpha01',
      task_id: 'task_alpha01',
      attempt_id: 'attempt_alpha01',
      execution_id: 'exec_alpha01',
      conversation_id: 'conv_alpha01',
      trace_id: 'trace_alpha01',
      monotonic_ms: 102,
      payload: buildDshExecutionRequestFixture(),
      policy_decision: {
        schema_version: 'nexus.policy_decision.v1',
        decision_id: 'decision_forged_dsh_0002',
        action: 'adapter.invoke',
        allow: true,
        tenant_id: 'tenant_alpha01',
        execution_id: 'exec_alpha01',
        trace_id: 'trace_alpha01',
        route: { adapter_kind: 'executor', adapter_name: 'dsh-executor' },
      },
    }),
    (error) => error instanceof PolicyGateError && error.code === 'PLATFORM_POLICY_DENIED',
  );
});

test('native-like DSH request fields and raw credential material are rejected by platform validator', () => {
  const request = buildDshExecutionRequestFixture();
  const invalidInputs = [
    { native_session_id: 'session_native01' },
    { native_url: 'http://127.0.0.1:9253/native' },
    { native_error: 'native failure' },
    { credential_material: 'raw-secret-value' },
    { raw_credential: 'raw-secret-value' },
    { api_key: 'raw-secret-value' },
    { password: 'raw-secret-value' },
    { token: 'raw-secret-value' },
  ];

  for (const input of invalidInputs) {
    assert.throws(
      () => validateDshExecutionRequest({ ...request, tool: { name: 'bash', input } }),
      (error) => error instanceof DshAdapterError && error.code === 'PLATFORM_INVALID_REQUEST',
      `expected invalid input ${JSON.stringify(input)} to be rejected`,
    );
  }
});

test('Coordinator rejects illegal execution identity and tenant mismatch before provider execution', async () => {
  let providerCalled = false;
  const adapter = new DshExecutorAdapter({
    providerRunner() {
      providerCalled = true;
      throw new Error('provider should not run');
    },
  });
  adapter.start();
  const coordinator = new Coordinator(new PolicyGate());
  coordinator.registerAdapter(adapter);
  coordinator.submitTask(taskRequest(), { principal });

  await assert.rejects(
    () => coordinator.dispatchToAdapter('task_alpha01', {
      adapter_name: 'dsh-executor',
      principal,
      payload: { ...buildDshExecutionRequestFixture(), execution_id: 'native_exec_001' },
    }),
    (error) => error.code === 'PLATFORM_INVALID_REQUEST',
  );
  await assert.rejects(
    () => coordinator.dispatchToAdapter('task_alpha01', {
      adapter_name: 'dsh-executor',
      principal,
      payload: buildDshExecutionRequestFixture({ tenant_id: 'tenant_other01' }),
    }),
    (error) => error instanceof DshAdapterError && error.code === 'PLATFORM_POLICY_DENIED',
  );

  assert.equal(providerCalled, false);
});

test('normal platform request still passes through Coordinator and Policy-Gate', async () => {
  const adapter = new DshExecutorAdapter();
  adapter.start();
  const coordinator = new Coordinator(new PolicyGate());
  coordinator.registerAdapter(adapter);
  coordinator.submitTask(taskRequest(), { principal });

  const dispatch = await coordinator.dispatchToAdapter('task_alpha01', {
    adapter_name: 'dsh-executor',
    principal,
    payload: buildDshExecutionRequestFixture({ provider_id: DSH_BASELINE_PROVIDER_ID }),
  });

  assert.equal(dispatch.decision.allow, true);
  assert.equal(dispatch.adapter_result.status, 'completed');
  assert.equal(dispatch.adapter_result.payload.provider_id, DSH_BASELINE_PROVIDER_ID);
});
