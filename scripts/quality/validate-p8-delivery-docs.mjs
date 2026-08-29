#!/usr/bin/env node

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const profile = readJson('config/delivery-readiness.p8.json');

assert.equal(profile.schema_version, 'nexus.delivery_readiness.p8.v1');
assert.equal(profile.task_id, 'P8-04');
assert.equal(profile.profile_id, 'delivery_readiness_p8_04');
assert.equal(profile.public_surface_change, false);
assert.equal(profile.deployment_paths.kubernetes_primary_path.status, 'documented');
assert.equal(profile.deployment_paths.compose_private_path.status, 'documented');

for (const gate of [
  'deploy_from_docs',
  'upgrade_from_docs',
  'rollback_from_docs',
  'provider_plugin_contract_stability',
  'legal_notice_closed',
  'p8_phase_gate_report',
  'P8-04_PUBLIC_API_STABILITY',
]) {
  assert.ok(profile.acceptance_gates.includes(gate), `delivery acceptance gate missing: ${gate}`);
}

for (const document of profile.handoff_documents) {
  assert.ok(existsSync(document.path), `delivery document missing: ${document.path}`);
  const text = read(document.path);
  for (const marker of document.required_markers) {
    assert.ok(text.includes(marker), `${document.path} missing marker ${marker}`);
  }
}

for (const path of profile.public_surface_files) {
  assert.ok(existsSync(path), `public surface file missing: ${path}`);
}

const publicSurface = profile.public_surface_files.map((path) => read(path)).join('\n');
assert.doesNotMatch(publicSurface, /\/v1\/(delivery|legal|notices|release|restore|backup|providers\/rollback|plugins\/rollback)/i);
assert.doesNotMatch(publicSurface, /nexus\.delivery_readiness\.p8\.v1|nexus\.legal_notice\.p8\.v1|P8-04_DELIVERY_DOCS_COMPLETE|P8-04_LEGAL_NOTICE_PACKAGE/);

console.log('PASS: P8-04 delivery docs validate deploy, upgrade, rollback, public API stability, and gate report markers');

function read(path) {
  return readFileSync(path, 'utf8');
}

function readJson(path) {
  return JSON.parse(read(path));
}
