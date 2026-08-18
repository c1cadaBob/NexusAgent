#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
vendor_root="$project_root/vendor"

declare -A sources=(
  [hermes-agent-main]="/opt/project/hermes-agent-main"
  [openclaw-main]="/opt/project/openclaw-main"
  [deepseek-harness-master]="/opt/project/deepseek-harness-master"
)

for name in "${!sources[@]}"; do
  source_dir="${sources[$name]}"
  target_dir="$vendor_root/$name"
  if [[ ! -d "$source_dir" ]]; then
    printf 'ERROR: missing upstream source: %s\n' "$source_dir" >&2
    exit 1
  fi
  mkdir -p "$target_dir"
  rsync -a --delete \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='.pnpm-store' \
    --exclude='dist' \
    --exclude='build' \
    --exclude='.venv' \
    --exclude='__pycache__' \
    --exclude='*.log' \
    "$source_dir/" "$target_dir/"
  printf 'SNAPSHOT %s -> %s\n' "$source_dir" "$target_dir"
done
