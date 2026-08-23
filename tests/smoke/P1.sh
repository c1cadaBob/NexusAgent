#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

required_files=(
  platform/contracts/common-identifiers.schema.json
  platform/contracts/task-request.schema.json
  platform/contracts/task-state.schema.json
  platform/contracts/event-envelope.schema.json
  platform/contracts/artifact-reference.schema.json
  platform/contracts/credential-reference.schema.json
  platform/contracts/platform-error.schema.json
  platform/task-state/index.ts
  platform/policy-gate/index.ts
  platform/coordinator/index.ts
  platform/clock/index.ts
  platform/event-bus/index.ts
  platform/adapters/index.ts
  platform/artifact-store/index.ts
  platform/memory-gateway/index.ts
  platform/credentials/index.ts
  platform/tenancy/index.ts
  platform/rbac/index.ts
  platform/audit/index.ts
  platform/observability/index.ts
  deploy/docker-compose.dev.yml
  deploy/docker-compose.prod.yml
  config/ports.dev.yaml
  config/services.dev.yaml
  docs/architecture/ports.md
  scripts/dev/p1-dev-service.mjs
  tests/unit/task-state.test.mjs
  tests/unit/policy-gate.test.mjs
  tests/unit/clock.test.mjs
  tests/unit/event-bus.test.mjs
  tests/unit/adapters.test.mjs
  tests/unit/artifact-store.test.mjs
  tests/unit/memory-gateway.test.mjs
  tests/unit/credentials.test.mjs
  tests/unit/tenancy.test.mjs
  tests/unit/rbac.test.mjs
  tests/unit/audit.test.mjs
  tests/unit/observability.test.mjs
  tests/contract/p1-contracts.test.mjs
  tests/integration/coordinator-policy-gate.test.mjs
  tests/integration/coordinator-adapter-event-bus.test.mjs
  tests/integration/data-spine-event-bus.test.mjs
  tests/integration/tenancy-rbac-audit-trace.test.mjs
  tests/security/policy-gate-bypass.test.mjs
  tests/security/adapter-bypass.test.mjs
  tests/security/data-spine-isolation.test.mjs
  tests/security/tenant-rbac-audit-guards.test.mjs
)

for file in "${required_files[@]}"; do
  [[ -f "$file" ]] || fail "missing P1-01 required file: $file"
done

rg -q 'nexus.task_state.v1' platform/contracts/task-state.schema.json || fail 'task-state schema missing version'
rg -q 'nexus.event_envelope.v1' platform/contracts/event-envelope.schema.json || fail 'event-envelope schema missing version'
rg -q 'PLATFORM_INVALID_STATE_TRANSITION' platform/contracts/platform-error.schema.json platform/task-state/index.ts || fail 'state transition error code missing'
rg -q 'PLATFORM_CROSS_TENANT_ID' platform/contracts/platform-error.schema.json platform/task-state/index.ts || fail 'cross-tenant error code missing'
rg -q 'TASK_STATE_LAYERS' platform/task-state/index.ts || fail 'task-state layers missing'
rg -q 'task.state_transition_rejected' platform/contracts/event-envelope.schema.json || fail 'event envelope missing rejected transition type'
rg -q 'PolicyGate' platform/policy-gate/index.ts || fail 'Policy-Gate implementation missing'
rg -q 'Coordinator' platform/coordinator/index.ts || fail 'Coordinator implementation missing'
rg -q 'assertAllowedDecision' platform/policy-gate/index.ts platform/coordinator/index.ts || fail 'Policy-Gate guard missing'
rg -q 'invokeSecuredAdapter' platform/coordinator/index.ts tests/security/policy-gate-bypass.test.mjs || fail 'secured adapter invocation missing'
rg -q 'ManualClock' platform/clock/index.ts tests/unit/clock.test.mjs || fail 'manual platform clock missing'
rg -q 'InMemoryEventBus' platform/event-bus/index.ts tests/unit/event-bus.test.mjs || fail 'in-memory event bus missing'
rg -q 'AdapterRegistry' platform/adapters/index.ts tests/unit/adapters.test.mjs || fail 'adapter registry missing'
rg -q 'MockPlannerAdapter' platform/adapters/index.ts tests/integration/coordinator-adapter-event-bus.test.mjs || fail 'mock planner adapter missing'
rg -q 'deadLetter' platform/event-bus/index.ts tests/unit/event-bus.test.mjs || fail 'event bus dead-letter behavior missing'
rg -q 'LocalArtifactStore' platform/artifact-store/index.ts tests/unit/artifact-store.test.mjs || fail 'artifact store implementation missing'
rg -q 'LocalMemoryGateway' platform/memory-gateway/index.ts tests/unit/memory-gateway.test.mjs || fail 'memory gateway implementation missing'
rg -q 'LocalCredentialCenter' platform/credentials/index.ts tests/unit/credentials.test.mjs || fail 'credential center implementation missing'
rg -q 'secret_scan_required' platform/contracts/credential-reference.schema.json platform/credentials/index.ts || fail 'credential redaction policy missing'
rg -q 'LocalTenantRegistry' platform/tenancy/index.ts tests/unit/tenancy.test.mjs || fail 'tenant registry implementation missing'
rg -q 'LocalRbacPolicy' platform/rbac/index.ts tests/unit/rbac.test.mjs || fail 'rbac policy implementation missing'
rg -q 'LocalAuditLog' platform/audit/index.ts tests/unit/audit.test.mjs || fail 'audit log implementation missing'
rg -q 'PLATFORM_AUDIT_CHAIN_BROKEN' platform/contracts/platform-error.schema.json platform/audit/index.ts tests/unit/audit.test.mjs || fail 'audit chain error code missing'
rg -q 'LocalObservability' platform/observability/index.ts tests/unit/observability.test.mjs || fail 'observability implementation missing'
rg -q 'Tenancy, RBAC, Policy-Gate, Audit, and Observability' tests/integration/tenancy-rbac-audit-trace.test.mjs || fail 'tenancy/rbac/audit/trace integration test missing'
rg -q 'PLATFORM_CONFIG_INVALID' platform/contracts/platform-error.schema.json docs/contracts/openapi.yaml || fail 'config invalid platform error code missing'
rg -q 'PLATFORM_PORT_CONFLICT' platform/contracts/platform-error.schema.json docs/contracts/openapi.yaml || fail 'port conflict platform error code missing'
rg -q 'PLATFORM_SERVICE_UNHEALTHY' platform/contracts/platform-error.schema.json docs/contracts/openapi.yaml || fail 'service health platform error code missing'

if rg -n 'Date\.now\(|datetime\.now\(' platform/task-state platform/contracts platform/policy-gate platform/coordinator platform/clock platform/event-bus platform/adapters platform/artifact-store platform/memory-gateway platform/credentials platform/tenancy platform/rbac platform/audit platform/observability; then
  fail 'wall-clock duration helper detected in P1 contracts or core service code'
fi

if rg -n 'Hermes|OpenClaw|DeepSeek|DSH|hermes|openclaw|deepseek' \
  platform/task-state \
  platform/policy-gate \
  platform/coordinator \
  platform/clock \
  platform/event-bus \
  platform/adapters/index.ts \
  platform/artifact-store \
  platform/memory-gateway \
  platform/credentials \
  platform/tenancy \
  platform/rbac \
  platform/audit \
  platform/observability \
  platform/contracts/common-identifiers.schema.json \
  platform/contracts/task-request.schema.json \
  platform/contracts/task-state.schema.json \
  platform/contracts/event-envelope.schema.json \
  platform/contracts/artifact-reference.schema.json \
  platform/contracts/credential-reference.schema.json; then
  fail 'P1 public contracts leaked native upstream naming'
fi

compose_json="$(docker compose -f deploy/docker-compose.dev.yml config --format json)" || fail 'development compose config failed'
NEXUS_P1_COMPOSE_JSON="$compose_json" python3 - <<'PY'
import json
import os
from pathlib import Path

import yaml


def fail(message):
    raise SystemExit(f"FAIL: {message}")


repo_root = Path.cwd()
ports_config = yaml.safe_load((repo_root / "config/ports.dev.yaml").read_text())
services_config = yaml.safe_load((repo_root / "config/services.dev.yaml").read_text())
compose_config = json.loads(os.environ["NEXUS_P1_COMPOSE_JSON"])

expected_services = list(ports_config["services"].keys())
ports_services = ports_config["services"]
services = services_config["services"]
compose_services = compose_config.get("services", {})

if set(services) != set(expected_services):
    fail(f"services.dev.yaml service set drift: {sorted(set(services) ^ set(expected_services))}")
if set(compose_services) != set(expected_services):
    fail(f"docker-compose.dev.yml service set drift: {sorted(set(compose_services) ^ set(expected_services))}")

base_host_port = int(ports_config["base_host_port"])
debug_base_port = int(ports_config["debug_base_port"])
debug_container_port = int(ports_config.get("debug_container_port", services_config.get("debug_container_port", 9229)))

host_ports = [int(ports_services[name]["host"]) for name in expected_services]
debug_ports = [int(ports_services[name]["debug"]) for name in expected_services]
if host_ports != list(range(base_host_port, base_host_port + len(expected_services))):
    fail(f"service host ports must be continuous from {base_host_port}: {host_ports}")
if debug_ports != list(range(debug_base_port, debug_base_port + len(expected_services))):
    fail(f"debug ports must be continuous from {debug_base_port}: {debug_ports}")
if len(set(host_ports + debug_ports)) != len(host_ports + debug_ports):
    fail("service and debug ports must not conflict")

expected_volume_targets = {"/workspace/platform", "/workspace/product", "/workspace/scripts", "/workspace/config"}
for name in expected_services:
    port_entry = ports_services[name]
    service_entry = services[name]
    compose_entry = compose_services[name]

    if service_entry.get("command") == "development placeholder":
        fail(f"{name} still uses placeholder command")
    if service_entry.get("source") in (None, ""):
        fail(f"{name} missing source path")
    if not (repo_root / service_entry["source"]).exists():
        fail(f"{name} source path does not exist: {service_entry['source']}")
    if service_entry.get("hot_reload") is not True or service_entry.get("debug") is not True:
        fail(f"{name} must enable hot_reload and debug in services.dev.yaml")
    if bool(service_entry.get("public")) != bool(port_entry.get("public")):
        fail(f"{name} public flag drift between ports and services config")
    if int(service_entry.get("container_port")) != int(port_entry.get("container")):
        fail(f"{name} container port drift between ports and services config")

    command = compose_entry.get("command", [])
    command_text = " ".join(command) if isinstance(command, list) else str(command)
    if command_text != service_entry["command"]:
        fail(f"{name} command drift between compose and services.dev.yaml: {command_text}")
    for marker in ("node --watch", "--inspect=0.0.0.0:9229", "scripts/dev/p1-dev-service.mjs"):
        if marker not in command_text:
            fail(f"{name} command missing marker: {marker}")

    env = compose_entry.get("environment", {})
    for key in ("NEXUS_SERVICE_NAME", "NEXUS_PUBLIC", "NEXUS_HOT_RELOAD", "NEXUS_DEBUG_PORT", "PORT"):
        if key not in env:
            fail(f"{name} compose environment missing {key}")
    if env["NEXUS_SERVICE_NAME"] != name:
        fail(f"{name} NEXUS_SERVICE_NAME drift")
    if env["NEXUS_HOT_RELOAD"] != "true":
        fail(f"{name} hot reload env must be true")
    if env["NEXUS_PUBLIC"] != str(bool(port_entry.get("public"))).lower():
        fail(f"{name} NEXUS_PUBLIC drift")
    if int(env["NEXUS_DEBUG_PORT"]) != int(port_entry["debug"]):
        fail(f"{name} NEXUS_DEBUG_PORT drift")
    if int(env["PORT"]) != int(port_entry["container"]):
        fail(f"{name} PORT drift")

    labels = compose_entry.get("labels", {})
    if labels.get("nexus.dev.hot_reload") != "true":
        fail(f"{name} missing hot reload label")
    if labels.get("nexus.service.public") != str(bool(port_entry.get("public"))).lower():
        fail(f"{name} public label drift")

    volume_targets = {volume.get("target") for volume in compose_entry.get("volumes", [])}
    if expected_volume_targets - volume_targets:
        fail(f"{name} missing source volume targets: {sorted(expected_volume_targets - volume_targets)}")

    healthcheck = compose_entry.get("healthcheck")
    if not healthcheck or "/health" not in " ".join(healthcheck.get("test", [])):
        fail(f"{name} missing /health healthcheck")

    published = {int(port["published"]): port for port in compose_entry.get("ports", [])}
    if int(port_entry["host"]) not in published:
        fail(f"{name} missing published service port {port_entry['host']}")
    if int(port_entry["debug"]) not in published:
        fail(f"{name} missing published debug port {port_entry['debug']}")
    service_port = published[int(port_entry["host"])]
    debug_port = published[int(port_entry["debug"])]
    if int(service_port["target"]) != int(port_entry["container"]):
        fail(f"{name} service port target drift")
    if int(debug_port["target"]) != debug_container_port:
        fail(f"{name} debug port target must be {debug_container_port}")
    if debug_port.get("host_ip") != "127.0.0.1":
        fail(f"{name} debug port must bind to 127.0.0.1")
    if not bool(port_entry.get("public")) and service_port.get("host_ip") != "127.0.0.1":
        fail(f"{name} internal service port must bind to 127.0.0.1")

prod_compose = (repo_root / "deploy/docker-compose.prod.yml").read_text()
for forbidden in ("--inspect", "NEXUS_HOT_RELOAD", "9250", "9251", "9252", "9253", "9254", "9255", "9256", "9257", "9258", "9259"):
    if forbidden in prod_compose:
        fail(f"production compose contains dev-only marker: {forbidden}")

platform_error = json.loads((repo_root / "platform/contracts/platform-error.schema.json").read_text())
openapi = yaml.safe_load((repo_root / "docs/contracts/openapi.yaml").read_text())
platform_codes = platform_error["properties"]["code"]["enum"]
openapi_codes = openapi["components"]["schemas"]["PlatformErrorCode"]["enum"]
if platform_codes != openapi_codes:
    fail(f"PlatformErrorCode drift: platform={platform_codes}, openapi={openapi_codes}")
for code in platform_codes:
    upper = code.upper()
    if any(term in upper for term in ("HERMES", "OPENCLAW", "DEEPSEEK", "DSH", "NATIVE")):
        fail(f"public platform error code leaks native upstream naming: {code}")

print("PASS: P1 dev compose, ports, services, production isolation, and platform error codes")
PY

node --test \
  tests/unit/task-state.test.mjs \
  tests/unit/policy-gate.test.mjs \
  tests/unit/clock.test.mjs \
  tests/unit/event-bus.test.mjs \
  tests/unit/adapters.test.mjs \
  tests/unit/artifact-store.test.mjs \
  tests/unit/memory-gateway.test.mjs \
  tests/unit/credentials.test.mjs \
  tests/unit/tenancy.test.mjs \
  tests/unit/rbac.test.mjs \
  tests/unit/audit.test.mjs \
  tests/unit/observability.test.mjs \
  tests/contract/p1-contracts.test.mjs \
  tests/integration/coordinator-policy-gate.test.mjs \
  tests/integration/coordinator-adapter-event-bus.test.mjs \
  tests/integration/data-spine-event-bus.test.mjs \
  tests/integration/tenancy-rbac-audit-trace.test.mjs \
  tests/security/policy-gate-bypass.test.mjs \
  tests/security/adapter-bypass.test.mjs \
  tests/security/data-spine-isolation.test.mjs \
  tests/security/tenant-rbac-audit-guards.test.mjs

echo 'PASS: P1 contracts, task-state, Policy-Gate, Coordinator, Clock, Event Bus, adapters, data services, tenancy/RBAC/audit/observability, dev orchestration, ports, platform errors, and bypass guards'
