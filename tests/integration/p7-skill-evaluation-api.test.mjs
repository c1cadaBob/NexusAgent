import assert from 'node:assert/strict';
import test from 'node:test';

import { createManualPlatformApi } from '../../product/api/index.ts';

const admin = Object.freeze({ authorization: 'Bearer dev-platform-admin' });
const tenantAdmin = Object.freeze({ authorization: 'Bearer dev-tenant-admin-alpha' });
const operator = Object.freeze({ authorization: 'Bearer dev-operator-alpha' });
const viewer = Object.freeze({ authorization: 'Bearer dev-viewer-alpha' });

function assertNoLeak(value) {
  assert.doesNotMatch(JSON.stringify(value), /Hermes|OpenClaw|DeepSeek|\bDSH\b|native_|raw_credential|credential_material|provider_(?:binding|runtime)|source_ref|https?:\/\/|\/(?:opt|tmp|var|etc|home|usr)\//i);
}

test('P7 skill evaluation API is default-off and tenant managed', async () => {
  const app = createManualPlatformApi();
  const config = await app.handle({ method: 'GET', path: '/v1/skill-evaluations/config?tenant_id=tenant_alpha01&trace_id=trace_skill_eval_api01', headers: tenantAdmin });
  assert.equal(config.status, 200);
  assert.equal(config.body.schema_version, 'nexus.skill_evaluation.p7.v1');
  assert.equal(config.body.enabled, false);
  assert.equal(config.body.mode, 'manual');
  assert.equal(config.body.corpus, 'approved_rejected_disabled');

  const blockedRun = await app.handle({ method: 'POST', path: '/v1/skill-evaluations/runs', headers: tenantAdmin, body: { tenant_id: 'tenant_alpha01', trace_id: 'trace_skill_eval_api02' } });
  assert.equal(blockedRun.status, 403);
  assert.equal(blockedRun.body.code, 'PLATFORM_FORBIDDEN');
  assertNoLeak({ config, blockedRun });
});

test('P7 skill evaluation API runs deterministic approved rejected disabled corpus', async () => {
  const app = createManualPlatformApi();
  const imported = await app.handle({
    method: 'POST',
    path: '/v1/admin/plugins/import',
    headers: admin,
    body: {
      source_kind: 'package_registry',
      source_ref: 'registry:evaluation.blocked',
      display_name: 'Evaluation Blocked Plugin',
      version: '1.0.0',
      expected_sha256: 'f'.repeat(64),
      license: 'MIT',
      notice_status: 'recorded',
      risk_level: 'medium',
      trace_id: 'trace_skill_eval_api03',
    },
  });
  assert.equal(imported.status, 202);
  const rejected = await app.handle({
    method: 'POST',
    path: `/v1/admin/plugins/${imported.body.plugin_id}/admission`,
    headers: admin,
    body: { decision: 'reject', reason: 'evaluation corpus negative case', trace_id: 'trace_skill_eval_api04' },
  });
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.allowlist_status, 'rejected');

  const enabled = await app.handle({ method: 'PATCH', path: '/v1/skill-evaluations/config', headers: tenantAdmin, body: { tenant_id: 'tenant_alpha01', enabled: true, max_cases: 20, trace_id: 'trace_skill_eval_api05' } });
  assert.equal(enabled.status, 200);
  assert.equal(enabled.body.enabled, true);

  const run = await app.handle({ method: 'POST', path: '/v1/skill-evaluations/runs', headers: tenantAdmin, body: { tenant_id: 'tenant_alpha01', trace_id: 'trace_skill_eval_api06' } });
  assert.equal(run.status, 202);
  assert.equal(run.body.status, 'passed');
  assert.equal(run.body.totals.approved_cases >= 1, true);
  assert.equal(run.body.totals.rejected_disabled_cases >= 3, true);
  assert.equal(run.body.cases.some((item) => item.candidate_id === imported.body.plugin_id && item.actual_outcome === 'blocked'), true);
  assert.equal(Object.hasOwn(run.body.cases[0], 'source_ref'), false);

  const listed = await app.handle({ method: 'GET', path: '/v1/skill-evaluations/runs?tenant_id=tenant_alpha01&limit=1', headers: tenantAdmin });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.items.length, 1);
  const read = await app.handle({ method: 'GET', path: `/v1/skill-evaluations/runs/${run.body.run_id}?tenant_id=tenant_alpha01`, headers: tenantAdmin });
  assert.equal(read.status, 200);
  assert.equal(read.body.run_id, run.body.run_id);

  const metrics = app.observability.metrics({ trace_id: 'trace_skill_eval_api06' });
  assert.equal(metrics.some((metric) => metric.name === 'skill_evaluation.failed_case_count'), true);
  const logs = app.observability.logs({ trace_id: 'trace_skill_eval_api06' });
  assert.equal(logs[0].message, 'skill_evaluation.completed');
  assertNoLeak({ rejected, enabled, run, listed, read, metrics, logs });
});

test('P7 skill evaluation API fails closed for unauthorized and cross-tenant callers', async () => {
  const app = createManualPlatformApi();
  for (const headers of [operator, viewer]) {
    const response = await app.handle({ method: 'GET', path: '/v1/skill-evaluations/config?tenant_id=tenant_alpha01&trace_id=trace_skill_eval_api07', headers });
    assert.equal(response.status, 403);
    assert.equal(response.body.code, 'PLATFORM_FORBIDDEN');
    assertNoLeak(response.body);
  }

  const crossTenant = await app.handle({ method: 'PATCH', path: '/v1/skill-evaluations/config', headers: tenantAdmin, body: { tenant_id: 'tenant_beta01', enabled: true, trace_id: 'trace_skill_eval_api08' } });
  assert.equal(crossTenant.status, 403);
  assert.equal(crossTenant.body.code, 'PLATFORM_FORBIDDEN');

  const platformAdmin = await app.handle({ method: 'GET', path: '/v1/skill-evaluations/config?tenant_id=tenant_beta01&trace_id=trace_skill_eval_api09', headers: admin });
  assert.equal(platformAdmin.status, 200);
  assert.equal(platformAdmin.body.tenant_id, 'tenant_beta01');
  assertNoLeak({ crossTenant, platformAdmin });
});

test('P7 skill evaluation failure isolation leaves platform task submission available', async () => {
  const app = createManualPlatformApi();
  const disabledRun = await app.handle({ method: 'POST', path: '/v1/skill-evaluations/runs', headers: tenantAdmin, body: { tenant_id: 'tenant_alpha01', trace_id: 'trace_skill_eval_api10' } });
  assert.equal(disabledRun.status, 403);

  const task = await app.handle({
    method: 'POST',
    path: '/v1/tasks',
    headers: operator,
    body: {
      tenant_id: 'tenant_alpha01',
      user_id: 'user_alpha01',
      agent_id: 'agent_alpha01',
      conversation_id: 'conv_skill_eval_api01',
      input: 'submit task after skill evaluation denial',
      trace_id: 'trace_skill_eval_api11',
    },
  });
  assert.equal(task.status, 202);
  assert.equal(task.body.state, 'admitted');
  assertNoLeak({ disabledRun, task });
});
