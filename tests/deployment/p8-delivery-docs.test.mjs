import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(path) {
  return readFileSync(path, 'utf8');
}

function readJson(path) {
  return JSON.parse(read(path));
}

test('P8 delivery readiness profile validates handoff documents and gates', () => {
  const output = execFileSync('node', ['scripts/quality/validate-p8-delivery-docs.mjs'], { encoding: 'utf8' });
  assert.match(output, /PASS: P8-04 delivery docs validate/);

  const profile = readJson('config/delivery-readiness.p8.json');
  assert.equal(profile.schema_version, 'nexus.delivery_readiness.p8.v1');
  assert.equal(profile.task_id, 'P8-04');
  assert.equal(profile.public_surface_change, false);
  assert.ok(profile.acceptance_gates.includes('deploy_from_docs'));
  assert.ok(profile.acceptance_gates.includes('upgrade_from_docs'));
  assert.ok(profile.acceptance_gates.includes('rollback_from_docs'));
  assert.ok(profile.acceptance_gates.includes('legal_notice_closed'));
  assert.ok(profile.handoff_documents.some((document) => document.path === 'docs/planning/phase-gates/P8-gate-review.md'));
});

test('P8 delivery docs describe deployment, upgrade, rollback, and API stability', () => {
  const combined = [
    'docs/operations/admin-handoff.md',
    'docs/operations/developer-handoff.md',
    'docs/operations/upgrade-migration.md',
    'docs/operations/provider-plugin-rollback.md',
    'docs/operations/delivery-readiness.md',
  ].map((path) => read(path)).join('\n');

  for (const marker of [
    'P8-04_ADMIN_HANDOFF',
    'P8-04_DEVELOPER_HANDOFF',
    'P8-04_UPGRADE_MIGRATION',
    'P8-04_PROVIDER_PLUGIN_ROLLBACK_MANUAL',
    'P8-04_DELIVERY_DOCS_COMPLETE',
    'kubernetes_primary_path',
    'compose_private_path',
    'provider_contract_stability',
    'plugin_admission_rollback',
    'P8-04_PUBLIC_API_STABILITY',
  ]) {
    assert.match(combined, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
