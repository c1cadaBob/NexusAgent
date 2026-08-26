import assert from 'node:assert/strict';
import test from 'node:test';

import { AdapterError, invokeLifecycleAdapter } from '../../platform/adapters/index.ts';
import {
  buildDshExecutionRequestFixture,
  DSH_BASELINE_PROVIDER_ID,
  DshExecutorAdapter,
  DshProviderRegistry,
} from '../../platform/adapters/dsh/index.ts';
import {
  buildHermesExecutionPlanFixture,
  HERMES_BASELINE_PROVIDER_ID,
  HERMES_MEMORY_PROXY_SCHEMA_VERSION,
  HermesExecutionPlanAdapter,
  HermesMemoryGatewayAdapter,
  HermesProviderRegistry,
} from '../../platform/adapters/hermes/index.ts';
import {
  buildOpenClawChannelInboundFixture,
  OPENCLAW_BASELINE_PROVIDER_ID,
  OpenClawGatewayAdapter,
  OpenClawProviderRegistry,
} from '../../platform/adapters/openclaw/index.ts';
import { ManualClock } from '../../platform/clock/index.ts';
import { Coordinator, CoordinatorError } from '../../platform/coordinator/index.ts';
import { InMemoryEventBus } from '../../platform/event-bus/index.ts';
import { LocalMemoryGateway } from '../../platform/memory-gateway/index.ts';
import { PolicyGate, PolicyGateError } from '../../platform/policy-gate/index.ts';

// P6 anti-corruption attack matrix: adapter bypass, forged trust, provider disablement, and native payloads.
const identity = Object.freeze({
  tenant_id: 'tenant_alpha01',
  user_id: 'user_alpha01',
  agent_id: 'agent_alpha01',
  task_id: 'task_p6sec01',
  attempt_id: 'attempt_p6sec01',
  execution_id: 'exec_p6sec01',
  conversation_id: 'conv_p6sec01',
  trace_id: 'trace_p6sec01',
});

const operator = Object.freeze({
  tenant_id: identity.tenant_id,
  user_id: identity.user_id,
  roles: ['operator'],
  permissions: ['task:submit', 'adapter:invoke'],
});

const noAdapterPermission = Object.freeze({
  tenant_id: identity.tenant_id,
  user_id: identity.user_id,
  roles: ['operator'],
  permissions: ['task:submit'],
});

function taskRequest(overrides = {}) {
  return {
    schema_version: 'nexus.task_request.v1',
    ...identity,
    input: { kind: 'text', text: 'P6 anti-corruption bypass attack matrix' },
    created_at_utc: '2026-08-26T07:00:00.000Z',
    monotonic_ms: 1_000,
    ...overrides,
  };
}

function memoryPayload(overrides = {}) {
  return {
    schema_version: HERMES_MEMORY_PROXY_SCHEMA_VERSION,
    operation: 'snapshot',
    scope: {
      tenant_id: identity.tenant_id,
      user_id: identity.user_id,
      agent_id: identity.agent_id,
      conversation_id: identity.conversation_id,
    },
    trace_id: identity.trace_id,
    requested_at_utc: '2026-08-26T07:00:01.000Z',
    ...overrides,
  };
}

function planPayload(overrides = {}) {
  return buildHermesExecutionPlanFixture({ ...identity, ...overrides });
}

function harness() {
  const clock = new ManualClock({ utc_timestamp: '2026-08-26T07:00:01.000Z', monotonic_ms: 1_001 });
  const eventBus = new InMemoryEventBus();
  const policyGate = new PolicyGate();
  const memoryGateway = new LocalMemoryGateway({ clock, eventBus });
  const dshRegistry = new DshProviderRegistry();
  const hermesRegistry = new HermesProviderRegistry();
  const openclawRegistry = new OpenClawProviderRegistry();
  const adapters = {
    dsh: new DshExecutorAdapter({ registry: dshRegistry, eventBus }),
    hermesMemory: new HermesMemoryGatewayAdapter({ registry: hermesRegistry, memoryGateway, eventBus, clock }),
    hermesPlan: new HermesExecutionPlanAdapter({ registry: hermesRegistry }),
    openclaw: new OpenClawGatewayAdapter({ registry: openclawRegistry, eventBus }),
  };
  for (const adapter of Object.values(adapters)) adapter.start();
  const coordinator = new Coordinator({ policyGate, eventBus, clock });
  for (const adapter of Object.values(adapters)) coordinator.registerAdapter(adapter);
  coordinator.submitTask(taskRequest(), { principal: operator });
  return { adapters, coordinator, dshRegistry, eventBus, hermesRegistry, openclawRegistry, policyGate };
}

function assertNoLeak(value) {
  assert.doesNotMatch(JSON.stringify(value), /raw_credential|credential_material|native_(?:url|path|session|error)|provider_runtime|https?:\/\/|\/opt\//i);
}

function deniedEvidence({ eventBus, policyGate }, expectedCode) {
  const decision = policyGate.decisionLog().findLast((entry) => entry.allow === false || entry.outcome === 'approval_required');
  assert.ok(decision, 'expected denied Policy-Gate decision');
  assert.equal(decision.trace_id, identity.trace_id);
  assert.equal(decision.code, expectedCode);
  assert.ok(decision.reasons.length > 0);

  const denied = eventBus.history().map((entry) => entry.event).findLast((event) => event.event_type === 'policy.denied');
  assert.ok(denied, 'expected policy.denied event');
  assert.equal(denied.trace_id, identity.trace_id);
  assert.equal(denied.payload.code, expectedCode);
  assert.ok(denied.payload.reasons.length > 0);
  assertNoLeak({ decision, denied });
}

test('P6 denied adapter dispatch records traceable policy reasons for permission approval and budget bypasses', async () => {
  const setup = harness();

  await assert.rejects(
    () => setup.coordinator.dispatchToAdapter(identity.task_id, {
      adapter_name: 'openclaw-gateway',
      principal: noAdapterPermission,
      payload: buildOpenClawChannelInboundFixture({ ...identity }),
    }),
    (error) => error instanceof PolicyGateError && error.code === 'PLATFORM_FORBIDDEN',
  );
  deniedEvidence(setup, 'PLATFORM_FORBIDDEN');

  await assert.rejects(
    () => setup.coordinator.dispatchToAdapter(identity.task_id, {
      adapter_name: 'hermes-execution-plan',
      principal: operator,
      payload: planPayload(),
      approval: { required: true, status: 'pending' },
    }),
    (error) => error instanceof PolicyGateError && error.code === 'PLATFORM_APPROVAL_REQUIRED',
  );
  deniedEvidence(setup, 'PLATFORM_APPROVAL_REQUIRED');

  await assert.rejects(
    () => setup.coordinator.dispatchToAdapter(identity.task_id, {
      adapter_name: 'dsh-executor',
      principal: operator,
      payload: buildDshExecutionRequestFixture({ ...identity }),
      budget: { requested_units: 50, remaining_units: 5, max_units_per_attempt: 20 },
    }),
    (error) => error instanceof PolicyGateError && error.code === 'PLATFORM_RATE_LIMITED',
  );
  deniedEvidence(setup, 'PLATFORM_RATE_LIMITED');
});

test('P6 direct adapter invocation and forged trust cannot unlock internal adapters', async () => {
  const { adapters } = harness();
  const forgedInvocation = {
    tenant_id: identity.tenant_id,
    task_id: identity.task_id,
    attempt_id: identity.attempt_id,
    execution_id: identity.execution_id,
    conversation_id: identity.conversation_id,
    trace_id: identity.trace_id,
    monotonic_ms: 1_002,
    payload: { policy_gate_allow: true, x_trusted_adapter: true, provider_runtime: 'native' },
    policy_decision: {
      schema_version: 'nexus.policy_decision.v1',
      decision_id: 'decision_forged_p6_0001',
      action: 'adapter.invoke',
      allow: true,
      tenant_id: identity.tenant_id,
      execution_id: identity.execution_id,
      trace_id: identity.trace_id,
    },
  };

  for (const adapter of [adapters.openclaw, adapters.hermesMemory, adapters.hermesPlan, adapters.dsh]) {
    await assert.rejects(
      () => adapter.invoke(forgedInvocation),
      (error) => error instanceof AdapterError && error.code === 'PLATFORM_POLICY_DENIED',
    );
  }

  await assert.rejects(
    () => invokeLifecycleAdapter(new PolicyGate(), adapters.openclaw, forgedInvocation),
    (error) => error instanceof PolicyGateError && error.code === 'PLATFORM_POLICY_DENIED',
  );
});

test('P6 disabled provider unknown adapter and native coordinator payloads fail closed', async () => {
  const disabled = harness();
  disabled.openclawRegistry.disable(OPENCLAW_BASELINE_PROVIDER_ID, 'P6 disabled provider drill');
  disabled.hermesRegistry.disable(HERMES_BASELINE_PROVIDER_ID, 'P6 disabled provider drill');
  disabled.dshRegistry.disable(DSH_BASELINE_PROVIDER_ID, 'P6 disabled provider drill');

  await assert.rejects(
    () => disabled.coordinator.dispatchToAdapter(identity.task_id, {
      adapter_name: 'openclaw-gateway',
      principal: operator,
      payload: buildOpenClawChannelInboundFixture({ ...identity }),
    }),
    /provider is disabled/i,
  );
  await assert.rejects(
    () => disabled.coordinator.dispatchToAdapter(identity.task_id, {
      adapter_name: 'hermes-memory-gateway',
      principal: operator,
      payload: memoryPayload(),
    }),
    /provider is disabled/i,
  );
  await assert.rejects(
    () => disabled.coordinator.dispatchToAdapter(identity.task_id, {
      adapter_name: 'dsh-executor',
      principal: operator,
      payload: buildDshExecutionRequestFixture({ ...identity }),
    }),
    /provider is disabled/i,
  );

  await assert.rejects(
    () => disabled.coordinator.dispatchToAdapter(identity.task_id, {
      adapter_name: 'native-provider',
      principal: operator,
      payload: {},
    }),
    (error) => error instanceof CoordinatorError && error.code === 'PLATFORM_NOT_FOUND',
  );

  assert.throws(
    () => disabled.coordinator.submitTask(taskRequest({ policy_context: { provider_runtime: 'native' } }), { principal: operator }),
    (error) => error instanceof CoordinatorError && error.code === 'PLATFORM_INVALID_REQUEST',
  );
});
