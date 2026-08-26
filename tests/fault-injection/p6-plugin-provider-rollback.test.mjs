import assert from 'node:assert/strict';
import test from 'node:test';

import {
  baselineDshProviderMetadata,
  DSH_BASELINE_PROVIDER_ID,
  DshProviderRegistry,
} from '../../platform/adapters/dsh/index.ts';
import {
  baselineHermesProviderMetadata,
  HERMES_BASELINE_PROVIDER_ID,
  HermesProviderRegistry,
} from '../../platform/adapters/hermes/index.ts';
import {
  baselineOpenClawProviderMetadata,
  OPENCLAW_BASELINE_PROVIDER_ID,
  OpenClawProviderRegistry,
} from '../../platform/adapters/openclaw/index.ts';
import { LocalPluginGovernance } from '../../platform/plugin-governance/index.ts';

// P6 provider and plugin rollback matrix: registry fallback, plugin disablement, and public projection checks.
function assertNoRollbackLeak(value) {
  assert.doesNotMatch(JSON.stringify(value), /raw_credential|credential_material|native_(?:url|path|session|error)|provider_runtime|https?:\/\/|\/(?:opt|tmp|var|etc|home|usr)\//i);
}

function assertRollbackCycle(registry, baselineProviderId, canaryProviderId) {
  const canary = registry.selectDefault(canaryProviderId);
  assert.equal(canary.provider_id, canaryProviderId);
  assert.equal(canary.is_default, true);
  assert.equal(canary.rollback_provider_id, baselineProviderId);

  const disabled = registry.disable(canaryProviderId, 'P6-03 provider rollback drill');
  assert.equal(disabled.status, 'disabled');
  assert.throws(() => registry.defaultProvider(), /disabled/i);

  const rolledBack = registry.rollbackDefault();
  assert.equal(rolledBack.provider_id, baselineProviderId);
  assert.equal(rolledBack.status, 'enabled');
  assert.equal(registry.defaultProvider().provider_id, baselineProviderId);
  assertNoRollbackLeak({ canary, disabled, rolledBack, list: registry.list() });
}

test('P6 Hermes OpenClaw and DSH provider registries roll back from disabled canaries', () => {
  assertRollbackCycle(
    new HermesProviderRegistry([
      baselineHermesProviderMetadata(),
      baselineHermesProviderMetadata({ provider_id: 'hermes-0.20.5-p6canary', source: 'test-fixture' }),
    ]),
    HERMES_BASELINE_PROVIDER_ID,
    'hermes-0.20.5-p6canary',
  );

  assertRollbackCycle(
    new OpenClawProviderRegistry([
      baselineOpenClawProviderMetadata(),
      baselineOpenClawProviderMetadata({ provider_id: 'openclaw-2026.8.1-p6canary', source: 'test-fixture' }),
    ]),
    OPENCLAW_BASELINE_PROVIDER_ID,
    'openclaw-2026.8.1-p6canary',
  );

  assertRollbackCycle(
    new DshProviderRegistry([
      baselineDshProviderMetadata(),
      baselineDshProviderMetadata({ provider_id: 'dsh-0.1.1-rc.2-p6canary', source: 'test-fixture' }),
    ]),
    DSH_BASELINE_PROVIDER_ID,
    'dsh-0.1.1-rc.2-p6canary',
  );
});

test('P6 plugin disable approve and reject decisions control capability visibility without native leakage', () => {
  const governance = new LocalPluginGovernance({ tenant_id: 'tenant_alpha01', trace_id: 'trace_p6rollback01' });
  const channelPlugin = governance.listInventory().find((entry) => entry.capability_ids.includes('cap_channel_dingtalk'));
  assert.ok(channelPlugin, 'expected seeded channel plugin inventory');
  assert.equal(governance.listCapabilities({ tenant_id: 'tenant_alpha01' }).some((capability) => capability.capability_id === 'cap_channel_dingtalk'), true);

  const disabled = governance.decideAdmission(channelPlugin.plugin_id, {
    decision: 'disable',
    reason: 'P6-03 plugin host unavailable drill',
    trace_id: 'trace_p6rollback02',
  });
  assert.equal(disabled.allowlist_status, 'disabled');
  assert.equal(governance.listCapabilities({ tenant_id: 'tenant_alpha01' }).some((capability) => capability.capability_id === 'cap_channel_dingtalk'), false);

  const approved = governance.decideAdmission(channelPlugin.plugin_id, {
    decision: 'approve',
    reason: 'P6-03 plugin rollback restored approved inventory',
    trace_id: 'trace_p6rollback03',
  });
  assert.equal(approved.allowlist_status, 'approved');
  assert.equal(governance.listCapabilities({ tenant_id: 'tenant_alpha01' }).some((capability) => capability.capability_id === 'cap_channel_dingtalk'), true);

  const rejected = governance.decideAdmission(channelPlugin.plugin_id, {
    decision: 'reject',
    reason: 'P6-03 plugin destructive update rejected',
    trace_id: 'trace_p6rollback04',
  });
  assert.equal(rejected.allowlist_status, 'rejected');
  assert.equal(governance.listCapabilities({ tenant_id: 'tenant_alpha01' }).some((capability) => capability.capability_id === 'cap_channel_dingtalk'), false);
  assertNoRollbackLeak({ disabled, approved, rejected, inventory: governance.listInventory(), capabilities: governance.listCapabilities({ include_disabled: true, tenant_id: 'tenant_alpha01' }) });
});

test('P6 imported plugin metadata can be disabled or rejected without creating tenant-visible capabilities', () => {
  const governance = new LocalPluginGovernance({ tenant_id: 'tenant_alpha01', trace_id: 'trace_p6rollback05' });
  const imported = governance.importPlugin({
    source_kind: 'package_registry',
    source_ref: 'registry:p6.rollback.plugin',
    display_name: 'P6 Rollback Fixture Plugin',
    version: '1.0.0',
    expected_sha256: 'd'.repeat(64),
    license: 'MIT',
    notice_status: 'recorded',
    risk_level: 'medium',
    trace_id: 'trace_p6rollback05',
  });
  assert.deepEqual(imported.capability_ids, []);

  const approved = governance.decideAdmission(imported.plugin_id, {
    decision: 'approve',
    reason: 'P6 metadata admission approval without runtime load',
    trace_id: 'trace_p6rollback06',
  });
  const disabled = governance.decideAdmission(imported.plugin_id, {
    decision: 'disable',
    reason: 'P6 plugin host fault disables metadata entry',
    trace_id: 'trace_p6rollback07',
  });
  const rejected = governance.decideAdmission(imported.plugin_id, {
    decision: 'reject',
    reason: 'P6 destructive plugin update rejected',
    trace_id: 'trace_p6rollback08',
  });
  assert.equal(approved.allowlist_status, 'approved');
  assert.equal(disabled.allowlist_status, 'disabled');
  assert.equal(rejected.allowlist_status, 'rejected');
  assert.equal(governance.listCapabilities({ tenant_id: 'tenant_alpha01' }).some((capability) => capability.plugin_id === imported.plugin_id), false);
  assertNoRollbackLeak({ imported, approved, disabled, rejected });
});
