import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildOpenClawPluginBridgeFixtures,
  discoverOpenClawGatewayCapabilities,
  OPENCLAW_PLUGIN_BRIDGE_SCHEMA_VERSION,
  OpenClawPluginBridgeError,
} from '../../platform/adapters/openclaw/plugin-bridge.ts';

function discover(candidates) {
  return discoverOpenClawGatewayCapabilities(candidates, {
    tenant_id: 'tenant_alpha01',
    trace_id: 'trace_plugin01',
  });
}

test('OpenClaw Plugin Bridge discovers approved channel and message capabilities as sanitized descriptors', () => {
  const result = discover(buildOpenClawPluginBridgeFixtures());
  const text = JSON.stringify(result);

  assert.equal(result.schema_version, OPENCLAW_PLUGIN_BRIDGE_SCHEMA_VERSION);
  assert.deepEqual(
    result.capabilities.filter((capability) => capability.capability_type === 'channel').map((capability) => capability.channel_name).sort(),
    ['dingtalk', 'feishu', 'telegram'],
  );
  assert.equal(result.plugin_inventory.length, 4);
  assert.deepEqual(result.plugin_inventory.map((plugin) => plugin.source_type).sort(), [
    'marketplace',
    'marketplace',
    'package_registry',
    'package_registry',
  ]);
  assert.ok(result.plugin_inventory.every((plugin) => plugin.native_host === 'channel_gateway_sidecar'));
  assert.ok(result.capabilities.some((capability) => capability.capability_type === 'message_transform'));
  assert.ok(result.gateway_hints.every((hint) => hint.coordinator_runtime === 'required' && hint.policy_gate_runtime === 'required'));
  for (const forbidden of ['http://', '/opt/', 'vendor/', 'MEMORY.md', 'USER.md', 'native_session', 'native_error', 'secret-token']) {
    assert.equal(text.includes(forbidden), false, `plugin discovery leaked ${forbidden}`);
  }
});

test('OpenClaw Plugin Bridge rejects unapproved disabled and tenant-invisible candidates', () => {
  const [candidate] = buildOpenClawPluginBridgeFixtures();
  for (const override of [
    { allowlist_status: 'pending_review' },
    { allowlist_status: 'disabled' },
    { admission_policy: { ...candidate.admission_policy, approval_state: 'rejected' } },
    { capabilities: [{ ...candidate.capabilities[0], tenant_visibility: { mode: 'approved_tenants', tenant_ids: ['tenant_other01'] } }] },
  ]) {
    assert.throws(
      () => discover([{ ...candidate, ...override }]),
      (error) => error instanceof OpenClawPluginBridgeError && ['PLATFORM_POLICY_DENIED', 'PLATFORM_FORBIDDEN'].includes(error.code),
    );
  }
});

test('OpenClaw Plugin Bridge rejects native agent tool memory URL path and secret-like plugin payloads', () => {
  const [candidate] = buildOpenClawPluginBridgeFixtures();
  const blockedCandidates = [
    { ...candidate, capabilities: [{ ...candidate.capabilities[0], capability_type: 'native_agent', declared_runtime: 'native_agent' }] },
    { ...candidate, capabilities: [{ ...candidate.capabilities[0], capability_type: 'native_tool', declared_runtime: 'native_tool' }] },
    { ...candidate, capabilities: [{ ...candidate.capabilities[0], capability_type: 'direct_memory', declared_runtime: 'direct_memory' }] },
    { ...candidate, source_ref: 'https://example.invalid/plugin.tgz' },
    { ...candidate, source_ref: 'vendor/openclaw-main/plugins/channel' },
    { ...candidate, capabilities: [{ ...candidate.capabilities[0], config: { env: { BOT_TOKEN: 'secret-token-value' } } }] },
    { ...candidate, capabilities: [{ ...candidate.capabilities[0], config: { native_session_id: 'native_session_abc' } }] },
  ];

  for (const blocked of blockedCandidates) {
    assert.throws(
      () => discover([blocked]),
      (error) => error instanceof OpenClawPluginBridgeError && ['PLATFORM_INVALID_REQUEST', 'PLATFORM_POLICY_DENIED'].includes(error.code),
    );
  }
});

test('OpenClaw Plugin Bridge rejects P4-02 Git and local plugin sources outside the first inventory allowlist', () => {
  const [candidate] = buildOpenClawPluginBridgeFixtures();
  for (const source_type of ['git', 'local_snapshot']) {
    assert.throws(
      () => discover([{ ...candidate, source_type, admission_policy: { ...candidate.admission_policy, allowed_sources: [source_type] } }]),
      (error) => error instanceof OpenClawPluginBridgeError && error.code === 'PLATFORM_POLICY_DENIED',
    );
  }
});
