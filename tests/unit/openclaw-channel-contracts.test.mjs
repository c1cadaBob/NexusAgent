import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildOpenClawChannelInboundFixture,
  buildOpenClawChannelOutboundFixture,
  buildOpenClawChannelSendIntent,
  buildOpenClawGatewayEventFixture,
  buildOpenClawTaskRequest,
  OPENCLAW_CHANNEL_INBOUND_SCHEMA_VERSION,
  OPENCLAW_CHANNEL_OUTBOUND_SCHEMA_VERSION,
  OpenClawGatewayAdapterError,
  validateOpenClawChannelInbound,
  validateOpenClawChannelOutbound,
} from '../../platform/adapters/openclaw/index.ts';

test('OpenClaw inbound channel contract maps approved messages into platform TaskRequest', () => {
  const inbound = validateOpenClawChannelInbound(buildOpenClawChannelInboundFixture());
  const taskRequest = buildOpenClawTaskRequest(inbound);

  assert.equal(inbound.schema_version, OPENCLAW_CHANNEL_INBOUND_SCHEMA_VERSION);
  assert.equal(inbound.operation, 'inbound');
  assert.equal(taskRequest.schema_version, 'nexus.task_request.v1');
  assert.equal(taskRequest.tenant_id, inbound.tenant_id);
  assert.equal(taskRequest.user_id, inbound.user_id);
  assert.equal(taskRequest.agent_id, inbound.agent_id);
  assert.equal(taskRequest.task_id, inbound.task_id);
  assert.equal(taskRequest.attempt_id, inbound.attempt_id);
  assert.equal(taskRequest.execution_id, inbound.execution_id);
  assert.equal(taskRequest.conversation_id, inbound.conversation_id);
  assert.equal(taskRequest.trace_id, inbound.trace_id);
  assert.equal(taskRequest.created_at_utc, inbound.requested_at_utc);
  assert.equal(taskRequest.monotonic_ms, inbound.monotonic_ms);
  assert.equal(taskRequest.input.kind, 'text');
  assert.equal(taskRequest.input.text, inbound.message.normalized_text);
});

test('OpenClaw inbound keeps P4-01 gateway event payloads as compatible input', () => {
  const legacy = buildOpenClawGatewayEventFixture({
    message: { kind: 'command', text: 'run platform task', normalized_text: 'run platform task' },
  });
  const inbound = validateOpenClawChannelInbound(legacy);
  const taskRequest = buildOpenClawTaskRequest(inbound);

  assert.equal(inbound.schema_version, OPENCLAW_CHANNEL_INBOUND_SCHEMA_VERSION);
  assert.equal(inbound.event_type, 'channel.message');
  assert.equal(taskRequest.input.kind, 'command');
  assert.equal(taskRequest.input.text, 'run platform task');
});

test('OpenClaw outbound contract maps final platform result into queued channel send intent', () => {
  const outbound = validateOpenClawChannelOutbound(buildOpenClawChannelOutboundFixture());
  const sendIntent = buildOpenClawChannelSendIntent(outbound);

  assert.equal(outbound.schema_version, OPENCLAW_CHANNEL_OUTBOUND_SCHEMA_VERSION);
  assert.equal(outbound.operation, 'outbound');
  assert.equal(sendIntent.schema_version, OPENCLAW_CHANNEL_OUTBOUND_SCHEMA_VERSION);
  assert.equal(sendIntent.delivery_outcome, 'queued');
  assert.equal(sendIntent.mode, 'final_result');
  assert.equal(sendIntent.channel.direction, 'outbound');
  assert.equal(sendIntent.result.result_id, 'result_alpha01');
  assert.equal(sendIntent.result.status, 'completed');
  assert.deepEqual(sendIntent.result.artifact_refs, ['artifact_alpha01']);
  assert.equal(sendIntent.native_agent_runtime, 'blocked');
  assert.equal(sendIntent.native_tool_runtime, 'blocked');
  assert.equal(sendIntent.native_memory_runtime, 'blocked');
});

test('OpenClaw channel contracts reject missing platform IDs time drift and raw/native payload', () => {
  const inboundCases = [
    { ...buildOpenClawChannelInboundFixture(), tenant_id: 'bad tenant' },
    { ...buildOpenClawChannelInboundFixture(), requested_at_utc: '2026-08-25 00:00:00' },
    { ...buildOpenClawChannelInboundFixture(), monotonic_ms: -1 },
    buildOpenClawChannelInboundFixture({ channel: { name: 'slack' } }),
    buildOpenClawChannelInboundFixture({ message: { text: 'read /etc/passwd' } }),
    { ...buildOpenClawChannelInboundFixture(), raw_manifest: { source: 'native' } },
  ];
  for (const payload of inboundCases) {
    assert.throws(
      () => validateOpenClawChannelInbound(payload),
      (error) => error instanceof OpenClawGatewayAdapterError,
    );
  }

  const outboundCases = [
    { ...buildOpenClawChannelOutboundFixture(), operation: 'inbound' },
    buildOpenClawChannelOutboundFixture({ channel: { direction: 'inbound' } }),
    buildOpenClawChannelOutboundFixture({ result: { result_id: 'native_result' } }),
    buildOpenClawChannelOutboundFixture({ result: { text: 'see https://native.invalid/session' } }),
    buildOpenClawChannelOutboundFixture({ delivery: { streaming: true } }),
    { ...buildOpenClawChannelOutboundFixture(), native_session_id: 'native_session_abc' },
  ];
  for (const payload of outboundCases) {
    assert.throws(
      () => validateOpenClawChannelOutbound(payload),
      (error) => error instanceof OpenClawGatewayAdapterError,
    );
  }
});
