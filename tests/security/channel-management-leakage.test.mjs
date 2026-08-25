import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createManualPlatformApi } from '../../product/api/index.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tenantAdmin = Object.freeze({ authorization: 'Bearer dev-tenant-admin-alpha' });
const viewer = Object.freeze({ authorization: 'Bearer dev-viewer-alpha' });

function channelBody(overrides = {}) {
  return {
    tenant_id: 'tenant_alpha01',
    channel_name: 'dingtalk',
    display_name: 'Channel Alpha',
    account_ref: 'channel_account_security01',
    conversation_ref: 'channel_conversation_security01',
    credential_ref: 'cred_channel_security01',
    trace_id: 'trace_channel20',
    ...overrides,
  };
}

function assertNoLeak(value) {
  assert.doesNotMatch(JSON.stringify(value), /Hermes|OpenClaw|DeepSeek|\bDSH\b|native_(?:url|path|session|error|agent|tool|memory)|raw_credential|credential_material|credential_ref|provider_(?:agent|task|cancel|binding)|https?:\/\/|\/(?:opt|tmp|var|etc|home|usr)\//i);
}

test('channel management authentication and tenant management permissions fail closed', async () => {
  const app = createManualPlatformApi();
  const missing = await app.handle({ method: 'GET', path: '/v1/channels?tenant_id=tenant_alpha01' });
  assert.equal(missing.status, 401);
  assert.equal(missing.body.code, 'PLATFORM_UNAUTHENTICATED');

  const invalid = await app.handle({ method: 'GET', path: '/v1/channels?tenant_id=tenant_alpha01', headers: { authorization: 'Bearer nope' } });
  assert.equal(invalid.status, 401);
  assert.equal(invalid.body.code, 'PLATFORM_UNAUTHENTICATED');

  const viewerCreate = await app.handle({ method: 'POST', path: '/v1/channels', headers: viewer, body: channelBody({ trace_id: 'trace_channel21' }) });
  assert.equal(viewerCreate.status, 403);
  assert.equal(viewerCreate.body.code, 'PLATFORM_FORBIDDEN');
  assertNoLeak({ missing, invalid, viewerCreate });
});

test('channel management rejects native credential transport and manifest bypass fields without echoing them', async () => {
  const app = createManualPlatformApi();
  const cases = [
    { raw_credential: 'secret-token-value' },
    { credential_material: 'secret-token-value' },
    { native_url: 'http://127.0.0.1:3052/internal' },
    { native_path: '/opt/project/NexusAgent/vendor/channel' },
    { native_session_id: 'native_session_123' },
    { native_error: 'native_error_stack' },
    { provider_binding: 'provider_binding_default' },
    { plugin_subagent: { command: 'run' } },
    { raw_manifest: { channel_name: 'dingtalk' } },
    { native_manifest: { channel_name: 'dingtalk' } },
  ];
  for (const [index, extra] of cases.entries()) {
    const response = await app.handle({ method: 'POST', path: '/v1/channels', headers: tenantAdmin, body: channelBody({ ...extra, trace_id: `trace_channel${30 + index}` }) });
    assert.equal(response.status, 400, JSON.stringify(extra));
    assert.equal(response.body.code, 'PLATFORM_INVALID_REQUEST');
    assertNoLeak(response.body);
  }
});

test('channel management public responses never echo credential references', async () => {
  const app = createManualPlatformApi();
  const created = await app.handle({ method: 'POST', path: '/v1/channels', headers: tenantAdmin, body: channelBody({ trace_id: 'trace_channel50' }) });
  assert.equal(created.status, 201);

  const enabled = await app.handle({ method: 'POST', path: `/v1/channels/${created.body.channel_config_id}/status`, headers: tenantAdmin, body: { status: 'enabled', reason: 'security test', trace_id: 'trace_channel51' } });
  assert.equal(enabled.status, 200);

  const tested = await app.handle({ method: 'POST', path: `/v1/channels/${created.body.channel_config_id}/test`, headers: tenantAdmin, body: { trace_id: 'trace_channel52' } });
  assert.equal(tested.status, 200);

  const listed = await app.handle({ method: 'GET', path: '/v1/channels?tenant_id=tenant_alpha01', headers: viewer });
  assert.equal(listed.status, 200);
  assertNoLeak({ created, enabled, tested, listed });
  assert.equal(listed.body.items[0].credential_status, 'reference_configured');
});

test('product channel management source avoids internal component names and implementation paths', async () => {
  const files = [
    'product/api/index.ts',
    'product/api/README.md',
    'product/channel-management/README.md',
    'product/web-console/src/apiClient.ts',
    'product/web-console/src/viewModel.ts',
    'product/web-console/src/main.tsx',
    'product/web-console/README.md',
    'docs/contracts/openapi.yaml',
  ];
  for (const file of files) {
    const source = await readFile(path.join(repoRoot, file), 'utf8');
    assert.doesNotMatch(source, /Hermes|OpenClaw|DeepSeek|\bDSH\b/, file);
    if (file.startsWith('product/')) assert.doesNotMatch(source, /platform\/adapters|vendor\//, file);
  }
});
