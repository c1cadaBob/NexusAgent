#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
manifest="$project_root/vendor/MANIFEST.yaml"
timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

version_for() {
  case "$1" in
    hermes-agent-main) sed -n 's/^version = "\([^"]*\)"/\1/p' "$project_root/vendor/$1/pyproject.toml" | head -n 1 ;;
    openclaw-main) sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p' "$project_root/vendor/$1/package.json" | head -n 1 ;;
    deepseek-harness-master) sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p' "$project_root/vendor/$1/package.json" | head -n 1 ;;
  esac
}

tree_sha() {
  local dir="$1"
  (
    cd "$dir"
    find . -type f \
      ! -path './node_modules/*' \
      ! -path './.pnpm-store/*' \
      ! -path './dist/*' \
      ! -path './build/*' \
      ! -path './.venv/*' \
      ! -path './__pycache__/*' \
      ! -name '*.log' \
      -print0 | LC_ALL=C sort -z | xargs -0 sha256sum
  ) | sha256sum | awk '{print $1}'
}

{
  printf 'generated_at_utc: %s\n' "$timestamp"
  printf 'project_root: /opt/project/NexusAgent\n'
  printf 'sources:\n'
  for name in hermes-agent-main openclaw-main deepseek-harness-master; do
    printf '  - name: %s\n' "$name"
    case "$name" in
      hermes-agent-main) printf '    source_path: /opt/project/hermes-agent-main\n' ;;
      openclaw-main) printf '    source_path: /opt/project/openclaw-main\n' ;;
      deepseek-harness-master) printf '    source_path: /opt/project/deepseek-harness-master\n' ;;
    esac
    printf '    version: "%s"\n' "$(version_for "$name")"
    printf '    upstream_commit: "【待确认问题】"\n'
    printf '    upstream_remote: "【待确认问题】"\n'
    printf '    tree_sha256: "%s"\n' "$(tree_sha "$project_root/vendor/$name")"
    printf '    local_patches: []\n'
  done
} > "$manifest"

printf 'WROTE %s\n' "$manifest"
