import assert from 'node:assert/strict';
import test from 'node:test';

import { invokeLifecycleAdapter } from '../../platform/adapters/index.ts';
import {
  HERMES_MEMORY_PROXY_SCHEMA_VERSION,
  HermesMemoryGatewayAdapter,
  HermesMemoryGatewayAdapterError,
  HermesProviderRegistry,
  HERMES_BASELINE_PROVIDER_ID,
} from '../../platform/adapters/hermes/index.ts';
import { ManualClock } from '../../platform/clock/index.ts';
import { Coordinator } from '../../platform/coordinator/index.ts';
import { InMemoryEventBus } from '../../platform/event-bus/index.ts';
import { LocalMemoryGateway } from '../../platform/memory-gateway/index.ts';
import { PolicyGate, PolicyGateError } from '../../platform/policy-gate/index.ts';

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
    input: { kind: 'text', text: 'load planner memory through the platform proxy' },
    created_at_utc: '2026-08-24T00:00:00Z',
    monotonic_ms: 100,
    ...overrides,
  };
}

function proxyPayload(overrides = {}) {
  return {
    schema_version: HERMES_MEMORY_PROXY_SCHEMA_VERSION,
    operation: 'snapshot',
    scope: {
      tenant_id: 'tenant_alpha01',
      user_id: 'user_alpha01',
      agent_id: 'agent_alpha01',
      conversation_id: 'conv_alpha01',
    },
    trace_id: 'trace_alpha01',
    requested_at_utc: '2026-08-24T00:00:01Z',
    ...overrides,
  };
}

function harness() {
  const clock = new ManualClock({ utc_timestamp: '2026-08-24T00:00:01.000Z', monotonic_ms: 200 });
  const eventBus = new InMemoryEventBus();
  const memoryGateway = new LocalMemoryGateway({ clock, eventBus });
  const registry = new HermesProviderRegistry();
  const adapter = new HermesMemoryGatewayAdapter({ registry, memoryGateway, eventBus, clock });
  adapter.start();
  const coordinator = new Coordinator({ policyGate: new PolicyGate(), eventBus, clock });
  coordinator.registerAdapter(adapter);
  coordinator.submitTask(taskRequest(), { principal });
  return { adapter, coordinator, eventBus, memoryGateway, registry };
}

test('HermesMemoryGatewayAdapter snapshots queries and writes through Coordinator and Policy-Gate', async () => {
  const { coordinator, eventBus, memoryGateway } = harness();
  memoryGateway.write({ scope: proxyPayload().scope, layer: 'agent_skill', text: 'Planner should use platform memory', source: 'integration', trace_id: 'trace_alpha01' });

  const snapshot = await coordinator.dispatchToAdapter('task_alpha01', {
    adapter_name: 'hermes-memory-gateway',
    principal,
    payload: proxyPayload(),
  });
  assert.equal(snapshot.adapter_result.status, 'completed');
  assert.equal(snapshot.adapter_result.payload.operation, 'snapshot');
  assert.equal(snapshot.adapter_result.payload.rendered.agent_skill.includes('platform memory'), true);

  const write = await coordinator.dispatchToAdapter('task_alpha01', {
    adapter_name: 'hermes-memory-gateway',
    principal,
    payload: proxyPayload({ operation: 'write', target: 'user', action: 'add', content: 'User likes terse handoffs' }),
  });
  assert.equal(write.adapter_result.payload.memory_ref.layer, 'user');

  const query = await coordinator.dispatchToAdapter('task_alpha01', {
    adapter_name: 'hermes-memory-gateway',
    principal,
    payload: proxyPayload({ operation: 'query', query: 'terse' }),
  });
  assert.equal(query.adapter_result.payload.records.length, 1);
  assert.equal(eventBus.history().some((entry) => entry.event.event_type === 'audit.recorded'), true);
});

test('HermesMemoryGatewayAdapter rejects direct invocation and forged policy decisions', async () => {
  const { adapter } = harness();
  await assert.rejects(
    () => adapter.invoke({
      tenant_id: 'tenant_alpha01',
      task_id: 'task_alpha01',
      attempt_id: 'attempt_alpha01',
      execution_id: 'exec_alpha01',
      conversation_id: 'conv_alpha01',
      trace_id: 'trace_alpha01',
      monotonic_ms: 101,
      payload: proxyPayload(),
    }),
    /Coordinator and Policy-Gate/,
  );

  await assert.rejects(
    () => invokeLifecycleAdapter(new PolicyGate(), adapter, {
      tenant_id: 'tenant_alpha01',
      task_id: 'task_alpha01',
      attempt_id: 'attempt_alpha01',
      execution_id: 'exec_alpha01',
      conversation_id: 'conv_alpha01',
      trace_id: 'trace_alpha01',
      monotonic_ms: 101,
      payload: proxyPayload(),
      policy_decision: { action: 'adapter.invoke', allow: true, tenant_id: 'tenant_alpha01', execution_id: 'exec_alpha01', trace_id: 'trace_alpha01' },
    }),
    (error) => error instanceof PolicyGateError && error.code === 'PLATFORM_POLICY_DENIED',
  );
});

test('HermesMemoryGatewayAdapter fails closed for disabled provider and mismatched scope', async () => {
  const { coordinator, registry } = harness();
  registry.disable(HERMES_BASELINE_PROVIDER_ID, 'P3-02 integration drill');

  await assert.rejects(
    () => coordinator.dispatchToAdapter('task_alpha01', {
      adapter_name: 'hermes-memory-gateway',
      principal,
      payload: proxyPayload(),
    }),
    /Planner provider is disabled/,
  );

  const second = harness();
  await assert.rejects(
    () => second.coordinator.dispatchToAdapter('task_alpha01', {
      adapter_name: 'hermes-memory-gateway',
      principal,
      payload: proxyPayload({ scope: { ...proxyPayload().scope, conversation_id: 'conv_other01' } }),
    }),
    (error) => error instanceof HermesMemoryGatewayAdapterError && error.code === 'PLATFORM_POLICY_DENIED',
  );
});
