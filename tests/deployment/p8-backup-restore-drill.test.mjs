import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  assertBackupRestoreReportClean,
  BACKUP_RESTORE_PROFILE_ID,
  BACKUP_RESTORE_RPO_MINUTES,
  BACKUP_RESTORE_RTO_HOURS,
  BACKUP_RESTORE_SCHEMA_VERSION,
  runBackupRestoreDrill,
} from '../../platform/backup-restore/index.ts';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

test('P8 backup restore profile locks RPO/RTO and restore gates', () => {
  const profile = readJson('config/backup-restore.p8.json');
  assert.equal(profile.schema_version, BACKUP_RESTORE_SCHEMA_VERSION);
  assert.equal(profile.profile_id, BACKUP_RESTORE_PROFILE_ID);
  assert.equal(profile.rpo_minutes, BACKUP_RESTORE_RPO_MINUTES);
  assert.equal(profile.rto_hours, BACKUP_RESTORE_RTO_HOURS);
  assert.deepEqual(profile.production_backend_defaults, {
    event_bus: 'nats_jetstream',
    artifact_store: 's3_compatible_object_store',
    credential_center: 'vault',
    memory_store: 'postgres_pgvector',
    observability: 'otel_prometheus_loki_tempo',
  });

  for (const gate of [
    'audit_hash_chain_verified',
    'event_order_and_dlq_replay_verified',
    'artifact_sha256_verified',
    'memory_version_continuity_verified',
    'credential_reference_hash_only_verified',
    'observability_readiness_reported',
    'rpo_15m_rto_4h_recorded',
  ]) {
    assert.ok(profile.restore_acceptance_gates.includes(gate), `restore gate exists: ${gate}`);
  }
});

test('P8 deterministic restore drill verifies audit, events, artifacts, memory, and credentials', () => {
  const report = runBackupRestoreDrill();
  assert.equal(report.schema_version, BACKUP_RESTORE_SCHEMA_VERSION);
  assert.equal(report.profile_id, BACKUP_RESTORE_PROFILE_ID);
  assert.equal(report.rpo_minutes, 15);
  assert.equal(report.rto_hours, 4);
  assert.equal(report.snapshot.audit.hash_chain_valid, true);
  assert.equal(report.snapshot.event_bus.dead_letter_count, 1);
  assert.ok(report.snapshot.event_bus.event_count >= 5);
  assert.equal(report.snapshot.memory.active_count, 1);
  assert.equal(report.snapshot.memory.conflict_count, 1);
  assert.equal(report.snapshot.credentials.count, 1);
  assert.equal(report.snapshot.artifacts.count, 1);
  assert.ok(report.snapshot.artifacts.references.every((reference) => /^[a-f0-9]{64}$/.test(reference.sha256)));
  assert.ok(report.snapshot.credentials.references.every((reference) => /^[a-f0-9]{64}$/.test(reference.material_sha256)));
  assert.ok(Object.values(report.restore_gates).every(Boolean));
  assert.equal(report.readiness.status, 'ready');
  assertBackupRestoreReportClean(report);
});

test('P8 restore drill report is metadata-only and rejects polluted report shapes', () => {
  const report = runBackupRestoreDrill();
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /raw_credential|credential_material|memory_text|memory_tombstone_text|native_url|native_path|native_session|native_error|provider_runtime|https?:\/\/|\/(?:opt|tmp|var|etc|home|usr)\//i);
  assert.doesNotMatch(serialized, /continuity fixture text|stale write blocked|artifact fixture bytes|redacted-fixture-value/i);

  assert.throws(() => assertBackupRestoreReportClean({ ...report, leaked: 'credential_material' }), /non-platform data/);
});
