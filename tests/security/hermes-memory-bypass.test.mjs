import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HERMES_MEMORY_PROXY_SCHEMA_VERSION,
  HermesMemoryGatewayAdapter,
  HermesMemoryGatewayAdapterError,
} from '../../platform/adapters/hermes/index.ts';
import { ManualClock } from '../../platform/clock/index.ts';
import { Coordinator } from '../../platform/coordinator/index.ts';
import { InMemoryEventBus } from '../../platform/event-bus/index.ts';
import { LocalMemoryGateway } from '../../platform/memory-gateway/index.ts';
import { PolicyGate } from '../../platform/policy-gate/index.ts';

const principal = Object.freeze({
  tenant_id: 'tenant_alpha01',
  user_id: 'user_alpha01',
  roles: ['operator'],
  permissions: ['task:submit', 'adapter:invoke'],
});

const scope = Object.freeze({
  tenant_id: 'tenant_alpha01',
  user_id: 'user_alpha01',
  agent_id: 'agent_alpha01',
  conversation_id: 'conv_alpha01',
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
    input: { kind: 'text', text: 'verify memory bypass rejection' },
    created_at_utc: '2026-08-24T00:00:00Z',
    monotonic_ms: 100,
  };
}

function payload(overrides = {}) {
  return {
    schema_version: HERMES_MEMORY_PROXY_SCHEMA_VERSION,
    operation: 'snapshot',
    scope: { ...scope },
    trace_id: 'trace_alpha01',
    requested_at_utc: '2026-08-24T00:00:01Z',
    ...overrides,
  };
}

function harness() {
  const clock = new ManualClock({ utc_timestamp: '2026-08-24T00:00:01.000Z', monotonic_ms: 200 });
  const eventBus = new InMemoryEventBus();
  const memoryGateway = new LocalMemoryGateway({ clock, eventBus });
  const adapter = new HermesMemoryGatewayAdapter({ memoryGateway, eventBus, clock });
  adapter.start();
  const coordinator = new Coordinator({ policyGate: new PolicyGate(), eventBus, clock });
  coordinator.registerAdapter(adapter);
  coordinator.submitTask(taskRequest(), { principal });
  return { coordinator, eventBus, memoryGateway };
}

test('Hermes memory proxy rejects direct native file path and credential bypass payloads', async () => {
  const cases = [
    payload({ operation: 'query', query: 'read MEMORY.md' }),
    payload({ operation: 'query', query: '../memories/USER.md' }),
    payload({ operation: 'query', query: 'https://native.example/session' }),
    payload({ operation: 'write', target: 'memory', action: 'add', content: 'read /opt/project/native/MEMORY.md' }),
    payload({ operation: 'write', target: 'memory', action: 'add', content: 'native_session_123 should never enter memory' }),
    payload({ operation: 'write', target: 'memory', action: 'add', content: 'api_key=plain_text_secret' }),
    payload({ operation: 'write', target: 'memory', action: 'add', content: 'password=plain_text_secret' }),
    payload({ operation: 'write', target: 'memory', action: 'add', content: 'secret-token should fail closed' }),
    payload({ operation: 'write', target: 'memory', action: 'add', content: 'Bearer abc.def.ghi' }),
    payload({ operation: 'write', target: 'memory', action: 'add', content: 'safe text', raw_credential: 'plain' }),
    payload({ operation: 'write', target: 'memory', action: 'add', content: 'safe text', native_error: 'native_error_disk_read' }),
    payload({ operation: 'write', target: 'memory', action: 'add', content: 'safe text', path: '/tmp/MEMORY.md' }),
  ];

  for (const unsafePayload of cases) {
    const { coordinator } = harness();
    await assert.rejects(
      () => coordinator.dispatchToAdapter('task_alpha01', {
        adapter_name: 'hermes-memory-gateway',
        principal,
        payload: unsafePayload,
      }),
      (error) => error instanceof HermesMemoryGatewayAdapterError && error.code === 'PLATFORM_INVALID_REQUEST',
    );
  }
});

test('Hermes memory proxy keeps unauthorized memory out while platform proxy path still passes', async () => {
  const { coordinator, eventBus, memoryGateway } = harness();
  memoryGateway.write({
    scope,
    layer: 'agent_skill',
    text: 'Approved planner memory',
    source: 'security',
    trace_id: 'trace_alpha01',
  });
  memoryGateway.write({
    scope: { ...scope, tenant_id: 'tenant_other01', conversation_id: 'conv_other01' },
    layer: 'agent_skill',
    text: 'unauthorized memory must not appear',
    source: 'security',
    trace_id: 'trace_alpha01',
  });

  const query = await coordinator.dispatchToAdapter('task_alpha01', {
    adapter_name: 'hermes-memory-gateway',
    principal,
    payload: payload({ operation: 'query', query: 'planner' }),
  });
  const serialized = JSON.stringify({ result: query.adapter_result.payload, events: eventBus.history() });
  assert.equal(query.adapter_result.status, 'completed');
  assert.equal(serialized.includes('Approved planner memory'), true);
  assert.equal(serialized.includes('unauthorized memory'), false);

  const write = await coordinator.dispatchToAdapter('task_alpha01', {
    adapter_name: 'hermes-memory-gateway',
    principal,
    payload: payload({ operation: 'write', target: 'user', action: 'add', content: 'Safe user preference' }),
  });
  assert.equal(write.adapter_result.payload.memory_ref.layer, 'user');

  await assert.rejects(
    () => coordinator.dispatchToAdapter('task_alpha01', {
      adapter_name: 'hermes-memory-gateway',
      principal,
      payload: payload({ scope: { ...scope, tenant_id: 'tenant_other01' } }),
    }),
    (error) => error instanceof HermesMemoryGatewayAdapterError && error.code === 'PLATFORM_POLICY_DENIED',
  );
});
