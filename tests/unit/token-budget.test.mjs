import assert from 'node:assert/strict';
import test from 'node:test';

import { ManualClock } from '../../platform/clock/index.ts';
import { InMemoryEventBus } from '../../platform/event-bus/index.ts';
import {
  estimateTokenBudgetUnits,
  LocalTokenBudget,
  TOKEN_BUDGET_DEFAULT_ENABLED,
  TOKEN_BUDGET_DIMENSION_MODE,
  TOKEN_BUDGET_ENFORCEMENT_SCOPE,
  TOKEN_BUDGET_SCHEMA_VERSION,
  TokenBudgetError,
} from '../../platform/coordinator/index.ts';
import { LocalObservability } from '../../platform/observability/index.ts';

const context = Object.freeze({
  tenant_id: 'tenant_alpha01',
  user_id: 'user_alpha01',
  agent_id: 'agent_alpha01',
  task_id: 'task_budget01',
  attempt_id: 'attempt_budget01',
  execution_id: 'exec_budget01',
  conversation_id: 'conv_budget01',
  trace_id: 'trace_budget_unit01',
});

function assertClean(value) {
  assert.doesNotMatch(JSON.stringify(value), /Hermes|OpenClaw|DeepSeek|\bDSH\b|native_|raw_credential|credential_material|provider_(?:binding|runtime)|memory_rejected_text|stale_payload|https?:\/\/|\/(?:opt|tmp|var|etc|home|usr)\//i);
}

test('P7 token budget defaults to enabled all-configured deterministic policy', () => {
  const clock = new ManualClock({ utc_timestamp: '2026-08-27T00:00:00.000Z', monotonic_ms: 100 });
  const budget = new LocalTokenBudget({ clock });
  const policy = budget.getPolicy('tenant_alpha01', 'trace_budget_unit02');

  assert.equal(TOKEN_BUDGET_DEFAULT_ENABLED, true);
  assert.equal(TOKEN_BUDGET_SCHEMA_VERSION, 'nexus.token_budget.p7.v1');
  assert.equal(TOKEN_BUDGET_DIMENSION_MODE, 'all_configured');
  assert.equal(TOKEN_BUDGET_ENFORCEMENT_SCOPE, 'task_adapter_api');
  assert.equal(policy.enabled, true);
  assert.equal(policy.limits.tenant_units, 100000);
  assert.equal(policy.limits.user_units, 50000);
  assert.equal(policy.limits.agent_units, 50000);
  assert.equal(policy.limits.task_units, 10000);
  assert.equal(policy.limits.max_units_per_attempt, 5000);
  assert.deepEqual(policy.resource_budget.dimensions, ['tenant', 'user', 'agent', 'task']);
  assert.equal(estimateTokenBudgetUnits('12345'), 2);
  assertClean(policy);
});

test('P7 token budget records checked reserved and denied ledger entries', () => {
  const clock = new ManualClock({ utc_timestamp: '2026-08-27T00:00:00.000Z', monotonic_ms: 100 });
  const eventBus = new InMemoryEventBus();
  const observability = new LocalObservability({ clock, service: 'token-budget', version: 'p7-test' });
  const budget = new LocalTokenBudget({ clock, eventBus, observability });
  const subscription = eventBus.subscribe({ subscriber: 'token-budget-test' });

  budget.updatePolicy({
    tenant_id: context.tenant_id,
    trace_id: 'trace_budget_unit03',
    limits: { tenant_units: 20, user_units: 20, agent_units: 20, task_units: 15, max_units_per_attempt: 10 },
  });

  const checked = budget.check({ ...context, requested_units: 4, reason_code: 'api_check' });
  const reserved = budget.check({ ...context, requested_units: 6, trace_id: 'trace_budget_unit04', reason_code: 'task_submit' }, { consume: true });
  const denied = budget.check({ ...context, requested_units: 11, trace_id: 'trace_budget_unit05', reason_code: 'executor_dispatch' });

  assert.equal(checked.status, 'approved');
  assert.equal(reserved.status, 'approved');
  assert.equal(denied.status, 'degraded');
  assert.equal(denied.reason_codes.includes('TOKEN_BUDGET_MAX_ATTEMPT_EXCEEDED'), true);
  assert.equal(denied.reason_codes.includes('TOKEN_BUDGET_EXCEEDED'), true);

  const ledger = budget.listLedger(context.tenant_id);
  assert.deepEqual(ledger.map((entry) => entry.status), ['checked', 'reserved', 'denied']);
  assert.equal(ledger.filter((entry) => entry.status === 'reserved').reduce((sum, entry) => sum + entry.consumed_units, 0), 6);
  assert.equal(eventBus.pull(subscription.subscription_id).some((delivery) => delivery.event.event_type === 'budget.degraded'), true);
  assert.equal(observability.metrics({ tenant_id: context.tenant_id }).some((metric) => metric.name === 'token_budget.consumed_units'), true);
  assertClean({ ledger, logs: observability.logs({ tenant_id: context.tenant_id }) });
});

test('P7 token budget rejects native raw provider and memory stale markers', () => {
  const budget = new LocalTokenBudget({ clock: new ManualClock({ utc_timestamp: '2026-08-27T00:00:00.000Z', monotonic_ms: 100 }) });
  for (const input of [
    { ...context, requested_units: 1, native_url: 'https://blocked.invalid' },
    { ...context, requested_units: 1, raw_credential: 'secret-token-value' },
    { ...context, requested_units: 1, memory_rejected_text: 'do not log me' },
    { ...context, requested_units: 1, stale_payload: { text: 'do not store me' } },
  ]) {
    assert.throws(() => budget.check(input), (error) => error instanceof TokenBudgetError && error.code === 'PLATFORM_INVALID_REQUEST');
  }
});
