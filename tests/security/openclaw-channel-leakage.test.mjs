import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildOpenClawChannelInboundFixture,
  buildOpenClawChannelOutboundFixture,
  OpenClawGatewayAdapter,
  OpenClawGatewayAdapterError,
  validateOpenClawChannelOutbound,
} from '../../platform/adapters/openclaw/index.ts';
import { ManualClock } from '../../platform/clock/index.ts';
import { Coordinator } from '../../platform/coordinator/index.ts';
import { InMemoryEventBus } from '../../platform/event-bus/index.ts';
import { PolicyGate } from '../../platform/policy-gate/index.ts';

const forbiddenMarkers = [
  'http://',
  'https://',
  'wss://',
  '/opt/',
  '/tmp/',
  '../',
  'vendor/openclaw-main',
  'native_session',
  'native_error',
  'raw_credential',
  'credential_material',
  'secret-token',
  'OPENCLAW_NATIVE',
  'agentCommandFromGatewayIngress',
  'tools.invoke',
  'MEMORY.md',
  'USER.md',
];

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
    input: { kind: 'text', text: 'channel leakage guard' },
    created_at_utc: '2026-08-25T00:00:00Z',
    monotonic_ms: 100,
  };
}

function assertNoLeak(value, label) {
  const text = JSON.stringify(value);
  for (const marker of forbiddenMarkers) {
    assert.equal(text.includes(marker), false, `${label} leaked ${marker}`);
  }
}

function harness() {
  const clock = new ManualClock({ utc_timestamp: '2026-08-25T00:00:04.000Z', monotonic_ms: 400 });
  const eventBus = new InMemoryEventBus();
  const adapter = new OpenClawGatewayAdapter({ eventBus });
  adapter.start();
  const coordinator = new Coordinator({ policyGate: new PolicyGate(), eventBus, clock });
  coordinator.registerAdapter(adapter);
  coordinator.submitTask(taskRequest(), { principal });
  return { coordinator, eventBus };
}

test('OpenClaw channel adapter result and Event Bus payload expose platform-only channel data', async () => {
  const { coordinator, eventBus } = harness();
  const inbound = await coordinator.dispatchToAdapter('task_alpha01', {
    adapter_name: 'openclaw-gateway',
    principal,
    payload: buildOpenClawChannelInboundFixture(),
  });
  const outbound = await coordinator.dispatchToAdapter('task_alpha01', {
    adapter_name: 'openclaw-gateway',
    principal,
    payload: buildOpenClawChannelOutboundFixture(),
  });

  assertNoLeak(inbound.adapter_result.payload, 'inbound adapter result');
  assertNoLeak(outbound.adapter_result.payload, 'outbound adapter result');
  assertNoLeak(outbound.adapter_result.payload.channel_send_intent, 'channel send intent');
  assertNoLeak(eventBus.history().map((entry) => entry.event), 'event bus history');
});

test('OpenClaw channel validation errors sanitize native URLs sessions paths and credentials', () => {
  const blockedPayloads = [
    { ...buildOpenClawChannelOutboundFixture(), native_url: 'https://native.invalid/send' },
    { ...buildOpenClawChannelOutboundFixture(), native_session_id: 'native_session_abc' },
    { ...buildOpenClawChannelOutboundFixture(), credential_material: 'secret-token-value' },
    buildOpenClawChannelOutboundFixture({ result: { text: 'native_error at /opt/project/NexusAgent/vendor/openclaw-main' } }),
  ];

  for (const payload of blockedPayloads) {
    assert.throws(
      () => validateOpenClawChannelOutbound(payload),
      (error) => {
        assert.equal(error instanceof OpenClawGatewayAdapterError, true);
        assertNoLeak({ message: error.message, details: error.details }, 'gateway validation error');
        return true;
      },
    );
  }
});
