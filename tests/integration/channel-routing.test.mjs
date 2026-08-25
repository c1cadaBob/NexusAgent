import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildOpenClawChannelInboundFixture,
  buildOpenClawChannelOutboundFixture,
  OpenClawGatewayAdapter,
  OpenClawProviderRegistry,
  OPENCLAW_BASELINE_PROVIDER_ID,
} from '../../platform/adapters/openclaw/index.ts';
import { ManualClock } from '../../platform/clock/index.ts';
import { Coordinator } from '../../platform/coordinator/index.ts';
import { InMemoryEventBus } from '../../platform/event-bus/index.ts';
import { PolicyGate } from '../../platform/policy-gate/index.ts';

const principal = Object.freeze({
  tenant_id: 'tenant_alpha01',
  user_id: 'user_alpha01',
  roles: ['operator'],
  permissions: ['task:submit', 'adapter:invoke', 'task:cancel'],
});

const channelPrincipal = Object.freeze({
  tenant_id: 'tenant_alpha01',
  user_id: 'user_alpha01',
  roles: ['channel'],
  permissions: ['adapter:invoke'],
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
    input: { kind: 'text', text: 'P4-04 approved channel routing' },
    created_at_utc: '2026-08-25T00:00:00Z',
    monotonic_ms: 100,
    ...overrides,
  };
}

function harness() {
  const clock = new ManualClock({ utc_timestamp: '2026-08-25T00:00:30.000Z', monotonic_ms: 3000 });
  const eventBus = new InMemoryEventBus();
  const registry = new OpenClawProviderRegistry();
  const adapter = new OpenClawGatewayAdapter({ registry, eventBus });
  adapter.start();
  const coordinator = new Coordinator({ policyGate: new PolicyGate(), eventBus, clock });
  coordinator.registerAdapter(adapter);
  coordinator.submitTask(taskRequest(), { principal });
  return { adapter, coordinator, eventBus, registry };
}

function eventsByProducer(eventBus, service, component) {
  return eventBus.history()
    .map((entry) => entry.event)
    .filter((event) => event.producer.service === service && event.producer.component === component);
}

test('approved OpenClaw channel routing runs inbound text command mapping and outbound send intent through platform controls', async () => {
  const { coordinator, eventBus, registry } = harness();
  assert.equal(registry.defaultProvider().provider_id, OPENCLAW_BASELINE_PROVIDER_ID);
  assert.equal(registry.defaultProvider().status, 'enabled');

  const inboundText = await coordinator.dispatchToAdapter('task_alpha01', {
    adapter_name: 'openclaw-gateway',
    principal: channelPrincipal,
    payload: buildOpenClawChannelInboundFixture({
      message: { kind: 'text', text: 'approved channel hello', normalized_text: 'approved channel hello' },
      channel: { message_id: 'msg_route_text01' },
    }),
  });

  assert.equal(inboundText.decision.allow, true);
  assert.equal(inboundText.decision.route.adapter_kind, 'channel');
  assert.equal(inboundText.adapter_result.status, 'completed');
  assert.equal(inboundText.adapter_result.payload.gateway_outcome, 'handoff');
  assert.equal(inboundText.adapter_result.payload.provider_id, OPENCLAW_BASELINE_PROVIDER_ID);
  assert.equal(inboundText.adapter_result.payload.provider_status, 'enabled');
  assert.equal(inboundText.adapter_result.payload.channel_event.channel.name, 'dingtalk');
  assert.equal(inboundText.adapter_result.payload.task_handoff.schema_version, 'nexus.task_request.v1');
  assert.equal(inboundText.adapter_result.payload.task_handoff.input.kind, 'text');
  assert.equal(inboundText.adapter_result.payload.task_handoff.input.text, 'approved channel hello');
  assert.equal(inboundText.adapter_result.payload.task_handoff.source.kind, 'channel');
  assert.equal(inboundText.adapter_result.payload.task_handoff.source.channel, 'dingtalk');
  assert.equal(inboundText.adapter_result.payload.native_agent_runtime, 'blocked');
  assert.equal(inboundText.adapter_result.payload.native_tool_runtime, 'blocked');
  assert.equal(inboundText.adapter_result.payload.native_memory_runtime, 'blocked');
  assert.equal(inboundText.adapter_result.payload.plugin_runtime, 'plugin_bridge_allowlist_required');

  const commandDispatch = await coordinator.dispatchToAdapter('task_alpha01', {
    adapter_name: 'openclaw-gateway',
    principal: channelPrincipal,
    payload: buildOpenClawChannelInboundFixture({
      message: { kind: 'command', text: '/continue', normalized_text: '/continue' },
      channel: { message_id: 'msg_route_continue01' },
    }),
  });

  assert.equal(commandDispatch.adapter_result.payload.gateway_outcome, 'command_mapping');
  assert.equal(commandDispatch.adapter_result.payload.command_mapping.schema_version, 'nexus.openclaw_command_mapping.p4.v1');
  assert.equal(commandDispatch.adapter_result.payload.task_command.schema_version, 'nexus.task_command.p4.v1');
  assert.equal(commandDispatch.adapter_result.payload.task_command.command, 'continue_attempt');
  assert.equal(commandDispatch.adapter_result.payload.task_command.source.adapter_name, 'openclaw-gateway');
  assert.equal(commandDispatch.adapter_result.payload.task_command.source.message_id, 'msg_route_continue01');

  const continued = coordinator.submitTaskCommand(commandDispatch.adapter_result.payload.task_command, { principal });
  assert.equal(continued.accepted, true);
  assert.equal(continued.command, 'continue_attempt');
  assert.equal(continued.snapshot.attempt_id, 'attempt_alpha01');
  assert.equal(continued.event.event_type, 'audit.recorded');

  const outbound = await coordinator.dispatchToAdapter('task_alpha01', {
    adapter_name: 'openclaw-gateway',
    principal: channelPrincipal,
    payload: buildOpenClawChannelOutboundFixture({
      channel: { message_id: 'msg_route_out01' },
      result: { result_id: 'result_route01', status: 'completed', text: 'platform final answer', artifact_refs: ['artifact_route01'] },
    }),
  });

  assert.equal(outbound.adapter_result.payload.gateway_outcome, 'channel_send_intent');
  assert.equal(outbound.adapter_result.payload.channel_send_intent.delivery_outcome, 'queued');
  assert.equal(outbound.adapter_result.payload.channel_send_intent.mode, 'final_result');
  assert.equal(outbound.adapter_result.payload.channel_send_intent.result.text, 'platform final answer');
  assert.equal(outbound.adapter_result.payload.channel_send_intent.channel.direction, 'outbound');
  assert.equal(outbound.adapter_result.payload.channel_send_intent.native_agent_runtime, 'blocked');
  assert.equal(outbound.adapter_result.payload.channel_send_intent.native_tool_runtime, 'blocked');
  assert.equal(outbound.adapter_result.payload.channel_send_intent.native_memory_runtime, 'blocked');

  const inboundEvents = eventsByProducer(eventBus, 'openclaw-adapter', 'channel-inbound-anti-corruption');
  const outboundEvents = eventsByProducer(eventBus, 'openclaw-adapter', 'channel-outbound-anti-corruption');
  assert.equal(inboundEvents.length, 2);
  assert.equal(outboundEvents.length, 1);
  assert.ok(inboundEvents.every((event) => event.payload.schema_version === 'nexus.openclaw_channel_inbound.p4.v1'));
  assert.equal(outboundEvents[0].event_type, 'audit.recorded');
  assert.equal(outboundEvents[0].payload.delivery_outcome, 'queued');
  assert.equal(outboundEvents[0].payload.result_id, 'result_route01');

  const text = JSON.stringify(eventBus.history().map((entry) => entry.event));
  for (const forbidden of ['tools.invoke', 'native_session', 'native_error', 'credential_material', 'raw_credential', 'http://', 'https://', '/opt/']) {
    assert.equal(text.includes(forbidden), false, `channel routing leaked ${forbidden}`);
  }
});
