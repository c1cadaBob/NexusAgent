const BLOCKED_KEY_PATTERN = /^(?:credential_material|raw_credential|api_key|password|token|secret|env|environment|native_session_id|native_error|native_error_code|native_path|native_url|base_url|endpoint|file_path|path|url|session_id|memory_path|tool_name|agent_command|plugin_subagent|native_agent|native_tool|native_memory|raw_manifest|native_manifest|manifest|provider_agent|provider_task|provider_cancel|provider_binding|runtime)$/i;
const BLOCKED_STRING_PATTERN = /Hermes|OpenClaw|DeepSeek|\bDSH\b|MEMORY\.md|USER\.md|SKILL\.md|(?:https?|wss?|ftp):\/\/|\.\.\/|\/(?:tmp|var|workspace|opt|etc|home|usr)\/|\b(?:native_session[A-Za-z0-9_-]*|native_error[A-Za-z0-9_-]*|raw_credential|credential_material|api[_-]?key|password|secret[-_ ]?token|bearer\s+[A-Za-z0-9._-]+|provider[_-]?(?:agent|task|cancel))\b/i;

export class PublicSurfaceError extends Error {
  readonly code: "PLATFORM_INVALID_REQUEST";
  readonly details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "PublicSurfaceError";
    this.code = "PLATFORM_INVALID_REQUEST";
    this.details = sanitizePublicDetails(details);
  }
}

export function assertPublicRequestPayload(value: unknown): void {
  visitPublicValue(value, "request");
}

export function assertPublicResponsePayload(value: unknown): void {
  visitPublicValue(value, "response");
}

export function sanitizePublicDetails(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value, (_key, item) => {
    if (typeof item !== "string") return item;
    return item
      .replace(/Hermes|OpenClaw|DeepSeek|\bDSH\b/gi, "[redacted-component]")
      .replace(/(?:https?|wss?|ftp):\/\/\S+/gi, "[redacted-url]")
      .replace(/\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+/gi, "[redacted-path]")
      .replace(/MEMORY\.md|USER\.md|SKILL\.md/gi, "[redacted-file]")
      .replace(/\b(?:native_session_id|native_session|native_error|native_path|native_url|credential_material|raw_credential|api_key|password|token|session_id|file_path|path|url|provider_agent|provider_task|provider_cancel|provider_binding|runtime)\b/gi, "[redacted-field]");
  })) as Record<string, unknown>;
}

function visitPublicValue(value: unknown, location: "request" | "response"): void {
  if (Array.isArray(value)) {
    for (const item of value) visitPublicValue(item, location);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (BLOCKED_KEY_PATTERN.test(key)) {
        throw new PublicSurfaceError("Payload contains a non-platform field", { location, field: key });
      }
      visitPublicValue(item, location);
    }
    return;
  }
  if (typeof value === "string" && BLOCKED_STRING_PATTERN.test(value)) {
    throw new PublicSurfaceError("Payload contains a non-platform marker", { location });
  }
}
