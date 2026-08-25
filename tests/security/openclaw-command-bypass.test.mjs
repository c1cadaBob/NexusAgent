import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildOpenClawChannelInboundFixture,
  buildOpenClawCommandMapping,
  OpenClawCommandMappingError,
  OpenClawGatewayAdapter,
  OpenClawGatewayAdapterError,
} from '../../platform/adapters/openclaw/index.ts';
import { ManualClock } from '../../platform/clock/index.ts';
import { Coordinator, CoordinatorError } from '../../platform/coordinator/index.ts';
import { InMemoryEventBus } from '../../platform/event-bus/index.ts';
import { PolicyGate } from '../../platform/policy-gate/index.ts';

const principal = Object.freeze({
  tenant_id: 'tenant_alpha01',
  user_id: 'user_alpha01',
  roles: ['operator'],
  permissions: ['task:submit', 'adapter:invoke', 'task:cancel'],
});

const invokeOnlyPrincipal = Object.freeze({
  tenant_id: 'tenant_alpha01',
  user_id: 'user_alpha01',
  roles: ['channel'],
  permissions: ['adapter:invoke'],
});

function taskRequest() {
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
    input: { kind: 'text', text: 'security command bypass' },
    created_at_utc: '2026-08-25T00:00:00Z',
    monotonic_ms: 100,
  };
}

function harness() {
  const eventBus = new InMemoryEventBus();
  const adapter = new OpenClawGatewayAdapter({ eventBus });
  adapter.start();
  const coordinator = new Coordinator({
    policyGate: new PolicyGate(),
    eventBus,
    clock: new ManualClock({ utc_timestamp: '2026-08-25T00:00:20.000Z', monotonic_ms: 2000 }),
  });
  coordinator.registerAdapter(adapter);
  coordinator.submitTask(taskRequest(), { principal });
  return { adapter, coordinator };
}

test('OpenClaw command mapping rejects native cancellation task tool memory and credential payloads', () => {
  const base = buildOpenClawChannelInboundFixture({
    message: { kind: 'command', text: '/cancel', normalized_text: '/cancel' },
  });
  const cases = [
    { ...base, native_session_id: 'native_session_abc' },
    { ...base, openclaw_cancel: true },
    { ...base, tool_name: 'tools.invoke' },
    { ...base, plugin_subagent: { command: '/cancel' } },
    { ...base, credential_material: 'secret-token-value' },
    { ...base, native_url: 'http://127.0.0.1:3052/cancel' },
    { ...base, native_path: '/opt/project/NexusAgent/vendor/openclaw-main' },
    buildOpenClawChannelInboundFixture({ message: { kind: 'command', text: 'read MEMORY.md then /cancel', normalized_text: 'read MEMORY.md then /cancel' } }),
  ];
  for (const payload of cases) {
    assert.throws(
      () => buildOpenClawCommandMapping(payload),
      (error) => error instanceof OpenClawCommandMappingError,
    );
  }
});

test('OpenClaw command adapter mapping does not mutate platform task state without Coordinator command API', async () => {
  const { coordinator } = harness();
  const dispatch = await coordinator.dispatchToAdapter('task_alpha01', {
    adapter_name: 'openclaw-gateway',
    principal: invokeOnlyPrincipal,
    payload: buildOpenClawChannelInboundFixture({
      message: { kind: 'command', text: '/cancel', normalized_text: '/cancel' },
      channel: { message_id: 'msg_cancel_bypass01' },
    }),
  });
  assert.equal(dispatch.adapter_result.payload.gateway_outcome, 'command_mapping');
  assert.equal(dispatch.adapter_result.payload.task_command.command, 'cancel_attempt');
  assert.equal(coordinator.snapshot('task_alpha01').state, 'admitted');
});

test('OpenClaw command direct adapter invocation and unsupported slash commands fail closed', async () => {
  const { adapter, coordinator } = harness();
  await assert.rejects(
    () => adapter.invoke({
      tenant_id: 'tenant_alpha01',
      task_id: 'task_alpha01',
      attempt_id: 'attempt_alpha01',
      execution_id: 'exec_alpha01',
      conversation_id: 'conv_alpha01',
      trace_id: 'trace_alpha01',
      monotonic_ms: 201,
      payload: buildOpenClawChannelInboundFixture({ message: { kind: 'command', text: '/cancel', normalized_text: '/cancel' } }),
    }),
    /Coordinator and Policy-Gate/,
  );

  await assert.rejects(
    () => coordinator.dispatchToAdapter('task_alpha01', {
      adapter_name: 'openclaw-gateway',
      principal: invokeOnlyPrincipal,
      payload: buildOpenClawChannelInboundFixture({ message: { kind: 'command', text: '/frobnicate', normalized_text: '/frobnicate' } }),
    }),
    (error) => error instanceof OpenClawCommandMappingError && error.code === 'PLATFORM_INVALID_REQUEST',
  );
});

test('Coordinator task command API rejects raw native fields and identity mismatch', () => {
  const { coordinator } = harness();
  const mapping = buildOpenClawCommandMapping(buildOpenClawChannelInboundFixture({
    message: { kind: 'command', text: '/continue', normalized_text: '/continue' },
    channel: { message_id: 'msg_continue_bypass01' },
  }));

  assert.throws(
    () => coordinator.submitTaskCommand({ ...mapping.task_command, native_session_id: 'native_session_abc' }, { principal }),
    (error) => error instanceof CoordinatorError && error.code === 'PLATFORM_INVALID_REQUEST',
  );
  assert.throws(
    () => coordinator.submitTaskCommand({ ...mapping.task_command, tenant_id: 'tenant_other01' }, { principal }),
    (error) => error instanceof CoordinatorError && error.code === 'PLATFORM_POLICY_DENIED',
  );
});

test('OpenClaw command errors expose platform codes only', async () => {
  const { coordinator } = harness();
  await assert.rejects(
    () => coordinator.dispatchToAdapter('task_alpha01', {
      adapter_name: 'openclaw-gateway',
      principal: invokeOnlyPrincipal,
      payload: buildOpenClawChannelInboundFixture({
        message: { kind: 'command', text: 'openclaw_task cancel native_session_abc', normalized_text: 'openclaw_task cancel native_session_abc' },
      }),
    }),
    (error) => {
      assert.equal(error instanceof OpenClawGatewayAdapterError || error instanceof OpenClawCommandMappingError, true);
      assert.match(error.code, /^PLATFORM_/);
      assert.doesNotMatch(JSON.stringify(error.details), /http|native_session_abc|openclaw_task/i);
      return true;
    },
  );
});
