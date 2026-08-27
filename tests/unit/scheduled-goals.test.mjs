import assert from 'node:assert/strict';
import test from 'node:test';

import { ManualClock } from '../../platform/clock/index.ts';
import { Coordinator, LocalScheduledGoals, LocalTokenBudget, SCHEDULED_GOALS_DEFAULT_ENABLED, SCHEDULED_GOALS_EXECUTION_MODE, SCHEDULED_GOALS_RESOURCE_BUDGET_MODE, SCHEDULED_GOALS_SCHEMA_VERSION, SCHEDULED_GOALS_SCHEDULE_MODE, ScheduledGoalsError } from '../../platform/coordinator/index.ts';
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
  const clock = new ManualClock({ utc_timestamp: '2026-08-27T00:00:00.000Z', monotonic_ms: 100 });
  const eventBus = new InMemoryEventBus();
  const observability = new LocalObservability({ clock, service: 'scheduled-goals', version: 'p7-test' });
  const tokenBudget = new LocalTokenBudget({ clock, eventBus, observability });
  const coordinator = new Coordinator({ policyGate: new PolicyGate(), clock, eventBus, tokenBudget: { enabled: true, service: tokenBudget } });
  const scheduledGoals = new LocalScheduledGoals({ clock, coordinator, eventBus, observability });
  return { clock, eventBus, observability, tokenBudget, coordinator, scheduledGoals };
}

function createGoal(scheduledGoals, overrides = {}) {
  return scheduledGoals.create({
    tenant_id: 'tenant_alpha01',
    user_id: 'user_alpha01',
    agent_id: 'agent_alpha01',
    conversation_id: 'conv_scheduled01',
    cron: '*/5 * * * *',
    input: 'scheduled platform task',
    trace_id: 'trace_scheduled_unit01',
    ...overrides,
  });
}

function assertClean(value) {
  assert.doesNotMatch(JSON.stringify(value), /Hermes|OpenClaw|DeepSeek|\bDSH\b|native_|raw_credential|credential_material|provider_(?:binding|runtime)|https?:\/\/|\/(?:opt|tmp|var|etc|home|usr)\//i);
}

test('P7 scheduled goals default off with UTC cron-like manual tick config', () => {
  const { scheduledGoals } = harness();
  const config = scheduledGoals.getConfig('tenant_alpha01', 'trace_scheduled_unit02');

  assert.equal(SCHEDULED_GOALS_SCHEMA_VERSION, 'nexus.scheduled_goal.p7.v1');
  assert.equal(SCHEDULED_GOALS_DEFAULT_ENABLED, false);
  assert.equal(SCHEDULED_GOALS_SCHEDULE_MODE, 'cron_like_utc');
  assert.equal(SCHEDULED_GOALS_EXECUTION_MODE, 'manual_tick');
  assert.equal(SCHEDULED_GOALS_RESOURCE_BUDGET_MODE, 'alpha_in_memory_limits');
  assert.equal(config.enabled, false);
  assert.equal(config.resource_budget.max_active_goals, 100);
  assert.equal(config.resource_budget.max_due_per_tick, 25);
  assert.equal(config.resource_budget.min_interval_minutes, 5);
  assertClean(config);
});

test('P7 scheduled goals parse cron alpha subset and run due only when enabled', () => {
  const { clock, eventBus, coordinator, scheduledGoals } = harness();
  const subscription = eventBus.subscribe({ subscriber: 'scheduled-goals-unit' });
  const goal = createGoal(scheduledGoals, { cron: '*/5 0-23/1 * * 1-5', trace_id: 'trace_scheduled_unit03' });

  assert.match(goal.scheduled_goal_id, /^scheduled_goal_alpha01_/);
  assert.equal(goal.next_run_at_utc, '2026-08-27T00:05:00.000Z');

  clock.set({ utc_timestamp: goal.next_run_at_utc, monotonic_ms: 500 });
  const skipped = scheduledGoals.runDue({ tenant_id: 'tenant_alpha01', trace_id: 'trace_scheduled_unit04', principal });
  assert.equal(skipped.status, 'skipped');
  assert.equal(skipped.due_count, 1);
  assert.equal(skipped.submitted_count, 0);

  scheduledGoals.updateConfig({ tenant_id: 'tenant_alpha01', trace_id: 'trace_scheduled_unit05', enabled: true });
  const submitted = scheduledGoals.runDue({ tenant_id: 'tenant_alpha01', trace_id: 'trace_scheduled_unit06', principal });
  assert.equal(submitted.status, 'completed');
  assert.equal(submitted.submitted_count, 1);
  assert.match(submitted.items[0].task_id, /^task_scheduled_/);
  assert.equal(coordinator.snapshot(submitted.items[0].task_id).state, 'admitted');
  assert.equal(eventBus.pull(subscription.subscription_id).some((delivery) => delivery.event.event_type === 'scheduled_goal.completed'), true);
  assertClean({ goal, skipped, submitted, events: coordinator.events() });
});

test('P7 scheduled goals support pause cancel retry and reject unsupported cron or native markers', () => {
  const { scheduledGoals } = harness();
  const goal = createGoal(scheduledGoals, { trace_id: 'trace_scheduled_unit07' });
  const paused = scheduledGoals.update(goal.scheduled_goal_id, { status: 'paused', trace_id: 'trace_scheduled_unit08' });
  assert.equal(paused.status, 'paused');
  assert.throws(() => scheduledGoals.retry(goal.scheduled_goal_id, { reason: 'retry paused goal', trace_id: 'trace_scheduled_unit09' }), /Only cancelled/);
  const resumed = scheduledGoals.update(goal.scheduled_goal_id, { status: 'scheduled', trace_id: 'trace_scheduled_unit10' });
  assert.equal(resumed.status, 'scheduled');
  const cancelled = scheduledGoals.cancel(goal.scheduled_goal_id, { reason: 'cancel scheduled goal', trace_id: 'trace_scheduled_unit11' }, principal);
  assert.equal(cancelled.status, 'cancelled');
  const retried = scheduledGoals.retry(goal.scheduled_goal_id, { reason: 'retry cancelled goal', trace_id: 'trace_scheduled_unit12' });
  assert.equal(retried.status, 'scheduled');

  for (const input of [
    { cron: '* * * * *', trace_id: 'trace_scheduled_unit13' },
    { cron: '*/5 * * * * *', trace_id: 'trace_scheduled_unit14' },
    { input: 'native_url blocked', trace_id: 'trace_scheduled_unit15' },
    { raw_credential: 'secret-token-value', trace_id: 'trace_scheduled_unit16' },
  ]) {
    assert.throws(() => createGoal(scheduledGoals, input), (error) => ['PLATFORM_INVALID_REQUEST', 'PLATFORM_RATE_LIMITED'].includes(error.code));
  }
});
