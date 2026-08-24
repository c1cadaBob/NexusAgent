import assert from 'node:assert/strict';
import test from 'node:test';

import { HERMES_MEMORY_PROXY_SCHEMA_VERSION } from '../../platform/adapters/hermes/index.ts';
import { ManualClock } from '../../platform/clock/index.ts';
import {
  LocalMemoryGateway,
  MEMORY_SNAPSHOT_SCHEMA_VERSION,
  MemoryGatewayError,
  PLANNER_MEMORY_LAYERS,
  sanitizePlannerMemoryText,
} from '../../platform/memory-gateway/index.ts';

function scope(overrides = {}) {
  return {
    tenant_id: 'tenant_alpha01',
    user_id: 'user_alpha01',
    agent_id: 'agent_alpha01',
    conversation_id: 'conv_alpha01',
    ...overrides,
  };
}

function gateway() {
  return new LocalMemoryGateway({ clock: new ManualClock({ utc_timestamp: '2026-08-24T00:00:00.000Z', monotonic_ms: 100 }) });
}

test('P3 planner snapshot is limited to session user and agent_skill layers', () => {
  const memory = gateway();
  assert.deepEqual(PLANNER_MEMORY_LAYERS, ['session', 'user', 'agent_skill']);

  memory.write({ scope: scope(), layer: 'session', text: 'Current turn asks for a migration plan', source: 'unit', trace_id: 'trace_alpha01' });
  memory.write({ scope: scope(), layer: 'user', text: 'User prefers concise summaries', source: 'unit', trace_id: 'trace_alpha01' });
  memory.write({ scope: scope(), layer: 'agent_skill', text: 'Use platform contracts before vendor types', source: 'unit', trace_id: 'trace_alpha01' });
  memory.write({ scope: scope(), layer: 'organization', text: 'Organization layer waits for P7', source: 'unit', trace_id: 'trace_alpha01' });

  const snapshot = memory.plannerSnapshot({ scope: scope(), trace_id: 'trace_alpha01' });

  assert.equal(snapshot.schema_version, MEMORY_SNAPSHOT_SCHEMA_VERSION);
  assert.equal(snapshot.records.length, 3);
  assert.equal(snapshot.rendered.session.includes('migration plan'), true);
  assert.equal(snapshot.rendered.user.includes('concise summaries'), true);
  assert.equal(snapshot.rendered.agent_skill.includes('platform contracts'), true);
  assert.equal(JSON.stringify(snapshot).includes('Organization layer'), false);

  assert.throws(
    () => memory.plannerSnapshot({ scope: scope(), trace_id: 'trace_alpha01', layers: ['organization'] }),
    (error) => error instanceof MemoryGatewayError && error.code === 'PLATFORM_FORBIDDEN',
  );
});

test('P3 expected_version conflict prevents stale Hermes proxy writes', () => {
  const memory = gateway();
  memory.write({ scope: scope(), layer: 'user', text: 'Initial user preference', source: 'unit', trace_id: 'trace_alpha01' });

  assert.equal(memory.currentVersion('tenant_alpha01'), 1);
  assert.throws(
    () => memory.writeFromMemoryProxy({
      scope: scope(),
      target: 'memory',
      action: 'add',
      content: 'stale write should fail',
      trace_id: 'trace_alpha01',
      expected_version: 0,
    }),
    (error) => error instanceof MemoryGatewayError && error.code === 'PLATFORM_CONFLICT',
  );
});

test('P3 Memory Gateway proxy maps Hermes targets and rejects native payload fields', () => {
  const memory = gateway();
  const record = memory.writeFromMemoryProxy({
    scope: scope(),
    target: 'memory',
    action: 'add',
    content: 'Adapter mapping belongs to agent skill memory',
    trace_id: 'trace_alpha01',
    source: 'unit-proxy',
  });

  assert.equal(HERMES_MEMORY_PROXY_SCHEMA_VERSION, 'nexus.hermes_memory_proxy.p3.v1');
  assert.equal(record.layer, 'agent_skill');
  assert.throws(
    () => memory.writeFromMemoryProxy({
      scope: scope(),
      target: 'memory',
      action: 'batch',
      operations: [{ action: 'add', content: 'bad', native_session_id: 'native_session_1' }],
      trace_id: 'trace_alpha01',
    }),
    (error) => error instanceof MemoryGatewayError && error.code === 'PLATFORM_INVALID_REQUEST',
  );
});

test('P3 planner snapshot sanitizes unsafe memory and enforces scope isolation', () => {
  const memory = gateway();
  memory.write({ scope: scope(), layer: 'agent_skill', text: 'Read MEMORY.md from /tmp/raw secret-token', source: 'unit', trace_id: 'trace_alpha01' });
  memory.write({ scope: scope({ user_id: 'user_other01' }), layer: 'user', text: 'unauthorized private preference', source: 'unit', trace_id: 'trace_alpha01' });

  const snapshot = memory.plannerSnapshot({ scope: scope(), trace_id: 'trace_alpha01' });
  const serialized = JSON.stringify(snapshot);

  assert.equal(serialized.includes('secret-token'), false);
  assert.equal(serialized.includes('MEMORY.md'), false);
  assert.equal(serialized.includes('unauthorized private preference'), false);
  assert.equal(snapshot.records[0].sanitized, true);
  assert.equal(sanitizePlannerMemoryText('safe fact').sanitized, false);
});
