import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { DEV_PRINCIPALS } from '../../product/web-console/src/apiClient.ts';
import { actionEnabled, assertConsolePublicValue, buildConsoleDashboardModel, projectChannelRow, projectMemoryRetentionRows, projectPluginRow, visibleNavigation } from '../../product/web-console/src/viewModel.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const blocked = /Hermes|OpenClaw|DeepSeek|\bDSH\b|native_|raw_credential|credential_material|credential_ref|provider_(?:agent|task|cancel|binding)|source_ref|session_id|file_path|memory_path|tool_name|\/(?:opt|tmp|var|etc|home|usr)\//i;

test('web console source avoids internal component names and adapter imports', async () => {
  const files = [
    'product/web-console/src/apiClient.ts',
    'product/web-console/src/viewModel.ts',
    'product/web-console/src/main.tsx',
    'product/web-console/src/styles.css',
    'product/web-console/README.md',
  ];
  for (const file of files) {
    const source = await readFile(path.join(repoRoot, file), 'utf8');
    assert.doesNotMatch(source, /Hermes|OpenClaw|DeepSeek|\bDSH\b/, file);
    assert.doesNotMatch(source, /platform\/adapters|vendor\//, file);
    assert.doesNotMatch(source, /Date\.now\(/, file);
  }
});

test('web console view-model projects plugin metadata without source details', () => {
  const row = projectPluginRow({
    plugin_id: 'plugin_console01',
    display_name: 'Console Plugin',
    source_kind: 'package_registry',
    version: '1.0.0',
    sha256: 'd'.repeat(64),
    license: 'MIT',
    notice_status: 'recorded',
    risk_level: 'medium',
    allowlist_status: 'approved',
    capability_ids: ['cap_console01'],
    trace_id: 'trace_console01',
  });
  assert.deepEqual(Object.keys(row), ['plugin_id', 'display_name', 'source_kind', 'version', 'sha256', 'license', 'notice_status', 'risk_level', 'allowlist_status', 'capability_ids']);
  assert.doesNotMatch(JSON.stringify(row), blocked);
});

test('web console view-model projects channel metadata without credential references', () => {
  const row = projectChannelRow({
    schema_version: 'nexus.channel_management.p5.v1',
    channel_config_id: 'channel_config_console01',
    tenant_id: 'tenant_alpha01',
    channel_name: 'telegram',
    display_name: 'Telegram Console',
    status: 'enabled',
    capability_id: 'cap_channel_telegram',
    account_ref: 'channel_account_console01',
    conversation_ref: 'channel_conversation_console01',
    credential_status: 'reference_configured',
    created_at: '2026-08-25T00:00:00.000Z',
    updated_at: '2026-08-25T00:00:00.000Z',
    trace_id: 'trace_console01',
  });
  assert.deepEqual(Object.keys(row), ['channel_config_id', 'tenant_id', 'channel_name', 'display_name', 'status', 'capability_id', 'account_ref', 'conversation_ref', 'credential_status', 'updated_at', 'trace_id']);
  assert.doesNotMatch(JSON.stringify(row), blocked);
  assert.throws(() => assertConsolePublicValue({ credential_ref: 'cred_console01' }), /non-platform marker/);
});

test('web console permission view gates plugin governance and channel management', () => {
  const admin = DEV_PRINCIPALS.find((profile) => profile.key === 'platform-admin');
  const tenantAdmin = DEV_PRINCIPALS.find((profile) => profile.key === 'tenant-admin');
  const viewer = DEV_PRINCIPALS.find((profile) => profile.key === 'viewer');
  const operator = DEV_PRINCIPALS.find((profile) => profile.key === 'operator');
  assert.ok(admin && tenantAdmin && viewer && operator);
  assert.equal(actionEnabled(admin, 'manage_plugins'), true);
  assert.equal(actionEnabled(tenantAdmin, 'manage_plugins'), false);
  assert.equal(actionEnabled(admin, 'manage_channels'), true);
  assert.equal(actionEnabled(tenantAdmin, 'manage_channels'), true);
  assert.equal(actionEnabled(admin, 'manage_memory_retention'), true);
  assert.equal(actionEnabled(tenantAdmin, 'manage_memory_retention'), true);
  assert.equal(actionEnabled(operator, 'manage_memory_retention'), false);
  assert.equal(actionEnabled(viewer, 'manage_memory_retention'), false);
  assert.equal(actionEnabled(viewer, 'manage_channels'), false);
  assert.equal(actionEnabled(viewer, 'submit_task'), false);
  assert.equal(visibleNavigation(tenantAdmin).some((item) => item.id === 'plugins'), false);
  assert.equal(visibleNavigation(viewer).some((item) => item.id === 'plugins'), false);
  assert.equal(visibleNavigation(viewer).some((item) => item.id === 'channels'), true);
  assert.equal(visibleNavigation(operator).some((item) => item.id === 'channels'), false);
});

test('web console view-model projects memory retention policy without tombstone text', () => {
  const rows = projectMemoryRetentionRows({
    schema_version: 'nexus.memory_retention.p7.v1',
    tenant_id: 'tenant_alpha01',
    policy_id: 'memory_retention_alpha01',
    enabled: true,
    mode: 'conservative',
    rules: [
      { layer: 'session', enabled: true, ttl_days: 7, action: 'soft_delete', immutable: false },
      { layer: 'audit_snapshot', enabled: false, ttl_days: null, action: 'retain', immutable: true },
    ],
    resource_budget: { evaluation_mode: 'manual_sweep', max_sweep_records: 100, max_policy_rules: 5 },
    updated_at_utc: '2026-08-26T00:00:00.000Z',
    monotonic_ms: 100,
    trace_id: 'trace_console_retention01',
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].ttl_days, 7);
  assert.doesNotMatch(JSON.stringify(rows), /text|tombstone|deleted_reason/i);
  assert.doesNotMatch(JSON.stringify(rows), blocked);
});

test('web console dashboard model rejects non-platform markers', () => {
  const profile = DEV_PRINCIPALS.find((item) => item.key === 'operator');
  assert.ok(profile);
  const model = buildConsoleDashboardModel(profile, {
    tasks: [{ tenant_id: 'tenant_alpha01', user_id: 'user_alpha01', agent_id: 'agent_alpha01', task_id: 'task_console01', attempt_id: 'attempt_console01', execution_id: 'exec_console01', conversation_id: 'conv_console01', state: 'admitted', trace_id: 'trace_console01', artifact_ids: [], created_at: '2026-08-25T00:00:00.000Z', updated_at: '2026-08-25T00:00:00.000Z' }],
    taskEvents: [],
    tenants: [],
    tenantUsers: [],
    channels: [],
    approvals: [],
    skills: [],
    capabilities: [],
    memory: [],
    memoryRetentionPolicy: {
      schema_version: 'nexus.memory_retention.p7.v1',
      tenant_id: 'tenant_alpha01',
      policy_id: 'memory_retention_alpha01',
      enabled: true,
      mode: 'conservative',
      rules: [{ layer: 'session', enabled: true, ttl_days: 7, action: 'soft_delete', immutable: false }],
      resource_budget: { evaluation_mode: 'manual_sweep', max_sweep_records: 100, max_policy_rules: 5 },
      updated_at_utc: '2026-08-26T00:00:00.000Z',
      monotonic_ms: 100,
      trace_id: 'trace_console_retention02',
    },
    plugins: [],
  });
  assert.equal(model.agents[0].agent_id, 'agent_alpha01');
  assert.equal(model.memoryRetentionRows.length, 1);
  assert.throws(() => assertConsolePublicValue({ source_ref: 'registry:blocked' }), /non-platform marker/);
});
