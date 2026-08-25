import assert from 'node:assert/strict';
import test from 'node:test';

import { createManualPlatformApi } from '../../product/api/index.ts';

const admin = Object.freeze({ authorization: 'Bearer dev-platform-admin' });
const tenantAdmin = Object.freeze({ authorization: 'Bearer dev-tenant-admin-alpha' });
const viewer = Object.freeze({ authorization: 'Bearer dev-viewer-alpha' });

function importBody(overrides = {}) {
  return {
    source_kind: 'package_registry',
    source_ref: 'registry:approved.research',
    display_name: 'Approved Research Plugin',
    version: '1.0.0',
    expected_sha256: 'b'.repeat(64),
    license: 'MIT',
    notice_status: 'recorded',
    risk_level: 'medium',
    trace_id: 'trace_plugin10',
    ...overrides,
  };
}

function assertNoLeak(value) {
  assert.doesNotMatch(JSON.stringify(value), /Hermes|OpenClaw|DeepSeek|\bDSH\b|native_|raw_credential|credential_material|https?:\/\/|\/opt\//i);
}

test('Plugin governance API is platform-admin only', async () => {
  const app = createManualPlatformApi();
  for (const headers of [tenantAdmin, viewer]) {
    const list = await app.handle({ method: 'GET', path: '/v1/admin/plugins', headers });
    assert.equal(list.status, 403);
    assert.equal(list.body.code, 'PLATFORM_FORBIDDEN');
    const imported = await app.handle({ method: 'POST', path: '/v1/admin/plugins/import', headers, body: importBody() });
    assert.equal(imported.status, 403);
    assert.equal(imported.body.code, 'PLATFORM_FORBIDDEN');
    assertNoLeak({ list, imported });
  }
});

test('Plugin governance API rejects URL path credential and manifest bypass payloads', async () => {
  const app = createManualPlatformApi();
  const cases = [
    importBody({ source_ref: 'https://registry.example/plugin.tgz' }),
    importBody({ source_ref: '/opt/project/NexusAgent/vendor/plugin' }),
    importBody({ raw_credential: 'secret-token-value' }),
    importBody({ manifest: { tool_name: 'provider-tool' } }),
    importBody({ expected_sha256: 'not-a-sha' }),
  ];
  for (const body of cases) {
    const response = await app.handle({ method: 'POST', path: '/v1/admin/plugins/import', headers: admin, body });
    assert.equal(response.status, 400);
    assert.equal(response.body.code, 'PLATFORM_INVALID_REQUEST');
    assertNoLeak(response.body);
  }
});

test('Plugin governance API approves disables and rejects inventory entries without exposing source details', async () => {
  const app = createManualPlatformApi();
  const imported = await app.handle({ method: 'POST', path: '/v1/admin/plugins/import', headers: admin, body: importBody() });
  assert.equal(imported.status, 202);
  assert.equal(imported.body.allowlist_status, 'pending_scan');
  assert.equal(Object.hasOwn(imported.body, 'source_ref'), false);

  const approved = await app.handle({
    method: 'POST',
    path: `/v1/admin/plugins/${imported.body.plugin_id}/admission`,
    headers: admin,
    body: { decision: 'approve', reason: 'metadata complete', trace_id: 'trace_plugin11' },
  });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.allowlist_status, 'approved');

  const disabled = await app.handle({
    method: 'POST',
    path: `/v1/admin/plugins/${imported.body.plugin_id}/admission`,
    headers: admin,
    body: { decision: 'disable', reason: 'operator requested disable', trace_id: 'trace_plugin12' },
  });
  assert.equal(disabled.status, 200);
  assert.equal(disabled.body.allowlist_status, 'disabled');

  const rejectedImport = await app.handle({ method: 'POST', path: '/v1/admin/plugins/import', headers: admin, body: importBody({ source_ref: 'registry:reject.me', trace_id: 'trace_plugin13' }) });
  const rejected = await app.handle({
    method: 'POST',
    path: `/v1/admin/plugins/${rejectedImport.body.plugin_id}/admission`,
    headers: admin,
    body: { decision: 'reject', reason: 'license review failed', trace_id: 'trace_plugin14' },
  });
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.allowlist_status, 'rejected');
  assertNoLeak({ imported, approved, disabled, rejected });
});
