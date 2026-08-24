import assert from 'node:assert/strict';
import test from 'node:test';

import {
  baselineDshProviderMetadata,
  buildDshExecutionRequestFixture,
  DSH_BASELINE_PROVIDER_ID,
  DshAdapterError,
  DshExecutorAdapter,
  DshProviderRegistry,
} from '../../platform/adapters/dsh/index.ts';
import { runDsh011Rc2ProviderFixture } from '../../platform/adapters/dsh/providers/dsh-0.1.1-rc.2/index.ts';
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
    input: { kind: 'command', text: 'run DSH failover fixture' },
    created_at_utc: '2026-08-24T00:00:00Z',
    monotonic_ms: 100,
  };
}

function coordinatorWithAdapter(adapter) {
  adapter.start();
  const coordinator = new Coordinator(new PolicyGate());
  coordinator.registerAdapter(adapter);
  coordinator.submitTask(taskRequest(), { principal });
  return coordinator;
}

test('DshExecutorAdapter rolls back from a failing canary provider to previous baseline provider', async () => {
  const canaryProviderId = 'dsh-0.1.1-rc.2-canary';
  const registry = new DshProviderRegistry([
    baselineDshProviderMetadata(),
    baselineDshProviderMetadata({ provider_id: canaryProviderId, source: 'test-fixture' }),
  ]);
  const adapter = new DshExecutorAdapter({
    registry,
    providerRunner(request, provider) {
      if (provider.provider_id === canaryProviderId) {
        throw new Error('canary provider unavailable');
      }
      return runDsh011Rc2ProviderFixture(request, provider);
    },
  });
  const coordinator = coordinatorWithAdapter(adapter);

  const baseline = await coordinator.dispatchToAdapter('task_alpha01', {
    adapter_name: 'dsh-executor',
    principal,
    payload: buildDshExecutionRequestFixture({ provider_id: DSH_BASELINE_PROVIDER_ID }),
  });
  assert.equal(baseline.adapter_result.payload.provider_id, DSH_BASELINE_PROVIDER_ID);
  assert.equal(baseline.adapter_result.status, 'completed');

  registry.selectDefault(canaryProviderId);
  await assert.rejects(
    () => coordinator.dispatchToAdapter('task_alpha01', {
      adapter_name: 'dsh-executor',
      principal,
      payload: buildDshExecutionRequestFixture({ provider_id: canaryProviderId }),
    }),
    (error) => error instanceof DshAdapterError && error.code === 'PLATFORM_INTERNAL_ERROR',
  );

  const rolledBack = registry.rollbackDefault();
  assert.equal(rolledBack.provider_id, DSH_BASELINE_PROVIDER_ID);
  const recovered = await coordinator.dispatchToAdapter('task_alpha01', {
    adapter_name: 'dsh-executor',
    principal,
    payload: buildDshExecutionRequestFixture({ provider_id: DSH_BASELINE_PROVIDER_ID }),
  });
  assert.equal(recovered.adapter_result.payload.provider_id, DSH_BASELINE_PROVIDER_ID);
  assert.equal(recovered.adapter_result.payload.execution_outcome, 'completed');
});

test('disabled canary provider cannot bypass Policy-Gate and does not run provider fixture', async () => {
  const canaryProviderId = 'dsh-0.1.1-rc.2-canary';
  const registry = new DshProviderRegistry([
    baselineDshProviderMetadata(),
    baselineDshProviderMetadata({ provider_id: canaryProviderId, source: 'test-fixture' }),
  ]);
  registry.selectDefault(canaryProviderId);
  registry.disable(canaryProviderId, 'P2-04 disabled canary rollback drill');
  let providerCalled = false;
  const adapter = new DshExecutorAdapter({
    registry,
    providerRunner(request, provider) {
      providerCalled = true;
      return runDsh011Rc2ProviderFixture(request, provider);
    },
  });
  const coordinator = coordinatorWithAdapter(adapter);

  await assert.rejects(
    () => coordinator.dispatchToAdapter('task_alpha01', {
      adapter_name: 'dsh-executor',
      principal,
      payload: buildDshExecutionRequestFixture({ provider_id: canaryProviderId }),
    }),
    (error) => error.code === 'PLATFORM_SERVICE_UNHEALTHY',
  );
  assert.equal(providerCalled, false);

  registry.rollbackDefault();
  const recovered = await coordinator.dispatchToAdapter('task_alpha01', {
    adapter_name: 'dsh-executor',
    principal,
    payload: buildDshExecutionRequestFixture({ provider_id: DSH_BASELINE_PROVIDER_ID }),
  });
  assert.equal(recovered.adapter_result.status, 'completed');
});
