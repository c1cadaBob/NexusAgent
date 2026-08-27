import assert from 'node:assert/strict';
import test from 'node:test';

import { createManualPlatformApi } from '../../product/api/index.ts';

const tenantAdmin = Object.freeze({ authorization: 'Bearer dev-tenant-admin-alpha' });
const platformAdmin = Object.freeze({ authorization: 'Bearer dev-platform-admin' });
const operator = Object.freeze({ authorization: 'Bearer dev-operator-alpha' });
const viewer = Object.freeze({ authorization: 'Bearer dev-viewer-alpha' });

function assertClean(value) {
  assert.doesNotMatch(JSON.stringify(value), /Hermes|OpenClaw|DeepSeek|\bDSH\b|native_|raw_credential|credential_material|provider_(?:binding|runtime)|memory_rejected_text|stale_payload|https?:\/\/|\/(?:opt|tmp|var|etc|home|usr)\//i);
}

test('P7 token budget API exposes default-on all-configured policy to tenant admins', async () => {
  const app = createManualPlatformApi();
  const policy = await app.handle({ method: 'GET', path: '/v1/budget/policy?tenant_id=tenant_alpha01&trace_id=trace_budget_api01', headers: tenantAdmin });

  assert.equal(policy.status, 200);
  assert.equal(policy.body.schema_version, 'nexus.token_budget.p7.v1');
  assert.equal(policy.body.enabled, true);
  assert.equal(policy.body.dimension_mode, 'all_configured');
  assert.equal(policy.body.enforcement_scope, 'task_adapter_api');
  assert.deepEqual(policy.body.resource_budget.dimensions, ['tenant', 'user', 'agent', 'task']);
  assertClean(policy.body);
});

test('P7 token budget API updates policy checks budget and lists ledger entries', async () => {
  const app = createManualPlatformApi();
  const updated = await app.handle({
    method: 'PATCH',
    path: '/v1/budget/policy',
    headers: tenantAdmin,
    body: {
      tenant_id: 'tenant_alpha01',
      trace_id: 'trace_budget_api02',
      limits: { tenant_units: 20, user_units: 20, agent_units: 20, task_units: 10, max_units_per_attempt: 8 },
    },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.limits.max_units_per_attempt, 8);

  const approved = await app.handle({
    method: 'POST',
    path: '/v1/budget/check',
    headers: operator,
    body: { tenant_id: 'tenant_alpha01', user_id: 'user_alpha01', agent_id: 'agent_alpha01', task_id: 'task_budget_api01', requested_units: 4, trace_id: 'trace_budget_api03', consume: true },
  });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.status, 'approved');
  assert.equal(approved.body.dimensions.some((item) => item.dimension === 'task'), true);

  const degraded = await app.handle({
    method: 'POST',
    path: '/v1/budget/check',
    headers: operator,
    body: { tenant_id: 'tenant_alpha01', user_id: 'user_alpha01', agent_id: 'agent_alpha01', task_id: 'task_budget_api01', requested_units: 9, trace_id: 'trace_budget_api04' },
  });
  assert.equal(degraded.status, 200);
  assert.equal(degraded.body.status, 'degraded');
  assert.equal(degraded.body.reason_codes.includes('TOKEN_BUDGET_MAX_ATTEMPT_EXCEEDED'), true);

  const ledger = await app.handle({ method: 'GET', path: '/v1/budget/ledger?tenant_id=tenant_alpha01', headers: tenantAdmin });
  assert.equal(ledger.status, 200);
  assert.equal(ledger.body.items.some((entry) => entry.status === 'reserved' && entry.consumed_units === 4), true);
  assert.equal(ledger.body.items.some((entry) => entry.status === 'denied'), true);
  assertClean({ updated, approved, degraded, ledger });
});

test('P7 token budget API permissions fail closed', async () => {
  const app = createManualPlatformApi();
  const viewerPolicy = await app.handle({ method: 'GET', path: '/v1/budget/policy?tenant_id=tenant_alpha01', headers: viewer });
  assert.equal(viewerPolicy.status, 403);
  assert.equal(viewerPolicy.body.code, 'PLATFORM_FORBIDDEN');

  const viewerCheck = await app.handle({ method: 'POST', path: '/v1/budget/check', headers: viewer, body: { tenant_id: 'tenant_alpha01', requested_units: 1, trace_id: 'trace_budget_api05' } });
  assert.equal(viewerCheck.status, 403);

  const betaPolicy = await app.handle({ method: 'GET', path: '/v1/budget/policy?tenant_id=tenant_beta01&trace_id=trace_budget_api06', headers: platformAdmin });
  assert.equal(betaPolicy.status, 200);
  assert.equal(betaPolicy.body.tenant_id, 'tenant_beta01');
  const crossTenant = await app.handle({ method: 'GET', path: '/v1/budget/policy?tenant_id=tenant_beta01', headers: tenantAdmin });
  assert.equal(crossTenant.status, 403);
  assertClean({ viewerPolicy, viewerCheck, betaPolicy, crossTenant });
});
