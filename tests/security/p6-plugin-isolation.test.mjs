import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildHermesPluginBridgeFixtures,
  discoverHermesPlannerCapabilities,
  HermesPluginBridgeError,
} from '../../platform/adapters/hermes/plugin-bridge.ts';
import {
  buildOpenClawPluginBridgeFixtures,
  discoverOpenClawGatewayCapabilities,
  OpenClawPluginBridgeError,
} from '../../platform/adapters/openclaw/plugin-bridge.ts';
import { LocalPluginGovernance, PluginGovernanceError } from '../../platform/plugin-governance/index.ts';
import { assertPublicRequestPayload, PublicSurfaceError } from '../../platform/public-surface/index.ts';

// dual-format malicious plugin coverage: platform-neutral mock payloads plus Hermes/OpenClaw bridge variants.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function pluginImport(overrides = {}) {
  return {
    source_kind: 'package_registry',
    source_ref: 'registry:p6.mock.plugin',
    display_name: 'P6 Mock Plugin',
    version: '1.0.0',
    expected_sha256: 'c'.repeat(64),
    license: 'MIT',
    notice_status: 'recorded',
    risk_level: 'medium',
    trace_id: 'trace_p6plugin01',
    ...overrides,
  };
}

function assertNoLeak(value) {
  assert.doesNotMatch(JSON.stringify(value), /raw_credential|credential_material|native_(?:url|path|session|error)|provider_(?:binding|runtime|agent|task|cancel)|https?:\/\/|\/opt\//i);
}

test('P6 platform-neutral mock malicious plugin manifests fail closed at public request and governance boundaries', () => {
  const governance = new LocalPluginGovernance({ tenant_id: 'tenant_alpha01', trace_id: 'trace_p6plugin01' });
  const blockedPayloads = [
    pluginImport({ native_agent: { command: 'run-native-agent' } }),
    pluginImport({ native_tool: { name: 'shell' } }),
    pluginImport({ native_memory: { path: 'MEMORY.md' } }),
    pluginImport({ plugin_subagent: { command: 'spawn' } }),
    pluginImport({ provider_runtime: 'native-runtime' }),
    pluginImport({ manifest: { capability_type: 'native_agent' } }),
    pluginImport({ raw_manifest: { source_ref: 'registry:p6.raw' } }),
    pluginImport({ native_manifest: { source_ref: 'registry:p6.native' } }),
    pluginImport({ env: { API_KEY: 'plain-text-secret' } }),
  ];

  for (const payload of blockedPayloads) {
    assert.throws(
      () => assertPublicRequestPayload(payload),
      (error) => error instanceof PublicSurfaceError && error.code === 'PLATFORM_INVALID_REQUEST',
    );
    assert.throws(
      () => governance.importPlugin(payload),
      (error) => error instanceof PublicSurfaceError && error.code === 'PLATFORM_INVALID_REQUEST',
    );
  }

  assert.throws(
    () => governance.importPlugin(pluginImport({ source_ref: 'https://example.invalid/p6-plugin.tgz' })),
    (error) => error instanceof PublicSurfaceError && error.code === 'PLATFORM_INVALID_REQUEST',
  );
  assert.throws(
    () => governance.importPlugin(pluginImport({ expected_sha256: 'not-a-sha' })),
    (error) => error instanceof PluginGovernanceError && error.code === 'PLATFORM_INVALID_REQUEST',
  );
});

test('P6 Hermes Plugin Bridge malicious fixture variants cannot become planner capabilities', () => {
  const [skillCandidate, mcpCandidate] = buildHermesPluginBridgeFixtures().map(clone);
  const variants = [
    { ...skillCandidate, allowlist_status: 'pending_review' },
    { ...skillCandidate, capabilities: [{ ...skillCandidate.capabilities[0], capability_type: 'native_agent', declared_runtime: 'native_agent' }] },
    { ...skillCandidate, capabilities: [{ ...skillCandidate.capabilities[0], capability_type: 'native_tool', declared_runtime: 'native_tool' }] },
    { ...skillCandidate, capabilities: [{ ...skillCandidate.capabilities[0], capability_type: 'direct_memory', declared_runtime: 'direct_memory' }] },
    { ...skillCandidate, source_ref: 'vendor/hermes-agent-main/plugins/native/SKILL.md' },
    { ...mcpCandidate, capabilities: [{ ...mcpCandidate.capabilities[0], config: { env: { API_KEY: 'plain-text-secret' } } }] },
    { ...mcpCandidate, capabilities: [{ ...mcpCandidate.capabilities[0], config: { provider_runtime: 'native-runtime' } }] },
  ];

  for (const variant of variants) {
    assert.throws(
      () => discoverHermesPlannerCapabilities([variant], { tenant_id: 'tenant_alpha01', trace_id: 'trace_p6plugin02' }),
      (error) => error instanceof HermesPluginBridgeError && ['PLATFORM_INVALID_REQUEST', 'PLATFORM_POLICY_DENIED'].includes(error.code),
    );
  }
});

test('P6 OpenClaw Plugin Bridge malicious fixture variants cannot become gateway capabilities', () => {
  const [candidate] = buildOpenClawPluginBridgeFixtures().map(clone);
  const variants = [
    { ...candidate, allowlist_status: 'pending_review' },
    { ...candidate, admission_policy: { ...candidate.admission_policy, approval_state: 'rejected' } },
    { ...candidate, source_type: 'git', admission_policy: { ...candidate.admission_policy, allowed_sources: ['git'] } },
    { ...candidate, source_ref: 'vendor/openclaw-main/plugins/native' },
    { ...candidate, capabilities: [{ ...candidate.capabilities[0], capability_type: 'native_agent', declared_runtime: 'native_agent' }] },
    { ...candidate, capabilities: [{ ...candidate.capabilities[0], capability_type: 'native_tool', declared_runtime: 'native_tool' }] },
    { ...candidate, capabilities: [{ ...candidate.capabilities[0], capability_type: 'direct_memory', declared_runtime: 'direct_memory' }] },
    { ...candidate, capabilities: [{ ...candidate.capabilities[0], config: { env: { BOT_TOKEN: 'plain-text-secret' } } }] },
    { ...candidate, capabilities: [{ ...candidate.capabilities[0], config: { provider_runtime: 'native-runtime' } }] },
    { ...candidate, capabilities: [{ ...candidate.capabilities[0], config: { plugin_subagent: { command: 'spawn' } } }] },
  ];

  for (const variant of variants) {
    assert.throws(
      () => discoverOpenClawGatewayCapabilities([variant], { tenant_id: 'tenant_alpha01', trace_id: 'trace_p6plugin03' }),
      (error) => error instanceof OpenClawPluginBridgeError && ['PLATFORM_INVALID_REQUEST', 'PLATFORM_POLICY_DENIED'].includes(error.code),
    );
  }
});

test('P6 approved plugin projections remain public and product source stays decoupled from internal adapters', async () => {
  const governance = new LocalPluginGovernance({ tenant_id: 'tenant_alpha01', trace_id: 'trace_p6plugin04' });
  const inventory = governance.listInventory();
  const capabilities = governance.listCapabilities({ tenant_id: 'tenant_alpha01' });
  assert.equal(inventory.length > 0, true);
  assert.equal(capabilities.length > 0, true);
  for (const entry of inventory) {
    assert.equal(Object.hasOwn(entry, 'source_ref'), false);
    assert.equal(Object.hasOwn(entry, 'provider_binding'), false);
    assert.equal(Object.hasOwn(entry, 'runtime'), false);
  }
  assertNoLeak({ inventory, capabilities });

  const productFiles = [
    'product/api/index.ts',
    'product/web-console/src/apiClient.ts',
    'product/web-console/src/viewModel.ts',
    'product/sdk/src/index.ts',
    'product/docs-site/src/main.tsx',
  ];
  for (const file of productFiles) {
    const source = await readFile(path.join(repoRoot, file), 'utf8');
    assert.doesNotMatch(source, /platform\/adapters|vendor\//, file);
  }
});
