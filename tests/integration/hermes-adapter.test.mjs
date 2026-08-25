import assert from 'node:assert/strict';
import test from 'node:test';

import { invokeLifecycleAdapter } from '../../platform/adapters/index.ts';
import {
  buildHermesExecutionPlanFixture,
  HERMES_MEMORY_PROXY_SCHEMA_VERSION,
  HermesExecutionPlanAdapter,
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

const scope = Object.freeze({
  tenant_id: 'tenant_alpha01',
  user_id: 'user_alpha01',
  agent_id: 'agent_alpha01',
  conversation_id: 'conv_alpha01',
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
    input: { kind: 'text', text: 'plan with platform memory context' },
    created_at_utc: '2026-08-24T00:00:00Z',
    monotonic_ms: 100,
    ...overrides,
  };
}

function memoryPayload(overrides = {}) {
  return {
    schema_version: HERMES_MEMORY_PROXY_SCHEMA_VERSION,
    operation: 'snapshot',
    scope: { ...scope },
    trace_id: 'trace_alpha01',
    requested_at_utc: '2026-08-24T00:00:01Z',
    ...overrides,
  };
}

function planPayload(overrides = {}) {
  const fixture = buildHermesExecutionPlanFixture({
    trace: { ...buildHermesExecutionPlanFixture().trace, source: 'adapter_validation' },
  });
  return { ...fixture, ...overrides };
}

function harness() {
  const clock = new ManualClock({ utc_timestamp: '2026-08-24T00:00:01.000Z', monotonic_ms: 200 });
  const eventBus = new InMemoryEventBus();
  const registry = new HermesProviderRegistry();
  const memoryGateway = new LocalMemoryGateway({ clock, eventBus });
  const planAdapter = new HermesExecutionPlanAdapter({ registry });
  const memoryAdapter = new HermesMemoryGatewayAdapter({ registry, memoryGateway, eventBus, clock });
  planAdapter.start();
  memoryAdapter.start();
  const coordinator = new Coordinator({ policyGate: new PolicyGate(), eventBus, clock });
  coordinator.registerAdapter(planAdapter);
  coordinator.registerAdapter(memoryAdapter);
  coordinator.submitTask(taskRequest(), { principal });
  return { coordinator, eventBus, memoryGateway, planAdapter, memoryAdapter, registry };
}

test('Hermes planner and memory adapters compose through Coordinator Policy-Gate and Memory Gateway', async () => {
  const { coordinator, eventBus, memoryGateway } = harness();
  memoryGateway.write({ scope, layer: 'agent_skill', text: 'Use platform memory only', source: 'integration', trace_id: 'trace_alpha01' });

  const snapshot = await coordinator.dispatchToAdapter('task_alpha01', {
    adapter_name: 'hermes-memory-gateway',
    principal,
    payload: memoryPayload(),
  });
  assert.equal(snapshot.adapter_result.status, 'completed');
  assert.equal(snapshot.adapter_result.payload.operation, 'snapshot');
  assert.equal(snapshot.adapter_result.payload.rendered.agent_skill.includes('platform memory'), true);

  const write = await coordinator.dispatchToAdapter('task_alpha01', {
    adapter_name: 'hermes-memory-gateway',
    principal,
    payload: memoryPayload({ operation: 'write', target: 'session', action: 'add', content: 'Session context stays proxied' }),
  });
  assert.equal(write.adapter_result.payload.memory_ref.layer, 'session');

  const plan = await coordinator.dispatchToAdapter('task_alpha01', {
    adapter_name: 'hermes-execution-plan',
    principal,
    payload: planPayload(),
  });
  assert.equal(plan.adapter_result.status, 'completed');
  assert.equal(plan.adapter_result.payload.plan_status, 'validated');
  assert.equal(plan.adapter_result.payload.execution_plan.memory_context.direct_memory_access, 'blocked');
  assert.equal(eventBus.history().some((entry) => entry.event.event_type === 'audit.recorded'), true);
});

test('Hermes adapters reject direct invocation and forged Policy-Gate decisions', async () => {
  const { memoryAdapter, planAdapter } = harness();

  await assert.rejects(
    () => memoryAdapter.invoke({
      tenant_id: 'tenant_alpha01',
      task_id: 'task_alpha01',
      attempt_id: 'attempt_alpha01',
      execution_id: 'exec_alpha01',
      conversation_id: 'conv_alpha01',
      trace_id: 'trace_alpha01',
      monotonic_ms: 201,
      payload: memoryPayload(),
    }),
    /Coordinator and Policy-Gate/,
  );
  await assert.rejects(
    () => planAdapter.invoke({
      tenant_id: 'tenant_alpha01',
      task_id: 'task_alpha01',
      attempt_id: 'attempt_alpha01',
      execution_id: 'exec_alpha01',
      conversation_id: 'conv_alpha01',
      trace_id: 'trace_alpha01',
      monotonic_ms: 201,
      payload: planPayload(),
    }),
    /Coordinator and Policy-Gate/,
  );

  await assert.rejects(
    () => invokeLifecycleAdapter(new PolicyGate(), memoryAdapter, {
      tenant_id: 'tenant_alpha01',
      task_id: 'task_alpha01',
      attempt_id: 'attempt_alpha01',
      execution_id: 'exec_alpha01',
      conversation_id: 'conv_alpha01',
      trace_id: 'trace_alpha01',
      monotonic_ms: 201,
      payload: memoryPayload(),
      policy_decision: { action: 'adapter.invoke', allow: true, tenant_id: 'tenant_alpha01', execution_id: 'exec_alpha01', trace_id: 'trace_alpha01' },
    }),
    (error) => error instanceof PolicyGateError && error.code === 'PLATFORM_POLICY_DENIED',
  );
});

test('Hermes adapters fail closed for disabled provider and identity mismatch', async () => {
  const disabled = harness();
  disabled.registry.disable(HERMES_BASELINE_PROVIDER_ID, 'P3-04 integration drill');
  await assert.rejects(
    () => disabled.coordinator.dispatchToAdapter('task_alpha01', {
      adapter_name: 'hermes-memory-gateway',
      principal,
      payload: memoryPayload(),
    }),
    /Planner provider is disabled/,
  );
  await assert.rejects(
    () => disabled.coordinator.dispatchToAdapter('task_alpha01', {
      adapter_name: 'hermes-execution-plan',
      principal,
      payload: planPayload(),
    }),
    /Planner provider is disabled/,
  );

  const mismatched = harness();
  await assert.rejects(
    () => mismatched.coordinator.dispatchToAdapter('task_alpha01', {
      adapter_name: 'hermes-memory-gateway',
      principal,
      payload: memoryPayload({ scope: { ...scope, conversation_id: 'conv_other01' } }),
    }),
    (error) => error instanceof HermesMemoryGatewayAdapterError && error.code === 'PLATFORM_POLICY_DENIED',
  );
  await assert.rejects(
    () => mismatched.coordinator.dispatchToAdapter('task_alpha01', {
      adapter_name: 'hermes-execution-plan',
      principal,
      payload: planPayload({ tenant_id: 'tenant_other01' }),
    }),
    /identity does not match/,
  );
});
