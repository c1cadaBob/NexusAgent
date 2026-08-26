import assert from 'node:assert/strict';
import test from 'node:test';

import { buildHermesExecutionPlanFixture } from '../../platform/adapters/hermes/index.ts';
import { ManualClock } from '../../platform/clock/index.ts';
import {
  evaluateExecutionPlanQuality,
  PlanQualityError,
  recordPlanQualityEvaluation,
  recordPlanQualityWarning,
} from '../../platform/coordinator/index.ts';
import { LocalObservability } from '../../platform/observability/index.ts';

const forbidden = /Hermes|OpenClaw|DeepSeek|\bDSH\b|raw_credential|credential_material|native_(?:url|path|session|error)|provider_runtime|https?:\/\/|\/(?:opt|tmp|var|etc|home|usr)\//i;

function assertNoLeak(value, label) {
  assert.doesNotMatch(JSON.stringify(value), forbidden, `${label} leaked forbidden content`);
}

function evaluate(plan = buildHermesExecutionPlanFixture()) {
  return evaluateExecutionPlanQuality({
    execution_plan: plan,
    evaluated_at_utc: '2026-08-26T09:20:00.000Z',
    monotonic_ms: 20_000,
  });
}

test('P7 plan quality evaluation and observability projection contain only platform fields', () => {
  const observability = new LocalObservability({
    clock: new ManualClock({ utc_timestamp: '2026-08-26T09:20:00.000Z', monotonic_ms: 20_000 }),
    service: 'coordinator',
    version: 'p7-security',
  });
  const evaluation = evaluate();
  recordPlanQualityEvaluation(observability, evaluation);

  assertNoLeak(evaluation, 'evaluation');
  assertNoLeak(observability.metrics({ trace_id: evaluation.trace_id }), 'metrics');
  assertNoLeak(observability.logs({ trace_id: evaluation.trace_id }), 'logs');
  assertNoLeak(observability.timeline({ trace_id: evaluation.trace_id }), 'timeline');
});

test('P7 plan quality rejects native raw provider and credential markers before projection', () => {
  const plan = buildHermesExecutionPlanFixture();
  for (const poisoned of [
    { ...plan, raw_credential: 'secret-value' },
    { ...plan, native_path: '/opt/native/session' },
    { ...plan, provider_runtime: 'direct' },
    { ...plan, risks: [{ ...plan.risks[0], mitigation: 'send to https://native.invalid/session' }] },
  ]) {
    assert.throws(
      () => evaluate(poisoned),
      (error) => error instanceof PlanQualityError && error.code === 'PLATFORM_SCHEMA_VALIDATION_FAILED',
    );
  }
});

test('P7 plan quality warning logs sanitize evaluator errors', () => {
  const observability = new LocalObservability({
    clock: new ManualClock({ utc_timestamp: '2026-08-26T09:20:00.000Z', monotonic_ms: 20_000 }),
    service: 'coordinator',
    version: 'p7-security',
  });
  recordPlanQualityWarning({
    observability,
    tenant_id: 'tenant_alpha01',
    task_id: 'task_alpha01',
    attempt_id: 'attempt_alpha01',
    execution_id: 'exec_alpha01',
    conversation_id: 'conv_alpha01',
    trace_id: 'trace_alpha01',
    recorded_at_utc: '2026-08-26T09:20:00.000Z',
    monotonic_ms: 20_000,
    error: new Error('native_url https://native.invalid credential_material secret'),
  });
  const logs = observability.logs({ trace_id: 'trace_alpha01' });
  assert.equal(logs.length, 1);
  assert.deepEqual(logs[0].fields, { code: 'PLATFORM_INVALID_REQUEST', reason_code: 'PLAN_QUALITY_EVALUATION_SKIPPED' });
  assertNoLeak(logs, 'warning logs');
});
