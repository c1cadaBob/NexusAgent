#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

required_files=(
  deploy/docker-compose.prod.yml
  config/services.prod.yaml
  deploy/k8s/namespace.yaml
  deploy/k8s/serviceaccount.yaml
  deploy/k8s/configmap.yaml
  deploy/k8s/secret-template.yaml
  deploy/k8s/deployments.yaml
  deploy/k8s/services.yaml
  deploy/k8s/ingress.yaml
  deploy/k8s/network-policies.yaml
  deploy/k8s/kustomization.yaml
  tests/deployment/p8-production-orchestration.test.mjs
  tests/security/p8-production-isolation.test.mjs
  tests/security/dsh-network-isolation.test.mjs
  tests/security/hermes-network-isolation.test.mjs
  tests/security/openclaw-network-isolation.test.mjs
  tests/smoke/P8.sh
  docs/planning/task-prompts/P8/P8-01.md
  docs/planning/open-questions-register.md
  docs/planning/open-questions/P8-resolution-plan.md
  docs/traceability/requirements-matrix.md
  docs/risks/risk-register.md
  docs/README.md
  tests/smoke/README.md
)

for file in "${required_files[@]}"; do
  [[ -f "$file" ]] || fail "missing P8 required file: $file"
done

audit_block="$(sed -n '/^# P8-01 修改记录包$/,/^## 完整提示词$/p' docs/planning/task-prompts/P8/P8-01.md)"
[[ -n "$audit_block" ]] || fail 'P8-01 audit record package is missing'
if printf '%s\n' "$audit_block" | rg -q '\.\.\.'; then
  fail 'P8-01 audit record package still contains placeholder ellipses'
fi

for audit_marker in \
  '任务与验收条件' \
  '源码证据' \
  '基线测试' \
  '影响面分析' \
  '修改计划与回滚' \
  '待确认问题' \
  '实际变更文件' \
  '关键改动点' \
  '新增测试' \
  '测试结果' \
  '防绕过测试' \
  '回滚验证'; do
  printf '%s\n' "$audit_block" | rg -q "$audit_marker" || fail "P8-01 audit marker missing: $audit_marker"
done

docker compose -f deploy/docker-compose.prod.yml config --format json >/tmp/nexusagent-p8-prod-compose.json

for marker in \
  'nexusagent-prod' \
  'P8-01 production compose template' \
  'nexus-prod-internal' \
  'internal: true' \
  'nexus-prod-edge' \
  'platform-api' \
  'web-console' \
  'openclaw-adapter' \
  'hermes-adapter' \
  'dsh-adapter' \
  'memory-gateway' \
  'artifact-store' \
  'event-bus' \
  'credential-center' \
  'observability'; do
  rg -F -q "$marker" deploy/docker-compose.prod.yml config/services.prod.yaml || fail "P8 Compose/service catalog marker missing: $marker"
done

for marker in \
  'production_primary_path: kubernetes' \
  'production_compose_path: single_node_private_fault_reproduction' \
  'hot_reload: false' \
  'debug_ports: false' \
  'source_bind_mounts: false' \
  'NEXUS_EVENT_BUS_BACKEND_REF' \
  'NEXUS_ARTIFACT_BACKEND_REF' \
  'NEXUS_CREDENTIAL_BACKEND_REF' \
  'NEXUS_MEMORY_BACKEND_REF' \
  'NEXUS_OBSERVABILITY_BACKEND_REF'; do
  rg -F -q "$marker" config/services.prod.yaml deploy/docker-compose.prod.yml || fail "P8 production service inventory marker missing: $marker"
done

for marker in \
  'nexus.p8.production_primary_path: kubernetes' \
  'kind: NetworkPolicy' \
  'default_deny' \
  'public_ingress_only' \
  'platform_governed_internal_only' \
  'allowPrivilegeEscalation: false' \
  'readOnlyRootFilesystem: true' \
  'runAsNonRoot: true' \
  'seccompProfile' \
  'drop:' \
  'ClusterIP' \
  'platform-api-and-web-console-only' \
  '__SET_BY_SECRET_MANAGER__'; do
  rg -F -q "$marker" deploy/k8s || fail "P8 Kubernetes production marker missing: $marker"
done

for marker in \
  'OQ-DEPLOY-001' \
  '已关闭' \
  'Kubernetes 是标准生产主路径' \
  'Docker Compose prod 是单机私有化' \
  'P8-01' \
  '两者都交付但 Kubernetes 优先' \
  '生产 Compose/Kubernetes 编排'; do
  rg -F -q "$marker" docs/planning/open-questions-register.md docs/planning/open-questions/P8-resolution-plan.md docs/traceability/requirements-matrix.md docs/risks/risk-register.md docs/README.md tests/smoke/README.md docs/planning/task-prompts/P8/P8-01.md || fail "P8 OQ/docs marker missing: $marker"
done

if rg -n -- '--watch|--inspect|NEXUS_HOT_RELOAD|NEXUS_DEBUG_PORT|9229|925[0-9]|type: bind|source: \.\./|/opt/project|tools\.invoke|agentCommandFromGatewayIngress|native gateway' deploy/docker-compose.prod.yml deploy/k8s config/services.prod.yaml; then
  fail 'P8 production orchestration leaked dev, debug, source mount, local path, or native entrypoint marker'
fi

if rg -n 'Date\.now\(|datetime\.now\(' deploy/docker-compose.prod.yml deploy/k8s config/services.prod.yaml tests/deployment/p8-production-orchestration.test.mjs tests/security/p8-production-isolation.test.mjs tests/smoke/P8.sh; then
  fail 'wall-clock duration helper detected in P8 production orchestration gate'
fi

if find deploy config tests/deployment -type d \( -name node_modules -o -name dist -o -name coverage -o -name .cache -o -name .vite -o -name __pycache__ \) -print | rg -q .; then
  fail 'P8 deployment surface contains generated dependency/cache/build artifacts'
fi

if find deploy config -type f \( -name '.env' -o -name '.env.*' \) -print | rg -q .; then
  fail 'P8 deployment surface contains environment files'
fi

if rg -n 'AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]+PRIVATE KEY-----|ghp_[A-Za-z0-9_]{30,}|xox[baprs]-[A-Za-z0-9-]{20,}' deploy config docs/planning/open-questions/P8-resolution-plan.md; then
  fail 'P8 production surface contains high-confidence secret pattern'
fi

node --test tests/deployment/p8-production-orchestration.test.mjs tests/security/p8-production-isolation.test.mjs
node --test tests/security/dsh-network-isolation.test.mjs tests/security/hermes-network-isolation.test.mjs tests/security/openclaw-network-isolation.test.mjs

echo 'PASS: P8-01 production Compose/Kubernetes orchestration, static isolation, OQ-DEPLOY-001 closure, and smoke checks'
