import type { CoordinatorTaskCommand, CoordinatorTaskCommandRequest } from "../../coordinator/index.ts";
import {
  assertMonotonicMs,
  assertPlatformId,
  assertUtcTimestamp,
} from "../../task-state/index.ts";

export const OPENCLAW_COMMAND_MAPPING_SCHEMA_VERSION = "nexus.openclaw_command_mapping.p4.v1";

export interface OpenClawCommandMappingInbound {
  tenant_id: string;
  user_id: string;
  agent_id: string;
  task_id: string;
  attempt_id: string;
  execution_id: string;
  conversation_id: string;
  trace_id: string;
  requested_at_utc: string;
  monotonic_ms: number;
  channel: {
    capability_id: string;
    name: string;
    direction: "inbound";
    account_ref: string;
    conversation_ref: string;
    message_id: string;
  };
  message: {
    kind: "text" | "command" | "event";
    text: string;
    normalized_text?: string;
  };
}

export interface OpenClawCommandMapping {
  schema_version: typeof OPENCLAW_COMMAND_MAPPING_SCHEMA_VERSION;
  command: CoordinatorTaskCommand;
  normalized_command: string;
  original_text: string;
  idempotency_key: string;
  task_command: CoordinatorTaskCommandRequest;
  native_agent_runtime: "blocked";
  native_tool_runtime: "blocked";
  native_memory_runtime: "blocked";
}

export class OpenClawCommandMappingError extends Error {
  readonly code:
    | "PLATFORM_INVALID_REQUEST"
    | "PLATFORM_SCHEMA_VALIDATION_FAILED";
  readonly details: Record<string, unknown>;

  constructor(code: OpenClawCommandMappingError["code"], message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "OpenClawCommandMappingError";
    this.code = code;
    this.details = sanitizeCommandDetails(details);
  }
}

const COMMAND_TEXT: Record<CoordinatorTaskCommand, readonly string[]> = Object.freeze({
  continue_attempt: ["/continue", "continue", "继续", "继续执行"],
  redo_attempt: ["/redo", "/retry", "redo", "retry", "重做", "重试"],
  cancel_attempt: ["/cancel", "/stop", "cancel", "stop", "取消", "停止"],
});

const COMMAND_BY_TEXT = new Map<string, CoordinatorTaskCommand>(
  Object.entries(COMMAND_TEXT).flatMap(([command, values]) => values.map((value) => [value, command as CoordinatorTaskCommand])),
);

export function normalizeOpenClawCommandText(text: string): string {
  return text.normalize("NFKC").trim().toLowerCase();
}

export function parseOpenClawCommandText(text: string): CoordinatorTaskCommand | null {
  const normalized = normalizeOpenClawCommandText(text);
  const command = COMMAND_BY_TEXT.get(normalized);
  if (command) return command;
  if (normalized.startsWith("/")) {
    throw new OpenClawCommandMappingError("PLATFORM_INVALID_REQUEST", "Unsupported gateway command", {
      normalized_command: normalized,
    });
  }
  return null;
}

export function buildOpenClawCommandMapping(inbound: OpenClawCommandMappingInbound): OpenClawCommandMapping | null {
  assertNoNativeCommandPayload(inbound);
  assertCommandInboundShape(inbound);
  const text = inbound.message.normalized_text ?? inbound.message.text;
  const command = parseOpenClawCommandText(text);
  if (!command) return null;

  const normalizedCommand = normalizeOpenClawCommandText(text);
  const idempotencyKey = buildOpenClawCommandIdempotencyKey(inbound, command);
  const taskCommand: CoordinatorTaskCommandRequest = {
    schema_version: "nexus.task_command.p4.v1",
    tenant_id: inbound.tenant_id,
    user_id: inbound.user_id,
    agent_id: inbound.agent_id,
    task_id: inbound.task_id,
    attempt_id: inbound.attempt_id,
    ...(command === "redo_attempt" ? { next_attempt_id: deriveRedoAttemptId(inbound.channel.message_id) } : {}),
    execution_id: inbound.execution_id,
    conversation_id: inbound.conversation_id,
    trace_id: inbound.trace_id,
    command,
    requested_at_utc: inbound.requested_at_utc,
    monotonic_ms: inbound.monotonic_ms,
    idempotency_key: idempotencyKey,
    reason: `approved channel command ${command}`,
    source: {
      kind: "channel",
      adapter_name: "openclaw-gateway",
      channel_name: inbound.channel.name,
      channel_capability_id: inbound.channel.capability_id,
      message_id: inbound.channel.message_id,
      account_ref: inbound.channel.account_ref,
      conversation_ref: inbound.channel.conversation_ref,
    },
  };

  return {
    schema_version: OPENCLAW_COMMAND_MAPPING_SCHEMA_VERSION,
    command,
    normalized_command: normalizedCommand,
    original_text: inbound.message.text,
    idempotency_key: idempotencyKey,
    task_command: taskCommand,
    native_agent_runtime: "blocked",
    native_tool_runtime: "blocked",
    native_memory_runtime: "blocked",
  };
}

export function buildOpenClawCommandIdempotencyKey(
  inbound: Pick<OpenClawCommandMappingInbound, "tenant_id" | "task_id" | "conversation_id" | "channel">,
  command: CoordinatorTaskCommand,
): string {
  const parts = [
    "idem",
    "openclaw",
    command.replace("_attempt", ""),
    safeIdPart(inbound.tenant_id),
    safeIdPart(inbound.task_id),
    safeIdPart(inbound.conversation_id),
    safeIdPart(inbound.channel.message_id),
  ];
  return parts.join("_").slice(0, 192);
}

function deriveRedoAttemptId(messageId: string): string {
  return `attempt_redo_${safeIdPart(messageId.replace(/^msg_/, ""))}`.slice(0, 127);
}

function assertCommandInboundShape(inbound: OpenClawCommandMappingInbound): void {
  for (const key of [
    "tenant_id",
    "user_id",
    "agent_id",
    "task_id",
    "attempt_id",
    "execution_id",
    "conversation_id",
    "trace_id",
  ] as const) {
    try {
      assertPlatformId(key, inbound[key]);
    } catch {
      throw new OpenClawCommandMappingError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Gateway command platform identity is invalid", {
        field: key,
      });
    }
  }
  try {
    assertUtcTimestamp(inbound.requested_at_utc, "command_mapping.requested_at_utc");
    assertMonotonicMs(inbound.monotonic_ms, "command_mapping.monotonic_ms");
  } catch {
    throw new OpenClawCommandMappingError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Gateway command time metadata is invalid");
  }
  if (inbound.channel.direction !== "inbound") {
    throw new OpenClawCommandMappingError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Gateway command requires inbound channel direction", {
      direction: inbound.channel.direction,
    });
  }
  requireCommandPattern(inbound.channel.capability_id, "channel.capability_id", /^cap_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/);
  requireCommandPattern(inbound.channel.name, "channel.name", /^[A-Za-z][A-Za-z0-9_-]{2,63}$/);
  requireCommandPattern(inbound.channel.account_ref, "channel.account_ref", /^channel_account_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/);
  requireCommandPattern(inbound.channel.conversation_ref, "channel.conversation_ref", /^channel_conversation_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/);
  requireCommandPattern(inbound.channel.message_id, "channel.message_id", /^msg_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/);
  if (!["text", "command", "event"].includes(inbound.message.kind)) {
    throw new OpenClawCommandMappingError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Gateway command message kind is invalid", {
      kind: inbound.message.kind,
    });
  }
}

function requireCommandPattern(value: unknown, field: string, pattern: RegExp): void {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new OpenClawCommandMappingError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Gateway command field is invalid", { field });
  }
}

function safeIdPart(value: string): string {
  return value.replace(/^[a-z]+_/, "").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 48) || "message";
}

function assertNoNativeCommandPayload(value: unknown): void {
  const forbiddenKeys = /^(?:credential_material|raw_credential|api_key|password|token|secret|env|environment|native_session_id|native_error|native_error_code|native_path|native_url|base_url|endpoint|file_path|path|url|session_id|memory_path|tool_name|agent_command|plugin_subagent|native_agent|native_tool|native_memory|raw_manifest|native_manifest|manifest|openclaw_agent|openclaw_task|openclaw_cancel)$/i;
  const forbiddenStrings = /MEMORY\.md|USER\.md|SKILL\.md|(?:https?|wss?|ftp):\/\/|\.\.\/|\/(?:tmp|var|workspace|opt|etc|home|usr)\/|\b(?:native_session[A-Za-z0-9_-]*|native_error[A-Za-z0-9_-]*|raw_credential|credential_material|api[_-]?key|password|secret[-_ ]?token|bearer\s+[A-Za-z0-9._-]+|openclaw[_-]?(?:agent|task|cancel))\b/i;
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item);
      return;
    }
    if (candidate && typeof candidate === "object") {
      for (const [key, item] of Object.entries(candidate)) {
        if (forbiddenKeys.test(key)) {
          throw new OpenClawCommandMappingError("PLATFORM_INVALID_REQUEST", "Gateway command payload contains non-platform field", {
            field: key,
          });
        }
        visit(item);
      }
      return;
    }
    if (typeof candidate === "string" && forbiddenStrings.test(candidate)) {
      throw new OpenClawCommandMappingError("PLATFORM_INVALID_REQUEST", "Gateway command payload contains non-platform marker");
    }
  };
  visit(value);
}

function sanitizeCommandDetails(value: Record<string, unknown>): Record<string, unknown> {
  const raw = JSON.stringify(value, (_key, item) => {
    if (typeof item === "string") {
      return item
        .replace(/(?:https?|wss?|ftp):\/\/\S+/gi, "[redacted-url]")
        .replace(/\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+/gi, "[redacted-path]")
        .replace(/MEMORY\.md|USER\.md|SKILL\.md/gi, "[redacted-native-file]")
        .replace(/\b(?:native_session_id|native_session|native_error|native_path|native_url|credential_material|raw_credential|api_key|password|token|session_id|file_path|path|url|raw_manifest|native_manifest)\b/gi, "[redacted-field]");
    }
    return item;
  });
  return JSON.parse(raw) as Record<string, unknown>;
}
