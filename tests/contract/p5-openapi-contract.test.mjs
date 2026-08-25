import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { PLATFORM_ID_PATTERNS, TASK_STATES } from '../../platform/task-state/index.ts';

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

test('P5 OpenAPI covers implemented REST MVP routes', async () => {
  const spec = await openapi();
  for (const route of [
    '/v1/health',
    '/v1/tasks',
    '/v1/tasks/{task_id}',
    '/v1/tasks/{task_id}/cancel',
    '/v1/tasks/{task_id}/retry',
    '/v1/tasks/{task_id}/events',
    '/v1/skills',
    '/v1/capabilities',
    '/v1/memory/search',
    '/v1/memory',
    '/v1/tenants',
    '/v1/tenants/{tenant_id}/users',
    '/v1/permissions',
    '/v1/approvals',
    '/v1/approvals/{approval_id}/decision',
    '/v1/budget/check',
    '/v1/admin/plugins',
    '/v1/admin/plugins/import',
    '/v1/admin/plugins/{plugin_id}/admission',
  ]) {
    assert.match(spec, new RegExp(`^  ${route.replace(/[{}]/g, '\\$&')}:`, 'm'), `missing route ${route}`);
  }
});

test('P5 OpenAPI identifier and task-state schemas match platform runtime', async () => {
  const spec = await openapi();
  assert.match(schemaBlock(spec, 'ExecutionId'), /\^exec_/);
  assert.match(schemaBlock(spec, 'ConversationId'), /\^conv_/);
  assert.match(schemaBlock(spec, 'CapabilityId'), /\^cap_/);
  assert.equal(String(PLATFORM_ID_PATTERNS.execution_id).includes('exec_'), true);
  assert.equal(String(PLATFORM_ID_PATTERNS.conversation_id).includes('conv_'), true);

  const taskState = schemaBlock(spec, 'TaskState');
  for (const state of TASK_STATES) {
    assert.match(taskState, new RegExp(`- ${state}\\b`), `TaskState missing ${state}`);
  }
  for (const stale of ['queued', 'awaiting_approval', 'cancel_requested', 'canceled', 'succeeded', 'expired']) {
    assert.doesNotMatch(taskState, new RegExp(`- ${stale}\\b`), `TaskState retained stale value ${stale}`);
  }
});

test('P5 OpenAPI list contracts use cursor pagination', async () => {
  const spec = await openapi();
  for (const schemaName of ['TaskList', 'EventList', 'SkillList', 'CapabilityList', 'TenantList', 'TenantUserList', 'ApprovalList', 'PluginInventoryList']) {
    const block = schemaBlock(spec, schemaName);
    assert.match(block, /next_cursor:/, `${schemaName} missing next_cursor`);
  }
  assert.equal([...spec.matchAll(/\$ref: '#\/components\/parameters\/LimitQuery'/g)].length >= 8, true);
  assert.equal([...spec.matchAll(/\$ref: '#\/components\/parameters\/CursorQuery'/g)].length >= 8, true);
});

test('P5 OpenAPI plugin governance requires public admission metadata only', async () => {
  const spec = await openapi();
  const inventory = schemaBlock(spec, 'PluginInventoryEntry');
  const pluginImport = schemaBlock(spec, 'PluginImportRequest');

  for (const marker of ['display_name', 'source_kind', 'version', 'sha256', 'license', 'notice_status', 'risk_level', 'allowlist_status']) {
    assert.match(inventory, new RegExp(marker), `PluginInventoryEntry missing ${marker}`);
  }
  for (const marker of ['display_name', 'version', 'expected_sha256', 'license', 'notice_status', 'trace_id']) {
    assert.match(pluginImport, new RegExp(marker), `PluginImportRequest missing ${marker}`);
  }
  assert.doesNotMatch(inventory, /source_ref|provider_binding|runtime|session|endpoint|url|path/i);
});

test('P5 OpenAPI public surface does not expose internal component naming or blocked fields', async () => {
  const spec = await openapi();
  assert.doesNotMatch(spec, /Hermes|OpenClaw|DeepSeek|\bDSH\b/);
  assert.doesNotMatch(spec, /native_(?:url|path|session|error)|raw_credential|credential_material|provider_(?:agent|task|cancel)/i);
});
