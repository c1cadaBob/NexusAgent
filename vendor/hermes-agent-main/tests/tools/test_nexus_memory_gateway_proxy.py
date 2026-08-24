"""P3-02 NexusAgent Memory Gateway proxy tests."""

from __future__ import annotations

import json


def _scope():
    return {
        "tenant_id": "tenant_alpha01",
        "user_id": "user_alpha01",
        "agent_id": "agent_alpha01",
        "conversation_id": "conv_alpha01",
        "trace_id": "trace_alpha01",
    }


def _snapshot():
    return {
        "schema_version": "nexus.memory_snapshot.p3.v1",
        "version": 7,
        "rendered": {
            "session": "Current planner turn context",
            "user": "User prefers short updates",
            "agent_skill": "Use Memory Gateway before vendor files",
        },
        "records": [
            {"layer": "session", "text": "Current planner turn context"},
            {"layer": "user", "text": "User prefers short updates"},
            {"layer": "agent_skill", "text": "Use Memory Gateway before vendor files"},
        ],
    }


def test_planner_only_snapshot_loads_from_platform_proxy(monkeypatch, tmp_path):
    monkeypatch.setenv("NEXUS_HERMES_PLANNER_ONLY", "1")
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / ".hermes"))
    monkeypatch.setenv("NEXUS_HERMES_MEMORY_SCOPE_JSON", json.dumps(_scope()))

    from agent.nexus_memory_gateway_proxy import clear_test_memory_gateway_proxy, set_test_memory_gateway_proxy
    from tools.memory_tool import MemoryStore

    calls = []

    def proxy(request):
        calls.append(request)
        assert request["operation"] == "snapshot"
        assert request["scope"]["tenant_id"] == "tenant_alpha01"
        return _snapshot()

    set_test_memory_gateway_proxy(proxy)
    try:
        store = MemoryStore()
        store.load_from_disk()
    finally:
        clear_test_memory_gateway_proxy()

    assert calls
    assert not (tmp_path / ".hermes" / "memories").exists()
    assert store.user_entries == ["User prefers short updates"]
    assert store.memory_entries == ["Use Memory Gateway before vendor files"]
    assert "Current planner turn context" in store._system_prompt_snapshot["memory"]


def test_planner_only_writes_use_platform_proxy(monkeypatch, tmp_path):
    monkeypatch.setenv("NEXUS_HERMES_PLANNER_ONLY", "1")
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / ".hermes"))
    monkeypatch.setenv("NEXUS_HERMES_MEMORY_SCOPE_JSON", json.dumps(_scope()))

    from agent.nexus_memory_gateway_proxy import clear_test_memory_gateway_proxy, set_test_memory_gateway_proxy
    from tools.memory_tool import MemoryStore, memory_tool

    calls = []

    def proxy(request):
        calls.append(request)
        if request["operation"] == "snapshot":
            return _snapshot()
        return {
            "schema_version": "nexus.hermes_memory_proxy.p3.v1",
            "operation": "write",
            "memory_ref": {"memory_id": "memory_alpha01_0001", "layer": "agent_skill", "version": 8},
        }

    set_test_memory_gateway_proxy(proxy)
    try:
        store = MemoryStore()
        store.load_from_disk()
        result = json.loads(memory_tool(action="add", target="memory", content="Proxy this fact", store=store))
    finally:
        clear_test_memory_gateway_proxy()

    assert result["success"] is True
    assert result["memory_ref"]["memory_id"] == "memory_alpha01_0001"
    assert calls[-1]["operation"] == "write"
    assert calls[-1]["target"] == "memory"
    assert not (tmp_path / ".hermes" / "memories").exists()


def test_planner_only_missing_scope_fails_closed_without_files(monkeypatch, tmp_path):
    monkeypatch.setenv("NEXUS_HERMES_PLANNER_ONLY", "1")
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / ".hermes"))
    monkeypatch.delenv("NEXUS_HERMES_MEMORY_SCOPE_JSON", raising=False)

    from tools.memory_tool import MemoryStore

    store = MemoryStore()
    store.load_from_disk()
    result = store.add("memory", "Cannot write without platform scope")

    assert result["success"] is False
    assert result["code"] == "NEXUS_HERMES_MEMORY_GATEWAY_SCOPE_REQUIRED"
    assert not (tmp_path / ".hermes" / "memories").exists()


def test_non_planner_only_file_drift_guard_still_refuses_overwrite(monkeypatch, tmp_path):
    monkeypatch.delenv("NEXUS_HERMES_PLANNER_ONLY", raising=False)
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / ".hermes"))

    from tools.memory_tool import MemoryStore, get_memory_dir

    memory_dir = get_memory_dir()
    memory_dir.mkdir(parents=True)
    path = memory_dir / "MEMORY.md"
    path.write_text("valid entry\nextra raw line without delimiter", encoding="utf-8")

    store = MemoryStore(memory_char_limit=10)
    store.load_from_disk()
    result = store.replace("memory", "valid", "replacement")

    assert result["success"] is False
    assert "drift_backup" in result
    assert path.exists()
