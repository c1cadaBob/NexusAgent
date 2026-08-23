"""P0 NexusAgent planner-only /loop isolation tests."""

from __future__ import annotations

from types import SimpleNamespace


class _FakeLoopManager:
    def __init__(self):
        self.set_calls = []
        self.resume_calls = 0
        self.clear_calls = 0

    def status_line(self):
        return "No loop set."

    def pause(self, reason="user-paused"):
        return None

    def resume(self):
        self.resume_calls += 1
        return SimpleNamespace(prompt="blocked", cadence_label=lambda: "1m")

    def clear(self):
        self.clear_calls += 1
        return True

    def has_loop(self):
        return False

    def set(self, *args, **kwargs):
        self.set_calls.append((args, kwargs))
        raise AssertionError("native loop creation must not run")


def test_dispatch_loop_command_blocks_creation_and_resume(monkeypatch):
    monkeypatch.setenv("NEXUS_HERMES_PLANNER_ONLY", "1")

    from hermes_cli.loops import dispatch_loop_command

    manager = _FakeLoopManager()

    created = dispatch_loop_command(manager, "5m check CI")
    assert created["created"] is False
    assert created["code"] == "NEXUS_HERMES_PLANNER_ONLY_LOOP_BLOCKED"
    assert manager.set_calls == []

    resumed = dispatch_loop_command(manager, "resume")
    assert resumed["created"] is False
    assert resumed["code"] == "NEXUS_HERMES_PLANNER_ONLY_LOOP_BLOCKED"
    assert manager.resume_calls == 0

    stopped = dispatch_loop_command(manager, "stop")
    assert stopped["created"] is False
    assert manager.clear_calls == 1


def test_fire_tick_pauses_existing_native_loop(monkeypatch):
    monkeypatch.setenv("NEXUS_HERMES_PLANNER_ONLY", "1")

    from hermes_cli.loops import LoopManager

    manager = LoopManager.__new__(LoopManager)
    manager._state = SimpleNamespace(status="active")
    reasons = []

    def _pause(reason="user-paused"):
        reasons.append(reason)
        manager._state.status = "paused"
        return manager._state

    manager.pause = _pause

    assert manager.fire_tick() is None
    assert reasons == ["nexus-planner-only-blocked"]
    assert manager._state.status == "paused"

