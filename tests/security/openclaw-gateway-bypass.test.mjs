import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildOpenClawGatewayEventFixture,
  OpenClawGatewayAdapter,
  OpenClawGatewayAdapterError,
  validateOpenClawGatewayEvent,
} from '../../platform/adapters/openclaw/index.ts';

function assertBlocked(payload, label) {
  assert.throws(
    () => validateOpenClawGatewayEvent(payload),
    (error) => error instanceof OpenClawGatewayAdapterError && ['PLATFORM_INVALID_REQUEST', 'PLATFORM_POLICY_DENIED', 'PLATFORM_SCHEMA_VALIDATION_FAILED'].includes(error.code),
    label,
  );
}

test('OpenClaw gateway payload rejects native Agent tool memory and plugin bypass markers', () => {
  const base = buildOpenClawGatewayEventFixture();
  const cases = [
    ['native Agent command', { ...base, native_agent: { command: 'agentCommandFromGatewayIngress' } }],
    ['tools.invoke payload', { ...base, tool_name: 'tools.invoke' }],
    ['native memory path', { ...base, memory_path: 'MEMORY.md' }],
    ['plugin subagent', { ...base, plugin_subagent: { id: 'subagent-main' } }],
    ['raw credential material', { ...base, credential_material: 'secret-token-value' }],
    ['native session id', { ...base, native_session_id: 'native_session_abc' }],
    ['native URL', { ...base, native_url: 'http://127.0.0.1:3052/tools/invoke' }],
    ['native file path', { ...base, native_path: '/opt/project/NexusAgent/vendor/openclaw-main' }],
    ['native error code', { ...base, native_error_code: 'OPENCLAW_NATIVE_FAILURE' }],
  ];

  for (const [label, payload] of cases) {
    assertBlocked(payload, label);
  }
});

test('OpenClaw gateway payload rejects unapproved channel and unblocked native runtime', () => {
  assertBlocked(
    buildOpenClawGatewayEventFixture({ channel: { name: 'slack' } }),
    'unapproved channel should fail closed',
  );
  assertBlocked(
    buildOpenClawGatewayEventFixture({ handoff: { native_agent_runtime: 'allowed' } }),
    'native Agent runtime must remain blocked',
  );
  assertBlocked(
    buildOpenClawGatewayEventFixture({ message: { text: 'read /tmp/native-session.db' } }),
    'native path text should fail closed',
  );
});

test('OpenClaw gateway adapter direct invoke cannot be unlocked with allow-like payload flags', async () => {
  const adapter = new OpenClawGatewayAdapter();
  adapter.start();
  await assert.rejects(
    () => adapter.invoke({
      tenant_id: 'tenant_alpha01',
      task_id: 'task_alpha01',
      attempt_id: 'attempt_alpha01',
      execution_id: 'exec_alpha01',
      conversation_id: 'conv_alpha01',
      trace_id: 'trace_alpha01',
      monotonic_ms: 201,
      payload: {
        ...buildOpenClawGatewayEventFixture(),
        coordinator_authorized: true,
        policy_gate_allow: true,
      },
    }),
    /Coordinator and Policy-Gate/,
  );
});
