import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildHermesPluginBridgeFixtures,
  discoverHermesPlannerCapabilities,
  HERMES_PLUGIN_BRIDGE_SCHEMA_VERSION,
  HermesPluginBridgeError,
} from '../../platform/adapters/hermes/index.ts';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function fixture(index = 0, overrides = {}) {
  return { ...clone(buildHermesPluginBridgeFixtures()[index]), ...overrides };
}

test('Hermes Plugin Bridge discovers approved skill and MCP capabilities as sanitized planner hints', () => {
  const result = discoverHermesPlannerCapabilities(buildHermesPluginBridgeFixtures(), {
    tenant_id: 'tenant_alpha01',
    trace_id: 'trace_plugin01',
  });

  assert.equal(result.schema_version, HERMES_PLUGIN_BRIDGE_SCHEMA_VERSION);
  assert.equal(result.capabilities.length, 2);
  assert.deepEqual(result.capabilities.map((capability) => capability.capability_type).sort(), ['mcp_server', 'skill']);
  assert.equal(result.planner_hints.length, 2);
  assert.equal(result.planner_hints.every((hint) => hint.planner_runtime === 'planner_only'), true);
  assert.equal(result.planner_hints.every((hint) => hint.memory_runtime === 'memory_gateway_required'), true);
  assert.equal(result.planner_hints.every((hint) => hint.execution_runtime === 'tool_intent_only'), true);

  const serialized = JSON.stringify(result);
  for (const forbidden of ['vendor/', 'SKILL.md', 'MEMORY.md', 'USER.md', 'http://', 'https://', '/opt/', 'native_session', 'native_error', 'api_key', 'password', 'secret-token']) {
    assert.equal(serialized.includes(forbidden), false, `planner hint leaked ${forbidden}`);
  }
});

test('Hermes Plugin Bridge rejects unapproved disabled and tenant-invisible candidates', () => {
  assert.throws(
    () => discoverHermesPlannerCapabilities([fixture(0, { allowlist_status: 'pending_review' })], { tenant_id: 'tenant_alpha01' }),
    (error) => error instanceof HermesPluginBridgeError && error.code === 'PLATFORM_POLICY_DENIED',
  );
  assert.throws(
    () => discoverHermesPlannerCapabilities([fixture(0, { allowlist_status: 'disabled' })], { tenant_id: 'tenant_alpha01' }),
    (error) => error instanceof HermesPluginBridgeError && error.code === 'PLATFORM_POLICY_DENIED',
  );

  const invisible = fixture();
  invisible.capabilities[0].tenant_visibility = { mode: 'approved_tenants', tenant_ids: ['tenant_other01'] };
  assert.throws(
    () => discoverHermesPlannerCapabilities([invisible], { tenant_id: 'tenant_alpha01' }),
    (error) => error instanceof HermesPluginBridgeError && error.code === 'PLATFORM_FORBIDDEN',
  );

  const adminOnly = fixture();
  adminOnly.capabilities[0].tenant_visibility = { mode: 'platform_admin_only' };
  assert.throws(
    () => discoverHermesPlannerCapabilities([adminOnly], { tenant_id: 'tenant_alpha01' }),
    (error) => error instanceof HermesPluginBridgeError && error.code === 'PLATFORM_FORBIDDEN',
  );
});

test('Hermes Plugin Bridge rejects native tool execution direct memory and secret-like MCP payloads', () => {
  const nativeTool = fixture();
  nativeTool.capabilities[0].capability_type = 'tool';
  nativeTool.capabilities[0].declared_runtime = 'tool_execution';
  assert.throws(
    () => discoverHermesPlannerCapabilities([nativeTool], { tenant_id: 'tenant_alpha01' }),
    (error) => error instanceof HermesPluginBridgeError && error.code === 'PLATFORM_POLICY_DENIED',
  );

  const directMemory = fixture();
  directMemory.capabilities[0].capability_type = 'memory_direct';
  assert.throws(
    () => discoverHermesPlannerCapabilities([directMemory], { tenant_id: 'tenant_alpha01' }),
    (error) => error instanceof HermesPluginBridgeError && error.code === 'PLATFORM_POLICY_DENIED',
  );

  const mcpSecret = fixture(1);
  mcpSecret.capabilities[0].config = { env: { API_KEY: 'plain_text_secret' } };
  assert.throws(
    () => discoverHermesPlannerCapabilities([mcpSecret], { tenant_id: 'tenant_alpha01' }),
    (error) => error instanceof HermesPluginBridgeError && error.code === 'PLATFORM_INVALID_REQUEST',
  );

  const rawSource = fixture(0, { source_ref: 'vendor/hermes-agent-main/plugins/google_meet/SKILL.md' });
  assert.throws(
    () => discoverHermesPlannerCapabilities([rawSource], { tenant_id: 'tenant_alpha01' }),
    (error) => error instanceof HermesPluginBridgeError && error.code === 'PLATFORM_INVALID_REQUEST',
  );

  const nativeSession = fixture();
  nativeSession.capabilities[0].config = { marker: 'native_session_123' };
  assert.throws(
    () => discoverHermesPlannerCapabilities([nativeSession], { tenant_id: 'tenant_alpha01' }),
    (error) => error instanceof HermesPluginBridgeError && error.code === 'PLATFORM_INVALID_REQUEST',
  );
});
