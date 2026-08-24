#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

cleanup_vendor_python_dirs() {
  find vendor/hermes-agent-main -depth -type d \
    \( -name __pycache__ -o -name .pytest_cache -o -name .ruff_cache -o -name .mypy_cache \) \
    -exec rm -rf {} +
}

trap cleanup_vendor_python_dirs EXIT

required_files=(
  platform/adapters/hermes/index.ts
  platform/adapters/hermes/providers/README.md
  platform/adapters/hermes/providers/hermes-0.20.5/README.md
  tests/unit/hermes-provider-registry.test.mjs
  vendor/hermes-agent-main/agent/nexus_planner_only_experiment.py
  vendor/hermes-agent-main/agent/conversation_loop.py
  vendor/hermes-agent-main/agent/tool_executor.py
  vendor/hermes-agent-main/hermes_cli/loops.py
  vendor/hermes-agent-main/hermes_cli/gateway.py
  vendor/hermes-agent-main/tests/agent/test_nexus_planner_only_experiment.py
  vendor/hermes-agent-main/tests/hermes_cli/test_nexus_planner_only_gateway.py
  vendor/hermes-agent-main/tests/hermes_cli/test_nexus_planner_only_loop.py
  docs/architecture/upstream-versioning-and-plugin-bridge.md
  docs/planning/open-questions/P3-resolution-plan.md
  docs/planning/task-prompts/P3/P3-01.md
  docs/traceability/requirements-matrix.md
  docs/risks/risk-register.md
  docs/README.md
  vendor/MANIFEST.yaml
)

for file in "${required_files[@]}"; do
  [[ -f "$file" ]] || fail "missing P3-01 required file: $file"
done

p3_01_audit_block="$(sed -n '/^# P3-01 修改记录包$/,/^## 完整提示词$/p' docs/planning/task-prompts/P3/P3-01.md)"
[[ -n "$p3_01_audit_block" ]] || fail 'P3-01 audit record package is missing'
if printf '%s\n' "$p3_01_audit_block" | rg -q '\.\.\.'; then
  fail 'P3-01 audit record package still contains placeholder ellipses'
fi
for audit_marker in \
  '任务与验收条件' \
  '源码证据' \
  '基线测试' \
  '影响面分析' \
  '修改计划与回滚' \
  '待确认问题' \
  '实际变更文件' \
  '测试结果' \
  '回滚验证'; do
  printf '%s\n' "$p3_01_audit_block" | rg -q "$audit_marker" || fail "P3-01 audit marker missing: $audit_marker"
done

for marker in \
  'task_id: P3-01' \
  'NexusAgent P3 Hermes planner-only provider boundary hardening' \
  'test_nexus_planner_only_gateway.py' \
  'platform/adapters/hermes/index.ts'; do
  rg -q "$marker" vendor/MANIFEST.yaml || fail "vendor manifest missing P3-01 marker: $marker"
done

for marker in \
  'HERMES_BASELINE_PROVIDER_ID' \
  'nexus.hermes_provider.p3.v1' \
  'NEXUS_HERMES_DISABLED_PROVIDER_IDS' \
  'NEXUS_HERMES_PLANNER_ONLY_GATEWAY_BLOCKED' \
  'native_gateway_runtime'; do
  rg -q "$marker" vendor/hermes-agent-main/agent/nexus_planner_only_experiment.py vendor/hermes-agent-main/hermes_cli/gateway.py || fail "Hermes P3 provider guard marker missing: $marker"
done

for marker in \
  'HermesProviderRegistry' \
  'provider-disable' \
  'provider-rollback' \
  'rollbackDefault' \
  'memory-gateway-required'; do
  rg -q "$marker" platform/adapters/hermes/index.ts tests/unit/hermes-provider-registry.test.mjs || fail "Hermes provider registry marker missing: $marker"
done

rg -q 'build_planner_only_turn_result' vendor/hermes-agent-main/agent/conversation_loop.py || fail 'conversation loop planner-only handoff missing'
rg -q 'build_blocked_tool_result' vendor/hermes-agent-main/agent/tool_executor.py || fail 'tool executor native tool block missing'
rg -q 'blocked_loop_output' vendor/hermes-agent-main/hermes_cli/loops.py || fail 'loop planner-only block missing'
rg -q 'build_blocked_gateway_result' vendor/hermes-agent-main/hermes_cli/gateway.py || fail 'gateway planner-only block missing'

if rg -qi 'Hermes|OpenClaw|DeepSeek|DSH' docs/contracts/openapi.yaml platform/contracts/platform-error.schema.json product; then
  fail 'public API/error/product surface leaked upstream native naming'
fi

node --test tests/unit/hermes-provider-registry.test.mjs

if python3 -c 'import pytest' >/dev/null 2>&1; then
  (
    cd vendor/hermes-agent-main
    python3 -m pytest \
      tests/agent/test_nexus_planner_only_experiment.py \
      tests/hermes_cli/test_nexus_planner_only_loop.py \
      tests/hermes_cli/test_nexus_planner_only_gateway.py
  )
else
  python3 - <<'PY'
import contextlib
import io
import json
import os
import sys
from types import SimpleNamespace

repo_root = os.getcwd()
vendor_root = os.path.join(repo_root, "vendor", "hermes-agent-main")
sys.path.insert(0, vendor_root)

os.environ["NEXUS_HERMES_PLANNER_ONLY"] = "1"
os.environ.pop("NEXUS_HERMES_DISABLED_PROVIDER_IDS", None)
os.environ.pop("NEXUS_HERMES_ROLLBACK_PROVIDER_ID", None)

from agent.nexus_planner_only_experiment import (
    HERMES_BASELINE_PROVIDER_ID,
    assert_nexus_hermes_provider_available,
    baseline_provider_metadata,
    build_execution_plan,
    provider_status_view,
)

metadata = baseline_provider_metadata()
assert metadata["provider_id"] == HERMES_BASELINE_PROVIDER_ID
assert metadata["role"] == "planner-only"
assert metadata["status"] == "enabled"
assert "native-gateway-block" in metadata["capabilities"]
assert "vendor_path" not in provider_status_view()
assert assert_nexus_hermes_provider_available()["provider_id"] == HERMES_BASELINE_PROVIDER_ID
plan = build_execution_plan("ship the platform task", task_id="task_alpha01", conversation_id="conv_alpha01", trace_id="trace_alpha01")
assert plan["schema_version"] == "nexus.execution_plan.p0.v1"
assert plan["trace"]["native_gateway_runtime"] == "blocked"

from agent.tool_executor import execute_tool_calls_sequential

messages = []
agent = SimpleNamespace(_invoke_tool=lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("native tool executed")))
tool_call = SimpleNamespace(id="call-1", function=SimpleNamespace(name="memory_search", arguments=json.dumps({"q": "secret"})))
execute_tool_calls_sequential(agent, SimpleNamespace(tool_calls=[tool_call]), messages, "task_alpha01")
assert json.loads(messages[0]["content"])["code"] == "NEXUS_HERMES_PLANNER_ONLY_NATIVE_TOOL_BLOCKED"

from hermes_cli.loops import dispatch_loop_command

class FakeLoopManager:
    def __init__(self):
        self.set_calls = []
        self.resume_calls = 0
    def status_line(self):
        return "No loop set."
    def pause(self, reason="user-paused"):
        return None
    def resume(self):
        self.resume_calls += 1
        return SimpleNamespace(prompt="blocked", cadence_label=lambda: "1m")
    def clear(self):
        return True
    def has_loop(self):
        return False
    def set(self, *args, **kwargs):
        self.set_calls.append((args, kwargs))
        raise AssertionError("native loop executed")

loop_result = dispatch_loop_command(FakeLoopManager(), "5m check CI")
assert loop_result["code"] == "NEXUS_HERMES_PLANNER_ONLY_LOOP_BLOCKED"

import hermes_cli.gateway as gateway_cli

guard_calls = []
gateway_cli._guard_official_docker_root_gateway = lambda: guard_calls.append("root")
gateway_cli._guard_named_profile_under_multiplexer = lambda **kwargs: guard_calls.append("profile")
gateway_cli._guard_supervised_gateway_conflict = lambda **kwargs: guard_calls.append("supervised")
gateway_cli._guard_existing_gateway_process_conflict = lambda **kwargs: guard_calls.append("process")
stdout = io.StringIO()
with contextlib.redirect_stdout(stdout):
    gateway_result = gateway_cli.run_gateway(verbose=2, quiet=False, replace=True, force=True)
gateway_payload = json.loads(stdout.getvalue())
assert gateway_result == gateway_payload
assert gateway_payload["code"] == "NEXUS_HERMES_PLANNER_ONLY_GATEWAY_BLOCKED"
assert guard_calls == []

os.environ["NEXUS_HERMES_DISABLED_PROVIDER_IDS"] = HERMES_BASELINE_PROVIDER_ID
try:
    assert_nexus_hermes_provider_available()
except ValueError as exc:
    payload = json.loads(str(exc))
else:
    raise AssertionError("disabled planner provider must be rejected")
assert payload["code"] == "NEXUS_HERMES_PLANNER_ONLY_PROVIDER_DISABLED"

os.environ.pop("NEXUS_HERMES_DISABLED_PROVIDER_IDS", None)
os.environ["NEXUS_HERMES_DEFAULT_PROVIDER_ID"] = "hermes-unknown"
try:
    assert_nexus_hermes_provider_available()
except ValueError as exc:
    payload = json.loads(str(exc))
else:
    raise AssertionError("unknown planner provider must be rejected")
assert payload["code"] == "NEXUS_HERMES_PLANNER_ONLY_PROVIDER_UNKNOWN"
PY
fi

echo 'PASS: P3 Hermes planner-only provider registry, native gateway/tool/loop/memory guards, manifest, audit package, and public leakage guard'
