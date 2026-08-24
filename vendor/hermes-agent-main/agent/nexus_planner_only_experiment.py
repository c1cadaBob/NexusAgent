"""NexusAgent P0 Hermes planner-only experiment helpers.

This module is intentionally small and opt-in.  It lets the NexusAgent vendor
snapshot prove that Hermes can be reduced to a planning boundary without
executing native tools, native loop wakeups, or file-backed memory.  The P3
provider work will replace this experiment with a production adapter protocol.
"""

from __future__ import annotations

import json
import os
from collections.abc import Mapping
from typing import Any, Dict, List, Optional

NEXUS_HERMES_PLANNER_ONLY_ENV = "NEXUS_HERMES_PLANNER_ONLY"
NEXUS_HERMES_DEFAULT_PROVIDER_ID_ENV = "NEXUS_HERMES_DEFAULT_PROVIDER_ID"
NEXUS_HERMES_DISABLED_PROVIDER_IDS_ENV = "NEXUS_HERMES_DISABLED_PROVIDER_IDS"
NEXUS_HERMES_ROLLBACK_PROVIDER_ID_ENV = "NEXUS_HERMES_ROLLBACK_PROVIDER_ID"
EXECUTION_PLAN_SCHEMA_VERSION = "nexus.execution_plan.p0.v1"
HERMES_BASELINE_PROVIDER_ID = "hermes-0.20.5"
HERMES_PROVIDER_CONTRACT_VERSION = "nexus.hermes_provider.p3.v1"
PLANNER_ONLY_TURN_EXIT_REASON = "nexus_planner_only_handoff"
BLOCKED_NATIVE_TOOL_CODE = "NEXUS_HERMES_PLANNER_ONLY_NATIVE_TOOL_BLOCKED"
BLOCKED_MEMORY_CODE = "NEXUS_HERMES_PLANNER_ONLY_MEMORY_GATEWAY_REQUIRED"
BLOCKED_LOOP_CODE = "NEXUS_HERMES_PLANNER_ONLY_LOOP_BLOCKED"
BLOCKED_GATEWAY_CODE = "NEXUS_HERMES_PLANNER_ONLY_GATEWAY_BLOCKED"
PROVIDER_DISABLED_CODE = "NEXUS_HERMES_PLANNER_ONLY_PROVIDER_DISABLED"
PROVIDER_UNKNOWN_CODE = "NEXUS_HERMES_PLANNER_ONLY_PROVIDER_UNKNOWN"

_TRUTHY = {"1", "true", "yes", "on"}


def is_nexus_hermes_planner_only_enabled() -> bool:
    """Return True when the P0 planner-only experiment is explicitly enabled."""

    return str(os.environ.get(NEXUS_HERMES_PLANNER_ONLY_ENV, "")).strip().lower() in _TRUTHY


def _current_provider_id() -> str:
    provider_id = str(os.environ.get(NEXUS_HERMES_DEFAULT_PROVIDER_ID_ENV, HERMES_BASELINE_PROVIDER_ID)).strip()
    return provider_id or HERMES_BASELINE_PROVIDER_ID


def _disabled_provider_ids() -> set[str]:
    raw = str(os.environ.get(NEXUS_HERMES_DISABLED_PROVIDER_IDS_ENV, ""))
    return {item.strip() for item in raw.split(",") if item.strip()}


def _rollback_provider_id() -> Optional[str]:
    provider_id = str(os.environ.get(NEXUS_HERMES_ROLLBACK_PROVIDER_ID_ENV, "")).strip()
    return provider_id or None


def _known_provider_ids() -> set[str]:
    provider_ids = {HERMES_BASELINE_PROVIDER_ID}
    rollback = _rollback_provider_id()
    if rollback:
        provider_ids.add(rollback)
    return provider_ids


def baseline_provider_metadata(provider_id: Optional[str] = None) -> Dict[str, Any]:
    """Return sanitized P3 planner provider metadata for platform-side checks."""

    resolved_provider_id = provider_id or HERMES_BASELINE_PROVIDER_ID
    disabled = resolved_provider_id in _disabled_provider_ids()
    metadata: Dict[str, Any] = {
        "provider_id": resolved_provider_id,
        "version": "0.20.5",
        "role": "planner-only",
        "status": "disabled" if disabled else "enabled",
        "contract_version": HERMES_PROVIDER_CONTRACT_VERSION,
        "schema_versions": [EXECUTION_PLAN_SCHEMA_VERSION],
        "capabilities": [
            "execution-plan",
            "memory-gateway-required",
            "native-gateway-block",
            "native-loop-block",
            "native-tool-block",
            "provider-disable",
            "provider-rollback",
        ],
    }
    rollback_provider_id = _rollback_provider_id()
    if rollback_provider_id:
        metadata["rollback_provider_id"] = rollback_provider_id
    return metadata


def provider_status_view(provider_id: Optional[str] = None) -> Dict[str, Any]:
    """Expose a provider status view without native URLs, sessions, or paths."""

    resolved_provider_id = provider_id or _current_provider_id()
    return baseline_provider_metadata(resolved_provider_id)


def assert_nexus_hermes_provider_available(provider_id: Optional[str] = None) -> Dict[str, Any]:
    """Validate the selected P3 planner provider before planning work starts."""

    resolved_provider_id = provider_id or _current_provider_id()
    if resolved_provider_id not in _known_provider_ids():
        raise ValueError(
            json.dumps(
                {
                    "success": False,
                    "code": PROVIDER_UNKNOWN_CODE,
                    "error": "Hermes planner provider is not registered with NexusAgent.",
                    "provider_id": resolved_provider_id,
                },
                ensure_ascii=False,
                sort_keys=True,
            )
        )
    status = provider_status_view(resolved_provider_id)
    if status["status"] != "enabled":
        raise ValueError(
            json.dumps(
                {
                    "success": False,
                    "code": PROVIDER_DISABLED_CODE,
                    "error": "Hermes planner provider is disabled by NexusAgent platform configuration.",
                    "provider_id": resolved_provider_id,
                    "rollback_provider_id": status.get("rollback_provider_id"),
                },
                ensure_ascii=False,
                sort_keys=True,
            )
        )
    return status


def _stringify_content(value: Any) -> str:
    """Best-effort text extraction from common Hermes/OpenAI message shapes."""

    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, Mapping):
        if "content" in value:
            return _stringify_content(value.get("content"))
        if "text" in value:
            return _stringify_content(value.get("text"))
        return json.dumps(dict(value), ensure_ascii=False, sort_keys=True)
    if isinstance(value, list):
        parts: List[str] = []
        for item in value:
            text = _stringify_content(item)
            if text:
                parts.append(text)
        return "\n".join(parts)
    return str(value)


def _truncate(value: str, limit: int = 500) -> str:
    value = (value or "").strip()
    if len(value) <= limit:
        return value
    return value[: limit - 1].rstrip() + "…"


def _coerce_args(raw_args: Any) -> Any:
    if raw_args is None:
        return {}
    if isinstance(raw_args, Mapping):
        return dict(raw_args)
    if isinstance(raw_args, str):
        try:
            parsed = json.loads(raw_args)
        except Exception:
            return {"raw": _truncate(raw_args, 300)}
        return parsed if isinstance(parsed, (dict, list)) else {"value": parsed}
    return {"raw": _truncate(str(raw_args), 300)}


def tool_call_name(tool_call: Any) -> str:
    function = getattr(tool_call, "function", None)
    if isinstance(tool_call, Mapping):
        function = tool_call.get("function", function)
    if isinstance(function, Mapping):
        return str(function.get("name") or "tool")
    return str(getattr(function, "name", "") or "tool")


def tool_call_arguments(tool_call: Any) -> Any:
    function = getattr(tool_call, "function", None)
    if isinstance(tool_call, Mapping):
        function = tool_call.get("function", function)
    if isinstance(function, Mapping):
        return _coerce_args(function.get("arguments"))
    return _coerce_args(getattr(function, "arguments", None))


def tool_call_id(tool_call: Any) -> str:
    if isinstance(tool_call, Mapping):
        return str(tool_call.get("id") or "")
    return str(getattr(tool_call, "id", "") or "")


def build_execution_plan(
    user_message: Any,
    *,
    task_id: Optional[str] = None,
    conversation_id: Optional[str] = None,
    trace_id: Optional[str] = None,
    source: str = "conversation_loop",
) -> Dict[str, Any]:
    """Build the minimal platform-facing ExecutionPlan used by the P0 proof."""

    provider = assert_nexus_hermes_provider_available()
    objective = _truncate(_stringify_content(user_message), 1000) or "(empty input)"
    plan = {
        "schema_version": EXECUTION_PLAN_SCHEMA_VERSION,
        "task": {
            "task_id": task_id,
            "conversation_id": conversation_id,
            "trace_id": trace_id,
            "objective": objective,
        },
        "steps": [
            {
                "step_id": "plan-001",
                "title": "Normalize platform task request",
                "intent": "analyze_input",
                "status": "planned",
                "depends_on": [],
            },
            {
                "step_id": "plan-002",
                "title": "Request platform-governed execution through DSH adapter",
                "intent": "emit_tool_intents",
                "status": "planned",
                "depends_on": ["plan-001"],
            },
            {
                "step_id": "plan-003",
                "title": "Persist memory only through Memory Gateway",
                "intent": "memory_gateway_boundary",
                "status": "planned",
                "depends_on": ["plan-001"],
            },
        ],
        "tool_intents": [],
        "memory_context": {
            "mode": "memory_gateway_required",
            "direct_file_memory": "blocked",
            "forbidden_paths": ["MEMORY.md", "USER.md"],
        },
        "risks": [
            {
                "code": "P0-HERMES-PROVIDER-NOT-FINAL",
                "level": "medium",
                "summary": "P0 uses an opt-in experiment; P3 must replace it with the production Hermes provider boundary.",
            }
        ],
        "trace": {
            "source": source,
            "planner_only": True,
            "provider_id": provider["provider_id"],
            "provider_contract_version": HERMES_PROVIDER_CONTRACT_VERSION,
            "native_tool_runtime": "blocked",
            "native_loop_runtime": "blocked",
            "native_gateway_runtime": "blocked",
            "native_file_memory": "blocked",
        },
    }
    validate_execution_plan_shape(plan)
    return plan


def validate_execution_plan_shape(plan: Mapping[str, Any]) -> None:
    """Small runtime validator matching platform/contracts/execution-plan.schema.json."""

    required = {"schema_version", "task", "steps", "tool_intents", "memory_context", "risks", "trace"}
    missing = required.difference(plan.keys())
    if missing:
        raise ValueError(f"ExecutionPlan missing required fields: {sorted(missing)}")
    if plan.get("schema_version") != EXECUTION_PLAN_SCHEMA_VERSION:
        raise ValueError("ExecutionPlan schema_version is not supported by the P0 experiment")
    if not isinstance(plan.get("task"), Mapping):
        raise ValueError("ExecutionPlan task must be an object")
    if not str(plan["task"].get("objective") or "").strip():
        raise ValueError("ExecutionPlan task.objective is required")
    if not isinstance(plan.get("steps"), list) or not plan["steps"]:
        raise ValueError("ExecutionPlan steps must be a non-empty array")
    for step in plan["steps"]:
        if not isinstance(step, Mapping) or not step.get("step_id") or not step.get("intent"):
            raise ValueError("ExecutionPlan steps must include step_id and intent")


def build_planner_only_turn_result(
    agent: Any,
    user_message: Any,
    *,
    task_id: Optional[str] = None,
    conversation_history: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Return a Hermes-compatible turn result carrying only an ExecutionPlan."""

    plan = build_execution_plan(
        user_message,
        task_id=task_id,
        conversation_id=getattr(agent, "session_id", None),
        trace_id=getattr(agent, "trace_id", None),
        source="conversation_loop",
    )
    messages = list(conversation_history or [])
    messages.append({"role": "user", "content": _stringify_content(user_message)})
    messages.append({"role": "assistant", "content": "", "nexus_execution_plan": plan})
    return {
        "final_response": "",
        "last_reasoning": None,
        "messages": messages,
        "api_calls": 0,
        "completed": True,
        "turn_exit_reason": PLANNER_ONLY_TURN_EXIT_REASON,
        "failed": False,
        "partial": False,
        "interrupted": False,
        "response_transformed": False,
        "pre_transform_response": "",
        "response_previewed": False,
        "model": getattr(agent, "model", ""),
        "provider": getattr(agent, "provider", ""),
        "base_url": getattr(agent, "base_url", None),
        "session_id": getattr(agent, "session_id", None),
        "task_id": task_id,
        "execution_plan": plan,
        "nexus_planner_only": True,
    }


def build_blocked_tool_result(
    tool_name: str,
    args: Any = None,
    *,
    source: str = "tool_executor",
) -> str:
    """Return a structured tool-result payload for blocked native execution."""

    payload = {
        "success": False,
        "code": BLOCKED_NATIVE_TOOL_CODE,
        "error": "Native tool execution is blocked by the NexusAgent planner-only experiment.",
        "tool_intent": {
            "name": tool_name or "tool",
            "arguments": _coerce_args(args),
            "handoff": "platform_policy_gate_required",
        },
        "trace": {
            "source": source,
            "planner_only": True,
        },
    }
    return json.dumps(payload, ensure_ascii=False, sort_keys=True)


def build_blocked_memory_result(action: str, target: str = "memory") -> Dict[str, Any]:
    """Return a dict result for blocked direct file-backed memory access."""

    return {
        "success": False,
        "code": BLOCKED_MEMORY_CODE,
        "error": "Direct file-backed memory is blocked; use the NexusAgent Memory Gateway boundary.",
        "action": action,
        "target": target or "memory",
        "memory_boundary": "memory_gateway_required",
    }


def blocked_loop_output() -> Dict[str, Any]:
    """Return the shared /loop disabled response for planner-only mode."""

    return {
        "output": (
            "NexusAgent planner-only mode blocks native recurring loop execution; "
            "use the platform scheduler and Coordinator instead."
        ),
        "created": False,
        "code": BLOCKED_LOOP_CODE,
    }


def build_blocked_gateway_result(source: str = "gateway.run") -> Dict[str, Any]:
    """Return the shared gateway disabled response for planner-only mode."""

    provider = provider_status_view()
    return {
        "success": False,
        "code": BLOCKED_GATEWAY_CODE,
        "error": (
            "NexusAgent planner-only mode blocks the native Hermes gateway; "
            "use the platform channel gateway and Coordinator instead."
        ),
        "provider": provider,
        "trace": {
            "source": source,
            "planner_only": True,
            "native_gateway_runtime": "blocked",
            "native_tool_runtime": "blocked",
            "native_loop_runtime": "blocked",
            "native_file_memory": "blocked",
        },
    }
