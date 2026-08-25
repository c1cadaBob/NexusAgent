import assert from 'node:assert/strict';
import test from 'node:test';

import { createManualPlatformApi } from '../../product/api/index.ts';

const tenantAdmin = Object.freeze({ authorization: 'Bearer dev-tenant-admin-alpha' });
const platformAdmin = Object.freeze({ authorization: 'Bearer dev-platform-admin' });
const operator = Object.freeze({ authorization: 'Bearer dev-operator-alpha' });
const viewer = Object.freeze({ authorization: 'Bearer dev-viewer-alpha' });

function channelBody(overrides = {}) {
  return {
    tenant_id: 'tenant_alpha01',
    channel_name: 'dingtalk',
    display_name: 'DingTalk Alpha',
    account_ref: 'channel_account_alpha01',
    conversation_ref: 'channel_conversation_alpha01',
    credential_ref: 'cred_channel_alpha01',
    trace_id: 'trace_channel01',
    ...overrides,
  };
}

function assertPublic(value) {
  const text = JSON.stringify(value);
  assert.doesNotMatch(text, /Hermes|OpenClaw|DeepSeek|\bDSH\b|native_|raw_credential|credential_material|credential_ref|provider_(?:agent|task|cancel|binding)|https?:\/\/|\/opt\//i);
}

test('tenant admin manages channel configuration and dry-run connection through platform API', async () => {
  const app = createManualPlatformApi();
  const created = await app.handle({ method: 'POST', path: '/v1/channels', headers: tenantAdmin, body: channelBody() });
  assert.equal(created.status, 201);
  assert.match(created.body.channel_config_id, /^channel_config_dingtalk_channel01_/);
  assert.equal(created.body.status, 'disabled');
  assert.equal(created.body.credential_status, 'reference_configured');
  assert.equal(Object.hasOwn(created.body, 'credential_ref'), false);

  const listed = await app.handle({ method: 'GET', path: '/v1/channels?tenant_id=tenant_alpha01', headers: viewer });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.items.length, 1);
  assert.equal(listed.body.items[0].channel_config_id, created.body.channel_config_id);

  const read = await app.handle({ method: 'GET', path: `/v1/channels/${created.body.channel_config_id}`, headers: viewer });
  assert.equal(read.status, 200);
  assert.equal(read.body.display_name, 'DingTalk Alpha');

  const updated = await app.handle({
    method: 'PATCH',
    path: `/v1/channels/${created.body.channel_config_id}`,
    headers: tenantAdmin,
    body: { display_name: 'DingTalk Operations', trace_id: 'trace_channel02' },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.display_name, 'DingTalk Operations');

  const enabled = await app.handle({
    method: 'POST',
    path: `/v1/channels/${created.body.channel_config_id}/status`,
    headers: tenantAdmin,
    body: { status: 'enabled', reason: 'ready for dry run', trace_id: 'trace_channel03' },
  });
  assert.equal(enabled.status, 200);
  assert.equal(enabled.body.status, 'enabled');

  const tested = await app.handle({
    method: 'POST',
    path: `/v1/channels/${created.body.channel_config_id}/test`,
    headers: tenantAdmin,
    body: { trace_id: 'trace_channel04' },
  });
  assert.equal(tested.status, 200);
  assert.equal(tested.body.test_status, 'passed');
  assert.equal(tested.body.policy_gate_status, 'allowed');
  assert.equal(tested.body.delivery_outcome, 'queued');

  const disabled = await app.handle({
    method: 'POST',
    path: `/v1/channels/${created.body.channel_config_id}/status`,
    headers: tenantAdmin,
    body: { status: 'disabled', reason: 'pause channel', trace_id: 'trace_channel05' },
  });
  assert.equal(disabled.status, 200);
  assert.equal(disabled.body.status, 'disabled');
  assertPublic({ created, listed, read, updated, enabled, tested, disabled });
});

test('platform admin can manage another tenant while tenant admin cannot cross tenant boundaries', async () => {
  const app = createManualPlatformApi();
  const beta = await app.handle({
    method: 'POST',
    path: '/v1/channels',
    headers: platformAdmin,
    body: channelBody({ tenant_id: 'tenant_beta01', channel_name: 'telegram', display_name: 'Telegram Beta', account_ref: 'channel_account_beta01', conversation_ref: 'channel_conversation_beta01', credential_ref: 'cred_channel_beta01', trace_id: 'trace_channel06' }),
  });
  assert.equal(beta.status, 201);
  assert.equal(beta.body.tenant_id, 'tenant_beta01');

  const deniedList = await app.handle({ method: 'GET', path: '/v1/channels?tenant_id=tenant_beta01', headers: tenantAdmin });
  assert.equal(deniedList.status, 403);
  assert.equal(deniedList.body.code, 'PLATFORM_FORBIDDEN');

  const deniedRead = await app.handle({ method: 'GET', path: `/v1/channels/${beta.body.channel_config_id}`, headers: tenantAdmin });
  assert.equal(deniedRead.status, 403);
  assert.equal(deniedRead.body.code, 'PLATFORM_FORBIDDEN');
  assertPublic({ beta, deniedList, deniedRead });
});

test('operator write access and unknown channel names fail closed', async () => {
  const app = createManualPlatformApi();
  const operatorCreate = await app.handle({ method: 'POST', path: '/v1/channels', headers: operator, body: channelBody({ trace_id: 'trace_channel07' }) });
  assert.equal(operatorCreate.status, 403);
  assert.equal(operatorCreate.body.code, 'PLATFORM_FORBIDDEN');

  const unknown = await app.handle({ method: 'POST', path: '/v1/channels', headers: tenantAdmin, body: channelBody({ channel_name: 'slack', trace_id: 'trace_channel08' }) });
  assert.equal(unknown.status, 403);
  assert.equal(unknown.body.code, 'PLATFORM_POLICY_DENIED');
  assertPublic({ operatorCreate, unknown });
});
