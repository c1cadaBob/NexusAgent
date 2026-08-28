import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

function read(path) {
  return readFileSync(path, 'utf8');
}

function readJson(path) {
  return JSON.parse(read(path));
}

test('P8 release gate workflow blocks release on quality gates and publishes GHCR only for tags', () => {
  const workflow = read('.github/workflows/p8-release-gate.yml');
  const releaseGate = readJson('config/release-gate.p8.json');

  assert.equal(releaseGate.schema_version, 'nexus.release_gate.p8.v1');
  assert.equal(releaseGate.release_behavior, 'tag_push_ghcr');
  assert.equal(releaseGate.promotion_strategy, 'canary_first');
  assert.equal(releaseGate.upstream_check_mode, 'optional_remote');
  assert.equal(releaseGate.image_publish_scope, 'real_runtime_only');
  assert.equal(releaseGate.production_default_switch, 'blocked_until_canary_review');

  for (const marker of [
    'name: P8 Release Gate',
    'pull_request:',
    'branches:',
    '- main',
    "- 'v*'",
    'needs: quality-gate',
    "if: startsWith(github.ref, 'refs/tags/v')",
    'packages: write',
    'docker/login-action@v3',
    'docker/build-push-action@v6',
    'secrets.GITHUB_TOKEN',
    'P8-02_GENERATED_ARTIFACT_CLEANUP',
    'P8-02_RELEASE_PAUSE_CANARY_ONLY',
  ]) {
    assert.ok(workflow.includes(marker), `workflow marker missing: ${marker}`);
  }

  for (const gate of releaseGate.quality_gates) {
    if (gate.startsWith('bash tests/smoke/')) assert.ok(workflow.includes(gate), `workflow missing smoke gate: ${gate}`);
  }
});

test('P8 Docker publish scope is limited to real platform API and web console runtimes', () => {
  const releaseGate = readJson('config/release-gate.p8.json');
  assert.deepEqual(releaseGate.published_images.map((image) => image.service).sort(), ['platform-api', 'web-console']);

  for (const image of releaseGate.published_images) {
    assert.ok(existsSync(image.dockerfile), `${image.dockerfile} exists`);
    assert.ok(existsSync(image.runtime_entrypoint), `${image.runtime_entrypoint} exists`);
    assert.match(image.image, /^ghcr\.io\/c1cadabob\/nexusagent\/(platform-api|web-console)$/);
  }

  const platformDockerfile = read('deploy/docker/platform-api.Dockerfile');
  assert.match(platformDockerfile, /product\/api\/server\.mjs/);
  assert.match(platformDockerfile, /NODE_OPTIONS=--experimental-strip-types/);
  assert.doesNotMatch(platformDockerfile, /pnpm install|vendor|--watch|--inspect|NEXUS_DEBUG_PORT|NEXUS_HOT_RELOAD/);

  const webDockerfile = read('deploy/docker/web-console.Dockerfile');
  assert.match(webDockerfile, /pnpm install --frozen-lockfile/);
  assert.match(webDockerfile, /pnpm run build/);
  assert.match(webDockerfile, /web-console-server\.mjs/);
  assert.doesNotMatch(webDockerfile, /vendor|--watch|--inspect|NEXUS_DEBUG_PORT|NEXUS_HOT_RELOAD/);
});

test('P8 release gate validator and manifest generator run without registry credentials', () => {
  const validation = execFileSync('node', ['scripts/quality/validate-p8-release-gate.mjs'], { encoding: 'utf8' });
  assert.match(validation, /PASS: P8-02 release gate/);

  const manifest = JSON.parse(execFileSync('node', ['scripts/upstream-tracking/generate-release-manifest.mjs'], { encoding: 'utf8' }));
  assert.equal(manifest.schema_version, 'nexus.release_manifest.p8.v1');
  assert.equal(manifest.release_behavior, 'tag_push_ghcr');
  assert.equal(manifest.production_default_promotion_allowed, false);
  assert.equal(manifest.canary_candidate_publish_allowed, true);
  assert.deepEqual(manifest.published_images.map((image) => image.service).sort(), ['platform-api', 'web-console']);
});
