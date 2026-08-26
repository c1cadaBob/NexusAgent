import assert from 'node:assert/strict';
import test from 'node:test';

import { createManualPlatformApi } from '../../product/api/index.ts';
import { NexusAgentApiError, NexusAgentClient, createTraceFactory } from '../../product/sdk/src/index.ts';

function clientFor(accessToken = 'dev-operator-alpha') {
  const app = createManualPlatformApi();
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const parsed = new URL(String(url));
    calls.push({ path: `${parsed.pathname}${parsed.search}`, method: init.method ?? 'GET', headers: init.headers ?? {} });
    assert.match(parsed.pathname, /^\/v1\//);
    const headers = Object.fromEntries(Object.entries(init.headers ?? {}).map(([key, value]) => [key.toLowerCase(), String(value)]));
    const body = init.body === undefined ? undefined : JSON.parse(String(init.body));
    const response = await app.handle({ method: init.method ?? 'GET', path: `${parsed.pathname}${parsed.search}`, headers, body });
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: async () => response.body,
    };
  };
  return { client: new NexusAgentClient({ baseUrl: 'http://sdk.test', accessToken, fetchImpl }), calls };
}

function assertClean(value) {
  assert.doesNotMatch(JSON.stringify(value), /Hermes|OpenClaw|DeepSeek|\bDSH\b|native_|raw_credential|credential_material|provider_binding|runtime|https?:\/\/|\/opt\//i);
}

test('TypeScript SDK attaches bearer token and maps platform errors', async () => {
  const { client, calls } = clientFor('dev-operator-alpha');
  await client.listTasks({ tenant_id: 'tenant_alpha01', limit: 5 });
  assert.equal(calls[0].path, '/v1/tasks?tenant_id=tenant_alpha01&limit=5');
  assert.equal(calls[0].headers.authorization, 'Bearer dev-operator-alpha');

  const invalid = clientFor('invalid-token').client;
  await assert.rejects(() => invalid.listTasks({ tenant_id: 'tenant_alpha01' }), (error) => {
    assert.equal(error instanceof NexusAgentApiError, true);
    assert.equal(error.status, 401);
    assert.equal(error.code, 'PLATFORM_UNAUTHENTICATED');
    return true;
  });
});

test('TypeScript SDK operator workflow covers tasks events memory approvals and budget', async () => {
  const { client } = clientFor('dev-operator-alpha');
  const trace = createTraceFactory('trace_sdk_test');
  const task = await client.submitTask({
    tenant_id: 'tenant_alpha01',
    user_id: 'user_alpha01',
    agent_id: 'agent_alpha01',
    conversation_id: 'conv_sdk_test01',
    input: 'SDK integration task',
    trace_id: trace(),
  });
  assert.match(task.task_id, /^task_sdk_test0001_/);
  assert.equal(task.state, 'admitted');

  const listed = await client.listTasks({ tenant_id: 'tenant_alpha01' });
  assert.equal(listed.items.some((item) => item.task_id === task.task_id), true);
  const read = await client.getTask(task.task_id);
  assert.equal(read.task_id, task.task_id);

  const cancelled = await client.cancelTask(task.task_id, { reason: 'SDK cancellation', trace_id: trace() });
  assert.equal(cancelled.state, 'cancelled');
  const retried = await client.retryTask(task.task_id, { reason: 'SDK retry', trace_id: trace() });
  assert.equal(retried.state, 'admitted');

  const events = await client.listTaskEvents(task.task_id);
  assert.equal(events.items.some((event) => event.payload.command === 'cancel_attempt'), true);
  assert.equal(events.items.some((event) => event.payload.command === 'redo_attempt'), true);

  const memory = await client.writeMemory({
    tenant_id: 'tenant_alpha01',
    user_id: 'user_alpha01',
    layer: 'user',
    text: 'SDK integration memory',
    trace_id: trace(),
  });
  const search = await client.searchMemory({ tenant_id: 'tenant_alpha01', user_id: 'user_alpha01', layer: 'user', query: 'integration memory', trace_id: trace() });
  assert.equal(search.items[0].memory_id, memory.memory_id);

  const approvals = await client.listApprovals({ tenant_id: 'tenant_alpha01' });
  assert.equal(approvals.items[0].approval_id, 'approval_alpha01');
  const approval = await client.decideApproval('approval_alpha01', { decision: 'approve', reason: 'SDK approval', trace_id: trace() });
  assert.equal(approval.status, 'approved');

  const budget = await client.checkBudget({ tenant_id: 'tenant_alpha01', requested_units: 10, remaining_units: 25, max_units_per_attempt: 25, trace_id: trace() });
  assert.equal(budget.status, 'approved');
  assertClean({ task, listed, read, cancelled, retried, events, memory, search, approvals, approval, budget });
});

test('TypeScript SDK tenant admin manages channels without credential echo', async () => {
  const { client } = clientFor('dev-tenant-admin-alpha');
  const trace = createTraceFactory('trace_sdk_channel_test');
  const created = await client.createChannel({
    tenant_id: 'tenant_alpha01',
    channel_name: 'telegram',
    display_name: 'Telegram SDK Test',
    account_ref: 'channel_account_sdktest01',
    conversation_ref: 'channel_conversation_sdktest01',
    credential_ref: 'cred_channel_sdktest01',
    trace_id: trace(),
  });
  assert.equal(created.credential_status, 'reference_configured');
  assert.equal(Object.hasOwn(created, 'credential_ref'), false);

  const enabled = await client.setChannelStatus(created.channel_config_id, { status: 'enabled', reason: 'SDK test enable', trace_id: trace() });
  assert.equal(enabled.status, 'enabled');
  const tested = await client.testChannel(created.channel_config_id, { trace_id: trace() });
  assert.equal(tested.test_status, 'passed');
  assert.equal(tested.delivery_outcome, 'queued');
  assertClean({ created, enabled, tested });
});

test('TypeScript SDK tenant admin manages memory retention without memory text echo', async () => {
  const { client } = clientFor('dev-tenant-admin-alpha');
  const trace = createTraceFactory('trace_sdk_retention_test');
  const policy = await client.getMemoryRetentionPolicy({ tenant_id: 'tenant_alpha01', trace_id: trace() });
  assert.equal(policy.schema_version, 'nexus.memory_retention.p7.v1');
  assert.equal(policy.rules.find((rule) => rule.layer === 'session').ttl_days, 7);

  const updated = await client.updateMemoryRetentionPolicy({ tenant_id: 'tenant_alpha01', trace_id: trace(), enabled: true, max_sweep_records: 25 });
  assert.equal(updated.resource_budget.max_sweep_records, 25);
  const memory = await client.writeMemory({ tenant_id: 'tenant_alpha01', user_id: 'user_alpha01', layer: 'user', text: 'SDK retention memory', trace_id: trace() });
  const deleted = await client.deleteMemory(memory.memory_id, { tenant_id: 'tenant_alpha01', reason: 'SDK retention delete', trace_id: trace() });
  assert.equal(deleted.status, 'deleted');
  assert.equal(Object.hasOwn(deleted, 'text'), false);
  const sweep = await client.sweepMemoryRetention({ tenant_id: 'tenant_alpha01', trace_id: trace() });
  assert.equal(sweep.schema_version, 'nexus.memory_retention.p7.v1');
  assertClean({ policy, updated, deleted, sweep });
});

test('TypeScript SDK platform admin manages plugin metadata admission', async () => {
  const { client } = clientFor('dev-platform-admin');
  const trace = createTraceFactory('trace_sdk_plugin_test');
  const inventory = await client.listPlugins({ limit: 5 });
  assert.equal(inventory.items.length > 0, true);

  const imported = await client.importPlugin({
    source_kind: 'package_registry',
    source_ref: 'registry:sdk.integration',
    display_name: 'SDK Integration Plugin',
    version: '1.0.0',
    expected_sha256: 'e'.repeat(64),
    license: 'MIT',
    notice_status: 'recorded',
    risk_level: 'medium',
    trace_id: trace(),
  });
  assert.equal(imported.allowlist_status, 'pending_scan');

  const approved = await client.decidePluginAdmission(imported.plugin_id, { decision: 'approve', reason: 'SDK integration approval', trace_id: trace() });
  assert.equal(approved.allowlist_status, 'approved');
  const disabled = await client.decidePluginAdmission(imported.plugin_id, { decision: 'disable', reason: 'SDK integration disable', trace_id: trace() });
  assert.equal(disabled.allowlist_status, 'disabled');
  const rejected = await client.decidePluginAdmission(imported.plugin_id, { decision: 'reject', reason: 'SDK integration reject', trace_id: trace() });
  assert.equal(rejected.allowlist_status, 'rejected');
  assertClean({ inventory, imported, approved, disabled, rejected });
});
