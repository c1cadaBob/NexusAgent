import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDshExecutionRequestFixture,
  DshExecutorAdapter,
} from '../../platform/adapters/dsh/index.ts';
import {
  buildHermesExecutionPlanFixture,
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

const identity = Object.freeze({
  tenant_id: 'tenant_alpha01',
  user_id: 'user_alpha01',
  agent_id: 'agent_alpha01',
  task_id: 'task_p6loop01',
  attempt_id: 'attempt_p6loop01',
  execution_id: 'exec_p6loop01',
  conversation_id: 'conv_p6loop01',
  trace_id: 'trace_p6loop01',
});

const operatorPrincipal = Object.freeze({
  tenant_id: identity.tenant_id,
  user_id: identity.user_id,
  roles: ['operator'],
  permissions: ['task:submit', 'adapter:invoke'],
});

const channelPrincipal = Object.freeze({
  tenant_id: identity.tenant_id,
  user_id: identity.user_id,
  roles: ['channel'],
  permissions: ['adapter:invoke'],
});

const scope = Object.freeze({
  tenant_id: identity.tenant_id,
  user_id: identity.user_id,
  agent_id: identity.agent_id,
  conversation_id: identity.conversation_id,
});

function setClock(clock, monotonic_ms) {
  return clock.set({
    utc_timestamp: new Date(Date.parse('2026-08-26T06:00:00.000Z') + monotonic_ms).toISOString(),
    monotonic_ms,
  });
}

function memoryPayload(overrides = {}) {
  return {
    schema_version: HERMES_MEMORY_PROXY_SCHEMA_VERSION,
    operation: 'snapshot',
    scope: { ...scope },
    trace_id: identity.trace_id,
    requested_at_utc: '2026-08-26T06:00:20.000Z',
    ...overrides,
  };
}

function planPayload(overrides = {}) {
  return buildHermesExecutionPlanFixture({
    ...identity,
    objective: 'Complete the P6 deterministic platform business closed loop',
    memory_context: {
      mode: 'memory_gateway_snapshot',
      layers: ['session', 'user', 'agent_skill'],
      snapshot_version: 1,
      direct_memory_access: 'blocked',
    },
    trace: {
      source: 'adapter_validation',
      planner_mode: 'planner_only',
      provider_binding: 'planner_provider_default',
      tool_runtime: 'platform_executor_required',
      memory_runtime: 'memory_gateway_required',
      gateway_runtime: 'blocked',
    },
    ...overrides,
  });
}

function harness() {
  const clock = new ManualClock({ utc_timestamp: '2026-08-26T06:00:01.000Z', monotonic_ms: 1_000 });
  const eventBus = new InMemoryEventBus();
  const subscription = eventBus.subscribe({ subscriber: 'p6_closed_loop', filter: { tenant_id: identity.tenant_id } });
  const artifactStore = new LocalArtifactStore({ clock, eventBus });
  const memoryGateway = new LocalMemoryGateway({ clock, eventBus });
  const hermesRegistry = new HermesProviderRegistry();
  const openclawRegistry = new OpenClawProviderRegistry();

  const adapters = [
    new OpenClawGatewayAdapter({ registry: openclawRegistry, eventBus }),
    new HermesMemoryGatewayAdapter({ registry: hermesRegistry, memoryGateway, eventBus, clock }),
    new HermesExecutionPlanAdapter({ registry: hermesRegistry }),
    new DshExecutorAdapter({ artifactStore, eventBus }),
  ];
  for (const adapter of adapters) adapter.start();

  const coordinator = new Coordinator({ policyGate: new PolicyGate(), eventBus, clock });
  for (const adapter of adapters) coordinator.registerAdapter(adapter);
  return { artifactStore, clock, coordinator, eventBus, subscription };
}

function eventHistory(eventBus) {
  return eventBus.history().map((entry) => entry.event);
}

function assertLinkedTimeline(events) {
  assert.equal(events.length > 0, true);
  assert.ok(events.every((event) => event.tenant_id === identity.tenant_id));
  assert.ok(events.every((event) => event.trace_id === identity.trace_id));
  assert.ok(events.filter((event) => event.task_id !== undefined).every((event) => event.task_id === identity.task_id));
  assert.ok(events.filter((event) => event.attempt_id !== undefined).every((event) => event.attempt_id === identity.attempt_id));
  assert.ok(events.filter((event) => event.execution_id !== undefined).every((event) => event.execution_id === identity.execution_id));
  assert.ok(events.filter((event) => event.conversation_id !== undefined).every((event) => event.conversation_id === identity.conversation_id));

  const monotonicValues = events.map((event) => event.monotonic_ms);
  assert.deepEqual(monotonicValues, [...monotonicValues].sort((left, right) => left - right));
  for (const event of events) {
    assert.match(event.occurred_at_utc, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  }
}

function assertCleanEventPayloads(events) {
  const serialized = JSON.stringify(events);
  for (const forbidden of [
    'raw_credential',
    'credential_material',
    'native_session',
    'native_error',
    'native_url',
    'native_path',
    'provider_runtime',
    'http://',
    'https://',
    '/opt/',
    'P6 stdout body must stay out of events',
    'P6 stderr body must stay out of events',
    'P6 artifact body must stay in artifact store only',
  ]) {
    assert.equal(serialized.includes(forbidden), false, `P6 closed-loop timeline leaked ${forbidden}`);
  }
}

test('P6 business closed loop links channel task planning memory execution artifact outbound and audit events', async () => {
  const { artifactStore, clock, coordinator, eventBus, subscription } = harness();

  const inbound = buildOpenClawChannelInboundFixture({
    ...identity,
    requested_at_utc: '2026-08-26T06:00:01.003Z',
    monotonic_ms: 1_003,
    channel: {
      message_id: 'msg_p6loop_in01',
      capability_id: 'cap_channel_dingtalk',
      name: 'dingtalk',
      account_ref: 'channel_account_dingtalk_alpha',
      conversation_ref: 'channel_conversation_alpha',
    },
    message: {
      kind: 'text',
      text: 'run the P6 deterministic business closed loop',
      normalized_text: 'run the P6 deterministic business closed loop',
    },
  });
  const taskRequest = buildOpenClawTaskRequest(inbound);
  const submitted = coordinator.submitTask(taskRequest, { principal: operatorPrincipal });
  assert.equal(submitted.accepted, true);
  assert.equal(submitted.snapshot.state, 'admitted');

  setClock(clock, 1_002);
  const inboundDispatch = await coordinator.dispatchToAdapter(identity.task_id, {
    adapter_name: 'openclaw-gateway',
    principal: channelPrincipal,
    payload: inbound,
  });
  assert.equal(inboundDispatch.adapter_result.payload.gateway_outcome, 'handoff');
  assert.deepEqual(inboundDispatch.adapter_result.payload.task_handoff, taskRequest);

  setClock(clock, 1_010);
  const memoryWrite = await coordinator.dispatchToAdapter(identity.task_id, {
    adapter_name: 'hermes-memory-gateway',
    principal: operatorPrincipal,
    payload: memoryPayload({
      operation: 'write',
      target: 'session',
      action: 'add',
      content: 'P6 closed-loop memory context is available through the platform gateway',
      requested_at_utc: '2026-08-26T06:00:01.010Z',
    }),
  });
  assert.equal(memoryWrite.adapter_result.payload.operation, 'write');
  assert.equal(memoryWrite.adapter_result.payload.memory_ref.layer, 'session');

  setClock(clock, 1_020);
  const memorySnapshot = await coordinator.dispatchToAdapter(identity.task_id, {
    adapter_name: 'hermes-memory-gateway',
    principal: operatorPrincipal,
    payload: memoryPayload({ requested_at_utc: '2026-08-26T06:00:01.020Z' }),
  });
  assert.equal(memorySnapshot.adapter_result.payload.operation, 'snapshot');
  assert.equal(memorySnapshot.adapter_result.payload.rendered.session.includes('closed-loop memory context'), true);

  setClock(clock, 1_030);
  const plan = await coordinator.dispatchToAdapter(identity.task_id, {
    adapter_name: 'hermes-execution-plan',
    principal: operatorPrincipal,
    payload: planPayload(),
  });
  assert.equal(plan.adapter_result.payload.plan_status, 'validated');
  assert.equal(plan.adapter_result.payload.execution_plan.memory_context.direct_memory_access, 'blocked');

  setClock(clock, 1_040);
  const executed = await coordinator.dispatchToAdapter(identity.task_id, {
    adapter_name: 'dsh-executor',
    principal: operatorPrincipal,
    payload: buildDshExecutionRequestFixture({
      ...identity,
      requested_at_utc: '2026-08-26T06:00:01.041Z',
      monotonic_ms: 1_041,
      tool: {
        name: 'bash',
        input: {
          emit_artifacts: true,
          stdout: 'P6 stdout body must stay out of events',
          stderr: 'P6 stderr body must stay out of events',
          artifact_body: 'P6 artifact body must stay in artifact store only',
        },
      },
    }),
  });
  const executionResult = executed.adapter_result.payload.execution_result;
  assert.equal(executed.adapter_result.status, 'completed');
  assert.equal(executionResult.execution_outcome, 'completed');
  assert.equal(executionResult.artifacts.length, 3);
  assert.ok(executionResult.artifacts.every((artifact) => artifact.execution_id === identity.execution_id));
  assert.ok(executionResult.artifacts.every((artifact) => artifact.trace_id === identity.trace_id));

  const artifact = executionResult.artifacts.find((candidate) => candidate.kind === 'execution_output');
  assert.ok(artifact);
  const readBack = artifactStore.read({
    tenant_id: identity.tenant_id,
    artifact_id: artifact.artifact_id,
    trace_id: identity.trace_id,
  });
  assert.equal(new TextDecoder().decode(readBack.data), 'P6 artifact body must stay in artifact store only');

  setClock(clock, 1_050);
  const outbound = await coordinator.dispatchToAdapter(identity.task_id, {
    adapter_name: 'openclaw-gateway',
    principal: channelPrincipal,
    payload: buildOpenClawChannelOutboundFixture({
      ...identity,
      requested_at_utc: '2026-08-26T06:00:01.051Z',
      monotonic_ms: 1_051,
      channel: {
        message_id: 'msg_p6loop_out01',
        capability_id: 'cap_channel_dingtalk',
        name: 'dingtalk',
        account_ref: 'channel_account_dingtalk_alpha',
        conversation_ref: 'channel_conversation_alpha',
      },
      result: {
        result_id: 'result_p6loop01',
        status: 'completed',
        text: 'P6 platform closed loop completed',
        artifact_refs: executionResult.artifacts.map((item) => item.artifact_id),
      },
    }),
  });
  assert.equal(outbound.adapter_result.payload.gateway_outcome, 'channel_send_intent');
  assert.equal(outbound.adapter_result.payload.channel_send_intent.delivery_outcome, 'queued');
  assert.deepEqual(outbound.adapter_result.payload.channel_send_intent.result.artifact_refs, executionResult.artifacts.map((item) => item.artifact_id));

  const events = eventHistory(eventBus);
  const eventTypes = events.map((event) => event.event_type);
  for (const expected of [
    'task.state_changed',
    'task.received',
    'planning.started',
    'planning.completed',
    'execution.started',
    'artifact.created',
    'execution.completed',
    'audit.recorded',
  ]) {
    assert.equal(eventTypes.includes(expected), true, `P6 closed-loop event missing: ${expected}`);
  }
  assert.equal(events.some((event) => event.producer.component === 'channel-inbound-anti-corruption'), true);
  assert.equal(events.some((event) => event.producer.component === 'hermes-memory-proxy'), true);
  assert.equal(events.some((event) => event.producer.component === 'execution-normalizer'), true);
  assert.equal(events.some((event) => event.producer.component === 'channel-outbound-anti-corruption'), true);
  assert.equal(events.some((event) => event.artifact_id === artifact.artifact_id), true);
  assert.equal(eventBus.pull(subscription.subscription_id).length, events.length);
  assertLinkedTimeline(events);
  assertCleanEventPayloads(events);
});
