import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildHermesExecutionPlanFixture,
  HermesExecutionPlanAdapter,
} from '../../platform/adapters/hermes/index.ts';
import { ManualClock } from '../../platform/clock/index.ts';
import { Coordinator } from '../../platform/coordinator/index.ts';
import { LocalObservability } from '../../platform/observability/index.ts';
import { PolicyGate } from '../../platform/policy-gate/index.ts';

const identity = Object.freeze({
  tenant_id: 'tenant_alpha01',
  user_id: 'user_alpha01',
  agent_id: 'agent_alpha01',
  task_id: 'task_p7quality01',
  attempt_id: 'attempt_p7quality01',
  execution_id: 'exec_p7quality01',
  conversation_id: 'conv_p7quality01',
  trace_id: 'trace_p7quality01',
});

const principal = Object.freeze({
  tenant_id: identity.tenant_id,
  user_id: identity.user_id,
  roles: ['operator'],
  permissions: ['task:submit', 'adapter:invoke'],
});

function taskRequest() {
  return {
    schema_version: 'nexus.task_request.v1',
    ...identity,
    input: { kind: 'text', text: 'evaluate P7 plan quality signals' },
    source: { kind: 'api', received_at_utc: '2026-08-26T09:10:00.000Z' },
    created_at_utc: '2026-08-26T09:10:00.000Z',
    monotonic_ms: 10_000,
  };
}

function planPayload() {
  return buildHermesExecutionPlanFixture({
    ...identity,
    trace: { ...buildHermesExecutionPlanFixture().trace, source: 'adapter_validation' },
  });
}

function harness(planQuality) {
  const clock = new ManualClock({ utc_timestamp: '2026-08-26T09:10:00.000Z', monotonic_ms: 10_000 });
  const observability = new LocalObservability({ clock, service: 'coordinator', version: 'p7-test' });
  const adapter = new HermesExecutionPlanAdapter();
  adapter.start();
  const coordinator = new Coordinator({ policyGate: new PolicyGate(), clock, planQuality: { observability, ...planQuality } });
  coordinator.registerAdapter(adapter);
  coordinator.submitTask(taskRequest(), { principal });
  return { clock, coordinator, observability };
}

test('P7 plan quality is default-off and does not emit observability signals', async () => {
  const { coordinator, observability } = harness({});
  const dispatch = await coordinator.dispatchToAdapter(identity.task_id, {
    adapter_name: 'hermes-execution-plan',
    principal,
    payload: planPayload(),
  });
  assert.equal(dispatch.adapter_result.payload.plan_status, 'validated');
  assert.deepEqual(observability.metrics({ trace_id: identity.trace_id }), []);
  assert.deepEqual(observability.logs({ trace_id: identity.trace_id }), []);
});

test('P7 plan quality emits internal metrics logs and timeline entries when explicitly enabled', async () => {
  const { coordinator, observability } = harness({ enabled: true });
  const dispatch = await coordinator.dispatchToAdapter(identity.task_id, {
    adapter_name: 'hermes-execution-plan',
    principal,
    payload: planPayload(),
  });
  assert.equal(dispatch.adapter_result.payload.plan_status, 'validated');

  const metrics = observability.metrics({ trace_id: identity.trace_id });
  assert.deepEqual(metrics.map((metric) => metric.name), [
    'plan_quality.score',
    'plan_quality.signal_count',
    'plan_quality.blocked_step_count',
  ]);
  assert.equal(metrics[0].value, 100);
  assert.equal(metrics[0].labels.quality_band, 'excellent');

  const logs = observability.logs({ trace_id: identity.trace_id });
  assert.equal(logs.length, 1);
  assert.equal(logs[0].message, 'plan_quality.evaluated');
  assert.equal(logs[0].fields.schema_version, 'nexus.plan_quality.p7.v1');
  assert.equal(logs[0].fields.feature_enabled, true);

  const timeline = observability.timeline({ trace_id: identity.trace_id });
  assert.equal(timeline.length, 4);
  assert.deepEqual(timeline.map((entry) => entry.monotonic_ms), [10_003, 10_004, 10_005, 10_006]);
});

test('P7 plan quality evaluator failures are logged and do not block planner dispatch', async () => {
  const { coordinator, observability } = harness({
    enabled: true,
    evaluator() {
      throw new Error('internal evaluator fixture failure with native_url redacted');
    },
  });
  const dispatch = await coordinator.dispatchToAdapter(identity.task_id, {
    adapter_name: 'hermes-execution-plan',
    principal,
    payload: planPayload(),
  });
  assert.equal(dispatch.adapter_result.payload.plan_status, 'validated');
  assert.deepEqual(observability.metrics({ trace_id: identity.trace_id }), []);
  const logs = observability.logs({ trace_id: identity.trace_id });
  assert.equal(logs.length, 1);
  assert.equal(logs[0].level, 'warn');
  assert.equal(logs[0].message, 'plan_quality.evaluation_skipped');
  assert.deepEqual(logs[0].fields, { code: 'PLATFORM_INVALID_REQUEST', reason_code: 'PLAN_QUALITY_EVALUATION_SKIPPED' });
});
