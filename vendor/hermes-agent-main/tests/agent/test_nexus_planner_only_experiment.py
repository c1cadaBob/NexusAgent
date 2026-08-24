"""P0 NexusAgent planner-only experiment tests."""

from __future__ import annotations

import json
from types import SimpleNamespace


def test_execution_plan_shape_and_turn_result(monkeypatch):
    monkeypatch.setenv("NEXUS_HERMES_PLANNER_ONLY", "1")

    from agent.nexus_planner_only_experiment import (
        build_execution_plan,
        build_planner_only_turn_result,
        validate_execution_plan_shape,
    )

    plan = build_execution_plan(
        "ship the platform task",
        tenant_id="tenant_alpha01",
        user_id="user_alpha01",
        agent_id="agent_alpha01",
        task_id="task_alpha01",
        attempt_id="attempt_alpha01",
        execution_id="exec_alpha01",
        conversation_id="conv_alpha01",
        trace_id="trace_alpha01",
    )
    validate_execution_plan_shape(plan)
    assert plan["schema_version"] == "nexus.execution_plan.p3.v1"
    assert plan["objective"] == "ship the platform task"
    assert plan["tenant_id"] == "tenant_alpha01"
    assert plan["memory_context"]["mode"] == "memory_gateway_snapshot"
    assert plan["memory_context"]["direct_memory_access"] == "blocked"
    assert plan["trace"]["provider_binding"] == "planner_provider_default"
    assert "final_response" not in plan
    assert "reasoning" not in plan

    result = build_planner_only_turn_result(
        SimpleNamespace(
            tenant_id="tenant_alpha01",
            user_id="user_alpha01",
            agent_id="agent_alpha01",
            task_id="task_alpha01",
            attempt_id="attempt_alpha01",
            execution_id="exec_alpha01",
            conversation_id="conv_alpha01",
            trace_id="trace_alpha01",
            model="",
            provider="",
        ),
        "ship the platform task",
        task_id="task_alpha01",
    )
    assert result["final_response"] == ""
    assert result["api_calls"] == 0
    assert result["turn_exit_reason"] == "nexus_planner_only_handoff"
    assert result["execution_plan"] == plan
    assert result["messages"][-1]["content"] == ""
    assert result["messages"][-1]["nexus_execution_plan"] == plan


def test_execution_plan_missing_platform_context_fails_closed(monkeypatch):
    monkeypatch.setenv("NEXUS_HERMES_PLANNER_ONLY", "1")

    from agent.nexus_planner_only_experiment import build_execution_plan

    try:
        build_execution_plan(
            "ship without context",
            tenant_id="tenant_alpha01",
            user_id="user_alpha01",
            agent_id="agent_alpha01",
            task_id="task_alpha01",
            attempt_id="attempt_alpha01",
            execution_id="exec_alpha01",
            conversation_id="conv_alpha01",
        )
    except ValueError as exc:
        payload = json.loads(str(exc))
    else:
        raise AssertionError("missing trace_id must fail closed")
    assert payload["code"] == "PLATFORM_SCHEMA_VALIDATION_FAILED"
    assert payload["details"]["field"] == "trace_id"


def test_provider_metadata_and_disabled_guard(monkeypatch):
    monkeypatch.setenv("NEXUS_HERMES_PLANNER_ONLY", "1")

    from agent.nexus_planner_only_experiment import (
        HERMES_BASELINE_PROVIDER_ID,
        HERMES_PROVIDER_CONTRACT_VERSION,
        assert_nexus_hermes_provider_available,
        baseline_provider_metadata,
        provider_status_view,
    )

    metadata = baseline_provider_metadata()
    assert metadata["provider_id"] == HERMES_BASELINE_PROVIDER_ID
    assert metadata["role"] == "planner-only"
    assert metadata["status"] == "enabled"
    assert metadata["contract_version"] == HERMES_PROVIDER_CONTRACT_VERSION
    assert metadata["schema_versions"] == ["nexus.execution_plan.p3.v1"]
    assert "native-gateway-block" in metadata["capabilities"]
    assert "vendor_path" not in provider_status_view()

    assert assert_nexus_hermes_provider_available()["provider_id"] == HERMES_BASELINE_PROVIDER_ID

    monkeypatch.setenv("NEXUS_HERMES_DISABLED_PROVIDER_IDS", HERMES_BASELINE_PROVIDER_ID)
    try:
        assert_nexus_hermes_provider_available()
    except ValueError as exc:
        payload = json.loads(str(exc))
    else:
        raise AssertionError("disabled planner provider must be rejected")
    assert payload["code"] == "NEXUS_HERMES_PLANNER_ONLY_PROVIDER_DISABLED"
    assert payload["provider_id"] == HERMES_BASELINE_PROVIDER_ID

    monkeypatch.delenv("NEXUS_HERMES_DISABLED_PROVIDER_IDS")
    monkeypatch.setenv("NEXUS_HERMES_DEFAULT_PROVIDER_ID", "hermes-unknown")
    try:
        assert_nexus_hermes_provider_available()
    except ValueError as exc:
        payload = json.loads(str(exc))
    else:
        raise AssertionError("unknown planner provider must be rejected")
    assert payload["code"] == "NEXUS_HERMES_PLANNER_ONLY_PROVIDER_UNKNOWN"


def test_tool_executor_blocks_native_tool_calls(monkeypatch):
    monkeypatch.setenv("NEXUS_HERMES_PLANNER_ONLY", "1")

    from agent.tool_executor import execute_tool_calls_sequential

    calls = []
    agent = SimpleNamespace(_invoke_tool=lambda *args, **kwargs: calls.append(args))
    tool_call = SimpleNamespace(
        id="call-1",
        function=SimpleNamespace(name="memory_search", arguments=json.dumps({"q": "secret"})),
    )
    assistant_message = SimpleNamespace(tool_calls=[tool_call])
    messages = []

    execute_tool_calls_sequential(agent, assistant_message, messages, "task-123")

    assert calls == []
    assert len(messages) == 1
    payload = json.loads(messages[0]["content"])
    assert payload["code"] == "NEXUS_HERMES_PLANNER_ONLY_NATIVE_TOOL_BLOCKED"
    assert payload["tool_intent"]["name"] == "memory_search"


def test_memory_provider_tools_are_hidden_and_blocked(monkeypatch):
    monkeypatch.setenv("NEXUS_HERMES_PLANNER_ONLY", "1")

    from agent.memory_manager import MemoryManager

    class Provider:
        name = "fake"

        def get_tool_schemas(self):
            return [{"name": "provider_search", "description": "x", "parameters": {}}]

        def handle_tool_call(self, tool_name, args, **kwargs):
            raise AssertionError("provider tool must not execute")

    manager = MemoryManager()
    manager._providers = [Provider()]
    manager._tool_to_provider = {"provider_search": manager._providers[0]}

    assert manager.get_all_tool_schemas() == []
    payload = json.loads(manager.handle_tool_call("provider_search", {"q": "x"}))
    assert payload["code"] == "NEXUS_HERMES_PLANNER_ONLY_NATIVE_TOOL_BLOCKED"


def test_file_memory_refuses_direct_read_write(monkeypatch, tmp_path):
    monkeypatch.setenv("NEXUS_HERMES_PLANNER_ONLY", "1")
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / ".hermes"))

    from tools.memory_tool import MemoryStore, memory_tool

    store = MemoryStore()
    store.load_from_disk()

    memories_dir = tmp_path / ".hermes" / "memories"
    assert not memories_dir.exists()
    assert store.memory_entries == []
    assert store.user_entries == []

    result = store.add("memory", "persist me")
    assert result["code"] == "NEXUS_HERMES_MEMORY_GATEWAY_SCOPE_REQUIRED"
    assert not memories_dir.exists()

    payload = json.loads(memory_tool(action="add", target="user", content="Alice", store=store))
    assert payload["code"] == "NEXUS_HERMES_MEMORY_GATEWAY_SCOPE_REQUIRED"
    assert not memories_dir.exists()
