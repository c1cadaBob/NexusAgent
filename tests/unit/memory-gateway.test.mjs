import assert from 'node:assert/strict';
import test from 'node:test';

import { LocalMemoryGateway, MEMORY_LAYERS, MemoryGatewayError } from '../../platform/memory-gateway/index.ts';
import { ManualClock } from '../../platform/clock/index.ts';

function scope(overrides = {}) {
  return {
    tenant_id: 'tenant_alpha01',
    user_id: 'user_alpha01',
    agent_id: 'agent_alpha01',
    conversation_id: 'conv_alpha01',
    ...overrides,
  };
}

test('LocalMemoryGateway writes and queries five-layer memory records', () => {
  const gateway = new LocalMemoryGateway({ clock: new ManualClock({ utc_timestamp: '2026-08-23T00:00:00.000Z', monotonic_ms: 20 }) });
  assert.deepEqual(MEMORY_LAYERS, ['session', 'user', 'agent_skill', 'organization', 'audit_snapshot']);

  const first = gateway.write({ scope: scope(), layer: 'session', text: 'Remember task context', source: 'unit-test', trace_id: 'trace_alpha01' });
  const second = gateway.write({ scope: scope(), layer: 'user', text: 'Remember user preference', source: 'unit-test', trace_id: 'trace_alpha01' });

  assert.equal(first.version, 1);
  assert.equal(second.version, 2);
  assert.equal(gateway.query({ scope: scope(), layer: 'session', trace_id: 'trace_alpha01' }).length, 1);
  assert.equal(gateway.query({ scope: scope(), query: 'preference', trace_id: 'trace_alpha01' })[0].memory_id, second.memory_id);
});

test('LocalMemoryGateway enforces tenant isolation on get and query', () => {
  const gateway = new LocalMemoryGateway();
  const record = gateway.write({ scope: scope(), layer: 'session', text: 'Tenant alpha only', source: 'unit-test', trace_id: 'trace_alpha01' });
  gateway.write({ scope: scope({ tenant_id: 'tenant_other01' }), layer: 'session', text: 'Tenant other only', source: 'unit-test', trace_id: 'trace_other01' });

  assert.equal(gateway.query({ scope: scope(), trace_id: 'trace_alpha01' }).length, 1);
  assert.throws(
    () => gateway.get('tenant_other01', record.memory_id),
    (error) => error instanceof MemoryGatewayError && error.code === 'PLATFORM_FORBIDDEN',
  );
});

test('LocalMemoryGateway rejects empty memory text and unsupported layer', () => {
  const gateway = new LocalMemoryGateway();
  assert.throws(
    () => gateway.write({ scope: scope(), layer: 'session', text: ' ', source: 'unit-test', trace_id: 'trace_alpha01' }),
    /Memory text is required/,
  );
  assert.throws(
    () => gateway.write({ scope: scope(), layer: 'native_file', text: 'bad', source: 'unit-test', trace_id: 'trace_alpha01' }),
    /Unsupported memory layer/,
  );
});
