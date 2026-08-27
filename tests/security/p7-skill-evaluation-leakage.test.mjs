import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { ManualClock } from '../../platform/clock/index.ts';
import { LocalObservability } from '../../platform/observability/index.ts';
import { LocalSkillEvaluation } from '../../platform/skill-evaluation/index.ts';
import { createManualPlatformApi } from '../../product/api/index.ts';
import { DEV_PRINCIPALS } from '../../product/web-console/src/apiClient.ts';
import { actionEnabled, assertConsolePublicValue, projectSkillEvaluationCaseRows, projectSkillEvaluationRows, visibleNavigation } from '../../product/web-console/src/viewModel.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tenantAdmin = Object.freeze({ authorization: 'Bearer dev-tenant-admin-alpha' });

function assertNoLeak(value) {
  assert.doesNotMatch(JSON.stringify(value), /Hermes|OpenClaw|DeepSeek|\bDSH\b|native_|raw_credential|credential_material|provider_(?:binding|runtime|agent|task|cancel)|source_ref|https?:\/\/|\/(?:opt|tmp|var|etc|home|usr)\//i);
}

test('P7 skill evaluation API rejects native raw provider and credential markers', async () => {
  const app = createManualPlatformApi();
  for (const body of [
    { tenant_id: 'tenant_alpha01', enabled: true, trace_id: 'trace_skill_leak01', native_url: 'http://blocked.local' },
    { tenant_id: 'tenant_alpha01', trace_id: 'trace_skill_leak02', raw_credential: 'secret-token-value' },
    { tenant_id: 'tenant_alpha01', trace_id: 'trace_skill_leak03', provider_runtime: 'direct' },
    { tenant_id: 'tenant_alpha01', trace_id: 'trace_skill_leak04', manifest: { file_path: '/opt/project/native' } },
  ]) {
    const route = Object.hasOwn(body, 'enabled') ? '/v1/skill-evaluations/config' : '/v1/skill-evaluations/runs';
    const method = Object.hasOwn(body, 'enabled') ? 'PATCH' : 'POST';
    const response = await app.handle({ method, path: route, headers: tenantAdmin, body });
    assert.equal(response.status, 400);
    assert.equal(response.body.code, 'PLATFORM_INVALID_REQUEST');
    assertNoLeak(response.body);
  }
});

test('P7 skill evaluation sanitizes malicious catalog output into failed report', () => {
  const clock = new ManualClock({ utc_timestamp: '2026-08-27T10:00:00.000Z', monotonic_ms: 100_000 });
  const observability = new LocalObservability({ clock, service: 'skill-evaluation', version: 'p7-security' });
  const catalog = {
    listCapabilities() {
      return [{
        capability_id: 'cap_native_url_blocked',
        capability_type: 'skill',
        display_name: 'Blocked capability',
        plugin_id: 'plugin_safe01',
        status: 'approved',
        risk_level: 'low',
        required_permissions: ['planner:invoke'],
      }];
    },
    listInventory() {
      return [];
    },
  };
  const evaluation = new LocalSkillEvaluation({ clock, catalog, observability });
  evaluation.updateConfig({ tenant_id: 'tenant_alpha01', trace_id: 'trace_skill_leak05', enabled: true });
  const report = evaluation.run({ tenant_id: 'tenant_alpha01', trace_id: 'trace_skill_leak06', requested_by_user_id: 'user_tenant_admin' });
  assert.equal(report.status, 'failed');
  assert.deepEqual(report.cases, []);
  const logs = observability.logs({ trace_id: 'trace_skill_leak06' });
  assert.equal(logs[0].fields.reason_codes.includes('SKILL_EVALUATION_RUNNER_ERROR'), true);
  assertNoLeak({ report, logs });
});

test('P7 skill evaluation console projection hides raw fixture details and gates navigation', () => {
  const admin = DEV_PRINCIPALS.find((profile) => profile.key === 'tenant-admin');
  const operator = DEV_PRINCIPALS.find((profile) => profile.key === 'operator');
  assert.ok(admin && operator);
  assert.equal(actionEnabled(admin, 'manage_skill_evaluation'), true);
  assert.equal(actionEnabled(operator, 'manage_skill_evaluation'), false);
  assert.equal(visibleNavigation(admin).some((item) => item.id === 'evaluations'), true);
  assert.equal(visibleNavigation(operator).some((item) => item.id === 'evaluations'), false);

  const report = {
    schema_version: 'nexus.skill_evaluation.p7.v1',
    tenant_id: 'tenant_alpha01',
    run_id: 'skill_eval_run_alpha01_0001',
    suite_id: 'skill_eval_suite_alpha01',
    status: 'passed',
    totals: { total_cases: 2, passed_cases: 2, failed_cases: 0, skipped_cases: 0, approved_cases: 1, rejected_disabled_cases: 1 },
    cases: [
      { case_id: 'skill_eval_case_0001', candidate_id: 'cap_planner_security_guidance', candidate_kind: 'capability', capability_type: 'skill', expected_outcome: 'visible', actual_outcome: 'visible', status: 'passed', reason_codes: ['SKILL_EVAL_APPROVED_VISIBLE'] },
      { case_id: 'skill_eval_case_0002', candidate_id: 'plugin_disabled_skill_fixture', candidate_kind: 'blocked_fixture', capability_type: 'skill', expected_outcome: 'blocked', actual_outcome: 'blocked', status: 'passed', reason_codes: ['SKILL_EVAL_REJECTED_DISABLED_BLOCKED'] },
    ],
    resource_budget: { evaluation_mode: 'deterministic_regression', max_cases: 25, evaluated_cases: 2 },
    started_at_utc: '2026-08-27T10:00:00.000Z',
    completed_at_utc: '2026-08-27T10:00:00.000Z',
    monotonic_ms: 100,
    trace_id: 'trace_skill_leak07',
    reason_codes: ['SKILL_EVALUATION_PASSED'],
  };
  const rows = projectSkillEvaluationRows([report]);
  const cases = projectSkillEvaluationCaseRows(report);
  assert.equal(rows[0].status, 'passed');
  assert.equal(cases.length, 2);
  assertNoLeak({ rows, cases });
  assert.throws(() => assertConsolePublicValue({ source_ref: 'registry:blocked' }), /non-platform marker/);
});

test('P7 skill evaluation public product source avoids adapters vendors and internal brands', async () => {
  for (const relativePath of [
    'product/api/index.ts',
    'product/sdk/src/index.ts',
    'product/web-console/src/apiClient.ts',
    'product/web-console/src/viewModel.ts',
    'product/web-console/src/main.tsx',
    'product/docs-site/src/catalog.ts',
  ]) {
    const source = await readFile(path.join(repoRoot, relativePath), 'utf8');
    assert.doesNotMatch(source, /Hermes|OpenClaw|DeepSeek|\bDSH\b/, relativePath);
    assert.doesNotMatch(source, /platform\/adapters|vendor\//, relativePath);
    assert.doesNotMatch(source, /Date\.now\(/, relativePath);
  }
});
