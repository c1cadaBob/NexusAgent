#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$project_root"

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

required_paths=(
  vendor/hermes-agent-main
  vendor/openclaw-main
  vendor/deepseek-harness-master
  vendor/MANIFEST.yaml
  platform/coordinator
  platform/policy-gate
  platform/adapters/hermes
  platform/adapters/openclaw
  platform/adapters/dsh
  product/api
  product/web-console
  deploy/docker-compose.dev.yml
  docs/planning/integrated-platform-plan.md
  docs/contracts/openapi.yaml
  docs/traceability/requirements-matrix.md
)

for path in "${required_paths[@]}"; do
  [[ -e "$path" ]] || fail "missing required path: $path"
done

rg -q 'version: "0\.20\.1"' vendor/MANIFEST.yaml || fail 'Hermes version missing from manifest'
rg -q 'version: "2026\.8\.1"' vendor/MANIFEST.yaml || fail 'OpenClaw version missing from manifest'
rg -q 'version: "0\.1\.0-rc\.5"' vendor/MANIFEST.yaml || fail 'DSH version missing from manifest'
rg -q 'upstream_commit: "【待确认问题】"' vendor/MANIFEST.yaml || fail 'unknown upstream commit must remain explicit'

for section in {0..14}; do
  rg -q "^## ${section}\." docs/planning/integrated-platform-plan.md || fail "planning section ${section} missing"
done

for endpoint in '/v1/tasks:' '/v1/skills:' '/v1/memory/search:' '/v1/tenants:' '/v1/approvals:'; do
  rg -q "^  ${endpoint}" docs/contracts/openapi.yaml || fail "OpenAPI endpoint missing: ${endpoint}"
done

if find vendor -type d \( -name node_modules -o -name .pnpm-store -o -name __pycache__ \) -print -quit | grep -q .; then
  fail 'excluded dependency/cache directory found in vendor snapshot'
fi

git diff --check || fail 'whitespace errors found'
printf 'PASS: P0 structure, vendor manifest, plan sections, OpenAPI placeholders, and exclusions\n'
