import assert from 'node:assert/strict';
import test from 'node:test';

import { invokeLifecycleAdapter } from '../../platform/adapters/index.ts';
import { buildDshExecutionRequestFixture, DshExecutorAdapter } from '../../platform/adapters/dsh/index.ts';
import { LocalArtifactStore } from '../../platform/artifact-store/index.ts';
import { ManualClock } from '../../platform/clock/index.ts';
import { InMemoryEventBus } from '../../platform/event-bus/index.ts';
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

async function invokeAdapter(adapter, payload) {
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

test('sandbox policy emits sandbox.denied and blocks unauthorized file and network requests', async () => {
  const eventBus = new InMemoryEventBus();
  const subscription = eventBus.subscribe({ subscriber: 'sandbox-audit', filter: { event_type: 'sandbox.denied' } });
  const adapter = new DshExecutorAdapter({ eventBus });
  adapter.start();

  const fileBlocked = await invokeAdapter(adapter, buildDshExecutionRequestFixture({
    tool: { name: 'bash', input: { command: 'cat /etc/passwd' } },
  }));
  assert.equal(fileBlocked.payload.execution_outcome, 'blocked');
  assert.equal(fileBlocked.payload.execution_result.error.code, 'PLATFORM_POLICY_DENIED');

  const networkBlocked = await invokeAdapter(adapter, buildDshExecutionRequestFixture({
    tool: { name: 'bash', input: { url: 'https://example.invalid/provider-native' } },
  }));
  assert.equal(networkBlocked.payload.execution_outcome, 'blocked');

  const deniedEvents = eventBus.pull(subscription.subscription_id);
  assert.equal(deniedEvents.length, 2);
  assert.ok(deniedEvents.every((delivery) => delivery.event.event_type === 'sandbox.denied'));
  assert.equal(JSON.stringify(deniedEvents).includes('https://'), false);
  assert.equal(JSON.stringify(deniedEvents).includes('/etc/passwd'), false);
});

test('stdout, stderr, artifact content, events, and errors redact credentials and native provider details', async () => {
  const eventBus = new InMemoryEventBus();
  const artifactStore = new LocalArtifactStore({
    clock: new ManualClock({ utc_timestamp: '2026-08-24T00:00:00.000Z', monotonic_ms: 300 }),
    eventBus,
  });
  const adapterWithRawProviderOutput = new DshExecutorAdapter({
    artifactStore,
    eventBus,
    providerRunner(providerRequest, provider) {
      return {
        schema_version: 'nexus.execution_result.p2.v1',
        tenant_id: providerRequest.tenant_id,
        task_id: providerRequest.task_id,
        attempt_id: providerRequest.attempt_id,
        execution_id: providerRequest.execution_id,
        trace_id: providerRequest.trace_id,
        provider_id: provider.provider_id,
        execution_outcome: 'completed',
        monotonic_ms: providerRequest.monotonic_ms + 1,
        completed_monotonic_ms: providerRequest.monotonic_ms + 1,
        events: [{
          schema_version: 'nexus.execution_event.p2.v1',
          execution_id: providerRequest.execution_id,
          trace_id: providerRequest.trace_id,
          provider_id: provider.provider_id,
          event_type: 'tool.result',
          status: 'completed',
          payload: { safe: 'kept', credential_ref: 'cred_alpha01_001', native_error: 'provider native failure' },
        }],
        artifacts: [],
        output: {
          stdout: 'stdout cred_alpha01_001 secret-token=alpha https://127.0.0.1/native /tmp/native-output session_id=raw',
          stderr: 'stderr password=beta native_error provider failed',
          artifact_candidates: [{
            kind: 'execution_output',
            content_type: 'text/plain',
            data: 'artifact api_key=gamma cred_alpha01_001 /workspace/native-file',
            classification: 'internal',
          }],
          safe: 'kept',
        },
      };
    },
  });
  adapterWithRawProviderOutput.start();

  const result = await invokeAdapter(adapterWithRawProviderOutput, buildDshExecutionRequestFixture());

  const serialized = JSON.stringify(result.payload);
  for (const forbidden of ['cred_alpha01_001', 'secret-token', 'password=beta', 'api_key=gamma', 'https://', '/tmp/', '/workspace/', 'session_id', 'native_error']) {
    assert.equal(serialized.includes(forbidden), false, `result leaked ${forbidden}`);
  }

  const artifacts = result.payload.execution_result.artifacts;
  assert.equal(artifacts.length, 3);
  for (const artifact of artifacts) {
    const readBack = artifactStore.read({ tenant_id: 'tenant_alpha01', artifact_id: artifact.artifact_id, trace_id: 'trace_alpha01' });
    const body = new TextDecoder().decode(readBack.data);
    for (const forbidden of ['cred_alpha01_001', 'secret-token', 'password=beta', 'api_key=gamma', 'https://', '/tmp/', '/workspace/', 'session_id', 'native_error']) {
      assert.equal(body.includes(forbidden), false, `artifact leaked ${forbidden}`);
    }
  }

  const eventJson = JSON.stringify(eventBus.history());
  assert.equal(eventJson.includes('cred_alpha01_001'), false);
  assert.equal(eventJson.includes('secret-token'), false);
  assert.equal(eventJson.includes('api_key=gamma'), false);
});
