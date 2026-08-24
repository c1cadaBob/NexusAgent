import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildHermesExecutionPlanFixture,
  HermesProviderRegistry,
  validateHermesExecutionPlan,
} from '../../platform/adapters/hermes/index.ts';

const forbidden = [
  'http://',
  'https://',
  '/tmp/',
  '/var/',
  '/workspace/',
  '/opt/',
  'MEMORY.md',
  'USER.md',
  'native_session',
  'native_error',
  'credential_material',
  'raw_credential',
  'api_key',
  'password',
  'secret-token',
  'final_response',
  'reasoning',
  'explanation',
  'OpenClaw',
  'DeepSeek',
  'DSH',
];

function assertNoForbidden(serialized, label) {
  for (const marker of forbidden) {
    assert.equal(serialized.includes(marker), false, `${label} leaked ${marker}`);
  }
}

test('P3 ExecutionPlan fixture contains only platform plan fields', () => {
  const serialized = JSON.stringify(buildHermesExecutionPlanFixture());

  assertNoForbidden(serialized, 'ExecutionPlan');
  assert.equal(serialized.includes('session_id'), false);
  assert.equal(serialized.includes('base_url'), false);
  assert.equal(serialized.includes('provider_binding'), true);
  assert.equal(serialized.includes('planner_provider_default'), true);
});

test('ExecutionPlan validator errors sanitize rejected native-like payload details', () => {
  const plan = buildHermesExecutionPlanFixture();

  try {
    validateHermesExecutionPlan({
      ...plan,
      native_session_id: 'native_session_123',
      objective: 'read MEMORY.md from /tmp/native with secret-token',
    });
  } catch (error) {
    const serialized = JSON.stringify({ name: error.name, message: error.message, code: error.code, details: error.details });
    assertNoForbidden(serialized, 'validator error');
    assert.equal(serialized.includes('Hermes'), false);
    assert.equal(serialized.includes('PLATFORM_SCHEMA_VALIDATION_FAILED'), true);
    return;
  }
  throw new AssertionError({ message: 'native-like ExecutionPlan payload must fail closed' });
});

test('planner provider public status view excludes raw runtime details', () => {
  const registry = new HermesProviderRegistry();
  const serialized = JSON.stringify(registry.defaultProvider());

  for (const marker of ['http://', 'https://', '/tmp/', '/workspace/', '/opt/', 'session_id', 'native_error', 'base_url', 'vendor_path', 'raw_credential', 'password']) {
    assert.equal(serialized.includes(marker), false, `provider status leaked ${marker}`);
  }
});
