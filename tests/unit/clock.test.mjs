import assert from 'node:assert/strict';
import test from 'node:test';

import { ClockError, ManualClock, SystemClock } from '../../platform/clock/index.ts';

test('SystemClock returns UTC timestamp and increasing monotonic clock', () => {
  const clock = new SystemClock();
  const first = clock.now();
  const second = clock.now();

  assert.match(first.utc_timestamp, /^\d{4}-\d{2}-\d{2}T.*Z$/);
  assert.ok(Number.isInteger(first.monotonic_ms));
  assert.ok(second.monotonic_ms > first.monotonic_ms);
});

test('ManualClock advances UTC and monotonic values deterministically', () => {
  const clock = new ManualClock({ utc_timestamp: '2026-08-23T00:00:00.000Z', monotonic_ms: 100 });
  assert.deepEqual(clock.now(), { utc_timestamp: '2026-08-23T00:00:00.000Z', monotonic_ms: 100 });

  const next = clock.advance(250);
  assert.deepEqual(next, { utc_timestamp: '2026-08-23T00:00:00.250Z', monotonic_ms: 350 });
});

test('ManualClock rejects backwards monotonic updates', () => {
  const clock = new ManualClock({ utc_timestamp: '2026-08-23T00:00:00.000Z', monotonic_ms: 100 });
  assert.throws(
    () => clock.set({ utc_timestamp: '2026-08-23T00:00:01.000Z', monotonic_ms: 99 }),
    (error) => error instanceof ClockError && error.code === 'PLATFORM_INVALID_REQUEST',
  );
});

test('ManualClock rejects invalid UTC timestamp', () => {
  assert.throws(
    () => new ManualClock({ utc_timestamp: '2026-08-23 00:00:00', monotonic_ms: 1 }),
    /Invalid UTC timestamp/,
  );
});
