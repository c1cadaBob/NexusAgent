import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const openapiPath = path.join(repoRoot, 'docs/contracts/openapi.yaml');

async function openapi() {
  return readFile(openapiPath, 'utf8');
}

function schemaBlock(text, schemaName) {
  const start = text.indexOf(`    ${schemaName}:`);
  assert.notEqual(start, -1, `schema not found: ${schemaName}`);
  const rest = text.slice(start + 1);
  const next = rest.search(/\n    [A-Za-z][A-Za-z0-9]+:\n/);
  return next === -1 ? rest : rest.slice(0, next);
}

function assertRoute(spec, route) {
  assert.match(spec, new RegExp(`^  ${route.replace(/[{}]/g, '\\$&')}:`, 'm'), `missing route ${route}`);
}

test('P7 OpenAPI covers token budget and memory conflict public routes', async () => {
  const spec = await openapi();
  for (const route of [
    '/v1/budget/check',
    '/v1/budget/policy',
    '/v1/budget/ledger',
    '/v1/memory/conflicts',
    '/v1/memory/conflicts/{conflict_id}',
    '/v1/memory/conflicts/{conflict_id}/decision',
  ]) {
    assertRoute(spec, route);
  }
});

test('P7 OpenAPI token budget schemas use all-configured task adapter api semantics', async () => {
  const spec = await openapi();
  const policy = schemaBlock(spec, 'TokenBudgetPolicy');
  const limits = schemaBlock(spec, 'TokenBudgetLimits');
  const result = schemaBlock(spec, 'BudgetCheckResult');
  const ledger = schemaBlock(spec, 'TokenBudgetLedgerEntry');

  for (const marker of ['nexus.token_budget.p7.v1', 'all_configured', 'task_adapter_api']) {
    assert.match(policy, new RegExp(marker), `TokenBudgetPolicy missing ${marker}`);
  }
  for (const marker of ['tenant_units', 'user_units', 'agent_units', 'task_units', 'max_units_per_attempt']) {
    assert.match(limits, new RegExp(marker), `TokenBudgetLimits missing ${marker}`);
  }
  for (const marker of ['decision_id', 'dimensions', 'reason_codes', 'TOKEN_BUDGET_APPROVED', 'TOKEN_BUDGET_EXCEEDED', 'TOKEN_BUDGET_MAX_ATTEMPT_EXCEEDED']) {
    assert.match(result, new RegExp(marker), `BudgetCheckResult missing ${marker}`);
  }
  assert.match(ledger, /ledger_id/);
  assert.match(ledger, /reserved/);
  assert.match(ledger, /denied/);
});

test('P7 OpenAPI memory conflict schemas are metadata only', async () => {
  const spec = await openapi();
  const conflict = schemaBlock(spec, 'MemoryConflict');
  const decision = schemaBlock(spec, 'MemoryConflictDecisionRequest');

  for (const marker of ['nexus.memory_conflict.p7.v1', 'conflict_id', 'expected_version', 'current_version', 'open', 'resolved', 'ignored', 'MEMORY_EXPECTED_VERSION_CONFLICT']) {
    assert.match(conflict, new RegExp(marker), `MemoryConflict missing ${marker}`);
  }
  assert.match(decision, /resolve/);
  assert.match(decision, /ignore/);
  assert.doesNotMatch(conflict, /stale_payload|memory_rejected_text|credential|native_|provider_|runtime|url|path|session|source_ref/i);
});

test('P7 OpenAPI new public response schemas do not expose native raw provider fields', async () => {
  const spec = await openapi();
  for (const schemaName of ['TokenBudgetPolicy', 'BudgetCheckResult', 'TokenBudgetLedgerEntry', 'TokenBudgetLedgerList', 'MemoryConflict', 'MemoryConflictList']) {
    assert.doesNotMatch(schemaBlock(spec, schemaName), /Hermes|OpenClaw|DeepSeek|\bDSH\b|native_|raw_credential|credential_material|provider_(?:binding|runtime|agent|task|cancel)|memory_rejected_text|stale_payload|https?:\/\/|\/(?:opt|tmp|var|etc|home|usr)\//i, schemaName);
  }
});
