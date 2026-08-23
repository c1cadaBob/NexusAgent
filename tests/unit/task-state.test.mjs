import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PLATFORM_ID_KEYS,
  TASK_STATE_LAYERS,
  TASK_STATES,
  TaskStateTransitionError,
  assertPlatformId,
  assertTransition,
  buildTaskStateEvent,
  getTaskStateLayer,
  isTransitionAllowed,
} from '../../platform/task-state/index.ts';

const baseSnapshot = Object.freeze({
  tenant_id: 'tenant_alpha01',
  task_id: 'task_alpha01',
  attempt_id: 'attempt_alpha01',
  trace_id: 'trace_alpha01',
  conversation_id: 'conv_alpha01',
  state: 'received',
  version: 1,
  monotonic_ms: 100,
});

test('defines required platform identifiers and seven state layers', () => {
  assert.deepEqual(PLATFORM_ID_KEYS, [
    'tenant_id',
    'user_id',
    'agent_id',
    'task_id',
    'attempt_id',
    'execution_id',
    'conversation_id',
    'artifact_id',
    'trace_id',
  ]);
  assert.equal(TASK_STATE_LAYERS.length, 7);
  assert.equal(getTaskStateLayer('received'), 'intake');
  assert.equal(getTaskStateLayer('executing'), 'execution');
  assert.ok(TASK_STATES.includes('approval_required'));
});

test('validates platform identifier prefixes', () => {
  assert.equal(assertPlatformId('tenant_id', 'tenant_valid001'), 'tenant_valid001');
  assert.throws(
    () => assertPlatformId('tenant_id', 'workspace_valid001'),
    (error) => error instanceof TaskStateTransitionError && error.code === 'PLATFORM_INVALID_REQUEST',
  );
});

test('allows legal state transition and emits platform event envelope', () => {
  const result = assertTransition({
    current: baseSnapshot,
    next: { ...baseSnapshot, state: 'admitted', version: 2, monotonic_ms: 101 },
    reason: 'policy precheck passed',
  });

  assert.equal(result.previous_state, 'received');
  assert.equal(result.next.state, 'admitted');
  assert.equal(result.state_layer, 'admission');
  assert.equal(result.outcome, null);

  const event = buildTaskStateEvent(result, {
    event_id: 'event_alpha01',
    occurred_at_utc: '2026-08-23T00:00:00Z',
    monotonic_ms: 102,
  });

  assert.equal(event.schema_version, 'nexus.event_envelope.v1');
  assert.equal(event.event_type, 'task.state_changed');
  assert.equal(event.tenant_id, baseSnapshot.tenant_id);
  assert.deepEqual(event.payload, {
    previous_state: 'received',
    state: 'admitted',
    state_layer: 'admission',
    outcome: null,
    reason: 'policy precheck passed',
  });
});

test('rejects illegal state transition', () => {
  assert.equal(isTransitionAllowed('planning', 'completed'), false);
  assert.throws(
    () => assertTransition({
      current: { ...baseSnapshot, state: 'planning' },
      next: { ...baseSnapshot, state: 'completed', monotonic_ms: 110 },
      reason: 'skip execution',
    }),
    (error) => error instanceof TaskStateTransitionError && error.code === 'PLATFORM_INVALID_STATE_TRANSITION',
  );
});

test('rejects cross-tenant transitions before state checks', () => {
  assert.throws(
    () => assertTransition({
      current: baseSnapshot,
      next: { ...baseSnapshot, tenant_id: 'tenant_other01', state: 'admitted', monotonic_ms: 101 },
      reason: 'spoof tenant',
    }),
    (error) => error instanceof TaskStateTransitionError && error.code === 'PLATFORM_CROSS_TENANT_ID',
  );
});

test('allows retry attempt only from blocked failed or cancelled states', () => {
  const retry = assertTransition({
    current: { ...baseSnapshot, state: 'failed', monotonic_ms: 200 },
    next: { ...baseSnapshot, attempt_id: 'attempt_retry01', state: 'admitted', monotonic_ms: 201 },
    reason: 'operator requested retry',
  });
  assert.equal(retry.next.attempt_id, 'attempt_retry01');
  assert.equal(retry.next.state, 'admitted');

  assert.throws(
    () => assertTransition({
      current: { ...baseSnapshot, state: 'executing', monotonic_ms: 200 },
      next: { ...baseSnapshot, attempt_id: 'attempt_badretry01', state: 'admitted', monotonic_ms: 201 },
      reason: 'invalid retry',
    }),
    (error) => error instanceof TaskStateTransitionError && error.code === 'PLATFORM_INVALID_STATE_TRANSITION',
  );
});

test('rejects backwards monotonic clock values', () => {
  assert.throws(
    () => assertTransition({
      current: { ...baseSnapshot, state: 'received', monotonic_ms: 300 },
      next: { ...baseSnapshot, state: 'admitted', monotonic_ms: 299 },
      reason: 'clock regression',
    }),
    (error) => error instanceof TaskStateTransitionError && error.code === 'PLATFORM_INVALID_STATE_TRANSITION',
  );
});
