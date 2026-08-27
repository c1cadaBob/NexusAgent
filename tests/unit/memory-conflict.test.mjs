import assert from 'node:assert/strict';
import test from 'node:test';

import { ManualClock } from '../../platform/clock/index.ts';
import { InMemoryEventBus } from '../../platform/event-bus/index.ts';
import {
  LocalMemoryGateway,
  MEMORY_CONFLICT_DEFAULT_ENABLED,
  MEMORY_CONFLICT_RESOLUTION_MODE,
  MEMORY_CONFLICT_SCHEMA_VERSION,
  MemoryGatewayError,
} from '../../platform/memory-gateway/index.ts';
import { LocalObservability } from '../../platform/observability/index.ts';

const scope = Object.freeze({
  tenant_id: 'tenant_alpha01',
  user_id: 'user_alpha01',
  agent_id: 'agent_alpha01',
  conversation_id: 'conv_memory_conflict01',
});

function assertClean(value) {
  assert.doesNotMatch(JSON.stringify(value), /Hermes|OpenClaw|DeepSeek|\bDSH\b|native_|raw_credential|credential_material|provider_(?:binding|runtime)|memory_rejected_text|stale_payload|https?:\/\/|\/(?:opt|tmp|var|etc|home|usr)\//i);
}

test('P7 memory conflict detection defaults to admin resolve queue', () => {
  assert.equal(MEMORY_CONFLICT_SCHEMA_VERSION, 'nexus.memory_conflict.p7.v1');
  assert.equal(MEMORY_CONFLICT_DEFAULT_ENABLED, true);
  assert.equal(MEMORY_CONFLICT_RESOLUTION_MODE, 'admin_resolve_queue');
});

test('P7 memory expected_version mismatch creates metadata-only open conflict', () => {
  const clock = new ManualClock({ utc_timestamp: '2026-08-27T01:00:00.000Z', monotonic_ms: 100 });
  const eventBus = new InMemoryEventBus();
  const observability = new LocalObservability({ clock, service: 'memory-gateway', version: 'p7-conflict' });
  const memory = new LocalMemoryGateway({ clock, eventBus, observability });
  const subscription = eventBus.subscribe({ subscriber: 'memory-conflict-test' });

  memory.write({ scope, layer: 'user', text: 'current memory text', source: 'unit', trace_id: 'trace_memory_conflict01' });
  assert.throws(
    () => memory.write({ scope, layer: 'user', text: 'stale text must not be stored', source: 'unit', trace_id: 'trace_memory_conflict02', expected_version: 0 }),
    (error) => error instanceof MemoryGatewayError && error.code === 'PLATFORM_CONFLICT',
  );

  const conflicts = memory.listConflicts(scope.tenant_id, 'trace_memory_conflict03');
  assert.equal(conflicts.length, 1);
  assert.match(conflicts[0].conflict_id, /^conflict_memory_alpha01_/);
  assert.equal(conflicts[0].schema_version, MEMORY_CONFLICT_SCHEMA_VERSION);
  assert.equal(conflicts[0].status, 'open');
  assert.equal(conflicts[0].expected_version, 0);
  assert.equal(conflicts[0].current_version, 1);
  assert.equal(JSON.stringify(conflicts).includes('stale text must not be stored'), false);

  const deliveries = eventBus.pull(subscription.subscription_id);
  assert.equal(deliveries.some((delivery) => delivery.event.event_type === 'memory.conflict_detected'), true);
  assertClean({ conflicts, deliveries, logs: observability.logs({ trace_id: 'trace_memory_conflict02' }) });
});

test('P7 memory conflict decisions resolve or ignore open records only', () => {
  const memory = new LocalMemoryGateway({ clock: new ManualClock({ utc_timestamp: '2026-08-27T01:00:00.000Z', monotonic_ms: 100 }) });
  memory.write({ scope, layer: 'session', text: 'version one', source: 'unit', trace_id: 'trace_memory_conflict04' });
  assert.throws(
    () => memory.write({ scope, layer: 'session', text: 'version conflict', source: 'unit', trace_id: 'trace_memory_conflict05', expected_version: 0 }),
    (error) => error instanceof MemoryGatewayError && error.code === 'PLATFORM_CONFLICT',
  );
  const conflict = memory.listConflicts(scope.tenant_id, 'trace_memory_conflict06')[0];
  const resolved = memory.decideConflict({
    tenant_id: scope.tenant_id,
    conflict_id: conflict.conflict_id,
    decision: 'resolve',
    reason: 'administrator reviewed version mismatch metadata',
    trace_id: 'trace_memory_conflict07',
    decided_by_user_id: 'user_tenant_admin',
  });

  assert.equal(resolved.status, 'resolved');
  assert.deepEqual(resolved.reason_codes, ['MEMORY_CONFLICT_RESOLVED']);
  assert.throws(
    () => memory.decideConflict({ tenant_id: scope.tenant_id, conflict_id: conflict.conflict_id, decision: 'ignore', reason: 'second decision', trace_id: 'trace_memory_conflict08' }),
    (error) => error instanceof MemoryGatewayError && error.code === 'PLATFORM_CONFLICT',
  );
  assert.throws(
    () => memory.decideConflict({ tenant_id: scope.tenant_id, conflict_id: conflict.conflict_id, decision: 'ignore', reason: 'native_url https://blocked.invalid', trace_id: 'trace_memory_conflict09' }),
    (error) => error instanceof MemoryGatewayError && error.code === 'PLATFORM_INVALID_REQUEST',
  );
  assertClean(resolved);
});
