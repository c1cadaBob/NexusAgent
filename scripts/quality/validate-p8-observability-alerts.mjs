#!/usr/bin/env node

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const alerts = readJson('config/observability-alerts.p8.json');

assert.equal(alerts.schema_version, 'nexus.observability_readiness.p8.v1');
assert.equal(alerts.task_id, 'P8-03');
assert.equal(alerts.rpo_minutes, 15);
assert.equal(alerts.rto_hours, 4);
assert.deepEqual(alerts.backend_defaults, {
  event_bus: 'nats_jetstream',
  artifact_store: 's3_compatible_object_store',
  credential_center: 'vault',
  memory_store: 'postgres_pgvector',
  observability: 'otel_prometheus_loki_tempo',
});

const requiredSignals = new Set([
  'api.availability',
  'task.failure_rate',
  'adapter.degradation',
  'event.backlog_dlq',
  'artifact.checksum_failure',
  'credential.lease_failure',
  'memory.conflict_sweep_anomaly',
  'backup.freshness',
  'restore.drill_status',
]);

assert.equal(alerts.alerts.length, requiredSignals.size);
for (const alert of alerts.alerts) {
  assert.ok(requiredSignals.has(alert.signal), `unexpected alert signal ${alert.signal}`);
  assert.match(alert.alert_id, /^alert_[a-z0-9_]+_p8_03$/);
  assert.ok(['warning', 'critical'].includes(alert.severity), `${alert.alert_id} must be actionable`);
  assert.ok(alert.threshold.length > 0, `${alert.alert_id} threshold required`);
  assert.ok(existsSync(alert.runbook.split('#')[0]), `${alert.alert_id} runbook must exist`);
}

for (const marker of [
  'tenant_id',
  'trace_id',
  'service',
  'signal',
  'raw_credential',
  'credential_material',
  'native_url',
  'native_path',
  'native_session',
  'native_error',
  'provider_runtime',
]) {
  assert.ok(JSON.stringify(alerts.label_policy).includes(marker), `label policy marker missing: ${marker}`);
}

console.log('PASS: P8-03 observability alert catalog validates SLOs, RPO/RTO, backend defaults, runbooks, and sanitized labels');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
