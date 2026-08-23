import assert from 'node:assert/strict';
import test from 'node:test';

import { LocalArtifactStore } from '../../platform/artifact-store/index.ts';
import { LocalCredentialCenter } from '../../platform/credentials/index.ts';
import { LocalMemoryGateway } from '../../platform/memory-gateway/index.ts';

test('data services reject cross-tenant artifact, memory, and credential access', () => {
  const artifactStore = new LocalArtifactStore();
  const memoryGateway = new LocalMemoryGateway();
  const credentialCenter = new LocalCredentialCenter();

  const artifact = artifactStore.upload({
    tenant_id: 'tenant_alpha01',
    task_id: 'task_alpha01',
    trace_id: 'trace_alpha01',
    kind: 'execution_output',
    content_type: 'text/plain',
    data: 'tenant alpha artifact',
  });
  const memory = memoryGateway.write({
    scope: { tenant_id: 'tenant_alpha01', user_id: 'user_alpha01' },
    layer: 'user',
    text: 'tenant alpha memory',
    source: 'security-test',
    trace_id: 'trace_alpha01',
  });
  const credential = credentialCenter.register({
    tenant_id: 'tenant_alpha01',
    trace_id: 'trace_alpha01',
    purpose: 'artifact_access',
    material: 'tenant-alpha-secret',
    expires_at_utc: '2026-08-23T01:00:00.000Z',
  });

  assert.throws(
    () => artifactStore.read({ tenant_id: 'tenant_other01', artifact_id: artifact.artifact_id, trace_id: 'trace_alpha01' }),
    /tenant mismatch/i,
  );
  assert.throws(
    () => memoryGateway.get('tenant_other01', memory.memory_id),
    /tenant mismatch/i,
  );
  assert.throws(
    () => credentialCenter.resolveReference('tenant_other01', credential.credential_ref, 'trace_alpha01'),
    /tenant mismatch/i,
  );
});

test('credential material never appears in references, audit records, or errors', () => {
  const credentialCenter = new LocalCredentialCenter();
  const credential = credentialCenter.register({
    tenant_id: 'tenant_alpha01',
    trace_id: 'trace_alpha01',
    purpose: 'executor_tool',
    material: 'do-not-leak-this-token',
    expires_at_utc: '2026-08-23T01:00:00.000Z',
  });

  const combined = JSON.stringify({ credential, audit: credentialCenter.auditLog() });
  assert.equal(combined.includes('do-not-leak-this-token'), false);
  assert.match(combined, /material_sha256/);
});
