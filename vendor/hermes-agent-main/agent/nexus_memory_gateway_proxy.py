"""NexusAgent Memory Gateway proxy fixture for Hermes planner-only mode.

The real cross-process Memory Gateway transport is intentionally out of scope
for P3-02.  This module gives the vendor snapshot a platform-shaped, injectable
proxy boundary so planner-only memory reads and writes no longer touch
``MEMORY.md`` / ``USER.md`` files while tests can prove fail-closed behavior.
"""

from __future__ import annotations

import json
import os
import re
from collections.abc import Callable, Mapping
from typing import Any, Dict, Optional

HERMES_MEMORY_PROXY_SCHEMA_VERSION = "nexus.hermes_memory_proxy.p3.v1"
HERMES_MEMORY_SNAPSHOT_SCHEMA_VERSION = "nexus.memory_snapshot.p3.v1"
NEXUS_HERMES_MEMORY_SCOPE_ENV = "NEXUS_HERMES_MEMORY_SCOPE_JSON"
NEXUS_HERMES_MEMORY_SNAPSHOT_ENV = "NEXUS_HERMES_MEMORY_SNAPSHOT_JSON"
MEMORY_GATEWAY_SCOPE_REQUIRED_CODE = "NEXUS_HERMES_MEMORY_GATEWAY_SCOPE_REQUIRED"
MEMORY_GATEWAY_UNAVAILABLE_CODE = "NEXUS_HERMES_MEMORY_GATEWAY_UNAVAILABLE"
MEMORY_GATEWAY_INVALID_RESPONSE_CODE = "NEXUS_HERMES_MEMORY_GATEWAY_INVALID_RESPONSE"

_PLATFORM_ID_PATTERNS = {
    "tenant_id": re.compile(r"^tenant_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$"),
    "user_id": re.compile(r"^user_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$"),
    "agent_id": re.compile(r"^agent_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$"),
    "conversation_id": re.compile(r"^conv_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$"),
    "trace_id": re.compile(r"^trace_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$"),
}

_FORBIDDEN_TEXT = re.compile(
    r"MEMORY\.md|USER\.md|https?://|/(?:tmp|var|workspace|opt)/|native_session|native_error|"
    r"credential_material|raw_credential|api[_-]?key|password|secret-token|secret_value|BEGIN (?:RSA|OPENSSH|PRIVATE) KEY",
    re.IGNORECASE,
)

_TEST_PROXY: Optional[Callable[[Dict[str, Any]], Dict[str, Any]]] = None


class MemoryGatewayProxyError(RuntimeError):
    """Fail-closed platform proxy error with a stable NexusAgent code."""

    def __init__(self, code: str, message: str, *, details: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.code = code
        self.details = details or {}

    def as_result(self, action: str = "unknown", target: str = "memory") -> Dict[str, Any]:
        return {
            "success": False,
            "code": self.code,
            "error": str(self),
            "action": action,
            "target": target,
        }


def set_test_memory_gateway_proxy(proxy: Optional[Callable[[Dict[str, Any]], Dict[str, Any]]]) -> None:
    """Install an in-process platform proxy fixture for vendor tests."""

    global _TEST_PROXY
    _TEST_PROXY = proxy


def clear_test_memory_gateway_proxy() -> None:
    set_test_memory_gateway_proxy(None)


def load_memory_gateway_snapshot(*, trace_id: Optional[str] = None) -> Dict[str, Any]:
    """Return a sanitized platform Memory Gateway snapshot or fail closed."""

    request = _base_request("snapshot", trace_id=trace_id)
    response = _invoke_proxy(request)
    return _normalize_snapshot(response)


def write_memory_gateway(
    *,
    action: str,
    target: str,
    content: Optional[str] = None,
    old_text: Optional[str] = None,
    operations: Optional[list[dict[str, Any]]] = None,
    trace_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Apply a platform-governed memory write through the injected proxy."""

    request = _base_request("write", trace_id=trace_id)
    request.update(
        {
            "target": target,
            "action": "batch" if action == "batch" else action,
            "content": content,
            "old_text": old_text,
            "operations": operations,
        }
    )
    response = _invoke_proxy(request)
    if not isinstance(response, Mapping) or response.get("operation") != "write":
        raise MemoryGatewayProxyError(
            MEMORY_GATEWAY_INVALID_RESPONSE_CODE,
            "Memory Gateway proxy returned an invalid write response.",
        )
    return {
        "success": True,
        "message": "Memory write proxied through NexusAgent Memory Gateway.",
        "action": action,
        "target": target,
        "proxy_schema_version": HERMES_MEMORY_PROXY_SCHEMA_VERSION,
        "memory_ref": _safe_mapping(response.get("memory_ref")),
    }


def fail_closed_memory_gateway_result(action: str, target: str, error: Exception) -> Dict[str, Any]:
    if isinstance(error, MemoryGatewayProxyError):
        return error.as_result(action, target)
    return {
        "success": False,
        "code": MEMORY_GATEWAY_UNAVAILABLE_CODE,
        "error": "Memory Gateway proxy failed closed before touching native memory files.",
        "action": action,
        "target": target,
    }


def _base_request(operation: str, *, trace_id: Optional[str]) -> Dict[str, Any]:
    scope = _platform_scope()
    resolved_trace_id = trace_id or str(scope.get("trace_id") or os.environ.get("NEXUS_TRACE_ID", "trace_memoryproxy01"))
    _assert_platform_id("trace_id", resolved_trace_id)
    return {
        "schema_version": HERMES_MEMORY_PROXY_SCHEMA_VERSION,
        "operation": operation,
        "scope": {key: scope[key] for key in ("tenant_id", "user_id", "agent_id", "conversation_id")},
        "trace_id": resolved_trace_id,
    }


def _platform_scope() -> Dict[str, Any]:
    raw = os.environ.get(NEXUS_HERMES_MEMORY_SCOPE_ENV)
    if not raw:
        raise MemoryGatewayProxyError(
            MEMORY_GATEWAY_SCOPE_REQUIRED_CODE,
            "Hermes planner-only memory requires a NexusAgent Memory Gateway scope.",
        )
    try:
        scope = json.loads(raw)
    except Exception as exc:  # pragma: no cover - exact parser message is not stable
        raise MemoryGatewayProxyError(MEMORY_GATEWAY_SCOPE_REQUIRED_CODE, "Memory Gateway scope is not valid JSON.") from exc
    if not isinstance(scope, Mapping):
        raise MemoryGatewayProxyError(MEMORY_GATEWAY_SCOPE_REQUIRED_CODE, "Memory Gateway scope must be an object.")
    for key in ("tenant_id", "user_id", "agent_id", "conversation_id"):
        _assert_platform_id(key, scope.get(key))
    if scope.get("trace_id") is not None:
        _assert_platform_id("trace_id", scope.get("trace_id"))
    return dict(scope)


def _invoke_proxy(request: Dict[str, Any]) -> Dict[str, Any]:
    if _TEST_PROXY is not None:
        return _TEST_PROXY(_scrub_request(request))

    if request["operation"] == "snapshot" and os.environ.get(NEXUS_HERMES_MEMORY_SNAPSHOT_ENV):
        try:
            return json.loads(os.environ[NEXUS_HERMES_MEMORY_SNAPSHOT_ENV])
        except Exception as exc:  # pragma: no cover - exact parser message is not stable
            raise MemoryGatewayProxyError(MEMORY_GATEWAY_INVALID_RESPONSE_CODE, "Memory Gateway snapshot fixture is invalid JSON.") from exc

    raise MemoryGatewayProxyError(
        MEMORY_GATEWAY_UNAVAILABLE_CODE,
        "No NexusAgent Memory Gateway proxy is available for Hermes planner-only memory.",
    )


def _normalize_snapshot(response: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(response, Mapping) or response.get("schema_version") != HERMES_MEMORY_SNAPSHOT_SCHEMA_VERSION:
        raise MemoryGatewayProxyError(
            MEMORY_GATEWAY_INVALID_RESPONSE_CODE,
            "Memory Gateway proxy returned an invalid snapshot response.",
        )
    rendered = _safe_mapping(response.get("rendered"))
    records = response.get("records") if isinstance(response.get("records"), list) else []
    normalized_records = []
    for record in records:
        if not isinstance(record, Mapping):
            continue
        text = _sanitize_text(str(record.get("text") or ""))
        normalized_records.append(
            {
                "layer": str(record.get("layer") or "session"),
                "text": text,
                "sanitized": bool(record.get("sanitized")) or text.startswith("[BLOCKED:"),
            }
        )
    return {
        "schema_version": HERMES_MEMORY_SNAPSHOT_SCHEMA_VERSION,
        "rendered": {
            "session": _sanitize_text(str(rendered.get("session") or "")),
            "user": _sanitize_text(str(rendered.get("user") or "")),
            "agent_skill": _sanitize_text(str(rendered.get("agent_skill") or "")),
        },
        "records": normalized_records,
        "version": int(response.get("version") or 0),
    }


def _sanitize_text(text: str) -> str:
    if _FORBIDDEN_TEXT.search(text or ""):
        return "[BLOCKED: memory entry contained unsafe or non-platform content. Removed from planner snapshot.]"
    return text


def _scrub_request(request: Dict[str, Any]) -> Dict[str, Any]:
    return json.loads(json.dumps(request, ensure_ascii=False))


def _safe_mapping(value: Any) -> Dict[str, Any]:
    return dict(value) if isinstance(value, Mapping) else {}


def _assert_platform_id(key: str, value: Any) -> None:
    pattern = _PLATFORM_ID_PATTERNS[key]
    if not isinstance(value, str) or not pattern.match(value):
        raise MemoryGatewayProxyError(
            MEMORY_GATEWAY_SCOPE_REQUIRED_CODE,
            f"Memory Gateway scope has invalid {key}.",
            details={key: value},
        )
