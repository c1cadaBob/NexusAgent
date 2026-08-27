import assert from 'node:assert/strict';
import test from 'node:test';

import { ManualClock } from '../../platform/clock/index.ts';
import { LocalObservability } from '../../platform/observability/index.ts';
import { LocalPluginGovernance } from '../../platform/plugin-governance/index.ts';
import {
  LocalSkillEvaluation,
  SKILL_EVALUATION_DEFAULT_ENABLED,
  SKILL_EVALUATION_SCHEMA_VERSION,
} from '../../platform/skill-evaluation/index.ts';

function harness() {
  const clock = new ManualClock({ utc_timestamp: '2026-08-27T09:00:00.000Z', monotonic_ms: 90_000 });
  const observability = new LocalObservability({ clock, service: 'skill-evaluation', version: 'p7-test' });
  const catalog = new LocalPluginGovernance({ tenant_id: 'tenant_alpha01', trace_id: 'trace_skill_eval01' });
  const evaluation = new LocalSkillEvaluation({ clock, catalog, observability });
  return { catalog, evaluation, observability };
}

function assertNoLeak(value) {
  assert.doesNotMatch(JSON.stringify(value), /Hermes|OpenClaw|DeepSeek|\bDSH\b|native_|raw_credential|credential_material|provider_(?:binding|runtime)|source_ref|https?:\/\/|\/(?:opt|tmp|var|etc|home|usr)\//i);
}

test('P7 skill evaluation is default-off and requires explicit tenant config', () => {
  const { evaluation, observability } = harness();
  const config = evaluation.getConfig('tenant_alpha01', 'trace_skill_eval01');
  assert.equal(config.schema_version, SKILL_EVALUATION_SCHEMA_VERSION);
  assert.equal(config.enabled, SKILL_EVALUATION_DEFAULT_ENABLED);
  assert.equal(config.mode, 'manual');
  assert.equal(config.corpus, 'approved_rejected_disabled');

  assert.throws(() => evaluation.run({ tenant_id: 'tenant_alpha01', trace_id: 'trace_skill_eval02', requested_by_user_id: 'user_tenant_admin' }), /disabled/);
  assert.deepEqual(observability.metrics({ trace_id: 'trace_skill_eval02' }), []);
  assertNoLeak(config);
});

test('P7 skill evaluation deterministically covers approved and rejected disabled candidates', () => {
  const { evaluation, observability } = harness();
  const config = evaluation.updateConfig({ tenant_id: 'tenant_alpha01', trace_id: 'trace_skill_eval03', enabled: true, max_cases: 10 });
  assert.equal(config.enabled, true);
  assert.equal(config.resource_budget.max_cases, 10);

  const report = evaluation.run({ tenant_id: 'tenant_alpha01', trace_id: 'trace_skill_eval04', requested_by_user_id: 'user_tenant_admin' });
  assert.equal(report.schema_version, SKILL_EVALUATION_SCHEMA_VERSION);
  assert.equal(report.status, 'passed');
  assert.equal(report.totals.failed_cases, 0);
  assert.equal(report.totals.approved_cases >= 1, true);
  assert.equal(report.totals.rejected_disabled_cases >= 2, true);
  assert.equal(report.cases.some((item) => item.expected_outcome === 'visible' && item.actual_outcome === 'visible'), true);
  assert.equal(report.cases.some((item) => item.expected_outcome === 'blocked' && item.actual_outcome === 'blocked'), true);

  const metrics = observability.metrics({ trace_id: 'trace_skill_eval04' });
  assert.deepEqual(metrics.map((metric) => metric.name), ['skill_evaluation.run_count', 'skill_evaluation.case_count', 'skill_evaluation.failed_case_count']);
  const logs = observability.logs({ trace_id: 'trace_skill_eval04' });
  assert.equal(logs[0].message, 'skill_evaluation.completed');
  assert.equal(logs[0].fields.status, 'passed');
  assertNoLeak({ report, metrics, logs });
});

test('P7 skill evaluation runner failures stay isolated in sanitized reports', () => {
  const { evaluation, observability } = harness();
  evaluation.updateConfig({ tenant_id: 'tenant_alpha01', trace_id: 'trace_skill_eval05', enabled: true });
  const report = evaluation.run({ tenant_id: 'tenant_alpha01', trace_id: 'trace_skill_eval06', requested_by_user_id: 'user_tenant_admin', inject_failure: true });
  assert.equal(report.status, 'failed');
  assert.deepEqual(report.cases, []);
  assert.deepEqual(report.reason_codes, ['SKILL_EVALUATION_RUNNER_ERROR']);
  const logs = observability.logs({ trace_id: 'trace_skill_eval06' });
  assert.equal(logs[0].level, 'warn');
  assert.equal(logs[0].fields.status, 'failed');
  assertNoLeak({ report, logs });
});
