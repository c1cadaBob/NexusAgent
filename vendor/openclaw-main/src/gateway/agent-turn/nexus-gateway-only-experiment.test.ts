import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorCodes } from "../../../packages/gateway-protocol/src/index.js";
import { dispatchAgentRunFromGateway } from "./agent-run-dispatch.js";
import {
  buildNexusGatewayOnlyTaskRequest,
  emitNexusGatewayOnlyTaskRequestHandoff,
  isNexusOpenClawGatewayOnlyExperimentEnabled,
  NEXUS_GATEWAY_ONLY_NATIVE_AGENT_BLOCKED_MESSAGE,
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
