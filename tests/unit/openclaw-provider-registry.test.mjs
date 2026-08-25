import assert from 'node:assert/strict';
import test from 'node:test';

import {
  baselineOpenClawProviderMetadata,
  OPENCLAW_BASELINE_PROVIDER_ID,
  OPENCLAW_PROVIDER_CONTRACT_VERSION,
  OpenClawProviderRegistry,
  OpenClawProviderRegistryError,
} from '../../platform/adapters/openclaw/index.ts';

test('OpenClawProviderRegistry exposes the P4 baseline provider as gateway-only default', () => {
  const registry = new OpenClawProviderRegistry();
  const providers = registry.list();

  assert.equal(providers.length, 1);
  assert.equal(providers[0].provider_id, OPENCLAW_BASELINE_PROVIDER_ID);
  assert.equal(providers[0].role, 'gateway-only');
  assert.equal(providers[0].status, 'enabled');
  assert.equal(providers[0].contract_version, OPENCLAW_PROVIDER_CONTRACT_VERSION);
  assert.equal(providers[0].is_default, true);
  assert.ok(providers[0].capabilities.includes('channel-ingress'));
  assert.ok(providers[0].capabilities.includes('provider-rollback'));
});

test('OpenClawProviderRegistry disables re-enables and rolls back providers with platform errors', () => {
  const registry = new OpenClawProviderRegistry();
  const disabled = registry.disable(OPENCLAW_BASELINE_PROVIDER_ID, 'P4-01 disable drill');
  assert.equal(disabled.status, 'disabled');
  assert.throws(
    () => registry.defaultProvider(),
    (error) => error instanceof OpenClawProviderRegistryError && error.code === 'PLATFORM_SERVICE_UNHEALTHY',
  );
  assert.equal(registry.enable(OPENCLAW_BASELINE_PROVIDER_ID).status, 'enabled');

  registry.register(baselineOpenClawProviderMetadata({
    provider_id: 'openclaw-2026.8.1-canary',
    source: 'test-fixture',
  }));
  assert.equal(registry.selectDefault('openclaw-2026.8.1-canary').provider_id, 'openclaw-2026.8.1-canary');
  assert.equal(registry.rollbackDefault().provider_id, OPENCLAW_BASELINE_PROVIDER_ID);
});

test('OpenClawProviderRegistry rejects unknown duplicate and non gateway-only providers', () => {
  const registry = new OpenClawProviderRegistry();
  assert.throws(
    () => registry.get('openclaw-missing-provider'),
    (error) => error instanceof OpenClawProviderRegistryError && error.code === 'PLATFORM_NOT_FOUND',
  );
  assert.throws(
    () => registry.register(baselineOpenClawProviderMetadata()),
    (error) => error instanceof OpenClawProviderRegistryError && error.code === 'PLATFORM_CONFLICT',
  );
  assert.throws(
    () => registry.register(baselineOpenClawProviderMetadata({ provider_id: 'openclaw-bad-role', role: 'agent-loop' })),
    (error) => error instanceof OpenClawProviderRegistryError && error.code === 'PLATFORM_INVALID_REQUEST',
  );
});

test('OpenClawProviderRegistry public status view excludes native URLs sessions paths and raw errors', () => {
  const registry = new OpenClawProviderRegistry();
  const text = JSON.stringify(registry.list());

  for (const forbidden of ['http://', '/opt/', 'vendor/openclaw-main', 'session_id', 'native_error', 'agentCommandFromGatewayIngress']) {
    assert.equal(text.includes(forbidden), false, `provider status leaked ${forbidden}`);
  }
});
