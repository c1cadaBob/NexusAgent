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

async function seedConflict(app) {
  const written = await app.handle({
    method: 'POST',
    path: '/v1/memory',
    headers: operator,
    body: { tenant_id: 'tenant_alpha01', user_id: 'user_alpha01', agent_id: 'agent_alpha01', conversation_id: 'conv_memory_api01', layer: 'user', text: 'current memory record', trace_id: 'trace_memory_conflict_api01' },
  });
  assert.equal(written.status, 201);
  const stale = await app.handle({
    method: 'POST',
    path: '/v1/memory',
    headers: operator,
    body: { tenant_id: 'tenant_alpha01', user_id: 'user_alpha01', agent_id: 'agent_alpha01', conversation_id: 'conv_memory_api01', layer: 'user', text: 'stale payload must not be persisted', expected_version: 0, trace_id: 'trace_memory_conflict_api02' },
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, 'PLATFORM_CONFLICT');
  return { written, stale };
}

test('P7 memory conflict API lists reads and resolves metadata-only conflicts', async () => {
  const app = createManualPlatformApi();
  const seeded = await seedConflict(app);

  const listed = await app.handle({ method: 'GET', path: '/v1/memory/conflicts?tenant_id=tenant_alpha01&status=open&trace_id=trace_memory_conflict_api03', headers: tenantAdmin });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.items.length, 1);
  assert.equal(listed.body.items[0].schema_version, 'nexus.memory_conflict.p7.v1');
  assert.equal(JSON.stringify(listed.body).includes('stale payload must not be persisted'), false);

  const conflictId = listed.body.items[0].conflict_id;
  const read = await app.handle({ method: 'GET', path: `/v1/memory/conflicts/${conflictId}?tenant_id=tenant_alpha01`, headers: tenantAdmin });
  assert.equal(read.status, 200);
  assert.equal(read.body.conflict_id, conflictId);

  const resolved = await app.handle({
    method: 'POST',
    path: `/v1/memory/conflicts/${conflictId}/decision`,
    headers: tenantAdmin,
    body: { tenant_id: 'tenant_alpha01', decision: 'resolve', reason: 'admin reviewed version metadata', trace_id: 'trace_memory_conflict_api04' },
  });
  assert.equal(resolved.status, 200);
  assert.equal(resolved.body.status, 'resolved');
  assert.equal(resolved.body.reason_codes.includes('MEMORY_CONFLICT_RESOLVED'), true);
  assertClean({ seeded, listed, read, resolved });
});

test('P7 memory conflict API permissions and cross-tenant checks fail closed', async () => {
  const app = createManualPlatformApi();
  await seedConflict(app);
  const listed = await app.handle({ method: 'GET', path: '/v1/memory/conflicts?tenant_id=tenant_alpha01', headers: tenantAdmin });
  const conflictId = listed.body.items[0].conflict_id;

  const operatorList = await app.handle({ method: 'GET', path: '/v1/memory/conflicts?tenant_id=tenant_alpha01', headers: operator });
  assert.equal(operatorList.status, 403);
  const viewerDecision = await app.handle({ method: 'POST', path: `/v1/memory/conflicts/${conflictId}/decision`, headers: viewer, body: { tenant_id: 'tenant_alpha01', decision: 'ignore', reason: 'viewer attempt', trace_id: 'trace_memory_conflict_api05' } });
  assert.equal(viewerDecision.status, 403);
  const crossTenant = await app.handle({ method: 'GET', path: `/v1/memory/conflicts/${conflictId}?tenant_id=tenant_beta01`, headers: tenantAdmin });
  assert.equal(crossTenant.status, 403);
  const platformRead = await app.handle({ method: 'GET', path: `/v1/memory/conflicts/${conflictId}?tenant_id=tenant_alpha01`, headers: platformAdmin });
  assert.equal(platformRead.status, 200);
  assertClean({ operatorList, viewerDecision, crossTenant, platformRead });
});
