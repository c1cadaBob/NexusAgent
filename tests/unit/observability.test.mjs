import assert from 'node:assert/strict';
import test from 'node:test';

import { ManualClock } from '../../platform/clock/index.ts';
import { LocalObservability } from '../../platform/observability/index.ts';

const traceContext = Object.freeze({
  tenant_id: 'tenant_alpha01',
  user_id: 'user_alpha01',
  task_id: 'task_alpha01',
  execution_id: 'exec_alpha01',
  trace_id: 'trace_alpha01',
});

test('LocalObservability reports health and records trace-bound metrics and logs', () => {
  const clock = new ManualClock({ utc_timestamp: '2026-08-23T00:00:00.000Z', monotonic_ms: 100 });
  const observability = new LocalObservability({ clock, service: 'coordinator', version: 'p1-test' });

  const health = observability.health(['service.local', 'event-bus.local']);
  assert.equal(health.status, 'ok');
  assert.equal(health.service, 'coordinator');

  observability.incrementMetric({ ...traceContext, name: 'tasks.accepted', value: 1, monotonic_ms: 105 });
  observability.recordLog({ ...traceContext, level: 'info', component: 'coordinator', message: 'task admitted', monotonic_ms: 103 });

  assert.equal(observability.metrics({ trace_id: 'trace_alpha01' }).length, 1);
  assert.equal(observability.logs({ tenant_id: 'tenant_alpha01' }).length, 1);
  assert.deepEqual(observability.timeline({ trace_id: 'trace_alpha01' }).map((entry) => entry.monotonic_ms), [103, 105]);
});

test('LocalObservability rejects metrics and logs without trace_id', () => {
  const observability = new LocalObservability();

  assert.throws(
    () => observability.incrementMetric({ tenant_id: 'tenant_alpha01', name: 'tasks.accepted' }),
    /Invalid platform identifier: trace_id/,
  );
  assert.throws(
    () => observability.recordLog({ tenant_id: 'tenant_alpha01', level: 'info', component: 'coordinator', message: 'missing trace' }),
    /Invalid platform identifier: trace_id/,
  );
});

test('LocalObservability marks degraded health when a check fails', () => {
  const observability = new LocalObservability();
  assert.equal(observability.health(['service.local', 'fail.event-bus']).status, 'degraded');
});
