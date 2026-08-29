import assert from 'node:assert/strict';
import test from 'node:test';

import { createDistributedPlatformRuntime, createInternalServiceServer } from '../../platform/internal-http/index.ts';
import { createPlatformApi } from '../../product/api/index.ts';

const token = 'dev-internal-test-token';

async function startService(serviceName) {
  const server = createInternalServiceServer({ serviceName, port: 0, token });
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
  };
}

async function stopService(service) {
  await new Promise((resolve, reject) => service.server.close((error) => error ? reject(error) : resolve()));
}

test('internal service entrypoints provide authenticated health and domain routes', async (t) => {
  const services = {};
  for (const name of ['openclaw-adapter', 'hermes-adapter', 'dsh-adapter', 'memory-gateway', 'artifact-store', 'event-bus', 'credential-center', 'observability']) {
    services[name] = await startService(name);
  }
  t.after(async () => {
    await Promise.all(Object.values(services).map(stopService));
  });

  for (const service of Object.values(services)) {
    const health = await fetch(`${service.url}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).ready, true);
  }

  const unauthorized = await fetch(`${services['memory-gateway'].url}/internal/v1/memory/conflicts`, { method: 'GET' });
  assert.equal(unauthorized.status, 401);

  const headers = {
    authorization: `Bearer ${token}`,
    'x-nexus-caller-service': 'platform-api',
    'content-type': 'application/json',
  };
  const forgedCaller = await fetch(`${services['memory-gateway'].url}/internal/v1/memory/conflicts`, {
    method: 'GET',
    headers: {
      ...headers,
      'x-nexus-caller-service': 'forged-platform-api',
    },
  });
  assert.equal(forgedCaller.status, 403);

  const written = await fetch(`${services['memory-gateway'].url}/internal/v1/memory/write`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      scope: { tenant_id: 'tenant_alpha01', user_id: 'user_alpha01' },
      layer: 'session',
      text: 'internal service probe',
      source: 'integration-test',
      trace_id: 'trace_internal_http01',
    }),
  });
  assert.equal(written.status, 200);
  assert.match((await written.json()).memory_id, /^memory_alpha01_/);
});

test('distributed platform API routes memory and channel dry-run through internal services', async (t) => {
  const names = ['openclaw-adapter', 'hermes-adapter', 'dsh-adapter', 'memory-gateway', 'artifact-store', 'event-bus', 'credential-center', 'observability'];
  const services = {};
  for (const name of names) services[name] = await startService(name);
  t.after(async () => {
    await Promise.all(Object.values(services).map(stopService));
  });

  const app = createPlatformApi({
    runtime: 'distributed',
    internal: {
      token,
      serviceUrls: Object.fromEntries(Object.entries(services).map(([name, service]) => [name, service.url])),
    },
  });
  const operator = { authorization: 'Bearer dev-operator-alpha' };
  const admin = { authorization: 'Bearer dev-tenant-admin-alpha' };

  const health = await app.handle({ method: 'GET', path: '/v1/health' });
  assert.equal(health.status, 200);

  const task = await app.handle({
    method: 'POST',
    path: '/v1/tasks',
    headers: operator,
    body: {
      tenant_id: 'tenant_alpha01',
      user_id: 'user_alpha01',
      agent_id: 'agent_alpha01',
      conversation_id: 'conv_internal_http01',
      input: 'distributed task probe',
      trace_id: 'trace_internal_http02',
    },
  });
  assert.equal(task.status, 202);
  assert.equal(task.body.state, 'admitted');

  const memory = await app.handle({
    method: 'POST',
    path: '/v1/memory',
    headers: operator,
    body: {
      tenant_id: 'tenant_alpha01',
      user_id: 'user_alpha01',
      agent_id: 'agent_alpha01',
      conversation_id: 'conv_internal_http01',
      layer: 'user',
      text: 'distributed memory probe',
      trace_id: 'trace_internal_http03',
    },
  });
  assert.equal(memory.status, 201);

  const channel = await app.handle({
    method: 'POST',
    path: '/v1/channels',
    headers: admin,
    body: {
      tenant_id: 'tenant_alpha01',
      channel_name: 'telegram',
      display_name: 'Internal HTTP Channel',
      account_ref: 'channel_account_internal01',
      conversation_ref: 'channel_conversation_internal01',
      credential_ref: 'cred_internal01',
      trace_id: 'trace_internal_http04',
    },
  });
  assert.equal(channel.status, 201);
  const enabled = await app.handle({
    method: 'POST',
    path: `/v1/channels/${channel.body.channel_config_id}/status`,
    headers: admin,
    body: { status: 'enabled', reason: 'internal route probe', trace_id: 'trace_internal_http05' },
  });
  assert.equal(enabled.status, 200);
  const dryRun = await app.handle({
    method: 'POST',
    path: `/v1/channels/${channel.body.channel_config_id}/test`,
    headers: admin,
    body: { trace_id: 'trace_internal_http06' },
  });
  assert.equal(dryRun.status, 200);
  assert.equal(dryRun.body.delivery_outcome, 'queued');

  const runtime = createDistributedPlatformRuntime({
    token,
    serviceUrls: Object.fromEntries(Object.entries(services).map(([name, service]) => [name, service.url])),
  });
  const timeline = await runtime.observability.timeline({ tenant_id: 'tenant_alpha01', trace_id: 'trace_internal_http03' });
  assert.ok(Array.isArray(timeline));
});
