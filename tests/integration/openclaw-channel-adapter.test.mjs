import assert from 'node:assert/strict';
import test from 'node:test';

import { invokeLifecycleAdapter } from '../../platform/adapters/index.ts';
import {
  buildOpenClawChannelInboundFixture,
  buildOpenClawChannelOutboundFixture,
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
    input: { kind: 'text', text: 'channel adapter integration' },
    created_at_utc: '2026-08-25T00:00:00Z',
    monotonic_ms: 100,
    ...overrides,
  };
}

function harness() {
  const clock = new ManualClock({ utc_timestamp: '2026-08-25T00:00:03.000Z', monotonic_ms: 300 });
  const eventBus = new InMemoryEventBus();
  const registry = new OpenClawProviderRegistry();
  const adapter = new OpenClawGatewayAdapter({ registry, eventBus });
  adapter.start();
  const coordinator = new Coordinator({ policyGate: new PolicyGate(), eventBus, clock });
  coordinator.registerAdapter(adapter);
  coordinator.submitTask(taskRequest(), { principal });
  return { adapter, coordinator, eventBus, registry };
}

test('OpenClaw channel adapter handles inbound and outbound only through Coordinator and Policy-Gate', async () => {
  const { coordinator, eventBus } = harness();

  const inbound = await coordinator.dispatchToAdapter('task_alpha01', {
    adapter_name: 'openclaw-gateway',
    principal,
    payload: buildOpenClawChannelInboundFixture(),
  });
  assert.equal(inbound.adapter_result.status, 'completed');
  assert.equal(inbound.adapter_result.payload.schema_version, 'nexus.openclaw_channel_inbound.p4.v1');
  assert.equal(inbound.adapter_result.payload.task_handoff.schema_version, 'nexus.task_request.v1');
  assert.equal(inbound.adapter_result.payload.task_handoff.created_at_utc, '2026-08-25T00:00:00Z');
  assert.equal(inbound.adapter_result.payload.task_handoff.monotonic_ms, 100);

  const outbound = await coordinator.dispatchToAdapter('task_alpha01', {
    adapter_name: 'openclaw-gateway',
    principal,
    payload: buildOpenClawChannelOutboundFixture(),
  });
  assert.equal(outbound.adapter_result.status, 'completed');
  assert.equal(outbound.adapter_result.payload.schema_version, 'nexus.openclaw_channel_outbound.p4.v1');
  assert.equal(outbound.adapter_result.payload.channel_send_intent.delivery_outcome, 'queued');
  assert.equal(outbound.adapter_result.payload.channel_send_intent.result.text, 'platform final result');
  assert.equal(eventBus.history().some((entry) => entry.event.event_type === 'task.received'), true);
  assert.equal(eventBus.history().some((entry) => entry.event.event_type === 'audit.recorded'), true);
});

test('OpenClaw channel adapter rejects direct invoke forged decision and disabled provider', async () => {
  const { adapter } = harness();
  await assert.rejects(
    () => adapter.invoke({
      tenant_id: 'tenant_alpha01',
      task_id: 'task_alpha01',
      attempt_id: 'attempt_alpha01',
      execution_id: 'exec_alpha01',
      conversation_id: 'conv_alpha01',
      trace_id: 'trace_alpha01',
      monotonic_ms: 301,
      payload: buildOpenClawChannelInboundFixture(),
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
      monotonic_ms: 301,
      payload: buildOpenClawChannelInboundFixture(),
      policy_decision: { action: 'adapter.invoke', allow: true, tenant_id: 'tenant_alpha01', execution_id: 'exec_alpha01', trace_id: 'trace_alpha01' },
    }),
    (error) => error instanceof PolicyGateError && error.code === 'PLATFORM_POLICY_DENIED',
  );

  const disabled = harness();
  disabled.registry.disable(OPENCLAW_BASELINE_PROVIDER_ID, 'P4-02 disabled drill');
  await assert.rejects(
    () => disabled.coordinator.dispatchToAdapter('task_alpha01', {
      adapter_name: 'openclaw-gateway',
      principal,
      payload: buildOpenClawChannelOutboundFixture(),
    }),
    /Gateway provider is disabled/,
  );
});

test('OpenClaw channel adapter fails closed for unknown channel and tenant or conversation mismatch', async () => {
  const { coordinator } = harness();
  await assert.rejects(
    () => coordinator.dispatchToAdapter('task_alpha01', {
      adapter_name: 'openclaw-gateway',
      principal,
      payload: buildOpenClawChannelInboundFixture({ channel: { name: 'slack' } }),
    }),
    (error) => error instanceof OpenClawGatewayAdapterError && error.code === 'PLATFORM_POLICY_DENIED',
  );

  await assert.rejects(
    () => coordinator.dispatchToAdapter('task_alpha01', {
      adapter_name: 'openclaw-gateway',
      principal,
      payload: buildOpenClawChannelOutboundFixture({ tenant_id: 'tenant_other01' }),
    }),
    (error) => error instanceof OpenClawGatewayAdapterError && error.code === 'PLATFORM_POLICY_DENIED',
  );

  await assert.rejects(
    () => coordinator.dispatchToAdapter('task_alpha01', {
      adapter_name: 'openclaw-gateway',
      principal,
      payload: buildOpenClawChannelOutboundFixture({ conversation_id: 'conv_other01' }),
    }),
    (error) => error instanceof OpenClawGatewayAdapterError && error.code === 'PLATFORM_POLICY_DENIED',
  );
});
