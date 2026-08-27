import assert from 'node:assert/strict';
import test from 'node:test';

import { ManualClock } from '../../platform/clock/index.ts';
import { Coordinator, CoordinatorError, LocalTokenBudget } from '../../platform/coordinator/index.ts';
import { InMemoryEventBus } from '../../platform/event-bus/index.ts';
import { LocalObservability } from '../../platform/observability/index.ts';
import { PolicyGate } from '../../platform/policy-gate/index.ts';

const identity = Object.freeze({
  tenant_id: 'tenant_alpha01',
  user_id: 'user_alpha01',
  agent_id: 'agent_alpha01',
  task_id: 'task_budget_enforce01',
  attempt_id: 'attempt_budget_enforce01',
  execution_id: 'exec_budget_enforce01',
  conversation_id: 'conv_budget_enforce01',
  trace_id: 'trace_budget_enforce01',
});

const principal = Object.freeze({
  tenant_id: identity.tenant_id,
  user_id: identity.user_id,
  roles: ['operator'],
  permissions: ['task:submit', 'adapter:invoke'],
});

function taskRequest(overrides = {}) {
  return {
    schema_version: 'nexus.task_request.v1',
    ...identity,
    input: { kind: 'text', text: 'budget enforcement platform task' },
    source: { kind: 'api' },
    created_at_utc: '2026-08-27T02:00:00.000Z',
    monotonic_ms: 200,
    ...overrides,
  };
}

function harness() {
  const clock = new ManualClock({ utc_timestamp: '2026-08-27T02:00:00.000Z', monotonic_ms: 200 });
  const eventBus = new InMemoryEventBus();
  const observability = new LocalObservability({ clock, service: 'coordinator', version: 'p7-budget' });
  const tokenBudget = new LocalTokenBudget({ clock, eventBus, observability });
  const coordinator = new Coordinator({ policyGate: new PolicyGate(), clock, eventBus, tokenBudget: { enabled: true, service: tokenBudget } });
  const calls = [];
  coordinator.registerAdapter({
    name: 'planner-budget-test',
    kind: 'planner',
    invoke(invocation) {
      calls.push(invocation);
      return { ...identity, status: 'completed', payload: { plan_status: 'validated' } };
    },
  });
  return { coordinator, tokenBudget, eventBus, observability, calls };
}

function assertClean(value) {
  assert.doesNotMatch(JSON.stringify(value), /Hermes|OpenClaw|DeepSeek|\bDSH\b|native_|raw_credential|credential_material|provider_(?:binding|runtime)|memory_rejected_text|stale_payload|https?:\/\/|\/(?:opt|tmp|var|etc|home|usr)\//i);
}

test('P7 token budget blocks task submit into platform blocked state with denial evidence', () => {
  const { coordinator, tokenBudget, eventBus } = harness();
  const subscription = eventBus.subscribe({ subscriber: 'p7-budget-submit' });
  tokenBudget.updatePolicy({
    tenant_id: identity.tenant_id,
    trace_id: 'trace_budget_enforce02',
    limits: { tenant_units: 10, user_units: 10, agent_units: 10, task_units: 10, max_units_per_attempt: 1 },
  });

  const result = coordinator.submitTask(taskRequest(), { principal, token_budget_units: 2 });
  assert.equal(result.accepted, false);
  assert.equal(result.snapshot.state, 'blocked');
  assert.equal(result.decision.code, 'PLATFORM_RATE_LIMITED');

  const events = coordinator.events();
  assert.equal(events.some((event) => event.event_type === 'policy.denied'), true);
  const deliveries = eventBus.pull(subscription.subscription_id);
  assert.equal(deliveries.some((delivery) => delivery.event.event_type === 'budget.degraded'), true);
  assertClean({ result, events, deliveries });
});

test('P7 token budget blocks adapter dispatch before invocation and records policy denial', async () => {
  const { coordinator, tokenBudget, eventBus, calls, observability } = harness();
  const subscription = eventBus.subscribe({ subscriber: 'p7-budget-dispatch' });
  tokenBudget.updatePolicy({
    tenant_id: identity.tenant_id,
    trace_id: 'trace_budget_enforce03',
    limits: { tenant_units: 10, user_units: 10, agent_units: 10, task_units: 10, max_units_per_attempt: 5 },
  });
  const submitted = coordinator.submitTask(taskRequest({ trace_id: 'trace_budget_enforce04' }), { principal, token_budget_units: 1 });
  assert.equal(submitted.accepted, true);

  tokenBudget.updatePolicy({
    tenant_id: identity.tenant_id,
    trace_id: 'trace_budget_enforce05',
    limits: { max_units_per_attempt: 1 },
  });
  await assert.rejects(
    () => coordinator.dispatchToAdapter(identity.task_id, {
      adapter_name: 'planner-budget-test',
      principal,
      payload: { requested_at_utc: '2026-08-27T02:00:01.000Z', task_id: identity.task_id },
      token_budget_units: 2,
    }),
    (error) => error instanceof CoordinatorError && error.code === 'PLATFORM_RATE_LIMITED',
  );

  assert.equal(calls.length, 0);
  assert.equal(coordinator.events().some((event) => event.event_type === 'policy.denied' && event.producer.component === 'adapter-dispatch'), true);
  assert.equal(eventBus.pull(subscription.subscription_id).some((delivery) => delivery.event.event_type === 'budget.degraded'), true);
  assert.equal(observability.metrics({ tenant_id: identity.tenant_id }).some((metric) => metric.name === 'token_budget.degraded_count'), true);
  assertClean({ events: coordinator.events(), ledger: tokenBudget.listLedger(identity.tenant_id) });
});
