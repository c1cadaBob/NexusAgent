import assert from 'node:assert/strict';
import test from 'node:test';

import { invokeLifecycleAdapter } from '../../platform/adapters/index.ts';
import {
  buildHermesExecutionPlanFixture,
  HERMES_EXECUTION_PLAN_SCHEMA_VERSION,
  HermesExecutionPlanAdapter,
  HermesExecutionPlanContractError,
  validateHermesExecutionPlan,
} from '../../platform/adapters/hermes/index.ts';
import { ManualClock } from '../../platform/clock/index.ts';
import { Coordinator } from '../../platform/coordinator/index.ts';
import { InMemoryEventBus } from '../../platform/event-bus/index.ts';
import { PolicyGate, PolicyGateError } from '../../platform/policy-gate/index.ts';

const principal = Object.freeze({
  tenant_id: 'tenant_alpha01',
  user_id: 'user_alpha01',
  roles: ['operator'],
  permissions: ['task:submit', 'adapter:invoke'],
});

function taskRequest(overrides = {}) {
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
    input: { kind: 'text', text: 'validate strict execution plan' },
    created_at_utc: '2026-08-24T00:00:00Z',
    monotonic_ms: 100,
    ...overrides,
  };
}

function harness() {
  const clock = new ManualClock({ utc_timestamp: '2026-08-24T00:00:01.000Z', monotonic_ms: 200 });
  const eventBus = new InMemoryEventBus();
  const adapter = new HermesExecutionPlanAdapter();
  adapter.start();
  const coordinator = new Coordinator({ policyGate: new PolicyGate(), eventBus, clock });
  coordinator.registerAdapter(adapter);
  coordinator.submitTask(taskRequest(), { principal });
  return { adapter, coordinator };
}

test('HermesExecutionPlanAdapter validates a P3 plan through Coordinator and Policy-Gate', async () => {
  const { coordinator } = harness();
  const dispatch = await coordinator.dispatchToAdapter('task_alpha01', {
    adapter_name: 'hermes-execution-plan',
    principal,
    payload: buildHermesExecutionPlanFixture({ trace: { ...buildHermesExecutionPlanFixture().trace, source: 'adapter_validation' } }),
  });

  assert.equal(dispatch.adapter_result.status, 'completed');
  assert.equal(dispatch.adapter_result.payload.schema_version, HERMES_EXECUTION_PLAN_SCHEMA_VERSION);
  assert.equal(dispatch.adapter_result.payload.plan_status, 'validated');
  assert.equal(dispatch.adapter_result.payload.provider_binding, 'planner_provider_default');
  assert.equal(dispatch.adapter_result.payload.execution_plan.schema_version, HERMES_EXECUTION_PLAN_SCHEMA_VERSION);
});

test('HermesExecutionPlanAdapter rejects direct invocation and forged policy decisions', async () => {
  const { adapter } = harness();

  await assert.rejects(
    () => adapter.invoke({
      tenant_id: 'tenant_alpha01',
      task_id: 'task_alpha01',
      attempt_id: 'attempt_alpha01',
      execution_id: 'exec_alpha01',
      conversation_id: 'conv_alpha01',
      trace_id: 'trace_alpha01',
      monotonic_ms: 201,
      payload: buildHermesExecutionPlanFixture(),
    }),
    /Coordinator and Policy-Gate/,
  );

  await assert.rejects(
    () => invokeLifecycleAdapter(new PolicyGate(), adapter, {
      tenant_id: 'tenant_alpha01',
      task_id: 'task_alpha01',
      attempt_id: 'attempt_alpha01',
      execution_id: 'exec_alpha01',
      conversation_id: 'conv_alpha01',
      trace_id: 'trace_alpha01',
      monotonic_ms: 201,
      payload: buildHermesExecutionPlanFixture(),
      policy_decision: { action: 'adapter.invoke', allow: true, tenant_id: 'tenant_alpha01', execution_id: 'exec_alpha01', trace_id: 'trace_alpha01' },
    }),
    (error) => error instanceof PolicyGateError && error.code === 'PLATFORM_POLICY_DENIED',
  );
});

test('ExecutionPlan validator fails closed for missing IDs dependency cycles unknown tool steps and schema drift', () => {
  const plan = buildHermesExecutionPlanFixture();
  const missingTenant = { ...plan };
  delete missingTenant.tenant_id;
  assert.throws(
    () => validateHermesExecutionPlan(missingTenant),
    (error) => error instanceof HermesExecutionPlanContractError && error.code === 'PLATFORM_SCHEMA_VALIDATION_FAILED',
  );

  assert.throws(
    () => validateHermesExecutionPlan({
      ...plan,
      steps: [
        { ...plan.steps[0], depends_on: ['step_plan_003'] },
        plan.steps[1],
        { ...plan.steps[2], depends_on: ['step_plan_001'] },
      ],
      dependencies: [
        { step_id: 'step_plan_001', depends_on_step_id: 'step_plan_003', relation: 'after' },
        { step_id: 'step_plan_002', depends_on_step_id: 'step_plan_001', relation: 'after' },
        { step_id: 'step_plan_003', depends_on_step_id: 'step_plan_001', relation: 'after' },
      ],
    }),
    (error) => error instanceof HermesExecutionPlanContractError && error.code === 'PLATFORM_SCHEMA_VALIDATION_FAILED',
  );

  assert.throws(
    () => validateHermesExecutionPlan({
      ...plan,
      tool_intents: [{ ...plan.tool_intents[0], step_id: 'step_missing_001' }],
    }),
    (error) => error instanceof HermesExecutionPlanContractError && error.code === 'PLATFORM_SCHEMA_VALIDATION_FAILED',
  );

  assert.throws(
    () => validateHermesExecutionPlan({ ...plan, schema_version: 'nexus.execution_plan.p0.v1' }),
    (error) => error instanceof HermesExecutionPlanContractError && error.code === 'PLATFORM_SCHEMA_VALIDATION_FAILED',
  );
});
