import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { runBackupRestoreDrill } from '../../platform/backup-restore/index.ts';

const PUBLIC_SURFACE_FILES = [
  'docs/contracts/openapi.yaml',
  'product/api/index.ts',
  'product/sdk/src/index.ts',
  'product/web-console/src/apiClient.ts',
];

const P8_BACKUP_FILES = [
  'config/observability-alerts.p8.json',
  'config/backup-restore.p8.json',
  'platform/observability/readiness.ts',
  'platform/backup-restore/index.ts',
  'scripts/quality/validate-p8-observability-alerts.mjs',
  'scripts/quality/validate-p8-backup-restore.mjs',
  'docs/operations/observability-alerts.md',
  'docs/operations/backup-restore.md',
  'docs/operations/incident-restore-drill.md',
];

function read(path) {
  return readFileSync(path, 'utf8');
}

function walkFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walkFiles(path);
    return statSync(path).isFile() ? [path] : [];
  });
}

test('P8 backup restore report never exports secret, memory, native, or local locator payloads', () => {
  const reportText = JSON.stringify(runBackupRestoreDrill());
  assert.doesNotMatch(reportText, /raw_credential|credential_material|memory_text|memory_tombstone_text|native_url|native_path|native_session|native_error|provider_runtime|provider_binding|https?:\/\/|\/(?:opt|tmp|var|etc|home|usr)\//i);
  assert.doesNotMatch(reportText, /continuity fixture text|stale write blocked|artifact fixture bytes|redacted-fixture-value/i);
});

test('P8 backup configs use forbidden markers only in explicit denylist policy fields', () => {
  const observability = JSON.parse(read('config/observability-alerts.p8.json'));
  const backup = JSON.parse(read('config/backup-restore.p8.json'));
  assert.deepEqual(observability.label_policy.forbidden_values.sort(), [
    'absolute_local_path',
    'credential_material',
    'native_error',
    'native_path',
    'native_session',
    'native_url',
    'provider_runtime',
    'raw_credential',
  ].sort());
  assert.deepEqual(backup.forbidden_backup_fields.sort(), [
    'absolute_local_path',
    'credential_material',
    'memory_text',
    'memory_tombstone_text',
    'native_error',
    'native_path',
    'native_session',
    'native_url',
    'provider_runtime',
    'raw_credential',
  ].sort());

  const policyText = JSON.stringify({ label_policy: observability.label_policy, forbidden_backup_fields: backup.forbidden_backup_fields });
  const configWithoutPolicies = JSON.stringify({
    observability: { ...observability, label_policy: undefined },
    backup: { ...backup, forbidden_backup_fields: undefined },
  });
  assert.match(policyText, /raw_credential|credential_material|native_url|provider_runtime/);
  assert.doesNotMatch(configWithoutPolicies, /raw_credential|credential_material|memory_text|memory_tombstone_text|native_url|native_path|native_session|native_error|provider_runtime|https?:\/\/|\/(?:opt|tmp|var|etc|home|usr)\//i);
});

test('P8 backup implementation and runbooks do not add public routes or generated artifacts', () => {
  const publicSurface = PUBLIC_SURFACE_FILES.map((file) => `--- ${file} ---\n${read(file)}`).join('\n');
  assert.doesNotMatch(publicSurface, /backup-restore|observability-readiness|restore-drill|\/v1\/backup|\/v1\/restore|\/v1\/alerts/i);

  const backupSurface = P8_BACKUP_FILES.map((file) => `--- ${file} ---\n${read(file)}`).join('\n');
  for (const highConfidence of [/AKIA[0-9A-Z]{16}/, /-----BEGIN [A-Z ]+PRIVATE KEY-----/, /ghp_[A-Za-z0-9_]{30,}/, /xox[baprs]-[A-Za-z0-9-]{20,}/]) {
    assert.doesNotMatch(backupSurface, highConfidence);
  }

  const generated = ['product', 'deploy', 'config', 'scripts', 'tests', 'platform']
    .flatMap((dir) => walkFiles(dir).filter((path) => /(^|\/)(node_modules|dist|coverage|\.cache|\.vite)(\/|$)/.test(path)));
  assert.deepEqual(generated, []);
});
