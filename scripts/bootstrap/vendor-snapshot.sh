#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
vendor_root="$project_root/vendor"

declare -A sources=(
  [hermes-agent-main]="/opt/project/hermes-agent-main"
  [openclaw-main]="/opt/project/openclaw-main"
  [deepseek-harness-master]="/opt/project/deepseek-harness-master"
)

declare -A expected_versions=(
  [hermes-agent-main]="0.20.5"
  [openclaw-main]="2026.8.1"
  [deepseek-harness-master]="0.1.1-rc.2"
)

exclude_args=(
  --exclude='.git'
  --exclude='.hg'
  --exclude='.svn'
  --exclude='node_modules'
  --exclude='.pnpm-store'
  --exclude='.yarn/cache'
  --exclude='dist'
  --exclude='build'
  --exclude='out'
  --exclude='coverage'
  --exclude='.cache'
  --exclude='.turbo'
  --exclude='.next'
  --exclude='.vite'
  --exclude='.venv'
  --exclude='venv'
  --exclude='env'
  --exclude='__pycache__'
  --exclude='.pytest_cache'
  --exclude='.ruff_cache'
  --exclude='.mypy_cache'
  --exclude='*.py[cod]'
  --exclude='*.log'
)

version_from_dir() {
  local name="$1"
  local source_dir="$2"
  case "$name" in
    hermes-agent-main) sed -n 's/^version = "\([^"]*\)"/\1/p' "$source_dir/pyproject.toml" | head -n 1 ;;
    openclaw-main) sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p' "$source_dir/package.json" | head -n 1 ;;
    deepseek-harness-master) sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p' "$source_dir/package.json" | head -n 1 ;;
  esac
}

for name in hermes-agent-main openclaw-main deepseek-harness-master; do
  source_dir="${sources[$name]}"
  target_dir="$vendor_root/$name"
  if [[ ! -d "$source_dir" ]]; then
    printf 'ERROR: missing upstream source: %s\n' "$source_dir" >&2
    exit 1
  fi
  actual_version="$(version_from_dir "$name" "$source_dir")"
  expected_version="${expected_versions[$name]}"
  if [[ "$actual_version" != "$expected_version" ]]; then
    printf 'ERROR: upstream version drift for %s: expected %s, found %s at %s\n' \
      "$name" "$expected_version" "${actual_version:-<missing>}" "$source_dir" >&2
    printf 'ERROR: refusing to overwrite pinned vendor snapshot; update planning and MANIFEST intentionally before accepting a new upstream version.\n' >&2
    exit 1
  fi
  mkdir -p "$target_dir"
  rsync -a --delete "${exclude_args[@]}" "$source_dir/" "$target_dir/"
  printf 'SNAPSHOT %s -> %s\n' "$source_dir" "$target_dir"
done
