"""P3 NexusAgent planner-only gateway isolation tests."""

from __future__ import annotations

import json


def test_run_gateway_blocks_before_native_gateway_start(monkeypatch, capsys):
    monkeypatch.setenv("NEXUS_HERMES_PLANNER_ONLY", "1")

    import hermes_cli.gateway as gateway_cli

    guard_calls = []
    monkeypatch.setattr(gateway_cli, "_guard_official_docker_root_gateway", lambda: guard_calls.append("root"))
    monkeypatch.setattr(gateway_cli, "_guard_named_profile_under_multiplexer", lambda **kwargs: guard_calls.append("profile"))
    monkeypatch.setattr(gateway_cli, "_guard_supervised_gateway_conflict", lambda **kwargs: guard_calls.append("supervised"))
    monkeypatch.setattr(gateway_cli, "_guard_existing_gateway_process_conflict", lambda **kwargs: guard_calls.append("process"))

    result = gateway_cli.run_gateway(verbose=2, quiet=False, replace=True, force=True)
    captured = capsys.readouterr().out.strip()
    payload = json.loads(captured)

    assert result == payload
    assert payload["code"] == "NEXUS_HERMES_PLANNER_ONLY_GATEWAY_BLOCKED"
    assert payload["provider"]["provider_id"] == "hermes-0.20.5"
    assert payload["provider"]["role"] == "planner-only"
    assert payload["trace"]["native_gateway_runtime"] == "blocked"
    assert guard_calls == []


def test_run_gateway_reports_disabled_provider_without_starting(monkeypatch, capsys):
    monkeypatch.setenv("NEXUS_HERMES_PLANNER_ONLY", "1")
    monkeypatch.setenv("NEXUS_HERMES_DISABLED_PROVIDER_IDS", "hermes-0.20.5")
    monkeypatch.setenv("NEXUS_HERMES_ROLLBACK_PROVIDER_ID", "hermes-0.20.5-previous")

    import hermes_cli.gateway as gateway_cli

    result = gateway_cli.run_gateway()
    captured = capsys.readouterr().out.strip()
    payload = json.loads(captured)

    assert result == payload
    assert payload["code"] == "NEXUS_HERMES_PLANNER_ONLY_GATEWAY_BLOCKED"
    assert payload["provider"]["status"] == "disabled"
    assert payload["provider"]["rollback_provider_id"] == "hermes-0.20.5-previous"
