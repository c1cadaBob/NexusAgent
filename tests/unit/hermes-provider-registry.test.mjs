import assert from 'node:assert/strict';
import test from 'node:test';

import {
  baselineHermesProviderMetadata,
  HERMES_BASELINE_PROVIDER_ID,
  HERMES_EXECUTION_PLAN_SCHEMA_VERSION,
  HERMES_PROVIDER_CONTRACT_VERSION,
  HermesProviderRegistry,
  HermesProviderRegistryError,
} from '../../platform/adapters/hermes/index.ts';

test('HermesProviderRegistry exposes the P3 baseline provider as planner-only default', () => {
  const registry = new HermesProviderRegistry();

  assert.deepEqual(registry.defaultProvider(), {
    provider_id: HERMES_BASELINE_PROVIDER_ID,
    role: 'planner-only',
    status: 'enabled',
    contract_version: HERMES_PROVIDER_CONTRACT_VERSION,
    is_default: true,
    capabilities: [
      'execution-plan',
      'memory-gateway-required',
      'native-gateway-block',
      'native-loop-block',
      'native-tool-block',
      'provider-disable',
      'provider-rollback',
    ],
    schema_versions: [HERMES_EXECUTION_PLAN_SCHEMA_VERSION],
  });
  assert.equal(registry.list().length, 1);
});

test('HermesProviderRegistry disables and re-enables the current provider with platform error codes', () => {
  const registry = new HermesProviderRegistry();

  const disabled = registry.disable(HERMES_BASELINE_PROVIDER_ID, 'P3-01 rollback drill');
  assert.equal(disabled.status, 'disabled');
  assert.throws(
    () => registry.defaultProvider(),
    (error) => error instanceof HermesProviderRegistryError && error.code === 'PLATFORM_SERVICE_UNHEALTHY',
  );

  const enabled = registry.enable(HERMES_BASELINE_PROVIDER_ID);
  assert.equal(enabled.status, 'enabled');
  assert.equal(registry.defaultProvider().provider_id, HERMES_BASELINE_PROVIDER_ID);
});

test('HermesProviderRegistry rolls back from a candidate provider to the previous default', () => {
  const candidate = baselineHermesProviderMetadata({
    provider_id: 'hermes-0.20.5-canary',
    source: 'test-fixture',
  });
  const registry = new HermesProviderRegistry([baselineHermesProviderMetadata(), candidate]);

  const selected = registry.selectDefault('hermes-0.20.5-canary');
  assert.equal(selected.provider_id, 'hermes-0.20.5-canary');
  assert.equal(selected.rollback_provider_id, HERMES_BASELINE_PROVIDER_ID);

  const rolledBack = registry.rollbackDefault();
  assert.equal(rolledBack.provider_id, HERMES_BASELINE_PROVIDER_ID);
  assert.equal(rolledBack.rollback_provider_id, 'hermes-0.20.5-canary');
});

test('HermesProviderRegistry rejects unknown duplicate and non planner-only providers', () => {
  const registry = new HermesProviderRegistry();

  assert.throws(
    () => registry.selectDefault('missing-provider'),
    (error) => error instanceof HermesProviderRegistryError && error.code === 'PLATFORM_NOT_FOUND',
  );
  assert.throws(
    () => registry.register(baselineHermesProviderMetadata()),
    (error) => error instanceof HermesProviderRegistryError && error.code === 'PLATFORM_CONFLICT',
  );
  assert.throws(
    () => new HermesProviderRegistry([baselineHermesProviderMetadata({ role: 'executor-only' })]),
    (error) => error instanceof HermesProviderRegistryError && error.code === 'PLATFORM_INVALID_REQUEST',
  );
});

test('HermesProviderRegistry public status view excludes native URLs session ids paths and raw errors', () => {
  const registry = new HermesProviderRegistry();
  const statusJson = JSON.stringify(registry.defaultProvider());

  for (const forbidden of ['http://', 'https://', 'session_id', 'native_error', '/tmp/', '/workspace/', 'vendor_path']) {
    assert.equal(statusJson.includes(forbidden), false, `status view leaked ${forbidden}`);
  }
});
