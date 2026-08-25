import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createManualPlatformApi } from '../../product/api/index.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const operator = Object.freeze({ authorization: 'Bearer dev-operator-alpha' });
const admin = Object.freeze({ authorization: 'Bearer dev-platform-admin' });

function taskBody(overrides = {}) {
  return {
    tenant_id: 'tenant_alpha01',
    user_id: 'user_alpha01',
    agent_id: 'agent_alpha01',
    conversation_id: 'conv_alpha01',
    input: 'security validation task',
    trace_id: 'trace_alpha01',
    ...overrides,
  };
}

function assertNoPublicLeak(value) {
  assert.doesNotMatch(JSON.stringify(value), /Hermes|OpenClaw|DeepSeek|\bDSH\b|native_(?:url|path|session|error|agent|tool|memory)|raw_credential|credential_material|provider_(?:agent|task|cancel)|https?:\/\/|\/opt\//i);
}

test('Platform API fails closed for missing or invalid bearer tokens', async () => {
  const app = createManualPlatformApi();
  const missing = await app.handle({ method: 'GET', path: '/v1/tasks' });
  assert.equal(missing.status, 401);
  assert.equal(missing.body.code, 'PLATFORM_UNAUTHENTICATED');

  const invalid = await app.handle({ method: 'GET', path: '/v1/tasks', headers: { authorization: 'Bearer nope' } });
  assert.equal(invalid.status, 401);
  assert.equal(invalid.body.code, 'PLATFORM_UNAUTHENTICATED');
  assertNoPublicLeak({ missing, invalid });
});

test('Platform API fails closed on cross-tenant access', async () => {
  const app = createManualPlatformApi();
  const response = await app.handle({ method: 'GET', path: '/v1/tasks?tenant_id=tenant_beta01', headers: operator });
  assert.equal(response.status, 403);
  assert.equal(response.body.code, 'PLATFORM_FORBIDDEN');
  assertNoPublicLeak(response.body);
});

test('Platform API rejects blocked request payload markers without echoing them', async () => {
  const app = createManualPlatformApi();
  const cases = [
    { native_url: 'http://127.0.0.1:3052/internal' },
    { native_path: '/opt/project/NexusAgent/vendor/component' },
    { native_session_id: 'native_session_abc' },
    { raw_credential: 'secret-token-value' },
    { credential_material: 'secret-token-value' },
    { plugin_subagent: { command: 'run' } },
    { provider_task: 'provider_task_123' },
  ];
  for (const extra of cases) {
    const response = await app.handle({ method: 'POST', path: '/v1/tasks', headers: operator, body: taskBody(extra) });
    assert.equal(response.status, 400);
    assert.equal(response.body.code, 'PLATFORM_INVALID_REQUEST');
    assertNoPublicLeak(response.body);
  }
});

test('Platform API rejects invalid pagination parameters with platform errors only', async () => {
  const app = createManualPlatformApi();
  for (const path of ['/v1/tasks?limit=0', '/v1/tasks?limit=101', '/v1/tasks?cursor=https://internal.invalid/page']) {
    const response = await app.handle({ method: 'GET', path, headers: operator });
    assert.equal(response.status, 400);
    assert.equal(response.body.code, 'PLATFORM_INVALID_REQUEST');
    assertNoPublicLeak(response.body);
  }
});

test('Platform API response events and plugin inventory are public projections only', async () => {
  const app = createManualPlatformApi();
  const task = await app.handle({ method: 'POST', path: '/v1/tasks', headers: operator, body: taskBody() });
  await app.handle({ method: 'POST', path: `/v1/tasks/${task.body.task_id}/cancel`, headers: operator, body: { reason: 'cancel for leak scan', trace_id: 'trace_alpha02' } });
  const events = await app.handle({ method: 'GET', path: `/v1/tasks/${task.body.task_id}/events`, headers: operator });
  const plugins = await app.handle({ method: 'GET', path: '/v1/admin/plugins', headers: admin });
  assert.equal(events.status, 200);
  assert.equal(plugins.status, 200);
  assertNoPublicLeak({ events, plugins });
  for (const entry of plugins.body.items) {
    assert.equal(Object.hasOwn(entry, 'source_ref'), false);
    assert.equal(Object.hasOwn(entry, 'provider_binding'), false);
  }
});

test('Product API source avoids internal component brand names', async () => {
  const files = ['product/api/index.ts', 'product/api/server.mjs', 'product/api/README.md'];
  for (const file of files) {
    const source = await readFile(path.join(repoRoot, file), 'utf8');
    assert.doesNotMatch(source, /Hermes|OpenClaw|DeepSeek|\bDSH\b/, file);
  }
});
