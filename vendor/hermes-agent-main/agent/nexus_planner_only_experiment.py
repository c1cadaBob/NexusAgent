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
import re
from typing import Any, Dict, List, Optional

NEXUS_HERMES_PLANNER_ONLY_ENV = "NEXUS_HERMES_PLANNER_ONLY"
NEXUS_HERMES_DEFAULT_PROVIDER_ID_ENV = "NEXUS_HERMES_DEFAULT_PROVIDER_ID"
NEXUS_HERMES_DISABLED_PROVIDER_IDS_ENV = "NEXUS_HERMES_DISABLED_PROVIDER_IDS"
NEXUS_HERMES_ROLLBACK_PROVIDER_ID_ENV = "NEXUS_HERMES_ROLLBACK_PROVIDER_ID"
EXECUTION_PLAN_SCHEMA_VERSION = "nexus.execution_plan.p3.v1"
LEGACY_EXECUTION_PLAN_SCHEMA_VERSION = "nexus.execution_plan.p0.v1"
HERMES_BASELINE_PROVIDER_ID = "hermes-0.20.5"
HERMES_PROVIDER_CONTRACT_VERSION = "nexus.hermes_provider.p3.v1"
PLANNER_ONLY_TURN_EXIT_REASON = "nexus_planner_only_handoff"
EXECUTION_PLAN_VALIDATION_CODE = "PLATFORM_SCHEMA_VALIDATION_FAILED"
BLOCKED_NATIVE_TOOL_CODE = "NEXUS_HERMES_PLANNER_ONLY_NATIVE_TOOL_BLOCKED"
BLOCKED_MEMORY_CODE = "NEXUS_HERMES_PLANNER_ONLY_MEMORY_GATEWAY_REQUIRED"
BLOCKED_LOOP_CODE = "NEXUS_HERMES_PLANNER_ONLY_LOOP_BLOCKED"
BLOCKED_GATEWAY_CODE = "NEXUS_HERMES_PLANNER_ONLY_GATEWAY_BLOCKED"
PROVIDER_DISABLED_CODE = "NEXUS_HERMES_PLANNER_ONLY_PROVIDER_DISABLED"
PROVIDER_UNKNOWN_CODE = "NEXUS_HERMES_PLANNER_ONLY_PROVIDER_UNKNOWN"

_TRUTHY = {"1", "true", "yes", "on"}

_PLATFORM_ID_PATTERNS = {
    "tenant_id": re.compile(r"^tenant_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$"),
    "user_id": re.compile(r"^user_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$"),
    "agent_id": re.compile(r"^agent_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$"),
    "task_id": re.compile(r"^task_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$"),
    "attempt_id": re.compile(r"^attempt_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$"),
    "execution_id": re.compile(r"^exec_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$"),
    "conversation_id": re.compile(r"^conv_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$"),
    "trace_id": re.compile(r"^trace_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$"),
}

_FORBIDDEN_PLAN_KEYS = {
    "explanation",
    "reasoning",
    "final_response",
    "model_explanation",
    "chain_of_thought",
    "credential_material",
    "raw_credential",
    "api_key",
    "password",
    "token",
    "native_session_id",
    "native_error",
    "native_path",
    "native_url",
    "base_url",
    "file_path",
    "path",
    "url",
    "session_id",
}

_FORBIDDEN_PLAN_TEXT = re.compile(
    r"MEMORY\.md|USER\.md|https?://|\b(?:native_session|native_error|api_key|raw_credential|credential_material|secret[-_ ]?token)\b|\b(?:Hermes|OpenClaw|DeepSeek|DSH)\b|/(?:tmp|var|workspace|opt)/",
    re.IGNORECASE,
)


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
    tenant_id: Optional[str] = None,
    user_id: Optional[str] = None,
    agent_id: Optional[str] = None,
    task_id: Optional[str] = None,
    attempt_id: Optional[str] = None,
    execution_id: Optional[str] = None,
    conversation_id: Optional[str] = None,
    trace_id: Optional[str] = None,
    memory_snapshot_version: int = 0,
    source: str = "conversation_loop",
) -> Dict[str, Any]:
    """Build a strict P3 platform-facing ExecutionPlan.

    The planner-only helper must receive complete platform context from
    NexusAgent. It does not generate substitute IDs for local native sessions.
    """

    assert_nexus_hermes_provider_available()
    context = {
        "tenant_id": tenant_id,
        "user_id": user_id,
        "agent_id": agent_id,
        "task_id": task_id,
        "attempt_id": attempt_id,
        "execution_id": execution_id,
        "conversation_id": conversation_id,
        "trace_id": trace_id,
    }
    _validate_platform_context(context)
    objective = _truncate(_stringify_content(user_message), 1000) or "(empty input)"
    plan = {
        "schema_version": EXECUTION_PLAN_SCHEMA_VERSION,
        **context,
        "objective": objective,
        "steps": [
            {
                "step_id": "step_plan_001",
                "title": "Normalize platform task request",
                "intent": "task.normalize",
                "status": "planned",
                "depends_on": [],
                "expected_output": "Validated task objective and platform identifiers",
            },
            {
                "step_id": "step_plan_002",
                "title": "Prepare platform tool intent",
                "intent": "tool.intent.prepare",
                "status": "planned",
                "depends_on": ["step_plan_001"],
                "expected_output": "Tool intent ready for Policy-Gate and executor routing",
            },
            {
                "step_id": "step_plan_003",
                "title": "Capture memory gateway context",
                "intent": "memory.context.capture",
                "status": "planned",
                "depends_on": ["step_plan_001"],
                "expected_output": "Planner memory context remains gateway scoped",
            },
        ],
        "tool_intents": [
            {
                "tool_intent_id": "tool_intent_plan_001",
                "step_id": "step_plan_002",
                "capability": "platform.execution.prepare",
                "executor_policy": {
                    "mode": "platform_executor_required",
                    "require_policy_gate": True,
                    "allow_direct_execution": False,
                    "artifact_store": "required",
                },
                "credential_refs": [{"credential_ref": "cred_alpha01_tool", "purpose": "executor_tool"}],
                "artifact_expectations": [{"kind": "execution_result", "store": "artifact_store", "required": False}],
            }
        ],
        "budget": {
            "estimated_units": 3,
            "max_execution_steps": 3,
            "requires_approval": False,
        },
        "dependencies": [
            {"step_id": "step_plan_002", "depends_on_step_id": "step_plan_001", "relation": "after"},
            {"step_id": "step_plan_003", "depends_on_step_id": "step_plan_001", "relation": "after"},
        ],
        "memory_context": {
            "mode": "memory_gateway_snapshot",
            "layers": ["session", "user", "agent_skill"],
            "snapshot_version": int(memory_snapshot_version),
            "direct_memory_access": "blocked",
        },
        "risks": [
            {
                "risk_id": "risk_policy_boundary",
                "severity": "medium",
                "mitigation": "Route execution through Policy-Gate and executor adapter",
            }
        ],
        "trace": {
            "source": source,
            "planner_mode": "planner_only",
            "provider_binding": "planner_provider_default",
            "tool_runtime": "platform_executor_required",
            "memory_runtime": "memory_gateway_required",
            "gateway_runtime": "blocked",
        },
    }
    validate_execution_plan_shape(plan)
    return plan


def validate_execution_plan_shape(plan: Mapping[str, Any]) -> None:
    """Runtime validator matching platform/contracts/execution-plan.schema.json."""

    _assert_no_forbidden_plan_content(plan)
    required = {
        "schema_version",
        "tenant_id",
        "user_id",
        "agent_id",
        "task_id",
        "attempt_id",
        "execution_id",
        "conversation_id",
        "trace_id",
        "objective",
        "steps",
        "tool_intents",
        "budget",
        "dependencies",
        "risks",
        "memory_context",
        "trace",
    }
    _assert_allowed_fields(plan, required, "ExecutionPlan")
    missing = required.difference(plan.keys())
    if missing:
        _schema_failure("ExecutionPlan missing required fields", missing=sorted(missing))
    if plan.get("schema_version") != EXECUTION_PLAN_SCHEMA_VERSION:
        _schema_failure(
            "Unsupported ExecutionPlan schema version",
            schema_version=plan.get("schema_version"),
            legacy_schema_version=LEGACY_EXECUTION_PLAN_SCHEMA_VERSION,
        )
    _validate_platform_context({key: plan.get(key) for key in _PLATFORM_ID_PATTERNS})
    if not str(plan.get("objective") or "").strip():
        _schema_failure("ExecutionPlan objective is required", field="objective")
    steps = _validate_plan_steps(plan.get("steps"))
    _validate_plan_dependencies(plan.get("dependencies"), steps)
    _validate_tool_intents(plan.get("tool_intents"), steps)
    _validate_budget(plan.get("budget"), len(steps))
    _validate_risks(plan.get("risks"))
    _validate_memory_context(plan.get("memory_context"))
    _validate_trace(plan.get("trace"))


def _validate_platform_context(context: Mapping[str, Any]) -> None:
    for key, pattern in _PLATFORM_ID_PATTERNS.items():
        value = context.get(key)
        if not isinstance(value, str) or not pattern.match(value):
            _schema_failure("ExecutionPlan platform context is incomplete or invalid", field=key)


def _validate_plan_steps(value: Any) -> List[Dict[str, Any]]:
    if not isinstance(value, list) or not value:
        _schema_failure("ExecutionPlan steps must be a non-empty array", field="steps")
    steps: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for index, step in enumerate(value):
        if not isinstance(step, Mapping):
            _schema_failure("ExecutionPlan step must be an object", field=f"steps.{index}")
        _assert_allowed_fields(step, {"step_id", "title", "intent", "status", "depends_on", "expected_output"}, f"steps.{index}")
        step_id = _require_pattern(step.get("step_id"), f"steps.{index}.step_id", r"^step_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$")
        if step_id in seen:
            _schema_failure("ExecutionPlan step_id must be unique", step_id=step_id)
        depends_on = step.get("depends_on")
        if not isinstance(depends_on, list):
            _schema_failure("ExecutionPlan step depends_on must be an array", field=f"steps.{index}.depends_on")
        for dependency in depends_on:
            dep_id = _require_pattern(dependency, f"steps.{index}.depends_on", r"^step_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$")
            if dep_id not in seen:
                _schema_failure("ExecutionPlan step dependency must reference an earlier step", step_id=step_id, depends_on_step_id=dep_id)
        seen.add(step_id)
        steps.append({
            "step_id": step_id,
            "depends_on": list(depends_on),
        })
        if step.get("status") not in {"planned", "blocked"}:
            _schema_failure("ExecutionPlan step status is invalid", field=f"steps.{index}.status")
        for field in ("title", "intent", "expected_output"):
            if not str(step.get(field) or "").strip():
                _schema_failure("ExecutionPlan step field is required", field=f"steps.{index}.{field}")
    _assert_no_cycles(steps)
    return steps


def _validate_plan_dependencies(value: Any, steps: List[Dict[str, Any]]) -> None:
    if not isinstance(value, list):
        _schema_failure("ExecutionPlan dependencies must be an array", field="dependencies")
    step_ids = {step["step_id"] for step in steps}
    required_pairs = {f"{step['step_id']}->{dependency}" for step in steps for dependency in step["depends_on"]}
    provided_pairs: set[str] = set()
    for index, dependency in enumerate(value):
        if not isinstance(dependency, Mapping):
            _schema_failure("ExecutionPlan dependency must be an object", field=f"dependencies.{index}")
        _assert_allowed_fields(dependency, {"step_id", "depends_on_step_id", "relation"}, f"dependencies.{index}")
        step_id = _require_pattern(dependency.get("step_id"), f"dependencies.{index}.step_id", r"^step_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$")
        depends_on_step_id = _require_pattern(dependency.get("depends_on_step_id"), f"dependencies.{index}.depends_on_step_id", r"^step_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$")
        if step_id not in step_ids or depends_on_step_id not in step_ids:
            _schema_failure("ExecutionPlan dependency references an unknown step", step_id=step_id, depends_on_step_id=depends_on_step_id)
        if dependency.get("relation") != "after":
            _schema_failure("ExecutionPlan dependency relation is invalid", field=f"dependencies.{index}.relation")
        provided_pairs.add(f"{step_id}->{depends_on_step_id}")
    if provided_pairs != required_pairs:
        _schema_failure("ExecutionPlan dependencies must exactly match step depends_on graph", expected_count=len(required_pairs), actual_count=len(provided_pairs))


def _validate_tool_intents(value: Any, steps: List[Dict[str, Any]]) -> None:
    if not isinstance(value, list) or not value:
        _schema_failure("ExecutionPlan tool_intents must be a non-empty array", field="tool_intents")
    step_ids = {step["step_id"] for step in steps}
    seen: set[str] = set()
    for index, intent in enumerate(value):
        if not isinstance(intent, Mapping):
            _schema_failure("ExecutionPlan tool intent must be an object", field=f"tool_intents.{index}")
        _assert_allowed_fields(intent, {"tool_intent_id", "step_id", "capability", "executor_policy", "credential_refs", "artifact_expectations"}, f"tool_intents.{index}")
        tool_intent_id = _require_pattern(intent.get("tool_intent_id"), f"tool_intents.{index}.tool_intent_id", r"^tool_intent_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$")
        if tool_intent_id in seen:
            _schema_failure("ExecutionPlan tool_intent_id must be unique", tool_intent_id=tool_intent_id)
        seen.add(tool_intent_id)
        step_id = _require_pattern(intent.get("step_id"), f"tool_intents.{index}.step_id", r"^step_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$")
        if step_id not in step_ids:
            _schema_failure("ExecutionPlan tool intent references an unknown step", step_id=step_id)
        if not re.match(r"^[a-z][a-z0-9_.-]{2,127}$", str(intent.get("capability") or "")):
            _schema_failure("ExecutionPlan tool intent capability is invalid", field=f"tool_intents.{index}.capability")
        policy = intent.get("executor_policy")
        if not isinstance(policy, Mapping):
            _schema_failure("ExecutionPlan tool intent executor_policy is required", field=f"tool_intents.{index}.executor_policy")
        _assert_allowed_fields(policy, {"mode", "require_policy_gate", "allow_direct_execution", "artifact_store"}, f"tool_intents.{index}.executor_policy")
        if policy != {"mode": "platform_executor_required", "require_policy_gate": True, "allow_direct_execution": False, "artifact_store": "required"}:
            _schema_failure("ExecutionPlan tool intent must require platform executor controls", field=f"tool_intents.{index}.executor_policy")
        _validate_credential_refs(intent.get("credential_refs"), index)
        _validate_artifact_expectations(intent.get("artifact_expectations"), index)


def _validate_credential_refs(value: Any, intent_index: int) -> None:
    if not isinstance(value, list):
        _schema_failure("ExecutionPlan credential_refs must be an array", field=f"tool_intents.{intent_index}.credential_refs")
    for index, credential in enumerate(value):
        if not isinstance(credential, Mapping):
            _schema_failure("ExecutionPlan credential_ref must be an object", field=f"tool_intents.{intent_index}.credential_refs.{index}")
        _assert_allowed_fields(credential, {"credential_ref", "purpose"}, f"tool_intents.{intent_index}.credential_refs.{index}")
        _require_pattern(credential.get("credential_ref"), f"tool_intents.{intent_index}.credential_refs.{index}.credential_ref", r"^cred_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$")
        if credential.get("purpose") != "executor_tool":
            _schema_failure("ExecutionPlan credential_ref purpose is invalid", field=f"tool_intents.{intent_index}.credential_refs.{index}.purpose")


def _validate_artifact_expectations(value: Any, intent_index: int) -> None:
    if not isinstance(value, list) or not value:
        _schema_failure("ExecutionPlan artifact_expectations must be a non-empty array", field=f"tool_intents.{intent_index}.artifact_expectations")
    for index, expectation in enumerate(value):
        if not isinstance(expectation, Mapping):
            _schema_failure("ExecutionPlan artifact expectation must be an object", field=f"tool_intents.{intent_index}.artifact_expectations.{index}")
        _assert_allowed_fields(expectation, {"kind", "store", "required"}, f"tool_intents.{intent_index}.artifact_expectations.{index}")
        if expectation.get("kind") not in {"execution_result", "structured_output", "diagnostic"}:
            _schema_failure("ExecutionPlan artifact expectation kind is invalid", field=f"tool_intents.{intent_index}.artifact_expectations.{index}.kind")
        if expectation.get("store") != "artifact_store" or not isinstance(expectation.get("required"), bool):
            _schema_failure("ExecutionPlan artifact expectation is invalid", field=f"tool_intents.{intent_index}.artifact_expectations.{index}")


def _validate_budget(value: Any, step_count: int) -> None:
    if not isinstance(value, Mapping):
        _schema_failure("ExecutionPlan budget must be an object", field="budget")
    _assert_allowed_fields(value, {"estimated_units", "max_execution_steps", "requires_approval"}, "budget")
    if not isinstance(value.get("estimated_units"), int) or value["estimated_units"] < 1:
        _schema_failure("ExecutionPlan budget estimated_units is invalid", field="budget.estimated_units")
    if not isinstance(value.get("max_execution_steps"), int) or value["max_execution_steps"] < step_count:
        _schema_failure("ExecutionPlan budget max_execution_steps is invalid", field="budget.max_execution_steps")
    if not isinstance(value.get("requires_approval"), bool):
        _schema_failure("ExecutionPlan budget requires_approval is invalid", field="budget.requires_approval")


def _validate_risks(value: Any) -> None:
    if not isinstance(value, list) or not value:
        _schema_failure("ExecutionPlan risks must be a non-empty array", field="risks")
    for index, risk in enumerate(value):
        if not isinstance(risk, Mapping):
            _schema_failure("ExecutionPlan risk must be an object", field=f"risks.{index}")
        _assert_allowed_fields(risk, {"risk_id", "severity", "mitigation"}, f"risks.{index}")
        _require_pattern(risk.get("risk_id"), f"risks.{index}.risk_id", r"^risk_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$")
        if risk.get("severity") not in {"low", "medium", "high", "critical"}:
            _schema_failure("ExecutionPlan risk severity is invalid", field=f"risks.{index}.severity")
        if not str(risk.get("mitigation") or "").strip():
            _schema_failure("ExecutionPlan risk mitigation is required", field=f"risks.{index}.mitigation")


def _validate_memory_context(value: Any) -> None:
    if not isinstance(value, Mapping):
        _schema_failure("ExecutionPlan memory_context must be an object", field="memory_context")
    _assert_allowed_fields(value, {"mode", "layers", "snapshot_version", "direct_memory_access"}, "memory_context")
    if value.get("mode") != "memory_gateway_snapshot" or value.get("direct_memory_access") != "blocked":
        _schema_failure("ExecutionPlan memory_context must use platform memory gateway", field="memory_context")
    layers = value.get("layers")
    if not isinstance(layers, list) or not layers or not set(layers).issubset({"session", "user", "agent_skill"}):
        _schema_failure("ExecutionPlan memory_context layers are invalid", field="memory_context.layers")
    if not isinstance(value.get("snapshot_version"), int) or value["snapshot_version"] < 0:
        _schema_failure("ExecutionPlan memory_context snapshot_version is invalid", field="memory_context.snapshot_version")


def _validate_trace(value: Any) -> None:
    expected = {
        "planner_mode": "planner_only",
        "provider_binding": "planner_provider_default",
        "tool_runtime": "platform_executor_required",
        "memory_runtime": "memory_gateway_required",
        "gateway_runtime": "blocked",
    }
    if not isinstance(value, Mapping):
        _schema_failure("ExecutionPlan trace must be an object", field="trace")
    _assert_allowed_fields(value, {"source", *expected.keys()}, "trace")
    if value.get("source") not in {"conversation_loop", "provider_fixture", "adapter_validation"}:
        _schema_failure("ExecutionPlan trace source is invalid", field="trace.source")
    for key, expected_value in expected.items():
        if value.get(key) != expected_value:
            _schema_failure("ExecutionPlan trace field is invalid", field=f"trace.{key}")


def _assert_no_cycles(steps: List[Dict[str, Any]]) -> None:
    by_id = {step["step_id"]: step for step in steps}
    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(step_id: str) -> None:
        if step_id in visited:
            return
        if step_id in visiting:
            _schema_failure("ExecutionPlan step dependencies cannot contain cycles", step_id=step_id)
        visiting.add(step_id)
        for dependency in by_id[step_id]["depends_on"]:
            visit(dependency)
        visiting.remove(step_id)
        visited.add(step_id)

    for step in steps:
        visit(step["step_id"])


def _assert_no_forbidden_plan_content(value: Any) -> None:
    if isinstance(value, Mapping):
        for key, item in value.items():
            if str(key).lower() in _FORBIDDEN_PLAN_KEYS:
                _schema_failure("ExecutionPlan contains a non-platform field", field=str(key))
            _assert_no_forbidden_plan_content(item)
    elif isinstance(value, list):
        for item in value:
            _assert_no_forbidden_plan_content(item)
    elif isinstance(value, str) and _FORBIDDEN_PLAN_TEXT.search(value):
        _schema_failure("ExecutionPlan contains non-platform content")


def _assert_allowed_fields(record: Mapping[str, Any], allowed: set[str], label: str) -> None:
    for key in record.keys():
        if key not in allowed:
            _schema_failure("ExecutionPlan contains an unsupported field", field=f"{label}.{key}")


def _require_pattern(value: Any, field: str, pattern: str) -> str:
    if not isinstance(value, str) or not re.match(pattern, value):
        _schema_failure("ExecutionPlan string field pattern is invalid", field=field)
    return value


def _schema_failure(message: str, **details: Any) -> None:
    raise ValueError(
        json.dumps(
            {
                "success": False,
                "code": EXECUTION_PLAN_VALIDATION_CODE,
                "error": message,
                "details": details,
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )


def build_planner_only_turn_result(
    agent: Any,
    user_message: Any,
    *,
    tenant_id: Optional[str] = None,
    user_id: Optional[str] = None,
    agent_id: Optional[str] = None,
    task_id: Optional[str] = None,
    attempt_id: Optional[str] = None,
    execution_id: Optional[str] = None,
    conversation_id: Optional[str] = None,
    trace_id: Optional[str] = None,
    conversation_history: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Return a Hermes-compatible turn result carrying only an ExecutionPlan."""

    plan = build_execution_plan(
        user_message,
        tenant_id=tenant_id or _agent_or_env(agent, "tenant_id", "NEXUS_TENANT_ID"),
        user_id=user_id or _agent_or_env(agent, "user_id", "NEXUS_USER_ID"),
        agent_id=agent_id or _agent_or_env(agent, "agent_id", "NEXUS_AGENT_ID"),
        task_id=task_id or _agent_or_env(agent, "task_id", "NEXUS_TASK_ID"),
        attempt_id=attempt_id or _agent_or_env(agent, "attempt_id", "NEXUS_ATTEMPT_ID"),
        execution_id=execution_id or _agent_or_env(agent, "execution_id", "NEXUS_EXECUTION_ID"),
        conversation_id=conversation_id or _agent_or_env(agent, "conversation_id", "NEXUS_CONVERSATION_ID"),
        trace_id=trace_id or _agent_or_env(agent, "trace_id", "NEXUS_TRACE_ID"),
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
        "provider": "",
        "base_url": None,
        "session_id": None,
        "task_id": task_id,
        "execution_plan": plan,
        "nexus_planner_only": True,
    }


def _agent_or_env(agent: Any, attr: str, env_name: str) -> Optional[str]:
    value = getattr(agent, attr, None)
    if value is None and attr == "conversation_id":
        value = getattr(agent, "session_id", None)
    if value is None:
        value = os.environ.get(env_name)
    if value is None:
        return None
    return str(value)


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
