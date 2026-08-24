import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildDshExecutionRequestFixture,
  buildDshProviderContractFixtures,
  DSH_EXECUTION_REQUEST_SCHEMA_VERSION,
  DSH_EXECUTION_RESULT_SCHEMA_VERSION,
  DshAdapterError,
  sanitizeDshExecutionResult,
  validateDshExecutionRequest,
} from '../../platform/adapters/dsh/index.ts';
import { runDsh011Rc2ProviderFixture } from '../../platform/adapters/dsh/providers/dsh-0.1.1-rc.2/index.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(repoRoot, relativePath), 'utf8'));
}

test('P2 execution request and result schemas are platform-owned contracts', async () => {
  const request = await readJson('platform/contracts/execution-request.schema.json');
  const result = await readJson('platform/contracts/execution-result.schema.json');

  assert.equal(request.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(result.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(request.properties.schema_version.const, DSH_EXECUTION_REQUEST_SCHEMA_VERSION);
  assert.equal(result.properties.schema_version.const, DSH_EXECUTION_RESULT_SCHEMA_VERSION);
  for (const field of ['tenant_id', 'task_id', 'attempt_id', 'execution_id', 'trace_id', 'monotonic_ms']) {
    assert.ok(request.required.includes(field), `ExecutionRequest missing ${field}`);
    assert.ok(result.required.includes(field), `ExecutionResult missing ${field}`);
  }
  assert.ok(request.required.includes('sandbox_policy'));
  assert.ok(request.required.includes('network_policy'));
  assert.ok(request.required.includes('resource_budget'));
  assert.ok(request.required.includes('artifact_policy'));
  assert.ok(request.required.includes('credential_refs'));
  assert.equal(JSON.stringify(request).includes('session_id'), false);
  assert.equal(JSON.stringify(result).includes('native_error'), false);
});

test('ExecutionRequest validator accepts platform schema and rejects native-only fields', () => {
  const request = buildDshExecutionRequestFixture();
  assert.equal(validateDshExecutionRequest(request).schema_version, DSH_EXECUTION_REQUEST_SCHEMA_VERSION);

  assert.throws(
    () => validateDshExecutionRequest({ ...request, native_session_id: 'session-123' }),
    (error) => error instanceof DshAdapterError && error.code === 'PLATFORM_INVALID_REQUEST',
  );
  assert.throws(
    () => validateDshExecutionRequest({ ...request, policy: { ...request.policy, allow_native_agent_loop: true } }),
    (error) => error instanceof DshAdapterError && error.code === 'PLATFORM_POLICY_DENIED',
  );
  assert.throws(
    () => validateDshExecutionRequest({ ...request, credential_refs: [{ credential_ref: 'cred_alpha01_001', purpose: 'planner_context' }] }),
    (error) => error instanceof DshAdapterError && error.code === 'PLATFORM_POLICY_DENIED',
  );
});

test('baseline and candidate providers reuse the same platform contract fixture', () => {
  for (const { provider, request } of buildDshProviderContractFixtures()) {
    const result = runDsh011Rc2ProviderFixture(request, provider);

    assert.equal(result.schema_version, DSH_EXECUTION_RESULT_SCHEMA_VERSION);
    assert.equal(result.provider_id, provider.provider_id);
    assert.equal(result.execution_outcome, 'completed');
    assert.deepEqual(result.artifacts, []);
    assert.equal(result.events.some((event) => event.event_type === 'tool.result'), true);
  }
});

test('ExecutionResult sanitizer maps unknown provider errors to platform errors', () => {
  const { provider, request } = buildDshProviderContractFixtures()[0];
  const result = runDsh011Rc2ProviderFixture(request, provider);
  const sanitized = sanitizeDshExecutionResult({
    ...result,
    error: {
      code: 'NATIVE_PROVIDER_ERROR',
      message: 'native_error at http://127.0.0.1/session/1',
      trace_id: request.trace_id,
      details: { native_url: 'http://127.0.0.1', safe: 'kept' },
    },
  }, request, provider);

  assert.equal(sanitized.error.code, 'PLATFORM_INTERNAL_ERROR');
  assert.equal(sanitized.error.message, 'Executor provider returned a platform error');
  assert.deepEqual(sanitized.error.details, { safe: 'kept' });
});
