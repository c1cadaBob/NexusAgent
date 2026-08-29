#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

required_files=(
  .github/workflows/p8-release-gate.yml
  deploy/docker/platform-api.Dockerfile
  deploy/docker/web-console.Dockerfile
  deploy/docker/web-console-server.mjs
  deploy/docker/README.md
  deploy/docker-compose.prod.yml
  config/services.prod.yaml
  config/release-gate.p8.json
  config/provider-compatibility.p8.json
  config/plugin-compatibility.p8.json
  config/observability-alerts.p8.json
  config/backup-restore.p8.json
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
  tests/deployment/p8-release-gate.test.mjs
  tests/deployment/p8-provider-compatibility.test.mjs
  tests/deployment/p8-observability-alerts.test.mjs
  tests/deployment/p8-backup-restore-drill.test.mjs
  tests/security/p8-production-isolation.test.mjs
  tests/security/p8-release-supply-chain.test.mjs
  tests/security/p8-backup-secret-isolation.test.mjs
  tests/security/dsh-network-isolation.test.mjs
  tests/security/hermes-network-isolation.test.mjs
  tests/security/openclaw-network-isolation.test.mjs
  scripts/quality/validate-p8-release-gate.mjs
  scripts/quality/validate-p8-observability-alerts.mjs
  scripts/quality/validate-p8-backup-restore.mjs
  scripts/upstream-tracking/validate-provider-compatibility.mjs
  scripts/upstream-tracking/weekly-upstream-check.mjs
  scripts/upstream-tracking/generate-release-manifest.mjs
  tests/smoke/P8.sh
  docs/planning/task-prompts/P8/P8-01.md
  docs/planning/task-prompts/P8/P8-02.md
  docs/planning/task-prompts/P8/P8-03.md
  docs/operations/release-gate.md
  docs/operations/provider-plugin-compatibility.md
  docs/operations/observability-alerts.md
  docs/operations/backup-restore.md
  docs/operations/incident-restore-drill.md
  platform/observability/readiness.ts
  platform/backup-restore/index.ts
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

p802_audit_block="$(sed -n '/^# P8-02 修改记录包$/,/^## 完整提示词$/p' docs/planning/task-prompts/P8/P8-02.md)"
[[ -n "$p802_audit_block" ]] || fail 'P8-02 audit record package is missing'
if printf '%s\n' "$p802_audit_block" | rg -q '\.\.\.'; then
  fail 'P8-02 audit record package still contains placeholder ellipses'
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
  printf '%s\n' "$p802_audit_block" | rg -q "$audit_marker" || fail "P8-02 audit marker missing: $audit_marker"
done

p803_audit_block="$(sed -n '/^# P8-03 修改记录包$/,/^## 完整提示词$/p' docs/planning/task-prompts/P8/P8-03.md)"
[[ -n "$p803_audit_block" ]] || fail 'P8-03 audit record package is missing'
if printf '%s\n' "$p803_audit_block" | rg -q '\.\.\.'; then
  fail 'P8-03 audit record package still contains placeholder ellipses'
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
  printf '%s\n' "$p803_audit_block" | rg -q "$audit_marker" || fail "P8-03 audit marker missing: $audit_marker"
done

docker compose -f deploy/docker-compose.prod.yml config --format json >/tmp/nexusagent-p8-prod-compose.json

node scripts/quality/validate-p8-release-gate.mjs >/tmp/nexusagent-p8-release-gate.txt
node scripts/quality/validate-p8-observability-alerts.mjs >/tmp/nexusagent-p8-observability-alerts.txt
node scripts/quality/validate-p8-backup-restore.mjs >/tmp/nexusagent-p8-backup-restore.txt
node scripts/upstream-tracking/validate-provider-compatibility.mjs >/tmp/nexusagent-p8-provider-compatibility.txt
node scripts/upstream-tracking/weekly-upstream-check.mjs >/tmp/nexusagent-p8-upstream-check.json
node scripts/upstream-tracking/generate-release-manifest.mjs >/tmp/nexusagent-p8-release-manifest.json

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

for marker in \
  'nexus.release_gate.p8.v1' \
  'tag_push_ghcr' \
  'canary_first' \
  'optional_remote' \
  'real_runtime_only' \
  'P8-02_RELEASE_PAUSE_CANARY_ONLY' \
  'ghcr.io/c1cadabob/nexusagent/platform-api' \
  'ghcr.io/c1cadabob/nexusagent/web-console' \
  'docker/login-action@v3' \
  'docker/build-push-action@v6' \
  'P8-02_GENERATED_ARTIFACT_CLEANUP' \
  'secrets.GITHUB_TOKEN'; do
  rg -F -q "$marker" .github/workflows/p8-release-gate.yml config/release-gate.p8.json docs/operations/release-gate.md || fail "P8-02 release gate marker missing: $marker"
done

for marker in \
  'nexus.provider_compatibility.p8.v1' \
  'nexus.plugin_compatibility.p8.v1' \
  'P8-02_PROVIDER_BREAKING_CHANGE_PAUSE' \
  'P8-02_PLUGIN_UPGRADE_GATE_PAUSE' \
  'upstream_identity_unconfirmed' \
  'rollback_target' \
  'production_default_may_promote' \
  'tenant_self_service_third_party_install' \
  'release_pause' \
  'UPSTREAM_IDENTITY_UNCONFIRMED'; do
  rg -F -q "$marker" config/provider-compatibility.p8.json config/plugin-compatibility.p8.json docs/operations/provider-plugin-compatibility.md /tmp/nexusagent-p8-upstream-check.json /tmp/nexusagent-p8-release-manifest.json || fail "P8-02 compatibility/upstream marker missing: $marker"
done

for marker in \
  'nexus.observability_readiness.p8.v1' \
  'nexus.backup_restore.p8.v1' \
  'backup_restore_p8_03_production_default' \
  'observability_readiness_p8_03_production_default' \
  'rpo_minutes' \
  'rto_hours' \
  '15m' \
  '4h' \
  'nats_jetstream' \
  's3_compatible_object_store' \
  'vault' \
  'postgres_pgvector' \
  'otel_prometheus_loki_tempo' \
  'audit_hash_chain_verified' \
  'event_order_and_dlq_replay_verified' \
  'artifact_sha256_verified' \
  'memory_version_continuity_verified' \
  'credential_reference_hash_only_verified' \
  'observability_readiness_reported' \
  'rpo_15m_rto_4h_recorded'; do
  rg -F -q "$marker" config/observability-alerts.p8.json config/backup-restore.p8.json config/services.prod.yaml deploy/docker-compose.prod.yml deploy/k8s/configmap.yaml platform/observability/readiness.ts platform/backup-restore/index.ts docs/operations/observability-alerts.md docs/operations/backup-restore.md docs/operations/incident-restore-drill.md /tmp/nexusagent-p8-observability-alerts.txt /tmp/nexusagent-p8-backup-restore.txt || fail "P8-03 observability/backup marker missing: $marker"
done

for marker in \
  'OQ-INFRA-002' \
  'OQ-INFRA-003' \
  'OQ-INFRA-004' \
  'OQ-INFRA-005' \
  'OQ-MEMORY-002' \
  'NATS JetStream' \
  'S3-compatible Object Store' \
  'Vault' \
  'OpenTelemetry' \
  'PostgreSQL + pgvector' \
  'P8-03'; do
  rg -F -q "$marker" docs/planning/open-questions-register.md docs/planning/open-questions/P8-resolution-plan.md docs/traceability/requirements-matrix.md docs/risks/risk-register.md docs/README.md tests/smoke/README.md docs/planning/task-prompts/P8/P8-03.md || fail "P8-03 OQ/docs marker missing: $marker"
done

if rg -n -- '--watch|--inspect|NEXUS_HOT_RELOAD|NEXUS_DEBUG_PORT|9229|925[0-9]|type: bind|source: \.\./|/opt/project|tools\.invoke|agentCommandFromGatewayIngress|native gateway' deploy/docker-compose.prod.yml deploy/k8s deploy/docker config/services.prod.yaml .github/workflows/p8-release-gate.yml; then
  fail 'P8 production orchestration leaked dev, debug, source mount, local path, or native entrypoint marker'
fi

if rg -n 'Date\.now\(|datetime\.now\(' deploy/docker-compose.prod.yml deploy/k8s deploy/docker config/services.prod.yaml config/release-gate.p8.json config/provider-compatibility.p8.json config/plugin-compatibility.p8.json scripts/quality scripts/upstream-tracking tests/deployment/p8-production-orchestration.test.mjs tests/deployment/p8-release-gate.test.mjs tests/deployment/p8-provider-compatibility.test.mjs tests/security/p8-production-isolation.test.mjs tests/security/p8-release-supply-chain.test.mjs tests/smoke/P8.sh; then
  fail 'wall-clock duration helper detected in P8 production orchestration gate'
fi

if rg -n 'Date\.now\(|datetime\.now\(' config/observability-alerts.p8.json config/backup-restore.p8.json platform/observability/readiness.ts platform/backup-restore/index.ts scripts/quality/validate-p8-observability-alerts.mjs scripts/quality/validate-p8-backup-restore.mjs tests/deployment/p8-observability-alerts.test.mjs tests/deployment/p8-backup-restore-drill.test.mjs tests/security/p8-backup-secret-isolation.test.mjs; then
  fail 'wall-clock duration helper detected in P8-03 observability/backup gate'
fi

node --input-type=module - <<'NODE'
import { runBackupRestoreDrill } from './platform/backup-restore/index.ts';
const report = JSON.stringify(runBackupRestoreDrill());
const forbidden = /raw_credential|credential_material|memory_text|memory_tombstone_text|native_url|native_path|native_session|native_error|provider_runtime|provider_binding|https?:\/\/|\/(?:opt|tmp|var|etc|home|usr)\/|continuity fixture text|stale write blocked|artifact fixture bytes|redacted-fixture-value/i;
if (forbidden.test(report)) {
  console.error('FAIL: P8-03 restore report leaked forbidden data');
  process.exit(1);
}
NODE

if find deploy config scripts tests/deployment tests/security -type d \( -name node_modules -o -name dist -o -name coverage -o -name .cache -o -name .vite -o -name __pycache__ \) -print | rg -q .; then
  fail 'P8 deployment surface contains generated dependency/cache/build artifacts'
fi

if find deploy config scripts tests/deployment tests/security -type f \( -name '.env' -o -name '.env.*' \) -print | rg -q .; then
  fail 'P8 deployment surface contains environment files'
fi

if rg -n 'AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]+PRIVATE KEY-----|ghp_[A-Za-z0-9_]{30,}|xox[baprs]-[A-Za-z0-9-]{20,}' deploy config scripts .github/workflows docs/planning/open-questions/P8-resolution-plan.md docs/operations/release-gate.md docs/operations/provider-plugin-compatibility.md; then
  fail 'P8 production surface contains high-confidence secret pattern'
fi

if rg -n 'secrets\.' .github/workflows/p8-release-gate.yml | rg -v 'secrets\.GITHUB_TOKEN'; then
  fail 'P8 release workflow uses an unapproved GitHub secret reference'
fi

node --test tests/deployment/p8-release-gate.test.mjs tests/deployment/p8-provider-compatibility.test.mjs tests/security/p8-release-supply-chain.test.mjs
node --test tests/deployment/p8-observability-alerts.test.mjs tests/deployment/p8-backup-restore-drill.test.mjs tests/security/p8-backup-secret-isolation.test.mjs
node --test tests/deployment/p8-production-orchestration.test.mjs tests/security/p8-production-isolation.test.mjs
node --test tests/security/dsh-network-isolation.test.mjs tests/security/hermes-network-isolation.test.mjs tests/security/openclaw-network-isolation.test.mjs

echo 'PASS: P8-01/P8-02/P8-03 production orchestration, release gate, GHCR candidate publish, canary rollback, upstream tracking, compatibility matrix, observability alerts, backup restore drill, static isolation, and smoke checks'
