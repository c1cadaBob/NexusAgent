import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildOpenClawChannelInboundFixture,
  OpenClawGatewayAdapter,
} from '../../platform/adapters/openclaw/index.ts';
import { ManualClock } from '../../platform/clock/index.ts';
import { Coordinator, CoordinatorError } from '../../platform/coordinator/index.ts';
import { InMemoryEventBus } from '../../platform/event-bus/index.ts';
import { PolicyGate } from '../../platform/policy-gate/index.ts';

const submitInvokeCancelPrincipal = Object.freeze({
  tenant_id: 'tenant_alpha01',
  user_id: 'user_alpha01',
  roles: ['operator'],
  permissions: ['task:submit', 'adapter:invoke', 'task:cancel'],
});

const submitInvokePrincipal = Object.freeze({
  tenant_id: 'tenant_alpha01',
  user_id: 'user_alpha01',
  roles: ['operator'],
  permissions: ['task:submit', 'adapter:invoke'],
});

const invokeOnlyPrincipal = Object.freeze({
  tenant_id: 'tenant_alpha01',
  user_id: 'user_alpha01',
  roles: ['channel'],
  permissions: ['adapter:invoke'],
});

const noSubmitPrincipal = Object.freeze({
  tenant_id: 'tenant_alpha01',
  user_id: 'user_alpha01',
  roles: ['viewer'],
  permissions: ['adapter:invoke'],
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
    input: { kind: 'text', text: 'channel command routing' },
    created_at_utc: '2026-08-25T00:00:00Z',
    monotonic_ms: 100,
    ...overrides,
  };
}

function harness(initialPrincipal = submitInvokeCancelPrincipal) {
  const clock = new ManualClock({ utc_timestamp: '2026-08-25T00:00:10.000Z', monotonic_ms: 1000 });
  const eventBus = new InMemoryEventBus();
  const adapter = new OpenClawGatewayAdapter({ eventBus });
  adapter.start();
  const coordinator = new Coordinator({ policyGate: new PolicyGate(), eventBus, clock });
  coordinator.registerAdapter(adapter);
  coordinator.submitTask(taskRequest(), { principal: initialPrincipal });
  return { coordinator, eventBus, clock };
}

async function mapCommand(coordinator, text, overrides = {}) {
  const inbound = buildOpenClawChannelInboundFixture({
    message: { kind: 'command', text, normalized_text: text },
    ...overrides,
  });
  const dispatch = await coordinator.dispatchToAdapter(inbound.task_id, {
    adapter_name: 'openclaw-gateway',
    principal: invokeOnlyPrincipal,
    payload: inbound,
  });
  assert.equal(dispatch.adapter_result.payload.gateway_outcome, 'command_mapping');
  assert.equal(dispatch.adapter_result.payload.command_mapping.schema_version, 'nexus.openclaw_command_mapping.p4.v1');
  return dispatch.adapter_result.payload.task_command;
}

test('OpenClaw continue command keeps the same attempt and is idempotent on replay', async () => {
  const { coordinator } = harness();
  const taskCommand = await mapCommand(coordinator, '/continue', { channel: { message_id: 'msg_continue01' } });

  const first = coordinator.submitTaskCommand(taskCommand, { principal: submitInvokePrincipal });
  assert.equal(first.command, 'continue_attempt');
  assert.equal(first.snapshot.attempt_id, 'attempt_alpha01');
  assert.equal(first.snapshot.state, 'admitted');
  assert.equal(first.event.event_type, 'audit.recorded');
  const eventCount = coordinator.events().length;

  const replay = coordinator.submitTaskCommand(taskCommand, { principal: submitInvokePrincipal });
  assert.deepEqual(replay.event, first.event);
  assert.deepEqual(replay.snapshot, first.snapshot);
  assert.equal(coordinator.events().length, eventCount);
});

test('OpenClaw redo command creates one new attempt only from retryable states', async () => {
  const { coordinator } = harness(noSubmitPrincipal);
  assert.equal(coordinator.snapshot('task_alpha01').state, 'blocked');

  const taskCommand = await mapCommand(coordinator, '/redo', { channel: { message_id: 'msg_redo01' } });
  const redo = coordinator.submitTaskCommand(taskCommand, { principal: submitInvokePrincipal });
  assert.equal(redo.command, 'redo_attempt');
  assert.equal(redo.snapshot.task_id, 'task_alpha01');
  assert.equal(redo.snapshot.attempt_id, 'attempt_redo_redo01');
  assert.equal(redo.snapshot.state, 'admitted');
  assert.equal(coordinator.snapshot('task_alpha01').attempt_id, 'attempt_redo_redo01');

  const replay = coordinator.submitTaskCommand(taskCommand, { principal: submitInvokePrincipal });
  assert.equal(replay.snapshot.attempt_id, 'attempt_redo_redo01');

  const admitted = harness();
  const invalidRedo = await mapCommand(admitted.coordinator, '/redo', { channel: { message_id: 'msg_redo02' } });
  assert.throws(
    () => admitted.coordinator.submitTaskCommand(invalidRedo, { principal: submitInvokePrincipal }),
    (error) => error instanceof CoordinatorError && error.code === 'PLATFORM_INVALID_STATE_TRANSITION',
  );
});

test('OpenClaw cancel command requires task cancel permission and emits traceable cancelled event', async () => {
  const { coordinator, eventBus } = harness();
  const taskCommand = await mapCommand(coordinator, '/cancel', { channel: { message_id: 'msg_cancel01' } });

  assert.throws(
    () => coordinator.submitTaskCommand(taskCommand, { principal: submitInvokePrincipal }),
    (error) => error instanceof CoordinatorError && error.code === 'PLATFORM_FORBIDDEN',
  );

  const cancelled = coordinator.submitTaskCommand(taskCommand, { principal: submitInvokeCancelPrincipal });
  assert.equal(cancelled.command, 'cancel_attempt');
  assert.equal(cancelled.snapshot.state, 'cancelled');
  assert.equal(cancelled.event.event_type, 'task.state_changed');
  assert.equal(cancelled.event.payload.state, 'cancelled');
  assert.equal(cancelled.event.payload.outcome, 'cancelled');
  assert.equal(cancelled.event.payload.command, 'cancel_attempt');
  assert.equal(cancelled.event.trace_id, 'trace_alpha01');
  assert.equal(eventBus.history().some((entry) => entry.event.event_type === 'task.state_changed' && entry.event.payload.command === 'cancel_attempt'), true);
});

test('OpenClaw command idempotency rejects mismatched replay payloads', async () => {
  const { coordinator } = harness();
  const taskCommand = await mapCommand(coordinator, '/continue', { channel: { message_id: 'msg_continue02' } });
  coordinator.submitTaskCommand(taskCommand, { principal: submitInvokePrincipal });

  assert.throws(
    () => coordinator.submitTaskCommand({ ...taskCommand, reason: 'different replay reason' }, { principal: submitInvokePrincipal }),
    (error) => error instanceof CoordinatorError && error.code === 'PLATFORM_CONFLICT',
  );
});
