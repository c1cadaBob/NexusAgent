import assert from 'node:assert/strict';
import test from 'node:test';

import { LocalArtifactStore } from '../../platform/artifact-store/index.ts';
import { ManualClock } from '../../platform/clock/index.ts';
import { LocalCredentialCenter } from '../../platform/credentials/index.ts';
import { InMemoryEventBus } from '../../platform/event-bus/index.ts';
import { LocalMemoryGateway } from '../../platform/memory-gateway/index.ts';

test('Artifact, Memory, and Credential local services publish platform events without raw payload leaks', () => {
  const clock = new ManualClock({ utc_timestamp: '2026-08-23T00:00:00.000Z', monotonic_ms: 100 });
  const eventBus = new InMemoryEventBus();
  const subscription = eventBus.subscribe({ subscriber: 'data-spine', filter: { tenant_id: 'tenant_alpha01' } });
  const artifactStore = new LocalArtifactStore({ clock, eventBus });
  const memoryGateway = new LocalMemoryGateway({ clock, eventBus });
  const credentialCenter = new LocalCredentialCenter({ clock, eventBus });

  const artifact = artifactStore.upload({
    tenant_id: 'tenant_alpha01',
    task_id: 'task_alpha01',
    attempt_id: 'attempt_alpha01',
    execution_id: 'exec_alpha01',
    trace_id: 'trace_alpha01',
    kind: 'execution_output',
    content_type: 'text/plain',
    data: 'raw artifact content',
  });
  clock.advance(10);
  const memory = memoryGateway.write({
    scope: { tenant_id: 'tenant_alpha01', user_id: 'user_alpha01', agent_id: 'agent_alpha01' },
    layer: 'session',
    text: 'memory content should stay in Memory Gateway response only',
    source: 'integration-test',
    trace_id: 'trace_alpha01',
  });
  clock.advance(10);
  const credential = credentialCenter.register({
    tenant_id: 'tenant_alpha01',
    user_id: 'user_alpha01',
    agent_id: 'agent_alpha01',
    trace_id: 'trace_alpha01',
    purpose: 'executor_tool',
    material: 'integration-secret-token',
    expires_at_utc: '2026-08-23T01:00:00.000Z',
  });

  const deliveries = eventBus.pull(subscription.subscription_id);
  assert.deepEqual(deliveries.map((delivery) => delivery.event.event_type), [
    'artifact.created',
    'audit.recorded',
    'credential.lease_issued',
  ]);
  assert.equal(artifact.tenant_id, 'tenant_alpha01');
  assert.equal(memory.tenant_id, 'tenant_alpha01');
  assert.equal(credential.tenant_id, 'tenant_alpha01');

  const eventJson = JSON.stringify(deliveries);
  assert.equal(eventJson.includes('raw artifact content'), false);
  assert.equal(eventJson.includes('memory content should stay'), false);
  assert.equal(eventJson.includes('integration-secret-token'), false);
  assert.ok(deliveries.every((delivery) => delivery.event.trace_id === 'trace_alpha01'));
});
