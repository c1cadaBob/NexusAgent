import assert from 'node:assert/strict';
import test from 'node:test';

import { invokeLifecycleAdapter } from '../../platform/adapters/index.ts';
import {
  buildDshExecutionRequestFixture,
  DshAdapterError,
  DshExecutorAdapter,
  validateDshExecutionRequest,
} from '../../platform/adapters/dsh/index.ts';
import { runDsh011Rc2ProviderFixture } from '../../platform/adapters/dsh/providers/dsh-0.1.1-rc.2/index.ts';
import { PolicyGate } from '../../platform/policy-gate/index.ts';

function policyDecision(policyGate) {
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
    principal: {
      tenant_id: 'tenant_alpha01',
      user_id: 'user_alpha01',
      roles: ['operator'],
      permissions: ['adapter:invoke'],
    },
    route: { adapter_kind: 'executor', adapter_name: 'dsh-executor' },
  });
}

async function invokeAdapter(payload, providerRunner) {
  const adapter = new DshExecutorAdapter({ providerRunner });
  adapter.start();
  const policyGate = new PolicyGate();
  return invokeLifecycleAdapter(policyGate, adapter, {
    tenant_id: 'tenant_alpha01',
    task_id: 'task_alpha01',
    attempt_id: 'attempt_alpha01',
    execution_id: 'exec_alpha01',
    conversation_id: 'conv_alpha01',
    trace_id: 'trace_alpha01',
    monotonic_ms: 102,
    payload,
    policy_decision: policyDecision(policyGate),
  });
}

test('ExecutionRequest resource_budget is required and range checked', () => {
  const request = buildDshExecutionRequestFixture();
  const withoutBudget = { ...request };
  delete withoutBudget.resource_budget;

  assert.throws(
    () => validateDshExecutionRequest(withoutBudget),
    (error) => error instanceof DshAdapterError && error.code === 'PLATFORM_INVALID_REQUEST',
  );
  assert.throws(
    () => validateDshExecutionRequest({ ...request, resource_budget: { ...request.resource_budget, timeout_ms: 0 } }),
    (error) => error instanceof DshAdapterError && error.code === 'PLATFORM_INVALID_REQUEST',
  );
  assert.throws(
    () => validateDshExecutionRequest({ ...request, resource_budget: { ...request.resource_budget, max_stdout_bytes: -1 } }),
    (error) => error instanceof DshAdapterError && error.code === 'PLATFORM_INVALID_REQUEST',
  );
});

test('deny_by_default sandbox blocks raw file access before provider execution', async () => {
  let providerCalled = false;
  const request = buildDshExecutionRequestFixture({
    tool: { name: 'bash', input: { file_access: { mode: 'read', path: '/etc/passwd' } } },
  });

  const result = await invokeAdapter(request, () => {
    providerCalled = true;
    throw new Error('provider should not run');
  });

  assert.equal(providerCalled, false);
  assert.equal(result.status, 'failed');
  assert.equal(result.payload.execution_outcome, 'blocked');
  assert.equal(result.payload.execution_result.error.code, 'PLATFORM_POLICY_DENIED');
  assert.equal(result.payload.events[0].event_type, 'execution.blocked');
});

test('raw network targets are blocked before provider execution', async () => {
  let providerCalled = false;
  const request = buildDshExecutionRequestFixture({
    tool: { name: 'bash', input: { network_access: { url: 'https://example.invalid/native' } } },
  });

  const result = await invokeAdapter(request, () => {
    providerCalled = true;
    throw new Error('provider should not run');
  });

  assert.equal(providerCalled, false);
  assert.equal(result.payload.execution_outcome, 'blocked');
  assert.equal(result.payload.execution_result.error.details.reason, 'network.denied');
});

test('workspace_readonly allows readonly workspace-relative file references', async () => {
  let providerCalled = false;
  const request = buildDshExecutionRequestFixture({
    sandbox_policy: { mode: 'required', file_system: 'workspace_readonly' },
    tool: { name: 'bash', input: { file_access: { mode: 'read', path: 'workspace/input.txt' } } },
  });

  const result = await invokeAdapter(request, (providerRequest, provider) => {
    providerCalled = true;
    return runDsh011Rc2ProviderFixture(providerRequest, provider);
  });

  assert.equal(providerCalled, true);
  assert.equal(result.payload.execution_outcome, 'completed');
});

test('provider timeout and output size budget violations map to platform errors', async () => {
  const timedOutRequest = buildDshExecutionRequestFixture({
    resource_budget: { timeout_ms: 1, max_stdout_bytes: 100, max_stderr_bytes: 100, max_artifact_bytes: 100 },
  });
  const timeout = await invokeAdapter(timedOutRequest, (providerRequest, provider) => ({
    ...runDsh011Rc2ProviderFixture(providerRequest, provider),
    completed_monotonic_ms: providerRequest.monotonic_ms + 10,
  }));
  assert.equal(timeout.payload.execution_result.error.code, 'PLATFORM_TIMEOUT');
  assert.equal(timeout.payload.execution_outcome, 'failed');

  const sizeRequest = buildDshExecutionRequestFixture({
    resource_budget: { timeout_ms: 100, max_stdout_bytes: 3, max_stderr_bytes: 100, max_artifact_bytes: 100 },
  });
  const oversized = await invokeAdapter(sizeRequest, (providerRequest, provider) => ({
    ...runDsh011Rc2ProviderFixture(providerRequest, provider),
    output: { stdout: 'too large' },
  }));
  assert.equal(oversized.payload.execution_result.error.code, 'PLATFORM_POLICY_DENIED');
  assert.equal(oversized.payload.execution_result.error.details.stream_name, 'stdout');
});
