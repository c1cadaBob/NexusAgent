import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { LocalArtifactStore } from '../../platform/artifact-store/index.ts';
import { LocalCredentialCenter } from '../../platform/credentials/index.ts';
import { InMemoryEventBus } from '../../platform/event-bus/index.ts';
import { LocalMemoryGateway } from '../../platform/memory-gateway/index.ts';
import { PolicyGate } from '../../platform/policy-gate/index.ts';
import { createManualPlatformApi } from '../../product/api/index.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const operator = Object.freeze({ authorization: 'Bearer dev-operator-alpha' });
const tenantAdmin = Object.freeze({ authorization: 'Bearer dev-tenant-admin-alpha' });
const viewer = Object.freeze({ authorization: 'Bearer dev-viewer-alpha' });

function assertNoLeak(value) {
  assert.doesNotMatch(JSON.stringify(value), /Hermes|OpenClaw|DeepSeek|\bDSH\b|raw_credential|credential_material|native_(?:url|path|session|error)|provider_(?:binding|runtime|agent|task|cancel)|https?:\/\/|\/(?:opt|tmp|var|etc|home|usr)\//i);
}

function channelBody(overrides = {}) {
  return {
    tenant_id: 'tenant_alpha01',
    channel_name: 'dingtalk',
    display_name: 'P6 denied channel',
    account_ref: 'channel_account_p6denied01',
    conversation_ref: 'channel_conversation_p6denied01',
    credential_ref: 'cred_channel_p6denied01',
    trace_id: 'trace_p6api01',
    ...overrides,
  };
}

test('P6 authenticated API denials create internal audit records with trace and reason', async () => {
  const app = createManualPlatformApi();

  const forbidden = await app.handle({
    method: 'POST',
    path: '/v1/channels',
    headers: viewer,
    body: channelBody({ trace_id: 'trace_p6api01' }),
  });
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.body.code, 'PLATFORM_FORBIDDEN');

  const invalid = await app.handle({
    method: 'POST',
    path: '/v1/tasks',
    headers: operator,
    body: {
      tenant_id: 'tenant_alpha01',
      user_id: 'user_alpha01',
      agent_id: 'agent_alpha01',
      conversation_id: 'conv_alpha01',
      input: 'provider runtime bypass attempt',
      provider_runtime: 'native-sidecar',
      trace_id: 'trace_p6api02',
    },
  });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.code, 'PLATFORM_INVALID_REQUEST');

  const forbiddenAudit = app.audit.query({ trace_id: 'trace_p6api01', action: 'api.request.denied' });
  const invalidAudit = app.audit.query({ trace_id: 'trace_p6api02', action: 'api.request.denied' });
  assert.equal(forbiddenAudit.length, 1);
  assert.equal(invalidAudit.length, 1);
  assert.equal(forbiddenAudit[0].details.code, 'PLATFORM_FORBIDDEN');
  assert.equal(invalidAudit[0].details.code, 'PLATFORM_INVALID_REQUEST');
  assert.match(forbiddenAudit[0].details.reason, /permission|required|administrator/i);
  assert.match(invalidAudit[0].details.reason, /non-platform/i);
  assertNoLeak({ forbidden, invalid, forbiddenAudit, invalidAudit });
});

test('P6 cross-tenant artifact memory and credential access fails closed without payload leaks', () => {
  const eventBus = new InMemoryEventBus();
  const artifactStore = new LocalArtifactStore({ eventBus });
  const memoryGateway = new LocalMemoryGateway({ eventBus });
  const credentialCenter = new LocalCredentialCenter({ eventBus });

  const artifact = artifactStore.upload({
    tenant_id: 'tenant_alpha01',
    task_id: 'task_p6data01',
    trace_id: 'trace_p6data01',
    kind: 'execution_output',
    content_type: 'text/plain',
    data: 'tenant alpha private artifact body',
  });
  const memory = memoryGateway.write({
    scope: { tenant_id: 'tenant_alpha01', user_id: 'user_alpha01' },
    layer: 'user',
    text: 'tenant alpha private memory body',
    source: 'p6-security',
    trace_id: 'trace_p6data01',
  });
  const credential = credentialCenter.register({
    tenant_id: 'tenant_alpha01',
    trace_id: 'trace_p6data01',
    purpose: 'executor_tool',
    material: 'p6-secret-material-do-not-leak',
    expires_at_utc: '2026-08-26T08:00:00.000Z',
  });

  assert.throws(
    () => artifactStore.read({ tenant_id: 'tenant_beta01', artifact_id: artifact.artifact_id, trace_id: 'trace_p6data02' }),
    /tenant mismatch/i,
  );
  assert.throws(
    () => memoryGateway.get('tenant_beta01', memory.memory_id),
    /tenant mismatch/i,
  );
  assert.throws(
    () => credentialCenter.resolveReference('tenant_beta01', credential.credential_ref, 'trace_p6data02'),
    /tenant mismatch/i,
  );

  const eventJson = JSON.stringify(eventBus.history());
  assert.equal(eventJson.includes('tenant alpha private artifact body'), false);
  assert.equal(eventJson.includes('tenant alpha private memory body'), false);
  assert.equal(eventJson.includes('p6-secret-material-do-not-leak'), false);
  assertNoLeak({ artifact, memory, credential, events: eventBus.history(), credentialAudit: credentialCenter.auditLog() });
});

test('P6 API and Policy-Gate reject tenant privilege escalation approval bypass and budget exhaustion', async () => {
  const app = createManualPlatformApi();
  const gate = new PolicyGate();

  const crossTenantMemory = await app.handle({
    method: 'POST',
    path: '/v1/memory/search',
    headers: operator,
    body: { tenant_id: 'tenant_beta01', user_id: 'user_beta01', layer: 'user', query: 'steal memory', trace_id: 'trace_p6auth01' },
  });
  assert.equal(crossTenantMemory.status, 403);
  assert.equal(crossTenantMemory.body.code, 'PLATFORM_FORBIDDEN');

  const adminPlugin = await app.handle({ method: 'GET', path: '/v1/admin/plugins', headers: tenantAdmin, body: { trace_id: 'trace_p6auth02' } });
  assert.equal(adminPlugin.status, 403);
  assert.equal(adminPlugin.body.code, 'PLATFORM_FORBIDDEN');

  const budget = await app.handle({
    method: 'POST',
    path: '/v1/budget/check',
    headers: operator,
    body: { tenant_id: 'tenant_alpha01', requested_units: 100, remaining_units: 5, max_units_per_attempt: 20, trace_id: 'trace_p6auth03' },
  });
  assert.equal(budget.status, 200);
  assert.equal(budget.body.status, 'denied');
  assert.equal(budget.body.code, 'PLATFORM_RATE_LIMITED');
  assert.ok(budget.body.reasons.some((reason) => /budget/i.test(reason)));

  const approval = gate.evaluate({
    action: 'task.submit',
    tenant_id: 'tenant_alpha01',
    task_id: 'task_p6auth01',
    attempt_id: 'attempt_p6auth01',
    execution_id: 'exec_p6auth01',
    conversation_id: 'conv_p6auth01',
    trace_id: 'trace_p6auth04',
    monotonic_ms: 2_000,
    requested_at_utc: '2026-08-26T07:00:02.000Z',
    principal: { tenant_id: 'tenant_alpha01', user_id: 'user_alpha01', roles: ['operator'], permissions: ['task:submit'] },
    approval: { required: true, status: 'pending' },
  });
  assert.equal(approval.allow, false);
  assert.equal(approval.code, 'PLATFORM_APPROVAL_REQUIRED');
  assert.equal(approval.trace_id, 'trace_p6auth04');
  assert.ok(approval.reasons.some((reason) => /approval/i.test(reason)));
  assertNoLeak({ crossTenantMemory, adminPlugin, budget, approval, audit: app.audit.query() });
});

test('P6 public product surfaces do not import adapters vendor paths or native direct ports', async () => {
  const productFiles = [
    'product/api/index.ts',
    'product/api/README.md',
    'product/channel-management/README.md',
    'product/web-console/src/apiClient.ts',
    'product/web-console/src/viewModel.ts',
    'product/sdk/src/index.ts',
    'product/docs-site/src/main.tsx',
    'docs/contracts/openapi.yaml',
  ];
  for (const file of productFiles) {
    const source = await readFile(path.join(repoRoot, file), 'utf8');
    assert.doesNotMatch(source, /Hermes|OpenClaw|DeepSeek|\bDSH\b/, file);
    if (file.startsWith('product/')) assert.doesNotMatch(source, /platform\/adapters|vendor\//, file);
  }

  const configFiles = ['deploy/docker-compose.dev.yml', 'deploy/docker-compose.prod.yml', 'config/ports.dev.yaml', 'config/services.dev.yaml'];
  for (const file of configFiles) {
    const source = await readFile(path.join(repoRoot, file), 'utf8');
    assert.doesNotMatch(source, /0\.0\.0\.0:925[0-9]|native[_-]?(?:gateway|agent|provider).*0\.0\.0\.0/i, file);
  }
});
