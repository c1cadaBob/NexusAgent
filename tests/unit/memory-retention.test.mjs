import assert from 'node:assert/strict';
import test from 'node:test';

import { ManualClock } from '../../platform/clock/index.ts';
import { InMemoryEventBus } from '../../platform/event-bus/index.ts';
import { LocalMemoryGateway, MEMORY_RETENTION_DEFAULT_ENABLED, MEMORY_RETENTION_SCHEMA_VERSION, MemoryGatewayError } from '../../platform/memory-gateway/index.ts';
import { LocalObservability } from '../../platform/observability/index.ts';

function scope(overrides = {}) {
  return {
    tenant_id: 'tenant_alpha01',
    user_id: 'user_alpha01',
    agent_id: 'agent_alpha01',
    conversation_id: 'conv_alpha01',
    ...overrides,
  };
}

function assertClean(value) {
  assert.doesNotMatch(JSON.stringify(value), /Hermes|OpenClaw|DeepSeek|\bDSH\b|native_|raw_credential|credential_material|provider_runtime|https?:\/\/|\/(?:opt|tmp|var|etc|home|usr)\//i);
}

test('P7 memory retention defaults to conservative enabled policy', () => {
  const memory = new LocalMemoryGateway({ clock: new ManualClock({ utc_timestamp: '2026-08-26T00:00:00.000Z', monotonic_ms: 100 }) });
  const policy = memory.getRetentionPolicy('tenant_alpha01', 'trace_retention01');

  assert.equal(MEMORY_RETENTION_DEFAULT_ENABLED, true);
  assert.equal(policy.schema_version, MEMORY_RETENTION_SCHEMA_VERSION);
  assert.equal(policy.enabled, true);
  assert.equal(policy.mode, 'conservative');
  assert.deepEqual(policy.rules.find((rule) => rule.layer === 'session'), { layer: 'session', enabled: true, ttl_days: 7, action: 'soft_delete', immutable: false });
  assert.equal(policy.rules.find((rule) => rule.layer === 'audit_snapshot').immutable, true);
  assertClean(policy);
});

test('P7 memory retention manual sweep soft-deletes expired session records only', () => {
  const clock = new ManualClock({ utc_timestamp: '2026-08-01T00:00:00.000Z', monotonic_ms: 100 });
  const eventBus = new InMemoryEventBus();
  const observability = new LocalObservability({ clock, service: 'memory-gateway', version: 'p7-retention' });
  const memory = new LocalMemoryGateway({ clock, eventBus, observability });
  const subscription = eventBus.subscribe({ subscriber: 'memory-retention-test' });

  const expiredSession = memory.write({ scope: scope(), layer: 'session', text: 'session record that will expire', source: 'unit', trace_id: 'trace_retention02' });
  const retainedUser = memory.write({ scope: scope(), layer: 'user', text: 'long lived user memory', source: 'unit', trace_id: 'trace_retention02' });
  memory.write({ scope: scope(), layer: 'audit_snapshot', text: 'immutable audit memory', source: 'unit', trace_id: 'trace_retention02' });

  clock.advance(8 * 24 * 60 * 60 * 1000);
  const sweep = memory.sweepRetention({ tenant_id: 'tenant_alpha01', trace_id: 'trace_retention03', requested_by_user_id: 'user_tenant_admin' });

  assert.equal(sweep.deleted_count, 1);
  assert.equal(sweep.items[0].memory_id, expiredSession.memory_id);
  assert.equal(sweep.items[0].status, 'expired');
  assert.equal(memory.query({ scope: scope(), trace_id: 'trace_retention04' }).some((record) => record.memory_id === expiredSession.memory_id), false);
  assert.equal(memory.query({ scope: scope(), trace_id: 'trace_retention04' }).some((record) => record.memory_id === retainedUser.memory_id), true);
  assert.throws(() => memory.get('tenant_alpha01', expiredSession.memory_id), (error) => error instanceof MemoryGatewayError && error.code === 'PLATFORM_NOT_FOUND');

  const deliveries = eventBus.pull(subscription.subscription_id);
  assert.equal(deliveries.some((delivery) => delivery.event.payload.reason_code === 'MEMORY_RETENTION_EXPIRED'), true);
  assertClean(deliveries);
  assertClean(observability.metrics({ trace_id: 'trace_retention03' }));
  assertClean(observability.logs({ trace_id: 'trace_retention03' }));
});

test('P7 memory retention manual soft delete is tenant scoped and protects audit snapshots', () => {
  const memory = new LocalMemoryGateway({ clock: new ManualClock({ utc_timestamp: '2026-08-26T00:00:00.000Z', monotonic_ms: 100 }) });
  const record = memory.write({ scope: scope(), layer: 'user', text: 'delete me', source: 'unit', trace_id: 'trace_retention05' });
  const audit = memory.write({ scope: scope(), layer: 'audit_snapshot', text: 'never delete', source: 'unit', trace_id: 'trace_retention05' });

  assert.throws(
    () => memory.softDeleteMemory({ tenant_id: 'tenant_beta01', memory_id: record.memory_id, reason: 'wrong tenant', trace_id: 'trace_retention06' }),
    (error) => error instanceof MemoryGatewayError && error.code === 'PLATFORM_FORBIDDEN',
  );
  assert.throws(
    () => memory.softDeleteMemory({ tenant_id: 'tenant_alpha01', memory_id: audit.memory_id, reason: 'audit delete', trace_id: 'trace_retention07' }),
    (error) => error instanceof MemoryGatewayError && error.code === 'PLATFORM_FORBIDDEN',
  );
  const deleted = memory.softDeleteMemory({ tenant_id: 'tenant_alpha01', memory_id: record.memory_id, reason: 'manual retention delete', trace_id: 'trace_retention08' });
  assert.equal(deleted.status, 'deleted');
  assert.equal(deleted.reason_code, 'MEMORY_MANUAL_DELETE');
  assertClean(deleted);
});
