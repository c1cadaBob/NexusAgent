#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
manifest="$project_root/vendor/MANIFEST.yaml"
timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

vendor_names=(hermes-agent-main openclaw-main deepseek-harness-master)
declare -A expected_versions=(
  [hermes-agent-main]="0.20.5"
  [openclaw-main]="2026.8.1"
  [deepseek-harness-master]="0.1.1-rc.2"
)
excluded_directories=(
  .git .hg .svn node_modules .pnpm-store .yarn/cache dist build out coverage
  .cache .turbo .next .vite .venv venv env __pycache__ .pytest_cache .ruff_cache .mypy_cache
)
excluded_files=('*.py[cod]' '*.log')

display_name_for() {
  case "$1" in
    hermes-agent-main) printf 'Hermes' ;;
    openclaw-main) printf 'OpenClaw' ;;
    deepseek-harness-master) printf 'DSH' ;;
  esac
}

role_for() {
  case "$1" in
    hermes-agent-main) printf 'planner-only' ;;
    openclaw-main) printf 'gateway-only' ;;
    deepseek-harness-master) printf 'executor-only' ;;
  esac
}

source_path_for() {
  case "$1" in
    hermes-agent-main) printf '/opt/project/hermes-agent-main' ;;
    openclaw-main) printf '/opt/project/openclaw-main' ;;
    deepseek-harness-master) printf '/opt/project/deepseek-harness-master' ;;
  esac
}

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
      ! -path './.git/*' \
      ! -path './.hg/*' \
      ! -path './.svn/*' \
      ! -path './node_modules/*' \
      ! -path './.pnpm-store/*' \
      ! -path './.yarn/cache/*' \
      ! -path './dist/*' \
      ! -path './build/*' \
      ! -path './out/*' \
      ! -path './coverage/*' \
      ! -path './.cache/*' \
      ! -path './.turbo/*' \
      ! -path './.next/*' \
      ! -path './.vite/*' \
      ! -path './.venv/*' \
      ! -path './venv/*' \
      ! -path './env/*' \
      ! -path './__pycache__/*' \
      ! -path './.pytest_cache/*' \
      ! -path './.ruff_cache/*' \
      ! -path './.mypy_cache/*' \
      ! -name '*.py[cod]' \
      ! -name '*.log' \
      -print0 | LC_ALL=C sort -z | xargs -0 sha256sum
  ) | sha256sum | awk '{print $1}'
}

{
  printf 'generated_at_utc: %s\n' "$timestamp"
  printf 'project_root: /opt/project/NexusAgent\n'
  printf 'snapshot_policy:\n'
  printf '  excluded_directories:\n'
  for excluded_dir in "${excluded_directories[@]}"; do
    printf '    - %s\n' "$excluded_dir"
  done
  printf '  excluded_files:\n'
  for excluded_file in "${excluded_files[@]}"; do
    printf '    - "%s"\n' "$excluded_file"
  done
  printf 'sources:\n'
  for name in "${vendor_names[@]}"; do
    digest="$(tree_sha "$project_root/vendor/$name")"
    version="$(version_for "$name")"
    expected_version="${expected_versions[$name]}"
    if [[ "$version" != "$expected_version" ]]; then
      printf 'ERROR: vendor version drift for %s: expected %s, found %s\n' \
        "$name" "$expected_version" "${version:-<missing>}" >&2
      exit 1
    fi
    printf '  - upstream_name: %s\n' "$(display_name_for "$name")"
    printf '    vendor_name: %s\n' "$name"
    printf '    internal_role: %s\n' "$(role_for "$name")"
    printf '    source_path: %s\n' "$(source_path_for "$name")"
    printf '    vendor_path: /opt/project/NexusAgent/vendor/%s\n' "$name"
    printf '    version: "%s"\n' "$version"
    printf '    snapshot_time_utc: %s\n' "$timestamp"
    printf '    upstream_commit: "【待确认问题】"\n'
    printf '    upstream_remote: "【待确认问题】"\n'
    printf '    file_manifest_sha256: "%s"\n' "$digest"
    printf '    tree_sha256: "%s"\n' "$digest"
    printf '    local_patches: []\n'
  done
} > "$manifest"

printf 'WROTE %s\n' "$manifest"
