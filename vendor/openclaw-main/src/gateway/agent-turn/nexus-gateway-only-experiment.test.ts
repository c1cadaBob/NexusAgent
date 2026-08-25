import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorCodes } from "../../../packages/gateway-protocol/src/index.js";
import { dispatchAgentRunFromGateway } from "./agent-run-dispatch.js";
import {
  assertNexusGatewayOnlyNoNativePayload,
  assertNexusGatewayOnlyPlatformContext,
  buildNexusGatewayOnlyPlatformMessageEvent,
  buildNexusGatewayOnlyTaskRequest,
  emitNexusGatewayOnlyTaskRequestHandoff,
  isNexusOpenClawGatewayOnlyExperimentEnabled,
  NEXUS_GATEWAY_ONLY_NATIVE_AGENT_BLOCKED_MESSAGE,
  NEXUS_GATEWAY_ONLY_NATIVE_PAYLOAD_BLOCKED_MESSAGE,
  NEXUS_GATEWAY_ONLY_PLATFORM_CONTEXT_REQUIRED_MESSAGE,
  NEXUS_OPENCLAW_GATEWAY_EVENT_SCHEMA_VERSION,
  NEXUS_OPENCLAW_GATEWAY_ONLY_ENV,
} from "./nexus-gateway-only-experiment.js";

const agentCommandFromGatewayIngress = vi.hoisted(() => vi.fn());

vi.mock("../../commands/agent.js", () => ({
  agentCommandFromGatewayIngress,
}));

vi.mock("../../runtime.js", () => ({
  defaultRuntime: {},
}));

describe("NexusAgent OpenClaw gateway-only experiment", () => {
  const originalExperimentFlag = process.env[NEXUS_OPENCLAW_GATEWAY_ONLY_ENV];

  afterEach(() => {
    if (originalExperimentFlag === undefined) {
      delete process.env[NEXUS_OPENCLAW_GATEWAY_ONLY_ENV];
    } else {
      process.env[NEXUS_OPENCLAW_GATEWAY_ONLY_ENV] = originalExperimentFlag;
    }
    vi.clearAllMocks();
  });

  it("is opt-in through NEXUS_OPENCLAW_GATEWAY_ONLY=1", () => {
    delete process.env[NEXUS_OPENCLAW_GATEWAY_ONLY_ENV];
    expect(isNexusOpenClawGatewayOnlyExperimentEnabled()).toBe(false);

    process.env[NEXUS_OPENCLAW_GATEWAY_ONLY_ENV] = "0";
    expect(isNexusOpenClawGatewayOnlyExperimentEnabled()).toBe(false);

    process.env[NEXUS_OPENCLAW_GATEWAY_ONLY_ENV] = "1";
    expect(isNexusOpenClawGatewayOnlyExperimentEnabled()).toBe(true);
  });

  it("projects gateway input into the platform TaskRequest shape", () => {
    expect(
      buildNexusGatewayOnlyTaskRequest({
        request: {
          message: " original request ",
          sessionKey: "agent:main:main",
          timeout: 12.9,
        },
        runId: "run-1",
        resolvedSessionKey: " agent:main:telegram:direct:peer ",
        message: " prepared message ",
        effectiveTranscriptInputText: " transcript text ",
      }),
    ).toEqual({
      conversation_id: "agent:main:telegram:direct:peer",
      input: "transcript text",
      budget: { deadline_ms: 12900 },
    });
  });

  it("builds a P4 platform gateway event only with platform Coordinator context", () => {
    const platformContext = {
      tenant_id: "tenant_alpha01",
      user_id: "user_alpha01",
      agent_id: "agent_alpha01",
      task_id: "task_alpha01",
      attempt_id: "attempt_alpha01",
      execution_id: "exec_alpha01",
      conversation_id: "conv_alpha01",
      trace_id: "trace_alpha01",
    };

    expect(assertNexusGatewayOnlyPlatformContext(platformContext)).toBeUndefined();
    expect(
      buildNexusGatewayOnlyPlatformMessageEvent({
        platformContext,
        channel: {
          capability_id: "cap_channel_dingtalk",
          name: "dingtalk",
          direction: "inbound",
          account_ref: "channel_account_dingtalk_alpha",
          conversation_ref: "channel_conversation_alpha",
          message_id: "msg_alpha01",
        },
        message: { kind: "text", text: "hello platform" },
      }),
    ).toMatchObject({
      schema_version: NEXUS_OPENCLAW_GATEWAY_EVENT_SCHEMA_VERSION,
      event_type: "channel.message",
      tenant_id: "tenant_alpha01",
      handoff: {
        mode: "task_request",
        coordinator_required: true,
        policy_gate_required: true,
        native_agent_runtime: "blocked",
        native_tool_runtime: "blocked",
        native_memory_runtime: "blocked",
        plugin_runtime: "plugin_bridge_allowlist_required",
      },
    });
  });

  it("fails closed for missing platform context and native-like payload markers", () => {
    expect(() => assertNexusGatewayOnlyPlatformContext({ tenant_id: "tenant_alpha01" })).toThrow(
      NEXUS_GATEWAY_ONLY_PLATFORM_CONTEXT_REQUIRED_MESSAGE,
    );
    expect(() => assertNexusGatewayOnlyNoNativePayload({ native_session_id: "native_session_abc" })).toThrow(
      NEXUS_GATEWAY_ONLY_NATIVE_PAYLOAD_BLOCKED_MESSAGE,
    );
    expect(() =>
      buildNexusGatewayOnlyTaskRequest({
        request: { message: "hello", sessionKey: "main", native_url: "http://127.0.0.1:3052/tools/invoke" } as never,
        runId: "run-native-payload",
      }),
    ).toThrow(NEXUS_GATEWAY_ONLY_NATIVE_PAYLOAD_BLOCKED_MESSAGE);
  });

  it("emits an acceptance and final handoff instead of continuing native execution", () => {
    const io = { emitAcceptance: vi.fn(), emitFinal: vi.fn() };

    const payload = emitNexusGatewayOnlyTaskRequestHandoff({
      io,
      request: { message: "hello", sessionKey: "main" },
      runId: "run-handoff",
    });

    expect(payload).toEqual({
      runId: "run-handoff",
      status: "handoff",
      taskRequest: { conversation_id: "main", input: "hello" },
    });
    expect(io.emitAcceptance).toHaveBeenCalledWith([true, payload, undefined], {
      runId: "run-handoff",
      nexusGatewayOnly: true,
    });
    expect(io.emitFinal).toHaveBeenCalledWith([true, payload, undefined], {
      runId: "run-handoff",
      nexusGatewayOnly: true,
    });
  });

  it("blocks dispatch and does not call the native Agent command", () => {
    process.env[NEXUS_OPENCLAW_GATEWAY_ONLY_ENV] = "1";
    const cleanupAbortController = vi.fn();
    const io = { emitAcceptance: vi.fn(), emitFinal: vi.fn() };

    dispatchAgentRunFromGateway({
      ingressOpts: { lifecycleGeneration: "generation-1" } as never,
      runId: "run-blocked",
      dedupeKeys: [],
      abortController: new AbortController(),
      cleanupAbortController,
      io,
      context: { dedupe: new Map() } as never,
      taskTrackingMode: "none",
    });

    expect(agentCommandFromGatewayIngress).not.toHaveBeenCalled();
    expect(cleanupAbortController).toHaveBeenCalledTimes(1);
    expect(io.emitFinal).toHaveBeenCalledWith(
      [
        false,
        {
          runId: "run-blocked",
          status: "error",
          summary: NEXUS_GATEWAY_ONLY_NATIVE_AGENT_BLOCKED_MESSAGE,
        },
        expect.objectContaining({
          code: ErrorCodes.UNAVAILABLE,
          message: NEXUS_GATEWAY_ONLY_NATIVE_AGENT_BLOCKED_MESSAGE,
        }),
      ],
      {
        runId: "run-blocked",
        error: NEXUS_GATEWAY_ONLY_NATIVE_AGENT_BLOCKED_MESSAGE,
        nexusGatewayOnly: true,
      },
    );
  });
});
