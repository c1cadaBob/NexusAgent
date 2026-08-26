import assert from 'node:assert/strict';
import test from 'node:test';

import { buildHermesExecutionPlanFixture } from '../../platform/adapters/hermes/index.ts';
import {
  evaluateExecutionPlanQuality,
  PLAN_QUALITY_DEFAULT_ENABLED,
  PLAN_QUALITY_SCHEMA_VERSION,
  PlanQualityError,
} from '../../platform/coordinator/index.ts';

function evaluate(plan = buildHermesExecutionPlanFixture(), overrides = {}) {
  return evaluateExecutionPlanQuality({
    execution_plan: plan,
    evaluated_at_utc: '2026-08-26T09:00:00.000Z',
    monotonic_ms: 9_000,
    ...overrides,
  });
}

function assertNoLeak(value) {
  assert.doesNotMatch(JSON.stringify(value), /raw_credential|credential_material|native_(?:url|path|session|error)|provider_runtime|https?:\/\/|\/(?:opt|tmp|var|etc|home|usr)\//i);
}

test('P7 plan quality evaluator scores a valid ExecutionPlan with platform-only signals', () => {
  const result = evaluate();
  assert.equal(PLAN_QUALITY_DEFAULT_ENABLED, false);
  assert.equal(result.schema_version, PLAN_QUALITY_SCHEMA_VERSION);
  assert.equal(result.feature_enabled, true);
  assert.equal(result.quality_band, 'excellent');
  assert.equal(result.quality_score, 100);
  assert.equal(result.resource_budget.evaluation_mode, 'deterministic_static');
  assert.equal(result.resource_budget.token_budget_scope, 'not_applicable_p7_01');
  assert.ok(result.signals.some((signal) => signal.reason_code === 'PLAN_EXECUTOR_POLICY_CONTROLLED'));
  assert.ok(result.explanations.every((explanation) => /^[A-Z0-9_]+$/.test(explanation.reason_code)));
  assertNoLeak(result);
});

test('P7 plan quality evaluator produces explanatory warning signals for weak plans', () => {
  const plan = buildHermesExecutionPlanFixture();
  const weakPlan = {
    ...plan,
    steps: [
      plan.steps[0],
      { ...plan.steps[1], status: 'blocked' },
      plan.steps[2],
    ],
    budget: { ...plan.budget, estimated_units: 1, max_execution_steps: 1 },
    risks: [{ ...plan.risks[0], severity: 'critical' }],
  };
  const result = evaluate(weakPlan);
  assert.equal(result.quality_band, 'watch');
  assert.ok(result.quality_score < 100);
  assert.ok(result.signals.some((signal) => signal.reason_code === 'PLAN_BLOCKED_STEPS_PRESENT'));
  assert.ok(result.signals.some((signal) => signal.reason_code === 'PLAN_BUDGET_STEP_ALIGNMENT_LOW'));
  assert.ok(result.signals.some((signal) => signal.reason_code === 'PLAN_HIGH_RISK_PRESENT'));
  assertNoLeak(result);
});

test('P7 plan quality evaluator fails closed for invalid or native-like payloads', () => {
  assert.throws(
    () => evaluate({ ...buildHermesExecutionPlanFixture(), schema_version: 'nexus.execution_plan.p0.v1' }),
    (error) => error instanceof PlanQualityError && error.code === 'PLATFORM_SCHEMA_VALIDATION_FAILED',
  );
  assert.throws(
    () => evaluate({ ...buildHermesExecutionPlanFixture(), native_url: 'https://native.invalid/session' }),
    (error) => error instanceof PlanQualityError && error.code === 'PLATFORM_SCHEMA_VALIDATION_FAILED',
  );
  assert.throws(
    () => evaluate({ ...buildHermesExecutionPlanFixture(), objective: 'load raw_credential from /opt/native/session' }),
    (error) => error instanceof PlanQualityError && error.code === 'PLATFORM_SCHEMA_VALIDATION_FAILED',
  );
});
