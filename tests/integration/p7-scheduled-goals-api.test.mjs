import assert from 'node:assert/strict';
import test from 'node:test';

import { createManualPlatformApi } from '../../product/api/index.ts';

const tenantAdmin = Object.freeze({ authorization: 'Bearer dev-tenant-admin-alpha' });
const platformAdmin = Object.freeze({ authorization: 'Bearer dev-platform-admin' });
const operator = Object.freeze({ authorization: 'Bearer dev-operator-alpha' });
const viewer = Object.freeze({ authorization: 'Bearer dev-viewer-alpha' });

function scheduledGoalBody(overrides = {}) {
  return {
    tenant_id: 'tenant_alpha01',
    user_id: 'user_alpha01',
    agent_id: 'agent_alpha01',
    conversation_id: 'conv_scheduled_api01',
    cron: '*/5 * * * *',
    input: 'scheduled goal integration task',
    budget_units: 10,
    trace_id: 'trace_scheduled_api01',
    ...overrides,
  };
}

function assertClean(value) {
  assert.doesNotMatch(JSON.stringify(value), /Hermes|OpenClaw|DeepSeek|\bDSH\b|native_|raw_credential|credential_material|provider_(?:binding|runtime)|https?:\/\/|\/(?:opt|tmp|var|etc|home|usr)\//i);
}

test('P7 scheduled goals API is default-off and tenant managed', async () => {
  const app = createManualPlatformApi();
  const config = await app.handle({ method: 'GET', path: '/v1/scheduled-goals/config?tenant_id=tenant_alpha01&trace_id=trace_scheduled_api02', headers: operator });
  assert.equal(config.status, 200);
  assert.equal(config.body.schema_version, 'nexus.scheduled_goal.p7.v1');
  assert.equal(config.body.enabled, false);
  assert.equal(config.body.schedule_mode, 'cron_like_utc');
  assert.equal(config.body.execution_mode, 'manual_tick');

  const created = await app.handle({ method: 'POST', path: '/v1/scheduled-goals', headers: operator, body: scheduledGoalBody({ trace_id: 'trace_scheduled_api03' }) });
  assert.equal(created.status, 201);
  assert.equal(created.body.status, 'scheduled');
  assert.equal(created.body.next_run_at_utc, '2026-08-25T00:05:00.000Z');

  app.clock.set({ utc_timestamp: created.body.next_run_at_utc, monotonic_ms: 1000 });
  const skipped = await app.handle({ method: 'POST', path: '/v1/scheduled-goals/run-due', headers: operator, body: { tenant_id: 'tenant_alpha01', trace_id: 'trace_scheduled_api04' } });
  assert.equal(skipped.status, 202);
  assert.equal(skipped.body.status, 'skipped');
  assert.equal(skipped.body.submitted_count, 0);
  assertClean({ config, created, skipped });
});

test('P7 scheduled goals API creates updates runs due cancels and retries through platform tasks', async () => {
  const app = createManualPlatformApi();
  const enabled = await app.handle({ method: 'PATCH', path: '/v1/scheduled-goals/config', headers: tenantAdmin, body: { tenant_id: 'tenant_alpha01', trace_id: 'trace_scheduled_api05', enabled: true } });
  assert.equal(enabled.status, 200);
  assert.equal(enabled.body.enabled, true);

  const created = await app.handle({ method: 'POST', path: '/v1/scheduled-goals', headers: operator, body: scheduledGoalBody({ cron: '5,10 * * * *', trace_id: 'trace_scheduled_api06' }) });
  assert.equal(created.status, 201);
  const patched = await app.handle({ method: 'PATCH', path: `/v1/scheduled-goals/${created.body.scheduled_goal_id}`, headers: operator, body: { status: 'paused', trace_id: 'trace_scheduled_api07' } });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.status, 'paused');
  const resumed = await app.handle({ method: 'PATCH', path: `/v1/scheduled-goals/${created.body.scheduled_goal_id}`, headers: operator, body: { status: 'scheduled', trace_id: 'trace_scheduled_api08' } });
  assert.equal(resumed.status, 200);

  app.clock.set({ utc_timestamp: resumed.body.next_run_at_utc, monotonic_ms: 2000 });
  const due = await app.handle({ method: 'POST', path: '/v1/scheduled-goals/run-due', headers: operator, body: { tenant_id: 'tenant_alpha01', trace_id: 'trace_scheduled_api09' } });
  assert.equal(due.status, 202);
  assert.equal(due.body.submitted_count, 1);
  assert.match(due.body.items[0].task_id, /^task_scheduled_/);

  const task = await app.handle({ method: 'GET', path: `/v1/tasks/${due.body.items[0].task_id}`, headers: operator });
  assert.equal(task.status, 200);
  assert.equal(task.body.state, 'admitted');

  const cancelled = await app.handle({ method: 'POST', path: `/v1/scheduled-goals/${created.body.scheduled_goal_id}/cancel`, headers: operator, body: { reason: 'operator cancelled scheduled goal', trace_id: 'trace_scheduled_api10' } });
  assert.equal(cancelled.status, 202);
  assert.equal(cancelled.body.status, 'cancelled');
  const retried = await app.handle({ method: 'POST', path: `/v1/scheduled-goals/${created.body.scheduled_goal_id}/retry`, headers: operator, body: { reason: 'operator retry scheduled goal', trace_id: 'trace_scheduled_api11' } });
  assert.equal(retried.status, 202);
  assert.equal(retried.body.status, 'scheduled');

  const listed = await app.handle({ method: 'GET', path: '/v1/scheduled-goals?tenant_id=tenant_alpha01', headers: operator });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.items.some((item) => item.scheduled_goal_id === created.body.scheduled_goal_id), true);
  assertClean({ enabled, created, patched, resumed, due, task, cancelled, retried, listed });
});

test('P7 scheduled goals API fails closed for unauthorized cross-tenant and invalid payloads', async () => {
  const app = createManualPlatformApi();
  const viewerCreate = await app.handle({ method: 'POST', path: '/v1/scheduled-goals', headers: viewer, body: scheduledGoalBody({ trace_id: 'trace_scheduled_api12' }) });
  assert.equal(viewerCreate.status, 403);
  assert.equal(viewerCreate.body.code, 'PLATFORM_FORBIDDEN');

  const crossTenant = await app.handle({ method: 'POST', path: '/v1/scheduled-goals', headers: operator, body: scheduledGoalBody({ tenant_id: 'tenant_beta01', trace_id: 'trace_scheduled_api13' }) });
  assert.equal(crossTenant.status, 403);

  const betaConfig = await app.handle({ method: 'PATCH', path: '/v1/scheduled-goals/config', headers: platformAdmin, body: { tenant_id: 'tenant_beta01', trace_id: 'trace_scheduled_api14', enabled: true } });
  assert.equal(betaConfig.status, 200);
  assert.equal(betaConfig.body.tenant_id, 'tenant_beta01');

  const nativePayload = await app.handle({ method: 'POST', path: '/v1/scheduled-goals', headers: operator, body: scheduledGoalBody({ native_url: 'https://blocked.invalid', trace_id: 'trace_scheduled_api15' }) });
  assert.equal(nativePayload.status, 400);
  assert.equal(nativePayload.body.code, 'PLATFORM_INVALID_REQUEST');

  const frequentCron = await app.handle({ method: 'POST', path: '/v1/scheduled-goals', headers: operator, body: scheduledGoalBody({ cron: '* * * * *', trace_id: 'trace_scheduled_api16' }) });
  assert.equal(frequentCron.status, 429);
  assert.equal(frequentCron.body.code, 'PLATFORM_RATE_LIMITED');
  assertClean({ viewerCreate, crossTenant, betaConfig, nativePayload, frequentCron });
});
