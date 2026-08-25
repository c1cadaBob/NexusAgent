import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  buildOpenClawChannelInboundFixture,
  buildOpenClawCommandIdempotencyKey,
  buildOpenClawCommandMapping,
  normalizeOpenClawCommandText,
  OPENCLAW_COMMAND_MAPPING_SCHEMA_VERSION,
  OpenClawCommandMappingError,
  parseOpenClawCommandText,
} from '../../platform/adapters/openclaw/index.ts';

test('OpenClaw command mapping recognizes only conservative exact command phrases', () => {
  assert.equal(normalizeOpenClawCommandText('  /CONTINUE  '), '/continue');
  assert.equal(parseOpenClawCommandText('/continue'), 'continue_attempt');
  assert.equal(parseOpenClawCommandText('继续执行'), 'continue_attempt');
  assert.equal(parseOpenClawCommandText('/redo'), 'redo_attempt');
  assert.equal(parseOpenClawCommandText('重试'), 'redo_attempt');
  assert.equal(parseOpenClawCommandText('/cancel'), 'cancel_attempt');
  assert.equal(parseOpenClawCommandText('停止'), 'cancel_attempt');
  assert.equal(parseOpenClawCommandText('please keep working on this task'), null);
  assert.throws(
    () => parseOpenClawCommandText('/continue please'),
    (error) => error instanceof OpenClawCommandMappingError && error.code === 'PLATFORM_INVALID_REQUEST',
  );
});

test('OpenClaw command mapping builds platform TaskCommand with deterministic idempotency', () => {
  const inbound = buildOpenClawChannelInboundFixture({
    message: { kind: 'command', text: '/redo', normalized_text: '/redo' },
    channel: { message_id: 'msg_redo01' },
  });
  const mapping = buildOpenClawCommandMapping(inbound);

  assert.equal(mapping.schema_version, OPENCLAW_COMMAND_MAPPING_SCHEMA_VERSION);
  assert.equal(mapping.command, 'redo_attempt');
  assert.equal(mapping.task_command.schema_version, 'nexus.task_command.p4.v1');
  assert.equal(mapping.task_command.command, 'redo_attempt');
  assert.equal(mapping.task_command.next_attempt_id, 'attempt_redo_redo01');
  assert.equal(mapping.task_command.source.message_id, 'msg_redo01');
  assert.equal(mapping.idempotency_key, buildOpenClawCommandIdempotencyKey(inbound, 'redo_attempt'));
  assert.equal(mapping.native_agent_runtime, 'blocked');
  assert.equal(mapping.native_tool_runtime, 'blocked');
  assert.equal(mapping.native_memory_runtime, 'blocked');
});

test('OpenClaw command mapping leaves normal channel text as regular TaskRequest handoff', () => {
  const inbound = buildOpenClawChannelInboundFixture({
    message: { kind: 'text', text: 'normal request', normalized_text: 'normal request' },
  });
  assert.equal(buildOpenClawCommandMapping(inbound), null);
});

test('OpenClaw command mapping rejects invalid IDs timestamps and native markers', () => {
  const cases = [
    { ...buildOpenClawChannelInboundFixture({ message: { text: '/cancel', normalized_text: '/cancel' } }), tenant_id: 'bad tenant' },
    { ...buildOpenClawChannelInboundFixture({ message: { text: '/cancel', normalized_text: '/cancel' } }), requested_at_utc: '2026-08-25 00:00:00' },
    { ...buildOpenClawChannelInboundFixture({ message: { text: '/cancel', normalized_text: '/cancel' } }), monotonic_ms: -1 },
    { ...buildOpenClawChannelInboundFixture({ message: { text: '/cancel', normalized_text: '/cancel' } }), native_session_id: 'native_session_abc' },
    buildOpenClawChannelInboundFixture({ message: { text: 'read /etc/passwd', normalized_text: 'read /etc/passwd' } }),
  ];
  for (const payload of cases) {
    assert.throws(
      () => buildOpenClawCommandMapping(payload),
      (error) => error instanceof OpenClawCommandMappingError,
    );
  }
});

test('TaskRequest schema records P4 command and channel idempotency metadata', () => {
  const schema = JSON.parse(fs.readFileSync('platform/contracts/task-request.schema.json', 'utf8'));
  assert.equal(schema.properties.command.properties.schema_version.const, 'nexus.task_command.p4.v1');
  assert.deepEqual(schema.properties.command.properties.action.enum, ['continue_attempt', 'redo_attempt', 'cancel_attempt']);
  assert.equal(schema.properties.source.properties.message_id.pattern, '^msg_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$');
  assert.equal(schema.properties.idempotency_key.type, 'string');
});
