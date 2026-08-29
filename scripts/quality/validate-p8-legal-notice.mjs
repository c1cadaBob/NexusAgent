#!/usr/bin/env node

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const legal = readJson('config/legal-notice.p8.json');
const providerMatrix = readJson(legal.provider_matrix);
const pluginMatrix = readJson(legal.plugin_matrix);
const vendorManifest = parseVendorManifest(read('vendor/MANIFEST.yaml'));

assert.equal(legal.schema_version, 'nexus.legal_notice.p8.v1');
assert.equal(legal.task_id, 'P8-04');
assert.equal(legal.package_id, 'legal_notice_p8_04_release_package');
assert.equal(legal.oq_closure.id, 'OQ-LEGAL-001');
assert.equal(legal.oq_closure.status, 'closed');
assert.equal(legal.oq_closure.closure_marker, 'P8-04_LEGAL_NOTICE_PACKAGE');
assert.ok(existsSync(legal.notice_document), 'legal notice document must exist');

const expectedComponents = new Set(['hermes', 'openclaw', 'dsh']);
assert.equal(legal.provider_sources.length, expectedComponents.size);

for (const source of legal.provider_sources) {
  assert.ok(expectedComponents.has(source.component), `unexpected provider legal source ${source.component}`);
  assert.ok(existsSync(source.vendor_path), `${source.vendor_path} must exist`);
  assert.ok(existsSync(source.license_file), `${source.license_file} must exist`);
  assert.match(read(source.license_file), /MIT License/i, `${source.license_file} must be MIT evidence`);

  const matrixEntry = providerMatrix.providers.find((provider) => provider.component === source.component);
  assert.ok(matrixEntry, `provider matrix missing ${source.component}`);
  assert.equal(matrixEntry.vendor_path, source.vendor_path);
  assert.equal(matrixEntry.tree_sha256, source.tree_sha256);
  assert.equal(matrixEntry.rollback_target, matrixEntry.provider_id);
  assert.equal(matrixEntry.default_promotion_allowed, false);
  assert.equal(matrixEntry.release_pause.active, true);

  const manifestEntry = vendorManifest.get(componentToManifestName(source.component));
  assert.ok(manifestEntry, `vendor manifest missing ${source.component}`);
  assert.equal(manifestEntry.tree_sha256, source.tree_sha256);
}

for (const nestedPath of legal.nested_notice_sources) {
  assert.ok(existsSync(nestedPath), `nested notice evidence missing: ${nestedPath}`);
}

assert.equal(pluginMatrix.tenant_self_service_third_party_install, legal.plugin_governance_requirements.tenant_self_service_third_party_install);
for (const required of legal.plugin_governance_requirements.required_fields) {
  assert.ok(pluginMatrix.default_policy.required_fields.includes(required), `plugin matrix policy missing ${required}`);
}
for (const plugin of pluginMatrix.plugins) {
  assert.match(plugin.sha256, /^[a-f0-9]{64}$/);
  assert.ok(plugin.license.length > 0, `${plugin.plugin_id} missing license`);
  assert.equal(plugin.notice_status, 'recorded');
  assert.equal(plugin.allowlist_status, 'approved');
  assert.equal(plugin.rollback_target, plugin.plugin_id);
}

const noticeText = read(legal.notice_document);
for (const marker of ['P8-04_LEGAL_NOTICE_PACKAGE', 'THIRD_PARTY_NOTICE', 'OQ-LEGAL-001', 'Closure Statement']) {
  assert.ok(noticeText.includes(marker), `notice document missing ${marker}`);
}

for (const gate of [
  'license_files_present',
  'notice_document_recorded',
  'provider_hashes_match_vendor_manifest',
  'plugin_matrix_notice_recorded',
  'plugin_matrix_license_recorded',
  'plugin_matrix_rollback_recorded',
  'repository_release_package',
  'OQ-LEGAL-001_closed',
]) {
  assert.ok(legal.release_gates.includes(gate), `legal release gate missing: ${gate}`);
}

const legalWithoutDenylist = JSON.stringify({ ...legal, forbidden_material_policy: undefined });
assert.doesNotMatch(legalWithoutDenylist, /raw_credential|credential_material|native_url|native_path|native_session|native_error|provider_runtime|provider_binding|https?:\/\/|\/(?:opt|tmp|var|etc|home|usr)\//i);

console.log('PASS: P8-04 legal notice package validates OQ-LEGAL-001 closure, licenses, notices, plugin metadata, hashes, and rollback evidence');

function componentToManifestName(component) {
  return ({ hermes: 'Hermes', openclaw: 'OpenClaw', dsh: 'DSH' })[component];
}

function parseVendorManifest(text) {
  const sources = new Map();
  let current;
  for (const line of text.split(/\r?\n/)) {
    const start = line.match(/^\s{2}- upstream_name:\s*(.+)$/);
    if (start) {
      current = { upstream_name: clean(start[1]) };
      sources.set(current.upstream_name, current);
      continue;
    }
    if (!current) continue;
    const field = line.match(/^\s{4}([a-zA-Z0-9_]+):\s*(.+)$/);
    if (field) current[field[1]] = clean(field[2]);
  }
  return sources;
}

function clean(value) {
  return value.trim().replace(/^"|"$/g, '');
}

function read(path) {
  return readFileSync(path, 'utf8');
}

function readJson(path) {
  return JSON.parse(read(path));
}
