import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createManualPlatformApi } from '../../product/api/index.ts';
import { DEV_PRINCIPALS } from '../../product/web-console/src/apiClient.ts';
import { assertConsolePublicValue, buildConsoleDashboardModel, projectScheduledGoalConfigRows, projectScheduledGoalRows, projectScheduledGoalRunDueRows, visibleNavigation } from '../../product/web-console/src/viewModel.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const operator = Object.freeze({ authorization: 'Bearer dev-operator-alpha' });
const tenantAdmin = Object.freeze({ authorization: 'Bearer dev-tenant-admin-alpha' });
const blocked = /Hermes|OpenClaw|DeepSeek|\bDSH\b|native_|raw_credential|credential_material|provider_(?:binding|runtime|agent|task|cancel)|session_id|file_path|memory_path|tool_name|https?:\/\/|\/(?:opt|tmp|var|etc|home|usr)\//i;

function assertClean(value) {
  assert.doesNotMatch(JSON.stringify(value), blocked);
}

function scheduledGoalBody(overrides = {}) {
  return {
    tenant_id: 'tenant_alpha01',
    user_id: 'user_alpha01',
    agent_id: 'agent_alpha01',
    conversation_id: 'conv_scheduled_security01',
    cron: '*/5 * * * *',
    input: 'scheduled security task',
    trace_id: 'trace_scheduled_security01',
    ...overrides,
  };
}

test('P7 scheduled goals API rejects native raw provider and credential markers', async () => {
  const app = createManualPlatformApi();
  for (const payload of [
    scheduledGoalBody({ trace_id: 'trace_scheduled_security02', raw_credential: 'secret-token-value' }),
    scheduledGoalBody({ trace_id: 'trace_scheduled_security03', provider_runtime: 'blocked-runtime' }),
    scheduledGoalBody({ trace_id: 'trace_scheduled_security04', input: 'load native_url https://blocked.invalid' }),
    scheduledGoalBody({ trace_id: 'trace_scheduled_security05', input: 'read /opt/project/native-path' }),
  ]) {
    const response = await app.handle({ method: 'POST', path: '/v1/scheduled-goals', headers: operator, body: payload });
    assert.equal(response.status, 400);
    assert.equal(response.body.code, 'PLATFORM_INVALID_REQUEST');
    assertClean(response.body);
  }
});

test('P7 scheduled goals events logs SDK and console projections are platform-only', async () => {
  const app = createManualPlatformApi();
  await app.handle({ method: 'PATCH', path: '/v1/scheduled-goals/config', headers: tenantAdmin, body: { tenant_id: 'tenant_alpha01', trace_id: 'trace_scheduled_security06', enabled: true } });
  const created = await app.handle({ method: 'POST', path: '/v1/scheduled-goals', headers: operator, body: scheduledGoalBody({ trace_id: 'trace_scheduled_security07' }) });
  app.clock.set({ utc_timestamp: created.body.next_run_at_utc, monotonic_ms: 1000 });
  const due = await app.handle({ method: 'POST', path: '/v1/scheduled-goals/run-due', headers: operator, body: { tenant_id: 'tenant_alpha01', trace_id: 'trace_scheduled_security08' } });

  const rows = projectScheduledGoalRows([created.body]);
  const configRows = projectScheduledGoalConfigRows(app.scheduledGoals.getConfig('tenant_alpha01', 'trace_scheduled_security09'));
  const dueRows = projectScheduledGoalRunDueRows(due.body);
  assertClean({ created, due, rows, configRows, dueRows, events: app.coordinator.events(), logs: app.observability.logs({ tenant_id: 'tenant_alpha01' }) });
  assert.throws(() => assertConsolePublicValue({ native_url: 'https://blocked.invalid' }), /non-platform marker/);
});

test('P7 scheduled goals public product source avoids adapter vendor and internal component names', async () => {
  const files = [
    'product/api/index.ts',
    'product/sdk/src/index.ts',
    'product/web-console/src/apiClient.ts',
    'product/web-console/src/viewModel.ts',
    'product/web-console/src/main.tsx',
    'product/docs-site/src/catalog.ts',
  ];
  for (const file of files) {
    const source = await readFile(path.join(repoRoot, file), 'utf8');
    assert.doesNotMatch(source, /Hermes|OpenClaw|DeepSeek|\bDSH\b/, file);
    assert.doesNotMatch(source, /platform\/adapters|vendor\//, file);
    assert.doesNotMatch(source, /Date\.now\(/, file);
  }
});

test('P7 scheduled goals console navigation and view-model gate management actions', () => {
  const operatorProfile = DEV_PRINCIPALS.find((item) => item.key === 'operator');
  const viewerProfile = DEV_PRINCIPALS.find((item) => item.key === 'viewer');
  assert.ok(operatorProfile && viewerProfile);
  assert.equal(visibleNavigation(operatorProfile).some((item) => item.id === 'scheduled-goals'), true);
  assert.equal(visibleNavigation(viewerProfile).some((item) => item.id === 'scheduled-goals'), true);
  assert.equal(operatorProfile.canManageScheduledGoals, true);
  assert.equal(viewerProfile.canManageScheduledGoals, false);
  const model = buildConsoleDashboardModel(operatorProfile, {
    tasks: [],
    taskEvents: [],
    tenants: [],
    tenantUsers: [],
    channels: [],
    scheduledGoals: [],
    approvals: [],
    skills: [],
    capabilities: [],
    memory: [],
    plugins: [],
  });
  assert.equal(model.counters.scheduled_goals, 0);
  assertClean(model);
});
