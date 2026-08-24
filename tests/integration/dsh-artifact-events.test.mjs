import assert from 'node:assert/strict';
import test from 'node:test';

import { DshExecutorAdapter, buildDshExecutionRequestFixture } from '../../platform/adapters/dsh/index.ts';
import { LocalArtifactStore } from '../../platform/artifact-store/index.ts';
import { ManualClock } from '../../platform/clock/index.ts';
import { Coordinator } from '../../platform/coordinator/index.ts';
import { InMemoryEventBus } from '../../platform/event-bus/index.ts';
import { PolicyGate } from '../../platform/policy-gate/index.ts';

const principal = Object.freeze({
  tenant_id: 'tenant_alpha01',
  user_id: 'user_alpha01',
  roles: ['operator'],
  permissions: ['task:submit', 'adapter:invoke'],
});

function taskRequest() {
  return {
    schema_version: 'nexus.task_request.v1',
    tenant_id: 'tenant_alpha01',
    user_id: 'user_alpha01',
    agent_id: 'agent_alpha01',
    task_id: 'task_alpha01',
    attempt_id: 'attempt_alpha01',
    execution_id: 'exec_alpha01',
    conversation_id: 'conv_alpha01',
    trace_id: 'trace_alpha01',
    input: { kind: 'command', text: 'run executor artifact fixture' },
    created_at_utc: '2026-08-24T00:00:00Z',
    monotonic_ms: 100,
  };
}

test('DshExecutorAdapter uploads provider outputs as ArtifactReference and publishes platform events', async () => {
  const clock = new ManualClock({ utc_timestamp: '2026-08-24T00:00:00.000Z', monotonic_ms: 200 });
  const eventBus = new InMemoryEventBus();
  const subscription = eventBus.subscribe({ subscriber: 'dsh-artifact-events', filter: { tenant_id: 'tenant_alpha01' } });
  const artifactStore = new LocalArtifactStore({ clock, eventBus });
  const adapter = new DshExecutorAdapter({ artifactStore, eventBus });
  adapter.start();
  const coordinator = new Coordinator({ policyGate: new PolicyGate(), eventBus, clock });
  coordinator.registerAdapter(adapter);
  coordinator.submitTask(taskRequest(), { principal });

  const dispatch = await coordinator.dispatchToAdapter('task_alpha01', {
    adapter_name: 'dsh-executor',
    principal,
    payload: buildDshExecutionRequestFixture({
      requested_at_utc: '2026-08-24T00:00:01Z',
      tool: {
        name: 'bash',
        input: {
          emit_artifacts: true,
          stdout: 'stdout artifact body',
          stderr: 'stderr artifact body',
          artifact_body: 'execution artifact body',
        },
      },
    }),
  });

  const executionResult = dispatch.adapter_result.payload.execution_result;
  assert.equal(dispatch.adapter_result.status, 'completed');
  assert.equal(executionResult.artifacts.length, 3);
  assert.deepEqual(executionResult.artifacts.map((artifact) => artifact.kind).sort(), [
    'execution_output',
    'log_excerpt',
    'log_excerpt',
  ]);
  assert.ok(executionResult.artifacts.every((artifact) => artifact.execution_id === 'exec_alpha01'));
  assert.ok(executionResult.artifacts.every((artifact) => artifact.storage_ref.startsWith('artifact_store:')));

  const readBack = artifactStore.read({
    tenant_id: 'tenant_alpha01',
    artifact_id: executionResult.artifacts[0].artifact_id,
    trace_id: 'trace_alpha01',
  });
  assert.equal(readBack.reference.trace_id, 'trace_alpha01');
  assert.ok(new TextDecoder().decode(readBack.data).includes('artifact body'));

  const deliveries = eventBus.pull(subscription.subscription_id);
  const eventTypes = deliveries.map((delivery) => delivery.event.event_type);
  assert.ok(eventTypes.includes('artifact.created'));
  assert.ok(eventTypes.includes('execution.completed'));
  assert.equal(deliveries.some((delivery) => delivery.event.event_type === 'artifact.created' && delivery.event.artifact_id), true);

  const eventJson = JSON.stringify(deliveries);
  assert.equal(eventJson.includes('stdout artifact body'), false);
  assert.equal(eventJson.includes('stderr artifact body'), false);
  assert.equal(eventJson.includes('execution artifact body'), false);
});
