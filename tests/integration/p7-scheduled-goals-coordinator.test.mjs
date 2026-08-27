import assert from 'node:assert/strict';
import test from 'node:test';

import { ManualClock } from '../../platform/clock/index.ts';
import { Coordinator, LocalScheduledGoals, LocalTokenBudget } from '../../platform/coordinator/index.ts';
import { InMemoryEventBus } from '../../platform/event-bus/index.ts';
import { LocalObservability } from '../../platform/observability/index.ts';
import { PolicyGate } from '../../platform/policy-gate/index.ts';

const principal = Object.freeze({
  tenant_id: 'tenant_alpha01',
  user_id: 'user_alpha01',
  roles: ['operator'],
  permissions: ['task:submit', 'task:cancel', 'adapter:invoke'],
});

function harness() {
  const clock = new ManualClock({ utc_timestamp: '2026-08-27T03:00:00.000Z', monotonic_ms: 300 });
  const eventBus = new InMemoryEventBus();
  const observability = new LocalObservability({ clock, service: 'scheduled-goals-coordinator', version: 'p7-test' });
  const tokenBudget = new LocalTokenBudget({ clock, eventBus, observability });
  const coordinator = new Coordinator({ policyGate: new PolicyGate(), clock, eventBus, tokenBudget: { enabled: true, service: tokenBudget } });
  const scheduledGoals = new LocalScheduledGoals({ clock, coordinator, eventBus, observability });
  scheduledGoals.updateConfig({ tenant_id: 'tenant_alpha01', trace_id: 'trace_scheduled_coord01', enabled: true });
  return { clock, eventBus, observability, tokenBudget, coordinator, scheduledGoals };
}

function createGoal(scheduledGoals, overrides = {}) {
  return scheduledGoals.create({
    tenant_id: 'tenant_alpha01',
    user_id: 'user_alpha01',
    agent_id: 'agent_alpha01',
    conversation_id: 'conv_scheduled_coord01',
    cron: '*/5 * * * *',
    input: 'coordinator scheduled goal task',
    trace_id: 'trace_scheduled_coord02',
    budget_units: 5,
    ...overrides,
  });
}

function assertClean(value) {
  assert.doesNotMatch(JSON.stringify(value), /Hermes|OpenClaw|DeepSeek|\bDSH\b|native_|raw_credential|credential_material|provider_(?:binding|runtime)|https?:\/\/|\/(?:opt|tmp|var|etc|home|usr)\//i);
}

test('P7 scheduled due scan submits ordinary scheduler source task through Coordinator and Event Bus', () => {
  const { clock, eventBus, observability, coordinator, scheduledGoals } = harness();
  const subscription = eventBus.subscribe({ subscriber: 'scheduled-goals-coordinator' });
  const goal = createGoal(scheduledGoals);
  clock.set({ utc_timestamp: goal.next_run_at_utc, monotonic_ms: 1000 });

  const result = scheduledGoals.runDue({ tenant_id: 'tenant_alpha01', trace_id: 'trace_scheduled_coord03', principal });
  assert.equal(result.submitted_count, 1);
  const item = result.items[0];
  const snapshot = coordinator.snapshot(item.task_id);
  assert.equal(snapshot.state, 'admitted');
  assert.equal(snapshot.tenant_id, 'tenant_alpha01');
  assert.equal(snapshot.conversation_id, 'conv_scheduled_coord01');
  assert.equal(coordinator.events().some((event) => event.event_type === 'task.state_changed' && event.task_id === item.task_id), true);
  assert.equal(eventBus.pull(subscription.subscription_id).some((delivery) => delivery.event.event_type === 'scheduled_goal.completed'), true);
  assert.equal(observability.metrics({ tenant_id: 'tenant_alpha01' }).some((metric) => metric.name === 'scheduled_goals.submitted'), true);
  assertClean({ result, events: coordinator.events(), logs: observability.logs({ tenant_id: 'tenant_alpha01' }) });
});

test('P7 scheduled due scan respects token budget and does not call downstream adapters on degradation', () => {
  const { clock, eventBus, observability, tokenBudget, coordinator, scheduledGoals } = harness();
  tokenBudget.updatePolicy({
    tenant_id: 'tenant_alpha01',
    trace_id: 'trace_scheduled_coord04',
    limits: { tenant_units: 10, user_units: 10, agent_units: 10, task_units: 10, max_units_per_attempt: 1 },
  });
  const goal = createGoal(scheduledGoals, { trace_id: 'trace_scheduled_coord05', budget_units: 5 });
  clock.set({ utc_timestamp: goal.next_run_at_utc, monotonic_ms: 2000 });

  const result = scheduledGoals.runDue({ tenant_id: 'tenant_alpha01', trace_id: 'trace_scheduled_coord06', principal });
  assert.equal(result.submitted_count, 0);
  assert.equal(result.blocked_count, 1);
  const stored = scheduledGoals.get(goal.scheduled_goal_id);
  assert.equal(stored.status, 'blocked');
  assert.equal(stored.failure_count, 1);
  assert.equal(coordinator.snapshot(result.items[0].task_id).state, 'blocked');
  assert.equal(coordinator.events().some((event) => event.event_type === 'policy.denied'), true);
  assert.equal(eventBus.history().some((entry) => entry.event.event_type === 'budget.degraded'), true);
  assert.equal(observability.metrics({ tenant_id: 'tenant_alpha01' }).some((metric) => metric.name === 'scheduled_goals.blocked'), true);
  assertClean({ result, stored, events: coordinator.events(), ledger: tokenBudget.listLedger('tenant_alpha01') });
});
