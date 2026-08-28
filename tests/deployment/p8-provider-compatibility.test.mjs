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

test('P8 provider compatibility matrix mirrors current vendor hashes and rollback gates', () => {
  const output = execFileSync('node', ['scripts/upstream-tracking/validate-provider-compatibility.mjs'], { encoding: 'utf8' });
  assert.match(output, /PASS: P8-02 provider and plugin compatibility matrices/);

  const matrix = readJson('config/provider-compatibility.p8.json');
  assert.equal(matrix.schema_version, 'nexus.provider_compatibility.p8.v1');
  assert.equal(matrix.release_pause_marker, 'P8-02_PROVIDER_BREAKING_CHANGE_PAUSE');
  assert.deepEqual(matrix.providers.map((provider) => provider.component).sort(), ['dsh', 'hermes', 'openclaw']);

  for (const provider of matrix.providers) {
    assert.equal(provider.compatibility_state, 'current_default');
    assert.equal(provider.candidate_state, 'none');
    assert.equal(provider.canary_phase, 'not_started');
    assert.equal(provider.default_promotion_allowed, false);
    assert.equal(provider.release_pause.active, true);
    assert.ok(provider.release_pause.reasons.includes('upstream_identity_unconfirmed'));
    assert.equal(provider.rollback_target, provider.provider_id);
    assert.ok(provider.required_tests.some((command) => command.includes('bash tests/smoke/P8.sh')));
  }
});

test('P8 weekly upstream check is optional-remote and fails promotion closed for unknown identity', () => {
  const report = JSON.parse(execFileSync('node', ['scripts/upstream-tracking/weekly-upstream-check.mjs'], { encoding: 'utf8' }));
  assert.equal(report.schema_version, 'nexus.upstream_check_report.p8.v1');
  assert.equal(report.upstream_check_mode, 'optional_remote');
  assert.equal(report.remote_check_requested, false);
  assert.equal(report.release_pause, true);
  assert.equal(report.promotion_strategy, 'canary_first');

  for (const result of report.results) {
    assert.equal(result.status, 'identity_unconfirmed');
    assert.equal(result.release_pause, true);
    assert.ok(result.reason_codes.includes('UPSTREAM_IDENTITY_UNCONFIRMED'));
    assert.equal(result.rollback_target, result.provider_id);
  }
});

test('P8 plugin compatibility matrix requires license notice hash and rollback before promotion', () => {
  const matrix = readJson('config/plugin-compatibility.p8.json');
  assert.equal(matrix.schema_version, 'nexus.plugin_compatibility.p8.v1');
  assert.equal(matrix.tenant_self_service_third_party_install, false);
  assert.equal(matrix.default_policy.production_default_may_promote, false);
  assert.ok(matrix.default_policy.pause_on.includes('missing_license'));
  assert.ok(matrix.default_policy.pause_on.includes('missing_notice'));
  assert.ok(matrix.default_policy.pause_on.includes('breaking_change'));

  for (const plugin of matrix.plugins) {
    assert.match(plugin.sha256, /^[a-f0-9]{64}$/);
    assert.equal(plugin.notice_status, 'recorded');
    assert.equal(plugin.allowlist_status, 'approved');
    assert.equal(plugin.rollback_target, plugin.plugin_id);
    assert.ok(plugin.required_tests.length >= 2);
  }
});
