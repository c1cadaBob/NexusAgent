#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runBackupRestoreDrill } from '../../platform/backup-restore/index.ts';

const profile = readJson('config/backup-restore.p8.json');

assert.equal(profile.schema_version, 'nexus.backup_restore.p8.v1');
assert.equal(profile.task_id, 'P8-03');
assert.equal(profile.profile_id, 'backup_restore_p8_03_production_default');
assert.equal(profile.rpo_minutes, 15);
assert.equal(profile.rto_hours, 4);
assert.deepEqual(profile.production_backend_defaults, {
  event_bus: 'nats_jetstream',
  artifact_store: 's3_compatible_object_store',
  credential_center: 'vault',
  memory_store: 'postgres_pgvector',
  observability: 'otel_prometheus_loki_tempo',
});
assert.equal(profile.backup_policy.immutable_audit_chain, true);
assert.equal(profile.backup_policy.tenant_scoped_snapshots, true);
assert.equal(profile.backup_policy.manual_restore_drill_required, true);

for (const gate of [
  'audit_hash_chain_verified',
  'event_order_and_dlq_replay_verified',
  'artifact_sha256_verified',
  'memory_version_continuity_verified',
  'credential_reference_hash_only_verified',
  'observability_readiness_reported',
  'rpo_15m_rto_4h_recorded',
]) {
  assert.ok(profile.restore_acceptance_gates.includes(gate), `restore acceptance gate missing: ${gate}`);
}

const report = runBackupRestoreDrill();
assert.equal(report.schema_version, 'nexus.backup_restore.p8.v1');
assert.equal(report.rpo_minutes, 15);
assert.equal(report.rto_hours, 4);
assert.deepEqual(report.backend_defaults, profile.production_backend_defaults);
assert.equal(report.snapshot.audit.hash_chain_valid, true);
assert.ok(report.snapshot.artifacts.references.every((reference) => /^[a-f0-9]{64}$/.test(reference.sha256)));
assert.equal(report.snapshot.event_bus.dead_letter_count, 1);
assert.equal(report.snapshot.memory.conflict_count, 1);
assert.ok(report.snapshot.credentials.references.every((reference) => /^[a-f0-9]{64}$/.test(reference.material_sha256)));
assert.ok(Object.values(report.restore_gates).every(Boolean));

const serialized = JSON.stringify(report);
assert.doesNotMatch(serialized, /raw_credential|credential_material|memory_text|memory_tombstone_text|native_url|native_path|native_session|native_error|provider_runtime|https?:\/\/|\/(?:opt|tmp|var|etc|home|usr)\//i);

console.log('PASS: P8-03 backup restore drill validates RPO/RTO, audit chain, event replay, artifact checksum, memory version, and credential reference-only recovery');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
