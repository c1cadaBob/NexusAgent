import assert from 'node:assert/strict';
import test from 'node:test';

import { createManualPlatformApi } from '../../product/api/index.ts';
import { DEV_PRINCIPALS, PlatformApiClient, PlatformApiError } from '../../product/web-console/src/apiClient.ts';

function clientFor(profileKey) {
  const app = createManualPlatformApi();
  const profile = DEV_PRINCIPALS.find((item) => item.key === profileKey);
  assert.ok(profile, `profile not found: ${profileKey}`);
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
  return { client: new PlatformApiClient(profile, { baseUrl: 'http://console.test', fetchImpl }), calls, profile };
}

test('web console API client attaches bearer tokens and uses platform routes', async () => {
  const { client, calls, profile } = clientFor('operator');
  await client.listTasks({ tenant_id: profile.tenant_id, limit: 5 });
  assert.equal(calls[0].path, '/v1/tasks?tenant_id=tenant_alpha01&limit=5');
  assert.equal(calls[0].headers.authorization, 'Bearer dev-operator-alpha');
});

test('operator workflow submits lists reads cancels retries events memory approvals and budget through platform API', async () => {
  const { client, profile } = clientFor('operator');
  const task = await client.submitTask({ input: 'console integration task', conversation_id: 'conv_console01', agent_id: 'agent_alpha01', trace_id: 'trace_console01' });
  assert.match(task.task_id, /^task_console01_/);

  const tasks = await client.listTasks({ tenant_id: profile.tenant_id });
  assert.equal(tasks.items.length, 1);
  const read = await client.getTask(task.task_id);
  assert.equal(read.task_id, task.task_id);

  const cancelled = await client.cancelTask(task.task_id, { reason: 'console integration cancel', trace_id: 'trace_console02' });
  assert.equal(cancelled.state, 'cancelled');
  const retried = await client.retryTask(task.task_id, { reason: 'console integration retry', trace_id: 'trace_console03' });
  assert.equal(retried.state, 'admitted');

  const events = await client.listTaskEvents(task.task_id);
  assert.equal(events.items.some((event) => event.payload.command === 'cancel_attempt'), true);
  assert.equal(events.items.some((event) => event.payload.command === 'redo_attempt'), true);

  const written = await client.writeMemory({ text: 'console memory record', layer: 'user', trace_id: 'trace_console04' });
  assert.match(written.memory_id, /^memory_alpha01_/);
  const memory = await client.searchMemory({ query: 'console memory', layer: 'user', user_id: profile.user_id, trace_id: 'trace_console05' });
  assert.equal(memory.items.length, 1);

  const approvals = await client.listApprovals({ tenant_id: profile.tenant_id });
  assert.equal(approvals.items[0].approval_id, 'approval_alpha01');
  const approval = await client.decideApproval('approval_alpha01', { decision: 'approve', reason: 'console approval', trace_id: 'trace_console06' });
  assert.equal(approval.status, 'approved');

  const budget = await client.checkBudget({ requested_units: 10, remaining_units: 25, max_units_per_attempt: 25, trace_id: 'trace_console07' });
  assert.equal(budget.status, 'approved');
  assert.equal(budget.schema_version, 'nexus.token_budget.p7.v1');
});

test('tenant admin workflow manages token budget policy and ledger while operator management fails closed', async () => {
  const tenantAdmin = clientFor('tenant-admin').client;
  const operator = clientFor('operator').client;

  const policy = await tenantAdmin.getBudgetPolicy({ trace_id: 'trace_console_budget01' });
  assert.equal(policy.schema_version, 'nexus.token_budget.p7.v1');
  assert.equal(policy.dimension_mode, 'all_configured');
  const updated = await tenantAdmin.updateBudgetPolicy({ trace_id: 'trace_console_budget02', limits: { task_units: 30, max_units_per_attempt: 20 } });
  assert.equal(updated.limits.task_units, 30);
  const checked = await tenantAdmin.checkBudget({ requested_units: 5, user_id: 'user_tenant_admin', task_id: 'task_console_budget01', trace_id: 'trace_console_budget03', consume: true });
  assert.equal(checked.status, 'approved');
  const ledger = await tenantAdmin.listBudgetLedger();
  assert.equal(ledger.items.some((entry) => entry.status === 'reserved' && entry.consumed_units === 5), true);

  await assert.rejects(() => operator.getBudgetPolicy({ trace_id: 'trace_console_budget04' }), (error) => {
    assert.equal(error instanceof PlatformApiError, true);
    assert.equal(error.status, 403);
    assert.equal(error.code, 'PLATFORM_FORBIDDEN');
    return true;
  });
});

test('platform admin workflow manages plugin metadata while tenant admin forced access fails closed', async () => {
  const admin = clientFor('platform-admin').client;
  const tenantAdmin = clientFor('tenant-admin').client;

  const inventory = await admin.listPlugins();
  assert.equal(inventory.items.length > 0, true);

  const imported = await admin.importPlugin({
    source_kind: 'package_registry',
    source_ref: 'registry:console.approved',
    display_name: 'Approved Console Plugin',
    version: '1.0.0',
    expected_sha256: 'c'.repeat(64),
    license: 'MIT',
    notice_status: 'recorded',
    risk_level: 'medium',
    trace_id: 'trace_console08',
  });
  assert.equal(imported.allowlist_status, 'pending_scan');

  const approved = await admin.decidePluginAdmission(imported.plugin_id, { decision: 'approve', reason: 'console admission', trace_id: 'trace_console09' });
  assert.equal(approved.allowlist_status, 'approved');
  const disabled = await admin.decidePluginAdmission(imported.plugin_id, { decision: 'disable', reason: 'console disable', trace_id: 'trace_console10' });
  assert.equal(disabled.allowlist_status, 'disabled');
  const rejected = await admin.decidePluginAdmission(imported.plugin_id, { decision: 'reject', reason: 'console reject', trace_id: 'trace_console11' });
  assert.equal(rejected.allowlist_status, 'rejected');

  await assert.rejects(() => tenantAdmin.listPlugins(), (error) => {
    assert.equal(error instanceof PlatformApiError, true);
    assert.equal(error.status, 403);
    assert.equal(error.code, 'PLATFORM_FORBIDDEN');
    return true;
  });
});

test('tenant admin workflow manages channel configuration while viewer write access fails closed', async () => {
  const tenantAdmin = clientFor('tenant-admin').client;
  const viewer = clientFor('viewer').client;

  const created = await tenantAdmin.createChannel({
    channel_name: 'feishu',
    display_name: 'Feishu Console',
    account_ref: 'channel_account_console01',
    conversation_ref: 'channel_conversation_console01',
    credential_ref: 'cred_channel_console01',
    trace_id: 'trace_console12',
  });
  assert.equal(created.channel_name, 'feishu');
  assert.equal(created.credential_status, 'reference_configured');
  assert.equal(Object.hasOwn(created, 'credential_ref'), false);

  const channels = await tenantAdmin.listChannels({ tenant_id: 'tenant_alpha01' });
  assert.equal(channels.items.some((channel) => channel.channel_config_id === created.channel_config_id), true);

  const enabled = await tenantAdmin.setChannelStatus(created.channel_config_id, { status: 'enabled', reason: 'console channel test', trace_id: 'trace_console13' });
  assert.equal(enabled.status, 'enabled');

  const tested = await tenantAdmin.testChannel(created.channel_config_id, { trace_id: 'trace_console14' });
  assert.equal(tested.test_status, 'passed');
  assert.equal(tested.policy_gate_status, 'allowed');
  assert.equal(tested.delivery_outcome, 'queued');

  await assert.rejects(() => viewer.createChannel({
    channel_name: 'dingtalk',
    display_name: 'Viewer Channel',
    account_ref: 'channel_account_viewer01',
    conversation_ref: 'channel_conversation_viewer01',
    trace_id: 'trace_console15',
  }), (error) => {
    assert.equal(error instanceof PlatformApiError, true);
    assert.equal(error.status, 403);
    assert.equal(error.code, 'PLATFORM_FORBIDDEN');
    return true;
  });
});

test('tenant admin workflow manages memory retention while operator forced access fails closed', async () => {
  const tenantAdmin = clientFor('tenant-admin').client;
  const operator = clientFor('operator').client;

  const policy = await tenantAdmin.getMemoryRetentionPolicy({ trace_id: 'trace_console_retention01' });
  assert.equal(policy.schema_version, 'nexus.memory_retention.p7.v1');
  assert.equal(policy.enabled, true);
  assert.equal(policy.rules.find((rule) => rule.layer === 'session').ttl_days, 7);

  const updated = await tenantAdmin.updateMemoryRetentionPolicy({ enabled: true, max_sweep_records: 25, trace_id: 'trace_console_retention02' });
  assert.equal(updated.resource_budget.max_sweep_records, 25);
  const memory = await tenantAdmin.writeMemory({ text: 'console retention memory', layer: 'user', trace_id: 'trace_console_retention03' });
  const deleted = await tenantAdmin.deleteMemory(memory.memory_id, { reason: 'console retention delete', trace_id: 'trace_console_retention04' });
  assert.equal(deleted.status, 'deleted');
  assert.equal(Object.hasOwn(deleted, 'text'), false);
  const sweep = await tenantAdmin.sweepMemoryRetention({ trace_id: 'trace_console_retention05' });
  assert.equal(sweep.schema_version, 'nexus.memory_retention.p7.v1');

  await assert.rejects(() => tenantAdmin.writeMemory({ text: 'console conflict stale memory', layer: 'user', trace_id: 'trace_console_conflict01', expected_version: 0 }), (error) => {
    assert.equal(error instanceof PlatformApiError, true);
    assert.equal(error.status, 409);
    assert.equal(error.code, 'PLATFORM_CONFLICT');
    return true;
  });
  const conflicts = await tenantAdmin.listMemoryConflicts();
  assert.equal(conflicts.items.length, 1);
  const conflict = await tenantAdmin.getMemoryConflict(conflicts.items[0].conflict_id);
  assert.equal(conflict.status, 'open');
  const ignored = await tenantAdmin.decideMemoryConflict(conflict.conflict_id, { decision: 'ignore', reason: 'console reviewed conflict metadata', trace_id: 'trace_console_conflict02' });
  assert.equal(ignored.status, 'ignored');

  await assert.rejects(() => operator.sweepMemoryRetention({ trace_id: 'trace_console_retention06' }), (error) => {
    assert.equal(error instanceof PlatformApiError, true);
    assert.equal(error.status, 403);
    assert.equal(error.code, 'PLATFORM_FORBIDDEN');
    return true;
  });
});

test('tenant admin workflow manages skill evaluation while operator forced access fails closed', async () => {
  const tenantAdmin = clientFor('tenant-admin').client;
  const operator = clientFor('operator').client;

  const config = await tenantAdmin.getSkillEvaluationConfig({ trace_id: 'trace_console_skill_eval01' });
  assert.equal(config.schema_version, 'nexus.skill_evaluation.p7.v1');
  assert.equal(config.enabled, false);

  await assert.rejects(() => tenantAdmin.runSkillEvaluation({ trace_id: 'trace_console_skill_eval02' }), (error) => {
    assert.equal(error instanceof PlatformApiError, true);
    assert.equal(error.status, 403);
    assert.equal(error.code, 'PLATFORM_FORBIDDEN');
    return true;
  });

  const enabled = await tenantAdmin.updateSkillEvaluationConfig({ enabled: true, max_cases: 10, trace_id: 'trace_console_skill_eval03' });
  assert.equal(enabled.enabled, true);
  const run = await tenantAdmin.runSkillEvaluation({ trace_id: 'trace_console_skill_eval04' });
  assert.equal(run.status, 'passed');
  const runs = await tenantAdmin.listSkillEvaluationRuns();
  assert.equal(runs.items.some((item) => item.run_id === run.run_id), true);
  const read = await tenantAdmin.getSkillEvaluationRun(run.run_id);
  assert.equal(read.run_id, run.run_id);

  await assert.rejects(() => operator.getSkillEvaluationConfig({ trace_id: 'trace_console_skill_eval05' }), (error) => {
    assert.equal(error instanceof PlatformApiError, true);
    assert.equal(error.status, 403);
    assert.equal(error.code, 'PLATFORM_FORBIDDEN');
    return true;
  });
});
