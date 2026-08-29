#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

required_files=(
  deploy/docker-compose.dev.lan.yml
  platform/internal-http/index.ts
  scripts/dev/internal-service.mjs
  tests/deployment/dev-lan-orchestration.test.mjs
  tests/integration/dev-lan-internal-http.test.mjs
  tests/security/dev-lan-surface.test.mjs
  docs/operations/development-hot-reload-lan.md
)

for file in "${required_files[@]}"; do
  [[ -f "$file" ]] || fail "missing LAN startup file: $file"
done

rg -q 'NEXUS_RUNTIME_MODE: distributed' deploy/docker-compose.dev.lan.yml || fail 'distributed runtime marker missing'
rg -q 'product/api/server.mjs' deploy/docker-compose.dev.lan.yml || fail 'real platform API command missing'
rg -q 'internal-service.mjs' deploy/docker-compose.dev.lan.yml scripts/dev/internal-service.mjs || fail 'internal service entrypoint marker missing'
rg -q 'NEXUS_DEV_BIND_ADDRESS' product/web-console/vite.config.ts || fail 'console LAN bind marker missing'
rg -q 'NEXUS_API_PROXY_TARGET|platform-api:8080' product/web-console/vite.config.ts || fail 'console API proxy marker missing'
rg -q -- '--store-dir /workspace/product/web-console/node_modules/.pnpm-store' deploy/docker-compose.dev.lan.yml || fail 'console pnpm store named-volume marker missing'
rg -q -- '--inspect=0.0.0.0:9229' deploy/docker-compose.dev.lan.yml || fail 'console inspector process marker missing'
rg -q 'NEXUS_LAN_BIND_ADDRESS' deploy/docker-compose.dev.lan.yml || fail 'LAN bind variable missing'
rg -q 'nexus.internal_service.p8.v1' platform/internal-http/index.ts scripts/dev/internal-service.mjs || fail 'internal service schema marker missing'
rg -q 'caller !== "platform-api"' platform/internal-http/index.ts || fail 'internal caller spoof guard marker missing'

if rg -n 'Date\.now\(' platform/internal-http scripts/dev/internal-service.mjs product/web-console; then
  fail 'Date.now detected in LAN runtime'
fi

docker compose -f deploy/docker-compose.dev.yml -f deploy/docker-compose.dev.lan.yml config --format json >/dev/null \
  || fail 'LAN Compose config failed'

node --test \
  tests/deployment/dev-lan-orchestration.test.mjs \
  tests/integration/dev-lan-internal-http.test.mjs \
  tests/security/dev-lan-surface.test.mjs

echo 'PASS: hot-reload LAN development orchestration, internal HTTP runtime, distributed platform wiring, and isolation'
