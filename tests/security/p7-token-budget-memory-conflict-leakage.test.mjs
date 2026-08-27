import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createManualPlatformApi } from '../../product/api/index.ts';
import { DEV_PRINCIPALS } from '../../product/web-console/src/apiClient.ts';
import {
  actionEnabled,
  assertConsolePublicValue,
  projectBudgetLedgerRows,
  projectBudgetPolicyRows,
  projectMemoryConflictRows,
  visibleNavigation,
} from '../../product/web-console/src/viewModel.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tenantAdmin = Object.freeze({ authorization: 'Bearer dev-tenant-admin-alpha' });
const operator = Object.freeze({ authorization: 'Bearer dev-operator-alpha' });
const forbidden = /Hermes|OpenClaw|DeepSeek|\bDSH\b|native_|raw_credential|credential_material|provider_(?:binding|runtime|agent|task|cancel)|memory_rejected_text|stale_payload|source_ref|https?:\/\/|\/(?:opt|tmp|var|etc|home|usr)\//i;

function assertNoLeak(value) {
  assert.doesNotMatch(JSON.stringify(value), forbidden);
}

async function seedConflict(app) {
  await app.handle({ method: 'POST', path: '/v1/memory', headers: operator, body: { tenant_id: 'tenant_alpha01', user_id: 'user_alpha01', layer: 'user', text: 'safe conflict current record', trace_id: 'trace_budget_conflict_sec01' } });
  const stale = await app.handle({ method: 'POST', path: '/v1/memory', headers: operator, body: { tenant_id: 'tenant_alpha01', user_id: 'user_alpha01', layer: 'user', text: 'memory_rejected_text https://blocked.invalid /opt/native', expected_version: 0, trace_id: 'trace_budget_conflict_sec02' } });
  assert.equal(stale.status, 400);
  assertNoLeak(stale.body);

  const safeConflict = await app.handle({ method: 'POST', path: '/v1/memory', headers: operator, body: { tenant_id: 'tenant_alpha01', user_id: 'user_alpha01', layer: 'user', text: 'safe stale record', expected_version: 0, trace_id: 'trace_budget_conflict_sec03' } });
  assert.equal(safeConflict.status, 409);
  const listed = await app.handle({ method: 'GET', path: '/v1/memory/conflicts?tenant_id=tenant_alpha01', headers: tenantAdmin });
  return listed.body.items[0];
}

test('P7 token budget and memory conflict APIs reject native raw provider stale markers', async () => {
  const app = createManualPlatformApi();
  for (const request of [
    { method: 'PATCH', path: '/v1/budget/policy', body: { tenant_id: 'tenant_alpha01', trace_id: 'trace_budget_conflict_sec04', limits: { tenant_units: 10, stale_payload: 'blocked' } } },
    { method: 'POST', path: '/v1/budget/check', body: { tenant_id: 'tenant_alpha01', trace_id: 'trace_budget_conflict_sec05', requested_units: 1, provider_runtime: 'direct' } },
  ]) {
    const response = await app.handle({ ...request, headers: tenantAdmin });
    assert.equal(response.status, 400);
    assertNoLeak(response.body);
  }

  const conflict = await seedConflict(app);
  const badDecision = await app.handle({ method: 'POST', path: `/v1/memory/conflicts/${conflict.conflict_id}/decision`, headers: tenantAdmin, body: { tenant_id: 'tenant_alpha01', decision: 'resolve', reason: 'native_error https://blocked.invalid raw_credential', trace_id: 'trace_budget_conflict_sec06' } });
  assert.equal(badDecision.status, 400);
  assertNoLeak({ conflict, badDecision });
});

test('P7 token budget and memory conflict console projections are metadata-only', () => {
  const tenantAdminProfile = DEV_PRINCIPALS.find((profile) => profile.key === 'tenant-admin');
  const operatorProfile = DEV_PRINCIPALS.find((profile) => profile.key === 'operator');
  assert.ok(tenantAdminProfile && operatorProfile);
  assert.equal(actionEnabled(tenantAdminProfile, 'manage_token_budget'), true);
  assert.equal(actionEnabled(tenantAdminProfile, 'manage_memory_conflicts'), true);
  assert.equal(actionEnabled(operatorProfile, 'manage_token_budget'), false);
  assert.equal(actionEnabled(operatorProfile, 'manage_memory_conflicts'), false);
  assert.equal(visibleNavigation(operatorProfile).some((item) => item.id === 'budget'), true);

  const policyRows = projectBudgetPolicyRows({
    schema_version: 'nexus.token_budget.p7.v1',
    tenant_id: 'tenant_alpha01',
    policy_id: 'budget_policy_alpha01',
    enabled: true,
    dimension_mode: 'all_configured',
    enforcement_scope: 'task_adapter_api',
    limits: { tenant_units: 100000, user_units: 50000, agent_units: 50000, task_units: 10000, max_units_per_attempt: 5000 },
    resource_budget: { accounting_mode: 'deterministic_estimate', dimensions: ['tenant', 'user', 'agent', 'task'] },
    updated_at_utc: '2026-08-27T00:00:00.000Z',
    monotonic_ms: 100,
    trace_id: 'trace_budget_conflict_sec07',
  });
  const ledgerRows = projectBudgetLedgerRows([{ ...policyRows[0], schema_version: 'nexus.token_budget.p7.v1', ledger_id: 'ledger_budget01', user_id: 'user_alpha01', status: 'reserved', requested_units: 10, consumed_units: 10, remaining_units: 49990, dimensions: [], reason_codes: ['TOKEN_BUDGET_APPROVED'], recorded_at_utc: '2026-08-27T00:00:00.000Z', monotonic_ms: 100 }]);
  const conflictRows = projectMemoryConflictRows([{ schema_version: 'nexus.memory_conflict.p7.v1', conflict_id: 'conflict_alpha01_0001', tenant_id: 'tenant_alpha01', scope: { tenant_id: 'tenant_alpha01', user_id: 'user_alpha01' }, layer: 'user', expected_version: 1, current_version: 2, status: 'open', reason_codes: ['MEMORY_EXPECTED_VERSION_CONFLICT'], created_at_utc: '2026-08-27T00:00:00.000Z', updated_at_utc: '2026-08-27T00:00:00.000Z', monotonic_ms: 100, trace_id: 'trace_budget_conflict_sec08' }]);
  assertNoLeak({ policyRows, ledgerRows, conflictRows });
  assert.throws(() => assertConsolePublicValue({ stale_payload: 'do not show' }), /non-platform marker/);
});

test('P7 token budget and memory conflict public source avoids adapters vendors and local clocks', async () => {
  for (const file of [
    'product/api/index.ts',
    'product/sdk/src/index.ts',
    'product/web-console/src/apiClient.ts',
    'product/web-console/src/viewModel.ts',
    'product/web-console/src/main.tsx',
    'product/docs-site/src/catalog.ts',
    'docs/contracts/openapi.yaml',
  ]) {
    const source = await readFile(path.join(repoRoot, file), 'utf8');
    assert.doesNotMatch(source, /platform\/adapters|vendor\//, file);
    assert.doesNotMatch(source, /Hermes|OpenClaw|DeepSeek|\bDSH\b/, file);
    assert.doesNotMatch(source, /Date\.now\(/, file);
  }
});
