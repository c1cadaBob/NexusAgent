import assert from 'node:assert/strict';
import test from 'node:test';

import { HERMES_MEMORY_PROXY_SCHEMA_VERSION, HermesMemoryGatewayAdapter, HermesMemoryGatewayAdapterError } from '../../platform/adapters/hermes/index.ts';
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
    input: { kind: 'text', text: 'verify memory isolation before planning' },
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

test('Hermes planner snapshot excludes unauthorized memory and sanitizes native markers', async () => {
  const { coordinator, eventBus, memoryGateway } = harness();
  memoryGateway.write({
    scope,
    layer: 'agent_skill',
    text: 'Never read MEMORY.md from /tmp/native secret-token native_session_123',
    source: 'security',
    trace_id: 'trace_alpha01',
  });
  memoryGateway.write({
    scope: { ...scope, user_id: 'user_other01' },
    layer: 'user',
    text: 'unauthorized memory must not cross user scope',
    source: 'security',
    trace_id: 'trace_alpha01',
  });

  const dispatch = await coordinator.dispatchToAdapter('task_alpha01', {
    adapter_name: 'hermes-memory-gateway',
    principal,
    payload: payload(),
  });
  const serialized = JSON.stringify({ result: dispatch.adapter_result.payload, events: eventBus.history() });

  for (const forbidden of ['MEMORY.md', 'USER.md', '/tmp/native', 'secret-token', 'native_session_123', 'unauthorized memory']) {
    assert.equal(serialized.includes(forbidden), false, `leaked ${forbidden}`);
  }
  assert.equal(serialized.includes('[BLOCKED: memory entry contained unsafe or non-platform content.'), true);
});

test('Hermes memory proxy rejects native-like payload fields before provider work', async () => {
  const { coordinator } = harness();
  await assert.rejects(
    () => coordinator.dispatchToAdapter('task_alpha01', {
      adapter_name: 'hermes-memory-gateway',
      principal,
      payload: payload({
        operation: 'write',
        target: 'memory',
        action: 'add',
        content: 'safe text',
        native_session_id: 'native_session_123',
      }),
    }),
    (error) => error instanceof HermesMemoryGatewayAdapterError && error.code === 'PLATFORM_INVALID_REQUEST',
  );
});
