import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(path) {
  return readFileSync(path, 'utf8');
}

test('P8 legal notice validator closes OQ-LEGAL-001 with license and notice evidence', () => {
  const output = execFileSync('node', ['scripts/quality/validate-p8-legal-notice.mjs'], { encoding: 'utf8' });
  assert.match(output, /PASS: P8-04 legal notice package validates OQ-LEGAL-001 closure/);
});

test('P8 legal notice package contains no secret values or native locators outside policy names', () => {
  const legal = JSON.parse(read('config/legal-notice.p8.json'));
  const legalTextWithoutPolicy = JSON.stringify({ ...legal, forbidden_material_policy: undefined });
  const notice = read('docs/legal/THIRD_PARTY_NOTICE.md');
  const docs = [
    'docs/operations/admin-handoff.md',
    'docs/operations/developer-handoff.md',
    'docs/operations/upgrade-migration.md',
    'docs/operations/provider-plugin-rollback.md',
    'docs/operations/delivery-readiness.md',
  ].map((path) => read(path)).join('\n');

  for (const text of [legalTextWithoutPolicy, notice, docs]) {
    assert.doesNotMatch(text, /raw_credential|credential_material|native_url|native_path|native_session|native_error|provider_runtime|provider_binding|https?:\/\/|\/(?:opt|tmp|var|etc|home|usr)\//i);
    assert.doesNotMatch(text, /AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]+PRIVATE KEY-----|ghp_[A-Za-z0-9_]{30,}|xox[baprs]-[A-Za-z0-9-]{20,}/);
  }
});

test('P8 legal notice package requires governed plugin license notice and rollback metadata', () => {
  const pluginMatrix = JSON.parse(read('config/plugin-compatibility.p8.json'));
  const legal = JSON.parse(read('config/legal-notice.p8.json'));
  assert.equal(pluginMatrix.tenant_self_service_third_party_install, false);
  assert.equal(legal.oq_closure.status, 'closed');

  for (const plugin of pluginMatrix.plugins) {
    assert.match(plugin.sha256, /^[a-f0-9]{64}$/);
    assert.equal(plugin.notice_status, 'recorded');
    assert.equal(plugin.allowlist_status, 'approved');
    assert.ok(plugin.license.length > 0);
    assert.equal(plugin.rollback_target, plugin.plugin_id);
  }
});
