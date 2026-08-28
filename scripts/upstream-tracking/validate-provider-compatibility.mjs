#!/usr/bin/env node

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const manifest = parseVendorManifest(read('vendor/MANIFEST.yaml'));
const providerMatrix = readJson('config/provider-compatibility.p8.json');
const pluginMatrix = readJson('config/plugin-compatibility.p8.json');

assert.equal(providerMatrix.schema_version, 'nexus.provider_compatibility.p8.v1');
assert.equal(providerMatrix.upstream_check_mode, 'optional_remote');
assert.equal(providerMatrix.promotion_strategy, 'canary_first');
assert.equal(providerMatrix.release_pause_marker, 'P8-02_PROVIDER_BREAKING_CHANGE_PAUSE');

const expected = new Map([
  ['hermes', { upstream_name: 'Hermes', role: 'planner-only' }],
  ['openclaw', { upstream_name: 'OpenClaw', role: 'gateway-only' }],
  ['dsh', { upstream_name: 'DSH', role: 'executor-only' }],
]);

assert.equal(providerMatrix.providers.length, expected.size);
for (const provider of providerMatrix.providers) {
  const expectation = expected.get(provider.component);
  assert.ok(expectation, `unexpected provider component ${provider.component}`);
  const source = manifest.get(expectation.upstream_name);
  assert.ok(source, `vendor manifest missing ${expectation.upstream_name}`);
  assert.equal(provider.internal_role, expectation.role);
  assert.equal(provider.version, source.version);
  assert.equal(provider.vendor_path, relativeVendorPath(source.vendor_path));
  assert.equal(provider.tree_sha256, source.tree_sha256);
  assert.ok(existsSync(provider.vendor_path), `${provider.vendor_path} must exist`);
  assert.equal(provider.compatibility_state, 'current_default');
  assert.equal(provider.candidate_state, 'none');
  assert.equal(provider.canary_phase, 'not_started');
  assert.equal(provider.default_promotion_allowed, false);
  assert.equal(provider.release_pause.active, true);
  assert.ok(provider.release_pause.reasons.includes('upstream_identity_unconfirmed'));
  assert.equal(provider.rollback_target, provider.provider_id);
  assert.match(provider.rollback_command, /Registry\.rollbackDefault$/);
  assert.ok(provider.required_tests.some((command) => command.includes('bash tests/smoke/P8.sh')));
}

assert.equal(pluginMatrix.schema_version, 'nexus.plugin_compatibility.p8.v1');
assert.equal(pluginMatrix.tenant_self_service_third_party_install, false);
assert.equal(pluginMatrix.default_policy.production_default_may_promote, false);
assert.ok(pluginMatrix.default_policy.pause_on.includes('missing_rollback_target'));
assert.ok(pluginMatrix.default_policy.pause_on.includes('breaking_change'));
assert.ok(pluginMatrix.plugins.length >= 3);
for (const plugin of pluginMatrix.plugins) {
  assert.match(plugin.plugin_id, /^plugin_[a-z0-9_]+_p8$/);
  assert.match(plugin.capability_id, /^cap_[a-z0-9_]+_p8$/);
  assert.match(plugin.sha256, /^[a-f0-9]{64}$/);
  assert.ok(plugin.license.length > 0);
  assert.equal(plugin.notice_status, 'recorded');
  assert.equal(plugin.allowlist_status, 'approved');
  assert.equal(plugin.canary_phase, 'not_started');
  assert.equal(plugin.rollback_target, plugin.plugin_id);
  assert.ok(plugin.required_tests.length > 0);
}

console.log('PASS: P8-02 provider and plugin compatibility matrices match vendor manifest, canary strategy, release pause, and rollback requirements');

export function parseVendorManifest(text) {
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

function relativeVendorPath(path) {
  return path.replace(/^\/opt\/project\/NexusAgent\//, '');
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
