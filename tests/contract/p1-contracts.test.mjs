import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { PLATFORM_ID_KEYS, TASK_STATE_LAYERS, TASK_STATES } from '../../platform/task-state/index.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function readJson(relativePath) {
  const raw = await readFile(path.join(repoRoot, relativePath), 'utf8');
  return JSON.parse(raw);
}

const contractFiles = [
  'platform/contracts/common-identifiers.schema.json',
  'platform/contracts/task-request.schema.json',
  'platform/contracts/task-state.schema.json',
  'platform/contracts/event-envelope.schema.json',
  'platform/contracts/artifact-reference.schema.json',
  'platform/contracts/credential-reference.schema.json',
  'platform/contracts/platform-error.schema.json',
];

test('P1 contract schemas are valid JSON and draft 2020-12', async () => {
  for (const file of contractFiles) {
    const schema = await readJson(file);
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema', file);
    assert.match(schema.$id, /^https:\/\/nexusagent\.local\/contracts\//, file);
    assert.equal(schema.additionalProperties, false, file);
  }
});

test('common identifier schema covers all required platform identifiers', async () => {
  const schema = await readJson('platform/contracts/common-identifiers.schema.json');
  const expectedPrefixes = {
    tenant_id: 'tenant_',
    user_id: 'user_',
    agent_id: 'agent_',
    task_id: 'task_',
    attempt_id: 'attempt_',
    execution_id: 'exec_',
    conversation_id: 'conv_',
    artifact_id: 'artifact_',
    trace_id: 'trace_',
  };
  for (const idKey of PLATFORM_ID_KEYS) {
    assert.ok(schema.properties[idKey], `missing property ${idKey}`);
    assert.ok(schema.$defs[idKey], `missing definition ${idKey}`);
    assert.match(schema.$defs[idKey].pattern, new RegExp(`\\^${expectedPrefixes[idKey]}`));
  }
  assert.ok(schema.$defs.utc_timestamp.pattern.includes('Z$'));
  assert.equal(schema.$defs.monotonic_ms.minimum, 0);
});

test('task state schema matches runtime state machine values', async () => {
  const schema = await readJson('platform/contracts/task-state.schema.json');
  assert.deepEqual(schema.properties.state.enum, TASK_STATES);
  assert.deepEqual(schema.properties.state_layer.enum, TASK_STATE_LAYERS);
  assert.equal(schema.properties.schema_version.const, 'nexus.task_state.v1');
  for (const required of ['tenant_id', 'task_id', 'attempt_id', 'trace_id', 'state', 'state_layer', 'updated_at_utc', 'monotonic_ms']) {
    assert.ok(schema.required.includes(required), `task-state missing required field ${required}`);
  }
});

test('task request and event envelope require platform identity and time fields', async () => {
  const taskRequest = await readJson('platform/contracts/task-request.schema.json');
  for (const required of ['tenant_id', 'user_id', 'agent_id', 'task_id', 'attempt_id', 'conversation_id', 'trace_id', 'created_at_utc', 'monotonic_ms']) {
    assert.ok(taskRequest.required.includes(required), `task-request missing ${required}`);
  }
  assert.equal(taskRequest.properties.policy_context.properties.tenant_scope.enum.includes('cross_tenant_denied'), true);

  const eventEnvelope = await readJson('platform/contracts/event-envelope.schema.json');
  for (const required of ['event_id', 'event_type', 'tenant_id', 'trace_id', 'occurred_at_utc', 'monotonic_ms', 'producer', 'subject', 'payload']) {
    assert.ok(eventEnvelope.required.includes(required), `event-envelope missing ${required}`);
  }
  assert.ok(eventEnvelope.properties.event_type.enum.includes('task.state_transition_rejected'));
});

test('artifact and credential references do not expose raw secret or local path fields', async () => {
  const artifact = await readJson('platform/contracts/artifact-reference.schema.json');
  assert.ok(artifact.required.includes('artifact_id'));
  assert.ok(artifact.required.includes('storage_ref'));
  assert.equal(Object.hasOwn(artifact.properties, 'path'), false);
  assert.equal(Object.hasOwn(artifact.properties, 'native_path'), false);

  const credential = await readJson('platform/contracts/credential-reference.schema.json');
  assert.ok(credential.required.includes('credential_ref'));
  assert.equal(Object.hasOwn(credential.properties, 'secret_value'), false);
  assert.equal(Object.hasOwn(credential.properties, 'plaintext'), false);
  assert.equal(credential.properties.redaction.properties.logs.const, 'redacted');
});

test('platform error schema includes P1 state and tenancy errors', async () => {
  const schema = await readJson('platform/contracts/platform-error.schema.json');
  const codes = schema.properties.code.enum;
  assert.ok(codes.includes('PLATFORM_INVALID_STATE_TRANSITION'));
  assert.ok(codes.includes('PLATFORM_CROSS_TENANT_ID'));
  assert.ok(codes.includes('PLATFORM_SCHEMA_VALIDATION_FAILED'));
});
