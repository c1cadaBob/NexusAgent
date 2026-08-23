import assert from 'node:assert/strict';
import test from 'node:test';

import {
  baselineDshProviderMetadata,
  DSH_BASELINE_PROVIDER_ID,
  DSH_PROVIDER_CONTRACT_VERSION,
  DshProviderRegistry,
  DshProviderRegistryError,
} from '../../platform/adapters/dsh/index.ts';

test('DshProviderRegistry exposes the P2 baseline provider as default executor-only provider', () => {
  const registry = new DshProviderRegistry();

  assert.deepEqual(registry.defaultProvider(), {
    provider_id: DSH_BASELINE_PROVIDER_ID,
    role: 'executor-only',
    status: 'enabled',
    contract_version: DSH_PROVIDER_CONTRACT_VERSION,
    is_default: true,
    capabilities: ['cancellation', 'provider-disable', 'provider-rollback', 'tool-execution'],
  });
  assert.equal(registry.list().length, 1);
});

test('DshProviderRegistry disables and re-enables the current provider with platform error codes', () => {
  const registry = new DshProviderRegistry();

  const disabled = registry.disable(DSH_BASELINE_PROVIDER_ID, 'P2-01 rollback drill');
  assert.equal(disabled.status, 'disabled');
  assert.throws(
    () => registry.defaultProvider(),
    (error) => error instanceof DshProviderRegistryError && error.code === 'PLATFORM_SERVICE_UNHEALTHY',
  );

  const enabled = registry.enable(DSH_BASELINE_PROVIDER_ID);
  assert.equal(enabled.status, 'enabled');
  assert.equal(registry.defaultProvider().provider_id, DSH_BASELINE_PROVIDER_ID);
});

test('DshProviderRegistry rolls back from a candidate provider to the previous default', () => {
  const candidate = baselineDshProviderMetadata({
    provider_id: 'dsh-0.1.1-rc.2-canary',
    source: 'test-fixture',
  });
  const registry = new DshProviderRegistry([baselineDshProviderMetadata(), candidate]);

  const selected = registry.selectDefault('dsh-0.1.1-rc.2-canary');
  assert.equal(selected.provider_id, 'dsh-0.1.1-rc.2-canary');
  assert.equal(selected.rollback_provider_id, DSH_BASELINE_PROVIDER_ID);

  const rolledBack = registry.rollbackDefault();
  assert.equal(rolledBack.provider_id, DSH_BASELINE_PROVIDER_ID);
  assert.equal(rolledBack.rollback_provider_id, 'dsh-0.1.1-rc.2-canary');
});

test('DshProviderRegistry rejects unknown, duplicate, and non executor-only providers', () => {
  const registry = new DshProviderRegistry();

  assert.throws(
    () => registry.selectDefault('missing-provider'),
    (error) => error instanceof DshProviderRegistryError && error.code === 'PLATFORM_NOT_FOUND',
  );
  assert.throws(
    () => registry.register(baselineDshProviderMetadata()),
    (error) => error instanceof DshProviderRegistryError && error.code === 'PLATFORM_CONFLICT',
  );
  assert.throws(
    () => new DshProviderRegistry([baselineDshProviderMetadata({ role: 'planner-only' })]),
    (error) => error instanceof DshProviderRegistryError && error.code === 'PLATFORM_INVALID_REQUEST',
  );
});

test('DshProviderRegistry public status view excludes native URLs, session ids, file paths, and raw errors', () => {
  const registry = new DshProviderRegistry();
  const statusJson = JSON.stringify(registry.defaultProvider());

  for (const forbidden of ['http://', 'https://', 'session_id', 'native_error', '/tmp/', '/workspace/', 'vendor_path']) {
    assert.equal(statusJson.includes(forbidden), false, `status view leaked ${forbidden}`);
  }
});
