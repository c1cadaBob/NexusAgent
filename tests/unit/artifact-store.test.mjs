import assert from 'node:assert/strict';
import test from 'node:test';

import { LocalArtifactStore, ArtifactStoreError } from '../../platform/artifact-store/index.ts';
import { ManualClock } from '../../platform/clock/index.ts';
import { InMemoryEventBus } from '../../platform/event-bus/index.ts';

function uploadInput(overrides = {}) {
  return {
    tenant_id: 'tenant_alpha01',
    task_id: 'task_alpha01',
    attempt_id: 'attempt_alpha01',
    execution_id: 'exec_alpha01',
    trace_id: 'trace_alpha01',
    kind: 'execution_output',
    content_type: 'text/plain',
    data: 'artifact body',
    classification: 'internal',
    ...overrides,
  };
}

test('LocalArtifactStore uploads, reads, and hashes artifact content', () => {
  const store = new LocalArtifactStore({ clock: new ManualClock({ utc_timestamp: '2026-08-23T00:00:00.000Z', monotonic_ms: 10 }) });
  const reference = store.upload(uploadInput());

  assert.match(reference.artifact_id, /^artifact_alpha01_/);
  assert.equal(reference.storage_ref.startsWith('artifact_store:'), true);
  assert.equal(reference.sha256.length, 64);
  assert.equal(reference.size_bytes, new TextEncoder().encode('artifact body').byteLength);

  const read = store.read({ tenant_id: 'tenant_alpha01', artifact_id: reference.artifact_id, trace_id: 'trace_alpha01' });
  assert.equal(new TextDecoder().decode(read.data), 'artifact body');
  assert.deepEqual(read.reference, reference);
});

test('LocalArtifactStore expires artifacts and rejects reads after expiry', () => {
  const store = new LocalArtifactStore();
  const reference = store.upload(uploadInput());

  store.expire({ tenant_id: 'tenant_alpha01', artifact_id: reference.artifact_id, trace_id: 'trace_alpha01' });
  assert.throws(
    () => store.read({ tenant_id: 'tenant_alpha01', artifact_id: reference.artifact_id, trace_id: 'trace_alpha01' }),
    (error) => error instanceof ArtifactStoreError && error.code === 'PLATFORM_CONFLICT',
  );
});

test('LocalArtifactStore enforces tenant isolation', () => {
  const store = new LocalArtifactStore();
  const reference = store.upload(uploadInput());
  assert.throws(
    () => store.read({ tenant_id: 'tenant_other01', artifact_id: reference.artifact_id, trace_id: 'trace_alpha01' }),
    (error) => error instanceof ArtifactStoreError && error.code === 'PLATFORM_FORBIDDEN',
  );
});

test('LocalArtifactStore publishes metadata-only artifact events', () => {
  const eventBus = new InMemoryEventBus();
  const subscription = eventBus.subscribe({ subscriber: 'audit' });
  const store = new LocalArtifactStore({
    clock: new ManualClock({ utc_timestamp: '2026-08-23T00:00:00.000Z', monotonic_ms: 10 }),
    eventBus,
  });
  store.upload(uploadInput({ data: 'sensitive artifact payload' }));

  const eventJson = JSON.stringify(eventBus.pull(subscription.subscription_id));
  assert.match(eventJson, /artifact\.created/);
  assert.equal(eventJson.includes('sensitive artifact payload'), false);
});
