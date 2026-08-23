import assert from 'node:assert/strict';
import test from 'node:test';

import { EventBusError, InMemoryEventBus } from '../../platform/event-bus/index.ts';

function event(overrides = {}) {
  return {
    schema_version: 'nexus.event_envelope.v1',
    event_id: 'event_alpha01',
    event_type: 'task.state_changed',
    tenant_id: 'tenant_alpha01',
    task_id: 'task_alpha01',
    attempt_id: 'attempt_alpha01',
    execution_id: 'exec_alpha01',
    trace_id: 'trace_alpha01',
    occurred_at_utc: '2026-08-23T00:00:00.000Z',
    monotonic_ms: 100,
    producer: { service: 'coordinator', component: 'task-state' },
    subject: { kind: 'task', id: 'task_alpha01' },
    payload: { state: 'admitted' },
    ...overrides,
  };
}

test('InMemoryEventBus publishes events in sequence and delivers to subscribers', () => {
  const bus = new InMemoryEventBus();
  const subscription = bus.subscribe({ subscriber: 'audit', filter: { tenant_id: 'tenant_alpha01' } });

  const first = bus.publish(event({ event_id: 'event_alpha01', monotonic_ms: 100 }));
  const second = bus.publish(event({ event_id: 'event_alpha02', monotonic_ms: 101 }));

  assert.equal(first.sequence, 1);
  assert.equal(second.sequence, 2);
  assert.equal(second.duplicate, false);
  assert.deepEqual(bus.pull(subscription.subscription_id).map((delivery) => delivery.event_id), ['event_alpha01', 'event_alpha02']);
});

test('InMemoryEventBus deduplicates repeated event_id', () => {
  const bus = new InMemoryEventBus();
  const subscription = bus.subscribe({ subscriber: 'audit' });

  const first = bus.publish(event());
  const duplicate = bus.publish(event({ payload: { state: 'mutated' } }));

  assert.equal(first.sequence, duplicate.sequence);
  assert.equal(duplicate.duplicate, true);
  assert.equal(bus.pull(subscription.subscription_id).length, 1);
  assert.deepEqual(bus.pull(subscription.subscription_id)[0].event.payload, { state: 'admitted' });
});

test('InMemoryEventBus supports ack and dead-letter semantics', () => {
  const bus = new InMemoryEventBus();
  const audit = bus.subscribe({ subscriber: 'audit' });
  const ops = bus.subscribe({ subscriber: 'ops' });
  bus.publish(event());

  assert.equal(bus.ack(audit.subscription_id, 'event_alpha01'), true);
  assert.equal(bus.pull(audit.subscription_id).length, 0);
  assert.equal(bus.deadLetter(ops.subscription_id, 'event_alpha01', 'handler failed'), true);
  assert.equal(bus.pull(ops.subscription_id).length, 0);
  assert.equal(bus.deliveries(ops.subscription_id)[0].status, 'dead_lettered');
});

test('InMemoryEventBus rejects missing trace_id tenant_id and monotonic_ms', () => {
  const bus = new InMemoryEventBus();
  assert.throws(
    () => bus.publish(event({ trace_id: undefined })),
    /Invalid platform identifier: trace_id/,
  );
  assert.throws(
    () => bus.publish(event({ tenant_id: 'workspace_alpha01' })),
    /Invalid platform identifier: tenant_id/,
  );
  assert.throws(
    () => bus.publish(event({ monotonic_ms: -1 })),
    /Invalid monotonic clock value/,
  );
  assert.throws(
    () => bus.subscribe({ subscriber: '', subscription_id: 'sub_bad01' }),
    (error) => error instanceof EventBusError && error.code === 'PLATFORM_INVALID_REQUEST',
  );
});
