import assert from 'node:assert/strict';
import test from 'node:test';

import { createManualPlatformApi } from '../../product/api/index.ts';

const operator = Object.freeze({ authorization: 'Bearer dev-operator-alpha' });
const tenantAdmin = Object.freeze({ authorization: 'Bearer dev-tenant-admin-alpha' });
const platformAdmin = Object.freeze({ authorization: 'Bearer dev-platform-admin' });
const viewer = Object.freeze({ authorization: 'Bearer dev-viewer-alpha' });

function assertClean(value) {
  assert.doesNotMatch(JSON.stringify(value), /Hermes|OpenClaw|DeepSeek|\bDSH\b|native_|raw_credential|credential_material|provider_runtime|https?:\/\/|\/(?:opt|tmp|var|etc|home|usr)\//i);
}

async function writeMemory(app, headers, body = {}) {
  const response = await app.handle({
    method: 'POST',
    path: '/v1/memory',
    headers,
    body: {
      tenant_id: 'tenant_alpha01',
      user_id: 'user_alpha01',
      agent_id: 'agent_alpha01',
      conversation_id: 'conv_alpha01',
      layer: 'session',
      text: 'retention api memory record',
      trace_id: 'trace_retention_api01',
      ...body,
    },
  });
  assert.equal(response.status, 201);
  return response.body;
}

test('P7 memory retention API exposes admin-managed conservative policy and manual sweep', async () => {
  const app = createManualPlatformApi();
  const policy = await app.handle({ method: 'GET', path: '/v1/memory/retention?tenant_id=tenant_alpha01&trace_id=trace_retention_api02', headers: tenantAdmin });
  assert.equal(policy.status, 200);
  assert.equal(policy.body.schema_version, 'nexus.memory_retention.p7.v1');
  assert.equal(policy.body.enabled, true);
  assert.equal(policy.body.rules.find((rule) => rule.layer === 'session').ttl_days, 7);
  assert.equal(policy.body.rules.find((rule) => rule.layer === 'audit_snapshot').immutable, true);

  const memory = await writeMemory(app, operator);
  app.clock.advance(8 * 24 * 60 * 60 * 1000);
  const sweep = await app.handle({ method: 'POST', path: '/v1/memory/retention/sweep', headers: tenantAdmin, body: { tenant_id: 'tenant_alpha01', trace_id: 'trace_retention_api03' } });
  assert.equal(sweep.status, 200);
  assert.equal(sweep.body.deleted_count, 1);
  assert.equal(sweep.body.items[0].memory_id, memory.memory_id);
  assert.equal(sweep.body.items[0].status, 'expired');

  const search = await app.handle({ method: 'POST', path: '/v1/memory/search', headers: operator, body: { tenant_id: 'tenant_alpha01', user_id: 'user_alpha01', layer: 'session', query: 'retention api', trace_id: 'trace_retention_api04' } });
  assert.equal(search.status, 200);
  assert.equal(search.body.items.length, 0);
  assertClean({ policy, sweep, search });
});

test('P7 memory retention API soft delete hides memory while preserving public audit evidence', async () => {
  const app = createManualPlatformApi();
  const memory = await writeMemory(app, operator, { layer: 'user', text: 'tenant admin will delete this memory', trace_id: 'trace_retention_api05' });
  const deleted = await app.handle({ method: 'POST', path: `/v1/memory/${memory.memory_id}/delete`, headers: tenantAdmin, body: { tenant_id: 'tenant_alpha01', reason: 'tenant admin retention delete', trace_id: 'trace_retention_api06' } });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.status, 'deleted');
  assert.equal(deleted.body.reason_code, 'MEMORY_MANUAL_DELETE');
  assert.equal(Object.hasOwn(deleted.body, 'text'), false);

  const search = await app.handle({ method: 'POST', path: '/v1/memory/search', headers: operator, body: { tenant_id: 'tenant_alpha01', user_id: 'user_alpha01', layer: 'user', query: 'tenant admin', trace_id: 'trace_retention_api07' } });
  assert.equal(search.status, 200);
  assert.equal(search.body.items.length, 0);
  assertClean({ deleted, search });
});

test('P7 memory retention API fails closed for unauthorized and cross-tenant operations', async () => {
  const app = createManualPlatformApi();
  const memory = await writeMemory(app, operator, { layer: 'user', trace_id: 'trace_retention_api08' });

  const operatorDelete = await app.handle({ method: 'POST', path: `/v1/memory/${memory.memory_id}/delete`, headers: operator, body: { tenant_id: 'tenant_alpha01', reason: 'operator cannot delete', trace_id: 'trace_retention_api09' } });
  assert.equal(operatorDelete.status, 403);
  const viewerSweep = await app.handle({ method: 'POST', path: '/v1/memory/retention/sweep', headers: viewer, body: { tenant_id: 'tenant_alpha01', trace_id: 'trace_retention_api10' } });
  assert.equal(viewerSweep.status, 403);
  const crossTenant = await app.handle({ method: 'POST', path: `/v1/memory/${memory.memory_id}/delete`, headers: tenantAdmin, body: { tenant_id: 'tenant_beta01', reason: 'wrong tenant', trace_id: 'trace_retention_api11' } });
  assert.equal(crossTenant.status, 403);

  const betaPolicy = await app.handle({ method: 'GET', path: '/v1/memory/retention?tenant_id=tenant_beta01&trace_id=trace_retention_api12', headers: platformAdmin });
  assert.equal(betaPolicy.status, 200);
  assert.equal(betaPolicy.body.tenant_id, 'tenant_beta01');
  assertClean({ operatorDelete, viewerSweep, crossTenant, betaPolicy });
});
