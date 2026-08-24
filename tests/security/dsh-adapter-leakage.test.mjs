import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDshExecutionRequestFixture,
  DshExecutorAdapter,
} from '../../platform/adapters/dsh/index.ts';
import { invokeLifecycleAdapter } from '../../platform/adapters/index.ts';
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

test('DshExecutorAdapter strips native provider URLs, sessions, paths, and plaintext secret fields', async () => {
  const request = buildDshExecutionRequestFixture();
  const adapter = new DshExecutorAdapter({
    providerRunner(providerRequest, provider) {
      return {
        schema_version: 'nexus.execution_result.p2.v1',
        tenant_id: providerRequest.tenant_id,
        task_id: providerRequest.task_id,
        attempt_id: providerRequest.attempt_id,
        execution_id: providerRequest.execution_id,
        trace_id: providerRequest.trace_id,
        provider_id: provider.provider_id,
        execution_outcome: 'failed',
        monotonic_ms: providerRequest.monotonic_ms + 1,
        completed_monotonic_ms: providerRequest.monotonic_ms + 1,
        events: [{
          schema_version: 'nexus.execution_event.p2.v1',
          execution_id: providerRequest.execution_id,
          trace_id: providerRequest.trace_id,
          provider_id: provider.provider_id,
          event_type: 'tool.result',
          status: 'failed',
          payload: {
            safe: 'kept',
            native_url: 'http://127.0.0.1:9252/native',
            native_path: '/tmp/native-output',
            nested: { session_id: 'native-session' },
          },
        }],
        artifacts: [],
        output: {
          safe: 'kept',
          native_url: 'http://127.0.0.1:9252/native',
          vendor_path: '/workspace/provider/file',
          plaintext: 'secret-token',
        },
        error: {
          code: 'NATIVE_PROVIDER_ERROR',
          message: 'native_error at http://127.0.0.1/session/1',
          trace_id: providerRequest.trace_id,
          details: {
            safe: 'kept',
            native_session_id: 'native-session',
            secret_value: 'secret-token',
          },
        },
      };
    },
  });
  adapter.start();
  const policyGate = new PolicyGate();

  const result = await invokeLifecycleAdapter(policyGate, adapter, {
    tenant_id: 'tenant_alpha01',
    task_id: 'task_alpha01',
    attempt_id: 'attempt_alpha01',
    execution_id: 'exec_alpha01',
    conversation_id: 'conv_alpha01',
    trace_id: 'trace_alpha01',
    monotonic_ms: 102,
    payload: request,
    policy_decision: policyDecision(policyGate),
  });

  const serialized = JSON.stringify(result.payload);
  for (const forbidden of ['http://', 'https://', 'native_url', 'native_path', 'session_id', '/tmp/', '/workspace/', 'secret_value', 'plaintext']) {
    assert.equal(serialized.includes(forbidden), false, `leaked ${forbidden}`);
  }
  assert.equal(result.payload.execution_result.output.safe, 'kept');
  assert.equal(result.payload.execution_result.error.code, 'PLATFORM_INTERNAL_ERROR');
  assert.deepEqual(result.payload.execution_result.error.details, { safe: 'kept' });
});
