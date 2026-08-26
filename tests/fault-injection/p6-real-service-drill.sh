#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

project_name="nexusagent-p6-drill"
compose=(docker compose -p "$project_name" -f deploy/docker-compose.dev.yml)
services=(platform-api openclaw-adapter dsh-adapter hermes-adapter memory-gateway artifact-store event-bus)

cleanup() {
  "${compose[@]}" down --remove-orphans --volumes >/dev/null 2>&1 || true
}
trap cleanup EXIT

command -v docker >/dev/null 2>&1 || fail 'docker is required for P6 real service lifecycle drill'
docker compose version >/dev/null 2>&1 || fail 'docker compose is required for P6 real service lifecycle drill'

# P6 real service lifecycle drill: start dev services, stop Hermes, verify OpenClaw + DSH route infrastructure stays healthy, restart Hermes.
cleanup
"${compose[@]}" up -d "${services[@]}" >/dev/null

health_url() {
  case "$1" in
    platform-api) printf 'http://127.0.0.1:3050/health' ;;
    openclaw-adapter) printf 'http://127.0.0.1:3052/health' ;;
    dsh-adapter) printf 'http://127.0.0.1:3053/health' ;;
    hermes-adapter) printf 'http://127.0.0.1:3054/health' ;;
    memory-gateway) printf 'http://127.0.0.1:3055/health' ;;
    artifact-store) printf 'http://127.0.0.1:3056/health' ;;
    event-bus) printf 'http://127.0.0.1:3057/health' ;;
    *) fail "unknown service for health probe: $1" ;;
  esac
}

probe_health() {
  local service="$1"
  local url
  url="$(health_url "$service")"
  node -e "fetch(process.argv[1]).then(async (response) => { const body = await response.json(); if (!response.ok || body.status !== 'ok' || body.service !== process.argv[2]) process.exit(1); }).catch(() => process.exit(1));" "$url" "$service" >/dev/null
}

wait_health() {
  local service="$1"
  local attempts=0
  until probe_health "$service"; do
    attempts=$((attempts + 1))
    if [[ "$attempts" -ge 45 ]]; then
      "${compose[@]}" ps >&2 || true
      fail "service did not become healthy: $service"
    fi
    sleep 1
  done
}

for service in "${services[@]}"; do
  wait_health "$service"
done

"${compose[@]}" stop hermes-adapter >/dev/null
if probe_health hermes-adapter; then
  fail 'Hermes adapter health unexpectedly passed after stop'
fi

for service in platform-api openclaw-adapter dsh-adapter memory-gateway artifact-store event-bus; do
  wait_health "$service"
done

"${compose[@]}" start hermes-adapter >/dev/null
wait_health hermes-adapter

echo 'PASS: P6 real service lifecycle drill kept OpenClaw plus DSH dev services healthy while Hermes was stopped and recovered after restart'
