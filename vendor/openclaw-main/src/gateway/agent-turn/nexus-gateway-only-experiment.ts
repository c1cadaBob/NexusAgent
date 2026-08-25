import { normalizeOptionalString } from "@openclaw/normalization-core/string-coerce";
import type { AgentRunRequest } from "../server-methods/agent-request-types.js";
import type { AgentTurnIo } from "./types.js";

export const NEXUS_OPENCLAW_GATEWAY_ONLY_ENV = "NEXUS_OPENCLAW_GATEWAY_ONLY";
export const NEXUS_OPENCLAW_GATEWAY_EVENT_SCHEMA_VERSION = "nexus.openclaw_gateway_event.p4.v1";

export const NEXUS_GATEWAY_ONLY_NATIVE_AGENT_BLOCKED_MESSAGE =
  "NexusAgent gateway-only experiment blocks native Agent execution";

export const NEXUS_GATEWAY_ONLY_NATIVE_TOOL_BLOCKED_MESSAGE =
  "NexusAgent gateway-only experiment blocks native tool execution";

export const NEXUS_GATEWAY_ONLY_NATIVE_PAYLOAD_BLOCKED_MESSAGE =
  "NexusAgent gateway-only mode blocks native gateway payload fields";

export const NEXUS_GATEWAY_ONLY_PLATFORM_CONTEXT_REQUIRED_MESSAGE =
  "NexusAgent gateway-only mode requires platform Coordinator context";

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

export type NexusGatewayOnlyPlatformContext = {
  tenant_id: string;
  user_id: string;
  agent_id: string;
  task_id: string;
  attempt_id: string;
  execution_id: string;
  conversation_id: string;
  trace_id: string;
};

export type NexusGatewayOnlyPlatformMessageEvent = {
  schema_version: typeof NEXUS_OPENCLAW_GATEWAY_EVENT_SCHEMA_VERSION;
  tenant_id: string;
  user_id: string;
  agent_id: string;
  task_id: string;
  attempt_id: string;
  execution_id: string;
  conversation_id: string;
  trace_id: string;
  event_type: "channel.message";
  channel: {
    capability_id: string;
    name: "dingtalk" | "feishu" | "telegram";
    direction: "inbound";
    account_ref: string;
    conversation_ref: string;
    message_id: string;
  };
  message: {
    kind: "text" | "command" | "event";
    text: string;
  };
  handoff: {
    mode: "task_request";
    adapter_kind: "channel";
    coordinator_required: true;
    policy_gate_required: true;
    native_agent_runtime: "blocked";
    native_tool_runtime: "blocked";
    native_memory_runtime: "blocked";
    plugin_runtime: "plugin_bridge_allowlist_required";
  };
};

export function isNexusOpenClawGatewayOnlyExperimentEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env[NEXUS_OPENCLAW_GATEWAY_ONLY_ENV] === "1";
}

export function assertNexusGatewayOnlyPlatformContext(
  context: unknown,
): asserts context is NexusGatewayOnlyPlatformContext {
  if (!context || typeof context !== "object") {
    throw new Error(NEXUS_GATEWAY_ONLY_PLATFORM_CONTEXT_REQUIRED_MESSAGE);
  }
  const candidate = context as Record<string, unknown>;
  const patterns: Record<keyof NexusGatewayOnlyPlatformContext, RegExp> = {
    tenant_id: /^tenant_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/,
    user_id: /^user_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/,
    agent_id: /^agent_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/,
    task_id: /^task_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/,
    attempt_id: /^attempt_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/,
    execution_id: /^exec_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/,
    conversation_id: /^conv_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/,
    trace_id: /^trace_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/,
  };
  for (const [key, pattern] of Object.entries(patterns)) {
    const value = candidate[key];
    if (typeof value !== "string" || !pattern.test(value)) {
      throw new Error(NEXUS_GATEWAY_ONLY_PLATFORM_CONTEXT_REQUIRED_MESSAGE);
    }
  }
}

export function assertNexusGatewayOnlyNoNativePayload(value: unknown): void {
  const forbiddenKeys = /^(?:credential_material|raw_credential|api_key|password|token|secret|env|environment|native_session_id|native_error|native_error_code|native_path|native_url|base_url|endpoint|file_path|path|url|memory_path|tool_name|agent_command|plugin_subagent|native_agent|native_tool|native_memory)$/i;
  const forbiddenStrings = /MEMORY\.md|USER\.md|https?:\/\/|\.\.\/|\/(?:tmp|var|workspace|opt)\/|\b(?:native_session[A-Za-z0-9_-]*|native_error[A-Za-z0-9_-]*|raw_credential|credential_material|api[_-]?key|password|secret[-_ ]?token|bearer\s+[A-Za-z0-9._-]+)\b/i;
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item);
      return;
    }
    if (candidate && typeof candidate === "object") {
      for (const [key, item] of Object.entries(candidate)) {
        if (forbiddenKeys.test(key)) {
          throw new Error(NEXUS_GATEWAY_ONLY_NATIVE_PAYLOAD_BLOCKED_MESSAGE);
        }
        visit(item);
      }
      return;
    }
    if (typeof candidate === "string" && forbiddenStrings.test(candidate)) {
      throw new Error(NEXUS_GATEWAY_ONLY_NATIVE_PAYLOAD_BLOCKED_MESSAGE);
    }
  };
  visit(value);
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
  assertNexusGatewayOnlyNoNativePayload(params.request);
  assertNexusGatewayOnlyNoNativePayload({
    message: params.message,
    effectiveTranscriptInputText: params.effectiveTranscriptInputText,
  });
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

export function buildNexusGatewayOnlyPlatformMessageEvent(params: {
  platformContext: NexusGatewayOnlyPlatformContext;
  channel: NexusGatewayOnlyPlatformMessageEvent["channel"];
  message: NexusGatewayOnlyPlatformMessageEvent["message"];
}): NexusGatewayOnlyPlatformMessageEvent {
  assertNexusGatewayOnlyPlatformContext(params.platformContext);
  assertNexusGatewayOnlyNoNativePayload({ channel: params.channel, message: params.message });
  return {
    schema_version: NEXUS_OPENCLAW_GATEWAY_EVENT_SCHEMA_VERSION,
    ...params.platformContext,
    event_type: "channel.message",
    channel: {
      capability_id: params.channel.capability_id,
      name: params.channel.name,
      direction: "inbound",
      account_ref: params.channel.account_ref,
      conversation_ref: params.channel.conversation_ref,
      message_id: params.channel.message_id,
    },
    message: {
      kind: params.message.kind,
      text: params.message.text,
    },
    handoff: {
      mode: "task_request",
      adapter_kind: "channel",
      coordinator_required: true,
      policy_gate_required: true,
      native_agent_runtime: "blocked",
      native_tool_runtime: "blocked",
      native_memory_runtime: "blocked",
      plugin_runtime: "plugin_bridge_allowlist_required",
    },
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
