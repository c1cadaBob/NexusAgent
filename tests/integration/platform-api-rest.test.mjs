import assert from 'node:assert/strict';
import test from 'node:test';

import { createManualPlatformApi } from '../../product/api/index.ts';

const operator = Object.freeze({ authorization: 'Bearer dev-operator-alpha' });
const admin = Object.freeze({ authorization: 'Bearer dev-platform-admin' });

function taskBody(overrides = {}) {
  return {
    tenant_id: 'tenant_alpha01',
    user_id: 'user_alpha01',
    agent_id: 'agent_alpha01',
    conversation_id: 'conv_alpha01',
    input: 'summarize the approved platform task queue',
    trace_id: 'trace_alpha01',
    ...overrides,
  };
}

function assertClean(value) {
  assert.doesNotMatch(JSON.stringify(value), /Hermes|OpenClaw|DeepSeek|\bDSH\b|native_|raw_credential|credential_material|https?:\/\/|\/opt\//i);
}

test('Platform API health succeeds without authentication', async () => {
  const app = createManualPlatformApi();
  const response = await app.handle({ method: 'GET', path: '/v1/health' });
  assert.equal(response.status, 200);
  assert.equal(response.body.service, 'nexusagent-platform-api');
  assert.equal(response.body.status, 'ok');
  assertClean(response.body);
});

test('Platform API submits lists reads cancels retries and projects task events', async () => {
  const app = createManualPlatformApi();
  const created = await app.handle({ method: 'POST', path: '/v1/tasks', headers: operator, body: taskBody() });
  assert.equal(created.status, 202);
  assert.match(created.body.task_id, /^task_alpha01_/);
  assert.match(created.body.execution_id, /^exec_alpha01_/);
  assert.equal(created.body.conversation_id, 'conv_alpha01');
  assert.equal(created.body.state, 'admitted');
  assertClean(created.body);

  const second = await app.handle({
    method: 'POST',
    path: '/v1/tasks',
    headers: operator,
    body: taskBody({ conversation_id: 'conv_alpha02', input: 'second approved platform task', trace_id: 'trace_alpha04' }),
  });
  assert.equal(second.status, 202);

  const listed = await app.handle({ method: 'GET', path: '/v1/tasks?tenant_id=tenant_alpha01', headers: operator });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.items.length, 2);
  assert.equal(listed.body.items[0].task_id, created.body.task_id);

  const firstPage = await app.handle({ method: 'GET', path: '/v1/tasks?tenant_id=tenant_alpha01&limit=1', headers: operator });
  assert.equal(firstPage.status, 200);
  assert.equal(firstPage.body.items.length, 1);
  assert.equal(firstPage.body.items[0].task_id, created.body.task_id);
  assert.equal(firstPage.body.next_cursor, 'cursor_1');

  const secondPage = await app.handle({ method: 'GET', path: `/v1/tasks?tenant_id=tenant_alpha01&limit=1&cursor=${firstPage.body.next_cursor}`, headers: operator });
  assert.equal(secondPage.status, 200);
  assert.equal(secondPage.body.items.length, 1);
  assert.equal(secondPage.body.items[0].task_id, second.body.task_id);
  assert.equal(Object.hasOwn(secondPage.body, 'next_cursor'), false);

  const read = await app.handle({ method: 'GET', path: `/v1/tasks/${created.body.task_id}`, headers: operator });
  assert.equal(read.status, 200);
  assert.equal(read.body.task_id, created.body.task_id);

  const cancelled = await app.handle({
    method: 'POST',
    path: `/v1/tasks/${created.body.task_id}/cancel`,
    headers: operator,
    body: { reason: 'operator cancelled duplicate work', trace_id: 'trace_alpha02' },
  });
  assert.equal(cancelled.status, 202);
  assert.equal(cancelled.body.state, 'cancelled');

  const retried = await app.handle({
    method: 'POST',
    path: `/v1/tasks/${created.body.task_id}/retry`,
    headers: operator,
    body: { reason: 'retry after cancellation', trace_id: 'trace_alpha03' },
  });
  assert.equal(retried.status, 202);
  assert.equal(retried.body.state, 'admitted');
  assert.notEqual(retried.body.attempt_id, cancelled.body.attempt_id);

  const events = await app.handle({ method: 'GET', path: `/v1/tasks/${created.body.task_id}/events`, headers: operator });
  assert.equal(events.status, 200);
  assert.equal(events.body.items.some((event) => event.payload.command === 'cancel_attempt'), true);
  assert.equal(events.body.items.some((event) => event.payload.command === 'redo_attempt'), true);
  assertClean(events.body);
});

test('Platform API memory write and search stay tenant scoped', async () => {
  const app = createManualPlatformApi();
  const written = await app.handle({
    method: 'POST',
    path: '/v1/memory',
    headers: operator,
    body: {
      tenant_id: 'tenant_alpha01',
      user_id: 'user_alpha01',
      agent_id: 'agent_alpha01',
      conversation_id: 'conv_alpha01',
      layer: 'user',
      text: 'approved memory record for alpha tenant',
      trace_id: 'trace_memory01',
    },
  });
  assert.equal(written.status, 201);
  assert.match(written.body.memory_id, /^memory_alpha01_/);
  assert.equal(written.body.layer, 'user');

  const search = await app.handle({
    method: 'POST',
    path: '/v1/memory/search',
    headers: operator,
    body: { tenant_id: 'tenant_alpha01', user_id: 'user_alpha01', layer: 'user', query: 'alpha tenant', trace_id: 'trace_memory02' },
  });
  assert.equal(search.status, 200);
  assert.equal(search.body.items.length, 1);
  assert.equal(search.body.items[0].memory_id, written.body.memory_id);
  assertClean(search.body);
});

test('Platform API approvals and budget checks return platform decisions only', async () => {
  const app = createManualPlatformApi();
  const approvals = await app.handle({ method: 'GET', path: '/v1/approvals?tenant_id=tenant_alpha01', headers: operator });
  assert.equal(approvals.status, 200);
  assert.equal(approvals.body.items[0].approval_id, 'approval_alpha01');

  const decided = await app.handle({
    method: 'POST',
    path: '/v1/approvals/approval_alpha01/decision',
    headers: operator,
    body: { decision: 'approve', reason: 'approved for P5 contract test', trace_id: 'trace_approval02' },
  });
  assert.equal(decided.status, 200);
  assert.equal(decided.body.status, 'approved');

  const budget = await app.handle({
    method: 'POST',
    path: '/v1/budget/check',
    headers: operator,
    body: { tenant_id: 'tenant_alpha01', requested_units: 10, remaining_units: 25, max_units_per_attempt: 20, trace_id: 'trace_budget01' },
  });
  assert.equal(budget.status, 200);
  assert.equal(budget.body.status, 'approved');
  assertClean({ approvals, decided, budget });
});

test('Platform API exposes tenants users permissions and admin plugin governance', async () => {
  const app = createManualPlatformApi();
  const tenants = await app.handle({ method: 'GET', path: '/v1/tenants', headers: admin });
  assert.equal(tenants.status, 200);
  assert.equal(tenants.body.items.some((tenant) => tenant.tenant_id === 'tenant_alpha01'), true);

  const users = await app.handle({ method: 'GET', path: '/v1/tenants/tenant_alpha01/users', headers: admin });
  assert.equal(users.status, 200);
  assert.equal(users.body.items.some((user) => user.user_id === 'user_alpha01'), true);

  const permissions = await app.handle({ method: 'GET', path: '/v1/permissions', headers: operator });
  assert.equal(permissions.status, 200);
  assert.equal(permissions.body.items.includes('task:submit'), true);

  const capabilities = await app.handle({ method: 'GET', path: '/v1/capabilities?tenant_id=tenant_alpha01', headers: operator });
  assert.equal(capabilities.status, 200);
  assert.equal(capabilities.body.items.length > 0, true);
  assert.equal(Object.hasOwn(capabilities.body.items[0], 'required_credentials'), false);

  const inventory = await app.handle({ method: 'GET', path: '/v1/admin/plugins', headers: admin });
  assert.equal(inventory.status, 200);
  assert.equal(inventory.body.items.length > 0, true);
  assert.equal(Object.hasOwn(inventory.body.items[0], 'source_ref'), false);

  const imported = await app.handle({
    method: 'POST',
    path: '/v1/admin/plugins/import',
    headers: admin,
    body: {
      source_kind: 'package_registry',
      source_ref: 'registry:approved.analytics',
      display_name: 'Approved Analytics Plugin',
      version: '1.0.0',
      expected_sha256: 'a'.repeat(64),
      license: 'MIT',
      notice_status: 'recorded',
      risk_level: 'medium',
      trace_id: 'trace_plugin02',
    },
  });
  assert.equal(imported.status, 202);
  assert.equal(imported.body.allowlist_status, 'pending_scan');

  const admitted = await app.handle({
    method: 'POST',
    path: `/v1/admin/plugins/${imported.body.plugin_id}/admission`,
    headers: admin,
    body: { decision: 'approve', reason: 'metadata complete', trace_id: 'trace_plugin03' },
  });
  assert.equal(admitted.status, 200);
  assert.equal(admitted.body.allowlist_status, 'approved');
  assertClean({ tenants, users, permissions, capabilities, inventory, imported, admitted });
});
