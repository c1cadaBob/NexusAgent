import assert from 'node:assert/strict';
import test from 'node:test';

import { MockExecutorAdapter, MockPlannerAdapter } from '../../platform/adapters/index.ts';
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
    input: { kind: 'text', text: 'run mock lifecycle' },
    created_at_utc: '2026-08-23T00:00:00.000Z',
    monotonic_ms: 100,
  };
}

test('Coordinator, Policy-Gate, Clock, Event Bus, and mock adapters run task lifecycle', async () => {
  const clock = new ManualClock({ utc_timestamp: '2026-08-23T00:00:00.000Z', monotonic_ms: 100 });
  const eventBus = new InMemoryEventBus();
  const subscription = eventBus.subscribe({ subscriber: 'timeline', filter: { tenant_id: 'tenant_alpha01' } });
  const coordinator = new Coordinator({ policyGate: new PolicyGate(), clock, eventBus });

  const planner = new MockPlannerAdapter('planner-mock');
  const executor = new MockExecutorAdapter('executor-mock');
  planner.start();
  executor.start();
  coordinator.registerAdapter(planner);
  coordinator.registerAdapter(executor);

  const submitted = coordinator.submitTask(taskRequest(), { principal });
  assert.equal(submitted.accepted, true);

  clock.advance(100);
  const planned = await coordinator.dispatchToAdapter('task_alpha01', {
    adapter_name: 'planner-mock',
    principal,
    payload: { requested_at_utc: '2026-08-23T00:00:00.100Z', objective: 'plan' },
  });

  clock.advance(100);
  const executed = await coordinator.dispatchToAdapter('task_alpha01', {
    adapter_name: 'executor-mock',
    principal,
    payload: { requested_at_utc: '2026-08-23T00:00:00.200Z', command: 'execute' },
  });

  assert.equal(planned.adapter_result.payload.adapter_kind, 'planner');
  assert.equal(executed.adapter_result.payload.adapter_kind, 'executor');
  assert.equal(planned.adapter_result.execution_id, 'exec_alpha01');
  assert.equal(executed.adapter_result.trace_id, 'trace_alpha01');

  const eventTypes = eventBus.pull(subscription.subscription_id).map((delivery) => delivery.event.event_type);
  assert.deepEqual(eventTypes, [
    'task.state_changed',
    'planning.started',
    'planning.completed',
    'execution.started',
    'execution.completed',
  ]);

  const monotonicValues = eventBus.pull(subscription.subscription_id).map((delivery) => delivery.event.monotonic_ms);
  assert.deepEqual(monotonicValues, [...monotonicValues].sort((left, right) => left - right));
  assert.ok(eventBus.pull(subscription.subscription_id).every((delivery) => delivery.event.execution_id === 'exec_alpha01'));
  assert.ok(eventBus.pull(subscription.subscription_id).every((delivery) => delivery.event.trace_id === 'trace_alpha01'));
});
