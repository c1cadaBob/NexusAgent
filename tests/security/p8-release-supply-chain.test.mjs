import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const RELEASE_FILES = [
  '.github/workflows/p8-release-gate.yml',
  'config/release-gate.p8.json',
  'config/provider-compatibility.p8.json',
  'config/plugin-compatibility.p8.json',
  'deploy/docker/platform-api.Dockerfile',
  'deploy/docker/web-console.Dockerfile',
  'deploy/docker/web-console-server.mjs',
  'scripts/quality/validate-p8-release-gate.mjs',
  'scripts/upstream-tracking/validate-provider-compatibility.mjs',
  'scripts/upstream-tracking/weekly-upstream-check.mjs',
  'scripts/upstream-tracking/generate-release-manifest.mjs',
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

test('P8 release supply chain files do not contain committed secrets or debug release controls', () => {
  const combined = RELEASE_FILES.map((file) => `--- ${file} ---\n${read(file)}`).join('\n');

  for (const forbidden of [
    '--watch',
    '--inspect',
    'NEXUS_HOT_RELOAD',
    'NEXUS_DEBUG_PORT',
    'type: bind',
    'hostPath:',
    'hostNetwork:',
    'privileged: true',
    '/opt/project',
    'credential_material:',
    'raw_credential:',
    'native_url:',
    'native_path:',
    'native_session:',
    'native_error:',
    'provider_runtime:',
  ]) {
    assert.equal(combined.includes(forbidden), false, `release file leaked forbidden marker: ${forbidden}`);
  }

  for (const highConfidence of [/AKIA[0-9A-Z]{16}/, /-----BEGIN [A-Z ]+PRIVATE KEY-----/, /ghp_[A-Za-z0-9_]{30,}/, /xox[baprs]-[A-Za-z0-9-]{20,}/]) {
    assert.doesNotMatch(combined, highConfidence);
  }

  const workflow = read('.github/workflows/p8-release-gate.yml');
  const secretRefs = [...workflow.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((match) => match[1]);
  assert.deepEqual(secretRefs, ['GITHUB_TOKEN']);
});

test('P8 generated release manifest is sanitized and keeps production default promotion closed', () => {
  const manifestText = execFileSync('node', ['scripts/upstream-tracking/generate-release-manifest.mjs'], { encoding: 'utf8' });
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.production_default_promotion_allowed, false);
  assert.equal(manifest.canary_candidate_publish_allowed, true);
  assert.equal(manifest.release_pause, true);

  const forbidden = /raw_credential|credential_material|native_url|native_path|native_session|native_error|provider_runtime|secret|https?:\/\/|\/(?:opt|tmp|var|etc|home|usr)\//i;
  assert.doesNotMatch(manifestText, forbidden);
});

test('P8 release surfaces do not add product public API or local generated artifacts', () => {
  const changedSurface = RELEASE_FILES.join('\n');
  assert.doesNotMatch(changedSurface, /docs\/contracts\/openapi\.yaml|product\/sdk\/src|product\/web-console\/src|product\/api\/index\.ts/);

  const generated = ['product', 'deploy', 'config', 'scripts', 'tests']
    .flatMap((dir) => walkFiles(dir).filter((path) => /(^|\/)(node_modules|dist|coverage|\.cache|\.vite)(\/|$)/.test(path)));
  assert.deepEqual(generated, []);
});
