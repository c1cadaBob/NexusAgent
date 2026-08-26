import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createManualPlatformApi } from '../../product/api/index.ts';
import { projectMemoryRetentionRows } from '../../product/web-console/src/viewModel.ts';
import { ManualClock } from '../../platform/clock/index.ts';
import { LocalMemoryGateway, MemoryGatewayError } from '../../platform/memory-gateway/index.ts';
import { LocalObservability } from '../../platform/observability/index.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tenantAdmin = Object.freeze({ authorization: 'Bearer dev-tenant-admin-alpha' });
const operator = Object.freeze({ authorization: 'Bearer dev-operator-alpha' });
const forbidden = /Hermes|OpenClaw|DeepSeek|\bDSH\b|native_|raw_credential|credential_material|provider_runtime|https?:\/\/|\/(?:opt|tmp|var|etc|home|usr)\//i;

function assertClean(value, label) {
  assert.doesNotMatch(JSON.stringify(value), forbidden, `${label} leaked forbidden content`);
}

test('P7 memory retention rejects native raw provider and credential markers', async () => {
  const app = createManualPlatformApi();
  const memory = await app.handle({ method: 'POST', path: '/v1/memory', headers: operator, body: { tenant_id: 'tenant_alpha01', user_id: 'user_alpha01', layer: 'user', text: 'safe memory', trace_id: 'trace_retention_sec01' } });
  assert.equal(memory.status, 201);

  const nativeReason = await app.handle({ method: 'POST', path: `/v1/memory/${memory.body.memory_id}/delete`, headers: tenantAdmin, body: { tenant_id: 'tenant_alpha01', reason: 'native_url https://native.invalid raw_credential', trace_id: 'trace_retention_sec02' } });
  assert.equal(nativeReason.status, 400);
  assertClean(nativeReason.body, 'native reason error');

  const nativePolicy = await app.handle({ method: 'PATCH', path: '/v1/memory/retention', headers: tenantAdmin, body: { tenant_id: 'tenant_alpha01', trace_id: 'trace_retention_sec03', rules: [{ layer: 'session', enabled: true, ttl_days: 7, action: 'soft_delete', immutable: false, provider_runtime: 'direct' }] } });
  assert.equal(nativePolicy.status, 400);
  assertClean(nativePolicy.body, 'native policy error');
});

test('P7 memory retention observability and sweep results do not include memory text', () => {
  const clock = new ManualClock({ utc_timestamp: '2026-08-01T00:00:00.000Z', monotonic_ms: 100 });
  const observability = new LocalObservability({ clock, service: 'memory-gateway', version: 'p7-security' });
  const memory = new LocalMemoryGateway({ clock, observability });
  memory.write({ scope: { tenant_id: 'tenant_alpha01', user_id: 'user_alpha01' }, layer: 'session', text: 'sensitive memory text should not be logged', source: 'security', trace_id: 'trace_retention_sec04' });
  clock.advance(8 * 24 * 60 * 60 * 1000);
  const sweep = memory.sweepRetention({ tenant_id: 'tenant_alpha01', trace_id: 'trace_retention_sec05', requested_by_user_id: 'user_tenant_admin' });

  assert.equal(JSON.stringify(sweep).includes('sensitive memory text'), false);
  assert.equal(JSON.stringify(observability.logs({ trace_id: 'trace_retention_sec05' })).includes('sensitive memory text'), false);
  assert.equal(JSON.stringify(observability.metrics({ trace_id: 'trace_retention_sec05' })).includes('sensitive memory text'), false);
  assertClean({ sweep, logs: observability.logs({ trace_id: 'trace_retention_sec05' }), metrics: observability.metrics({ trace_id: 'trace_retention_sec05' }) }, 'retention observability');
});

test('P7 memory retention protects immutable audit snapshots and console projections', () => {
  const memory = new LocalMemoryGateway({ clock: new ManualClock({ utc_timestamp: '2026-08-26T00:00:00.000Z', monotonic_ms: 100 }) });
  const audit = memory.write({ scope: { tenant_id: 'tenant_alpha01', user_id: 'user_alpha01' }, layer: 'audit_snapshot', text: 'audit memory', source: 'security', trace_id: 'trace_retention_sec06' });
  assert.throws(
    () => memory.softDeleteMemory({ tenant_id: 'tenant_alpha01', memory_id: audit.memory_id, reason: 'delete audit', trace_id: 'trace_retention_sec07' }),
    (error) => error instanceof MemoryGatewayError && error.code === 'PLATFORM_FORBIDDEN',
  );
  const rows = projectMemoryRetentionRows(memory.getRetentionPolicy('tenant_alpha01', 'trace_retention_sec08'));
  assert.equal(rows.some((row) => row.layer === 'audit_snapshot' && row.immutable === true), true);
  assertClean(rows, 'console retention rows');
});

test('P7 memory retention public source avoids internal adapter and upstream paths', async () => {
  for (const file of [
    'product/api/index.ts',
    'product/sdk/src/index.ts',
    'product/web-console/src/apiClient.ts',
    'product/web-console/src/viewModel.ts',
    'product/web-console/src/main.tsx',
    'docs/contracts/openapi.yaml',
  ]) {
    const source = await readFile(path.join(repoRoot, file), 'utf8');
    assert.doesNotMatch(source, /platform\/adapters|vendor\//, file);
    assert.doesNotMatch(source, /Hermes|OpenClaw|DeepSeek|\bDSH\b/, file);
    assert.doesNotMatch(source, /Date\.now\(/, file);
  }
});
