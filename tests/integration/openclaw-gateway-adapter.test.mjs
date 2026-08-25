import assert from 'node:assert/strict';
import test from 'node:test';

import { invokeLifecycleAdapter } from '../../platform/adapters/index.ts';
import {
  buildOpenClawGatewayEventFixture,
  OpenClawGatewayAdapter,
  OpenClawGatewayAdapterError,
  OpenClawProviderRegistry,
  OPENCLAW_BASELINE_PROVIDER_ID,
} from '../../platform/adapters/openclaw/index.ts';
import { ManualClock } from '../../platform/clock/index.ts';
import { Coordinator } from '../../platform/coordinator/index.ts';
import { InMemoryEventBus } from '../../platform/event-bus/index.ts';
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
    input: { kind: 'text', text: 'channel gateway ingress' },
    created_at_utc: '2026-08-25T00:00:00Z',
    monotonic_ms: 100,
    ...overrides,
  };
}

function harness() {
  const clock = new ManualClock({ utc_timestamp: '2026-08-25T00:00:01.000Z', monotonic_ms: 200 });
  const eventBus = new InMemoryEventBus();
  const registry = new OpenClawProviderRegistry();
  const adapter = new OpenClawGatewayAdapter({ registry, eventBus });
  adapter.start();
  const coordinator = new Coordinator({ policyGate: new PolicyGate(), eventBus, clock });
  coordinator.registerAdapter(adapter);
  coordinator.submitTask(taskRequest(), { principal });
  return { adapter, coordinator, eventBus, registry };
}

test('OpenClawGatewayAdapter accepts normalized channel event only through Coordinator and Policy-Gate', async () => {
  const { coordinator, eventBus } = harness();
  const result = await coordinator.dispatchToAdapter('task_alpha01', {
    adapter_name: 'openclaw-gateway',
    principal,
    payload: buildOpenClawGatewayEventFixture(),
  });

  assert.equal(result.adapter_result.status, 'completed');
  assert.equal(result.adapter_result.payload.gateway_outcome, 'handoff');
  assert.equal(result.adapter_result.payload.provider_id, OPENCLAW_BASELINE_PROVIDER_ID);
  assert.equal(result.adapter_result.payload.channel_event.channel.name, 'dingtalk');
  assert.equal(result.adapter_result.payload.task_handoff.schema_version, 'nexus.task_request.v1');
  assert.equal(result.adapter_result.payload.native_agent_runtime, 'blocked');
  assert.equal(result.adapter_result.payload.native_tool_runtime, 'blocked');
  assert.equal(eventBus.history().some((entry) => entry.event.producer.service === 'openclaw-adapter'), true);
});

test('OpenClawGatewayAdapter rejects direct invocation and forged Policy-Gate decisions', async () => {
  const { adapter } = harness();

  await assert.rejects(
    () => adapter.invoke({
      tenant_id: 'tenant_alpha01',
      task_id: 'task_alpha01',
      attempt_id: 'attempt_alpha01',
      execution_id: 'exec_alpha01',
      conversation_id: 'conv_alpha01',
      trace_id: 'trace_alpha01',
      monotonic_ms: 201,
      payload: buildOpenClawGatewayEventFixture(),
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
      monotonic_ms: 201,
      payload: buildOpenClawGatewayEventFixture(),
      policy_decision: { action: 'adapter.invoke', allow: true, tenant_id: 'tenant_alpha01', execution_id: 'exec_alpha01', trace_id: 'trace_alpha01' },
    }),
    (error) => error instanceof PolicyGateError && error.code === 'PLATFORM_POLICY_DENIED',
  );
});

test('OpenClawGatewayAdapter fails closed for disabled provider and tenant mismatch', async () => {
  const disabled = harness();
  disabled.registry.disable(OPENCLAW_BASELINE_PROVIDER_ID, 'P4-01 disable drill');
  await assert.rejects(
    () => disabled.coordinator.dispatchToAdapter('task_alpha01', {
      adapter_name: 'openclaw-gateway',
      principal,
      payload: buildOpenClawGatewayEventFixture(),
    }),
    /Gateway provider is disabled/,
  );

  const mismatched = harness();
  await assert.rejects(
    () => mismatched.coordinator.dispatchToAdapter('task_alpha01', {
      adapter_name: 'openclaw-gateway',
      principal,
      payload: buildOpenClawGatewayEventFixture({ tenant_id: 'tenant_other01' }),
    }),
    (error) => error instanceof OpenClawGatewayAdapterError && error.code === 'PLATFORM_POLICY_DENIED',
  );
});
