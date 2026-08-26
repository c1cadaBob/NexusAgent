import assert from 'node:assert/strict';
import test from 'node:test';

import {
  baselineDshProviderMetadata,
  buildDshExecutionRequestFixture,
  DSH_BASELINE_PROVIDER_ID,
  DshAdapterError,
  DshExecutorAdapter,
  DshProviderRegistry,
} from '../../platform/adapters/dsh/index.ts';
import { runDsh011Rc2ProviderFixture } from '../../platform/adapters/dsh/providers/dsh-0.1.1-rc.2/index.ts';
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
  buildOpenClawChannelOutboundFixture,
  buildOpenClawTaskRequest,
  OpenClawGatewayAdapter,
  OpenClawProviderRegistry,
} from '../../platform/adapters/openclaw/index.ts';
import { LocalArtifactStore } from '../../platform/artifact-store/index.ts';
import { ManualClock } from '../../platform/clock/index.ts';
import { Coordinator } from '../../platform/coordinator/index.ts';
import { InMemoryEventBus } from '../../platform/event-bus/index.ts';
import { LocalMemoryGateway } from '../../platform/memory-gateway/index.ts';
import { PolicyGate } from '../../platform/policy-gate/index.ts';

// P6 fault injection matrix: Hermes disabled, DSH canary failure, resource exhaustion, duplicate events, and lightweight route.
const identity = Object.freeze({
  tenant_id: 'tenant_alpha01',
  user_id: 'user_alpha01',
  agent_id: 'agent_alpha01',
  task_id: 'task_p6fault01',
  attempt_id: 'attempt_p6fault01',
  execution_id: 'exec_p6fault01',
  conversation_id: 'conv_p6fault01',
  trace_id: 'trace_p6fault01',
});

const operator = Object.freeze({
  tenant_id: identity.tenant_id,
  user_id: identity.user_id,
  roles: ['operator'],
  permissions: ['task:submit', 'adapter:invoke'],
});

const channel = Object.freeze({
  tenant_id: identity.tenant_id,
  user_id: identity.user_id,
  roles: ['channel'],
  permissions: ['adapter:invoke'],
});

function setClock(clock, monotonic_ms) {
  return clock.set({
    utc_timestamp: new Date(Date.parse('2026-08-26T08:00:00.000Z') + monotonic_ms).toISOString(),
    monotonic_ms,
  });
}

function harness(options = {}) {
  const clock = new ManualClock({ utc_timestamp: '2026-08-26T08:00:01.000Z', monotonic_ms: 1_000 });
  const eventBus = new InMemoryEventBus();
  const artifactStore = new LocalArtifactStore({ clock, eventBus });
  const memoryGateway = new LocalMemoryGateway({ clock, eventBus });
  const hermesRegistry = options.hermesRegistry ?? new HermesProviderRegistry();
  const openclawRegistry = options.openclawRegistry ?? new OpenClawProviderRegistry();
  const dshRegistry = options.dshRegistry ?? new DshProviderRegistry();
  const adapters = {
    openclaw: new OpenClawGatewayAdapter({ registry: openclawRegistry, eventBus }),
    hermesMemory: new HermesMemoryGatewayAdapter({ registry: hermesRegistry, memoryGateway, eventBus, clock }),
    hermesPlan: new HermesExecutionPlanAdapter({ registry: hermesRegistry }),
    dsh: new DshExecutorAdapter({ registry: dshRegistry, eventBus, artifactStore, providerRunner: options.providerRunner }),
  };
  for (const adapter of Object.values(adapters)) adapter.start();
  const coordinator = new Coordinator({ policyGate: new PolicyGate(), eventBus, clock });
  for (const adapter of Object.values(adapters)) coordinator.registerAdapter(adapter);
  return { adapters, artifactStore, clock, coordinator, dshRegistry, eventBus, hermesRegistry, openclawRegistry };
}

function inboundMessage(overrides = {}) {
  return buildOpenClawChannelInboundFixture({
    ...identity,
    requested_at_utc: '2026-08-26T08:00:01.001Z',
    monotonic_ms: 1_001,
    message: {
      kind: 'text',
      text: 'P6 lightweight route should not require Hermes planner runtime',
      normalized_text: 'P6 lightweight route should not require Hermes planner runtime',
    },
    ...overrides,
  });
}

function memoryPayload(overrides = {}) {
  return {
    schema_version: HERMES_MEMORY_PROXY_SCHEMA_VERSION,
    operation: 'write',
    scope: {
      tenant_id: identity.tenant_id,
      user_id: identity.user_id,
      agent_id: identity.agent_id,
      conversation_id: identity.conversation_id,
    },
    target: 'session',
    action: 'add',
    content: 'P6 memory recovery fixture',
    trace_id: identity.trace_id,
    requested_at_utc: '2026-08-26T08:00:01.010Z',
    ...overrides,
  };
}

function executionRequest(overrides = {}) {
  return buildDshExecutionRequestFixture({
    ...identity,
    requested_at_utc: '2026-08-26T08:00:01.030Z',
    monotonic_ms: 1_030,
    tool: {
      name: 'bash',
      input: {
        emit_artifacts: true,
        stdout: 'P6 lightweight stdout stays in artifact metadata only',
        artifact_body: 'P6 lightweight artifact body stays in artifact store',
      },
    },
    ...overrides,
  });
}

function providerResult(request, provider, overrides = {}) {
  return {
    schema_version: 'nexus.execution_result.p2.v1',
    tenant_id: request.tenant_id,
    task_id: request.task_id,
    attempt_id: request.attempt_id,
    execution_id: request.execution_id,
    trace_id: request.trace_id,
    provider_id: provider.provider_id,
    execution_outcome: 'completed',
    monotonic_ms: request.monotonic_ms + 1,
    completed_monotonic_ms: request.monotonic_ms + 1,
    events: [],
    artifacts: [],
    output: {},
    ...overrides,
  };
}

function assertNoFaultLeak(value) {
  assert.doesNotMatch(JSON.stringify(value), /raw_credential|credential_material|native_(?:url|path|session|error)|provider_runtime|https?:\/\/|\/(?:opt|tmp|var|etc|home|usr)\//i);
}

test('P6 lightweight OpenClaw plus DSH route completes when Hermes provider is disabled', async () => {
  const setup = harness();
  setup.hermesRegistry.disable(HERMES_BASELINE_PROVIDER_ID, 'P6-03 Hermes unavailable lightweight route drill');

  const inbound = inboundMessage();
  const taskRequest = buildOpenClawTaskRequest(inbound);
  const submitted = setup.coordinator.submitTask(taskRequest, { principal: operator });
  assert.equal(submitted.snapshot.state, 'admitted');

  const inboundResult = await setup.coordinator.dispatchToAdapter(identity.task_id, {
    adapter_name: 'openclaw-gateway',
    principal: channel,
    payload: inbound,
  });
  assert.equal(inboundResult.adapter_result.payload.gateway_outcome, 'handoff');

  const seededPlan = buildHermesExecutionPlanFixture({
    ...identity,
    objective: 'Seeded platform plan for planner unavailable P6 lightweight route',
    trace: {
      source: 'adapter_validation',
      planner_mode: 'planner_only',
      provider_binding: 'planner_provider_default',
      tool_runtime: 'platform_executor_required',
      memory_runtime: 'memory_gateway_required',
      gateway_runtime: 'blocked',
    },
  });
  assert.equal(seededPlan.objective.includes('planner unavailable'), true);
  assert.equal(setup.eventBus.history().some((entry) => entry.event.event_type === 'planning.completed'), false);

  setClock(setup.clock, 1_030);
  const executed = await setup.coordinator.dispatchToAdapter(identity.task_id, {
    adapter_name: 'dsh-executor',
    principal: operator,
    payload: executionRequest(),
  });
  assert.equal(executed.adapter_result.status, 'completed');
  assert.equal(executed.adapter_result.payload.execution_result.execution_outcome, 'completed');
  assert.equal(executed.adapter_result.payload.execution_result.artifacts.length > 0, true);

  setClock(setup.clock, 1_050);
  const outbound = await setup.coordinator.dispatchToAdapter(identity.task_id, {
    adapter_name: 'openclaw-gateway',
    principal: channel,
    payload: buildOpenClawChannelOutboundFixture({
      ...identity,
      final_result: {
        status: 'completed',
        text: 'P6 lightweight route completed through seeded platform plan',
        artifact_ids: executed.adapter_result.payload.execution_result.artifacts.map((artifact) => artifact.artifact_id),
      },
    }),
  });
  assert.equal(outbound.adapter_result.payload.gateway_outcome, 'channel_send_intent');
  assert.equal(outbound.adapter_result.payload.channel_send_intent.delivery_outcome, 'queued');
  assertNoFaultLeak({ executed, outbound, events: setup.eventBus.history() });
});

test('P6 DSH canary throw timeout budget exhaustion and rollback stay platform-owned', async () => {
  const canaryProviderId = 'dsh-0.1.1-rc.2-p6canary';
  const dshRegistry = new DshProviderRegistry([
    baselineDshProviderMetadata(),
    baselineDshProviderMetadata({ provider_id: canaryProviderId, source: 'test-fixture' }),
  ]);
  const setup = harness({
    dshRegistry,
    providerRunner(request, provider) {
      if (provider.provider_id !== canaryProviderId) return runDsh011Rc2ProviderFixture(request, provider);
      if (request.tool.input.mode === 'throw') throw new Error('P6 canary provider unavailable');
      if (request.tool.input.mode === 'timeout') {
        return providerResult(request, provider, {
          completed_monotonic_ms: request.monotonic_ms + request.resource_budget.timeout_ms + 1,
        });
      }
      if (request.tool.input.mode === 'budget') {
        return providerResult(request, provider, { output: { stdout: 'x'.repeat(64) } });
      }
      return providerResult(request, provider, { output: { native_url: 'https://native.invalid/session', credential_material: 'secret-token-value', safe: 'kept' } });
    },
  });
  setup.coordinator.submitTask({ ...buildOpenClawTaskRequest(inboundMessage()), task_id: identity.task_id }, { principal: operator });
  dshRegistry.selectDefault(canaryProviderId);

  await assert.rejects(
    () => setup.coordinator.dispatchToAdapter(identity.task_id, {
      adapter_name: 'dsh-executor',
      principal: operator,
      payload: executionRequest({ provider_id: canaryProviderId, tool: { name: 'bash', input: { mode: 'throw' } } }),
    }),
    (error) => error instanceof DshAdapterError && error.code === 'PLATFORM_INTERNAL_ERROR',
  );

  const timeout = await setup.coordinator.dispatchToAdapter(identity.task_id, {
    adapter_name: 'dsh-executor',
    principal: operator,
    payload: executionRequest({ provider_id: canaryProviderId, tool: { name: 'bash', input: { mode: 'timeout' } } }),
  });
  assert.equal(timeout.adapter_result.payload.execution_result.execution_outcome, 'failed');
  assert.equal(timeout.adapter_result.payload.execution_result.error.code, 'PLATFORM_TIMEOUT');

  const budget = await setup.coordinator.dispatchToAdapter(identity.task_id, {
    adapter_name: 'dsh-executor',
    principal: operator,
    payload: executionRequest({
      provider_id: canaryProviderId,
      resource_budget: { timeout_ms: 30_000, max_stdout_bytes: 2, max_stderr_bytes: 2, max_artifact_bytes: 2 },
      tool: { name: 'bash', input: { mode: 'budget' } },
    }),
  });
  assert.equal(budget.adapter_result.payload.execution_result.execution_outcome, 'blocked');
  assert.equal(budget.adapter_result.payload.execution_result.error.code, 'PLATFORM_POLICY_DENIED');

  const destructive = await setup.coordinator.dispatchToAdapter(identity.task_id, {
    adapter_name: 'dsh-executor',
    principal: operator,
    payload: executionRequest({ provider_id: canaryProviderId, tool: { name: 'bash', input: { mode: 'destructive' } } }),
  });
  assert.equal(destructive.adapter_result.payload.execution_result.output.safe, 'kept');
  assertNoFaultLeak(destructive);

  const rolledBack = dshRegistry.rollbackDefault();
  assert.equal(rolledBack.provider_id, DSH_BASELINE_PROVIDER_ID);
  const recovered = await setup.coordinator.dispatchToAdapter(identity.task_id, {
    adapter_name: 'dsh-executor',
    principal: operator,
    payload: executionRequest({ provider_id: DSH_BASELINE_PROVIDER_ID }),
  });
  assert.equal(recovered.adapter_result.payload.execution_result.execution_outcome, 'completed');
  assertNoFaultLeak({ timeout, budget, destructive, recovered, events: setup.eventBus.history() });
});

test('P6 duplicate events dead-letter and memory conflict stay traceable without native leakage', async () => {
  const setup = harness();
  setup.coordinator.submitTask(buildOpenClawTaskRequest(inboundMessage()), { principal: operator });
  const subscription = setup.eventBus.subscribe({ subscriber: 'p6_fault_ops', filter: { tenant_id: identity.tenant_id } });

  const event = {
    schema_version: 'nexus.event_envelope.v1',
    event_id: 'event_p6fault_duplicate01',
    event_type: 'execution.failed',
    tenant_id: identity.tenant_id,
    task_id: identity.task_id,
    attempt_id: identity.attempt_id,
    execution_id: identity.execution_id,
    conversation_id: identity.conversation_id,
    trace_id: identity.trace_id,
    occurred_at_utc: '2026-08-26T08:00:01.060Z',
    monotonic_ms: 1_060,
    producer: { service: 'fault-injection', component: 'duplicate-event' },
    subject: { kind: 'execution', id: identity.execution_id },
    payload: { reason: 'provider.retry.duplicate' },
  };
  const first = setup.eventBus.publish(event);
  const duplicate = setup.eventBus.publish({ ...event, payload: { reason: 'mutated duplicate must be ignored' } });
  assert.equal(first.duplicate, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(setup.eventBus.pull(subscription.subscription_id).some((delivery) => delivery.event_id === event.event_id), true);
  assert.equal(setup.eventBus.deadLetter(subscription.subscription_id, event.event_id, 'P6 handler failed once'), true);

  const write = await setup.coordinator.dispatchToAdapter(identity.task_id, {
    adapter_name: 'hermes-memory-gateway',
    principal: operator,
    payload: memoryPayload(),
  });
  assert.equal(write.adapter_result.payload.memory_ref.version, 1);
  await assert.rejects(
    () => setup.coordinator.dispatchToAdapter(identity.task_id, {
      adapter_name: 'hermes-memory-gateway',
      principal: operator,
      payload: memoryPayload({ action: 'replace', old_text: 'P6 memory recovery fixture', content: 'stale write', expected_version: 0 }),
    }),
    /version/i,
  );
  assertNoFaultLeak({ deliveries: setup.eventBus.deliveries(subscription.subscription_id), events: setup.eventBus.history() });
});
