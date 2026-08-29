import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { ManualClock } from '../../platform/clock/index.ts';
import {
  buildObservabilityReadiness,
  OBSERVABILITY_READINESS_SCHEMA_VERSION,
  ObservabilityReadinessError,
} from '../../platform/observability/readiness.ts';

function read(path) {
  return readFileSync(path, 'utf8');
}

function readJson(path) {
  return JSON.parse(read(path));
}

const BACKEND_DEFAULTS = {
  event_bus: 'nats_jetstream',
  artifact_store: 's3_compatible_object_store',
  credential_center: 'vault',
  memory_store: 'postgres_pgvector',
  observability: 'otel_prometheus_loki_tempo',
};

const REQUIRED_SIGNALS = [
  'api.availability',
  'task.failure_rate',
  'adapter.degradation',
  'event.backlog_dlq',
  'artifact.checksum_failure',
  'credential.lease_failure',
  'memory.conflict_sweep_anomaly',
  'backup.freshness',
  'restore.drill_status',
];

test('P8 observability alert catalog locks SLOs, backend defaults, and runbooks', () => {
  const alerts = readJson('config/observability-alerts.p8.json');
  assert.equal(alerts.schema_version, OBSERVABILITY_READINESS_SCHEMA_VERSION);
  assert.equal(alerts.profile_id, 'observability_readiness_p8_03_production_default');
  assert.equal(alerts.rpo_minutes, 15);
  assert.equal(alerts.rto_hours, 4);
  assert.deepEqual(alerts.backend_defaults, BACKEND_DEFAULTS);
  assert.equal(alerts.alerts.length, REQUIRED_SIGNALS.length);

  for (const signal of REQUIRED_SIGNALS) {
    const alert = alerts.alerts.find((entry) => entry.signal === signal);
    assert.ok(alert, `${signal} alert exists`);
    assert.match(alert.alert_id, /^alert_[a-z0-9_]+_p8_03$/);
    assert.ok(['warning', 'critical'].includes(alert.severity), `${alert.alert_id} is actionable`);
    assert.ok(alert.threshold.length > 0, `${alert.alert_id} has a threshold`);
    assert.ok(existsSync(alert.runbook.split('#')[0]), `${alert.alert_id} runbook exists`);
  }
});

test('P8 observability readiness projection is sanitized and platform-clocked', () => {
  const clock = new ManualClock({ utc_timestamp: '2026-08-29T02:00:00.000Z', monotonic_ms: 2400 });
  const report = buildObservabilityReadiness({
    tenant_id: 'tenant_p8obs01',
    trace_id: 'trace_p8obs01',
    service: 'p8-observability-readiness',
    rpo_minutes: 15,
    rto_hours: 4,
    backend_defaults: BACKEND_DEFAULTS,
    clock,
    signals: REQUIRED_SIGNALS.map((signal) => ({
      signal,
      status: 'ready',
      severity: 'info',
      reason_code: `${signal.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_READY`,
      labels: {
        tenant_id: 'tenant_p8obs01',
        trace_id: 'trace_p8obs01',
        service: 'p8-observability-readiness',
        signal,
      },
    })),
  });

  assert.equal(report.schema_version, OBSERVABILITY_READINESS_SCHEMA_VERSION);
  assert.equal(report.status, 'ready');
  assert.equal(report.checked_at_utc, '2026-08-29T02:00:00.000Z');
  assert.equal(report.monotonic_ms, 2400);
  assert.deepEqual(report.backend_defaults, BACKEND_DEFAULTS);
  assert.doesNotMatch(JSON.stringify(report), /raw_credential|credential_material|native_url|native_path|native_session|native_error|provider_runtime|https?:\/\/|\/(?:opt|tmp|var|etc|home|usr)\//i);
});

test('P8 observability readiness fails closed on native labels and unsupported backends', () => {
  assert.throws(() => buildObservabilityReadiness({
    tenant_id: 'tenant_p8obs01',
    trace_id: 'trace_p8obs01',
    service: 'p8-observability-readiness',
    rpo_minutes: 15,
    rto_hours: 4,
    backend_defaults: { ...BACKEND_DEFAULTS, event_bus: 'unsupported_bus' },
    signals: [{
      signal: 'api.availability',
      status: 'ready',
      severity: 'info',
      reason_code: 'API_AVAILABILITY_READY',
      labels: { tenant_id: 'tenant_p8obs01', trace_id: 'trace_p8obs01', service: 'p8-observability-readiness', signal: 'api.availability' },
    }],
  }), ObservabilityReadinessError);

  assert.throws(() => buildObservabilityReadiness({
    tenant_id: 'tenant_p8obs01',
    trace_id: 'trace_p8obs01',
    service: 'p8-observability-readiness',
    rpo_minutes: 15,
    rto_hours: 4,
    backend_defaults: BACKEND_DEFAULTS,
    signals: [{
      signal: 'api.availability',
      status: 'ready',
      severity: 'info',
      reason_code: 'API_AVAILABILITY_READY',
      labels: { tenant_id: 'tenant_p8obs01', trace_id: 'trace_p8obs01', service: 'p8-observability-readiness', signal: 'api.availability', source: 'native_url' },
    }],
  }), ObservabilityReadinessError);
});
