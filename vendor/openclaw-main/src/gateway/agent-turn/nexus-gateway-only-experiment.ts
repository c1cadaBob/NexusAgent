import { normalizeOptionalString } from "@openclaw/normalization-core/string-coerce";
import type { AgentRunRequest } from "../server-methods/agent-request-types.js";
import type { AgentTurnIo } from "./types.js";

export const NEXUS_OPENCLAW_GATEWAY_ONLY_ENV = "NEXUS_OPENCLAW_GATEWAY_ONLY";

export const NEXUS_GATEWAY_ONLY_NATIVE_AGENT_BLOCKED_MESSAGE =
  "NexusAgent gateway-only experiment blocks native Agent execution";

export const NEXUS_GATEWAY_ONLY_NATIVE_TOOL_BLOCKED_MESSAGE =
  "NexusAgent gateway-only experiment blocks native tool execution";

export type NexusPlatformTaskRequest = {
  conversation_id: string;
  input: string;
  budget?: {
    deadline_ms?: number;
  };
};

export type NexusGatewayOnlyHandoffPayload = {
  runId: string;
  status: "handoff";
  taskRequest: NexusPlatformTaskRequest;
};

export function isNexusOpenClawGatewayOnlyExperimentEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env[NEXUS_OPENCLAW_GATEWAY_ONLY_ENV] === "1";
}

function normalizeTaskRequestText(value: unknown): string | undefined {
  return normalizeOptionalString(value)?.trim() || undefined;
}

export function buildNexusGatewayOnlyTaskRequest(params: {
  request: Pick<AgentRunRequest, "message" | "sessionId" | "sessionKey" | "timeout">;
  runId: string;
  resolvedSessionKey?: string;
  resolvedSessionId?: string;
  message?: string;
  effectiveTranscriptInputText?: string;
}): NexusPlatformTaskRequest {
  const conversationId =
    normalizeTaskRequestText(params.resolvedSessionKey) ??
    normalizeTaskRequestText(params.resolvedSessionId) ??
    normalizeTaskRequestText(params.request.sessionKey) ??
    normalizeTaskRequestText(params.request.sessionId) ??
    normalizeTaskRequestText(params.runId) ??
    "nexus-gateway-only-unresolved-conversation";
  const input =
    normalizeTaskRequestText(params.effectiveTranscriptInputText) ??
    normalizeTaskRequestText(params.message) ??
    normalizeTaskRequestText(params.request.message) ??
    "empty input";
  const deadlineMs =
    typeof params.request.timeout === "number" && Number.isFinite(params.request.timeout)
      ? Math.max(1, Math.floor(params.request.timeout * 1000))
      : undefined;

  return {
    conversation_id: conversationId,
    input,
    ...(deadlineMs !== undefined ? { budget: { deadline_ms: deadlineMs } } : {}),
  };
}

export function buildNexusGatewayOnlyHandoffPayload(params: {
  request: Pick<AgentRunRequest, "message" | "sessionId" | "sessionKey" | "timeout">;
  runId: string;
  resolvedSessionKey?: string;
  resolvedSessionId?: string;
  message?: string;
  effectiveTranscriptInputText?: string;
}): NexusGatewayOnlyHandoffPayload {
  return {
    runId: params.runId,
    status: "handoff",
    taskRequest: buildNexusGatewayOnlyTaskRequest(params),
  };
}

export function emitNexusGatewayOnlyTaskRequestHandoff(params: {
  io: AgentTurnIo;
  request: Pick<AgentRunRequest, "message" | "sessionId" | "sessionKey" | "timeout">;
  runId: string;
  resolvedSessionKey?: string;
  resolvedSessionId?: string;
  message?: string;
  effectiveTranscriptInputText?: string;
}): NexusGatewayOnlyHandoffPayload {
  const payload = buildNexusGatewayOnlyHandoffPayload(params);
  const meta = { runId: params.runId, nexusGatewayOnly: true };
  params.io.emitAcceptance([true, payload, undefined], meta);
  params.io.emitFinal([true, payload, undefined], meta);
  return payload;
}
