#!/usr/bin/env node

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const releaseGate = readJson('config/release-gate.p8.json');
const providerMatrix = readJson('config/provider-compatibility.p8.json');
const pluginMatrix = readJson('config/plugin-compatibility.p8.json');
const workflow = read('.github/workflows/p8-release-gate.yml');

assert.equal(releaseGate.schema_version, 'nexus.release_gate.p8.v1');
assert.equal(releaseGate.release_behavior, 'tag_push_ghcr');
assert.equal(releaseGate.promotion_strategy, 'canary_first');
assert.equal(releaseGate.upstream_check_mode, 'optional_remote');
assert.equal(releaseGate.image_publish_scope, 'real_runtime_only');
assert.equal(releaseGate.root_dependency_changes_allowed, false);
assert.equal(releaseGate.public_api_changes_allowed, false);

const publishable = new Set(releaseGate.published_images.map((image) => image.service));
assert.deepEqual([...publishable].sort(), ['platform-api', 'web-console']);
for (const image of releaseGate.published_images) {
  assert.match(image.image, /^ghcr\.io\/c1cadabob\/nexusagent\//);
  assert.equal(image.context, '.');
  assert.equal(image.publish_on_tags, true);
  assert.ok(existsSync(image.dockerfile), `${image.dockerfile} must exist`);
  assert.ok(existsSync(image.runtime_entrypoint), `${image.runtime_entrypoint} must exist`);
}

const externalServices = releaseGate.external_image_refs.map((entry) => entry.service).sort();
assert.deepEqual(externalServices, [
  'artifact-store',
  'credential-center',
  'dsh-adapter',
  'event-bus',
  'hermes-adapter',
  'memory-gateway',
  'observability',
  'openclaw-adapter',
]);
for (const entry of releaseGate.external_image_refs) {
  assert.equal(entry.publish_blocking, true, `${entry.service} must block production default promotion until image ref is supplied`);
  assert.match(entry.image_env, /^NEXUS_[A-Z0-9_]+_IMAGE$/);
}

for (const command of [
  'scripts/planning/generate-task-prompts.py --check',
  'git diff --check',
  "git diff --check -- . ':!vendor/**'",
  'bash tests/smoke/P0.sh',
  'bash tests/smoke/P1.sh',
  'bash tests/smoke/P2.sh',
  'bash tests/smoke/P3.sh',
  'bash tests/smoke/P4.sh',
  'bash tests/smoke/P5.sh',
  'bash tests/smoke/P6.sh',
  'bash tests/smoke/P7.sh',
  'bash tests/smoke/P8.sh',
]) {
  assert.ok(releaseGate.quality_gates.includes(command), `quality gate missing: ${command}`);
}

for (const marker of [
  'tag_push_ghcr',
  "tags:",
  "'v*'",
  'packages: write',
  'needs: quality-gate',
  'docker/login-action@v3',
  'docker/build-push-action@v6',
  'secrets.GITHUB_TOKEN',
  'ghcr.io/c1cadabob/nexusagent/platform-api',
  'ghcr.io/c1cadabob/nexusagent/web-console',
  'P8-02_GENERATED_ARTIFACT_CLEANUP',
  'P8-02_RELEASE_PAUSE_CANARY_ONLY',
]) {
  assert.ok(workflow.includes(marker), `workflow marker missing: ${marker}`);
}

assert.equal(providerMatrix.schema_version, 'nexus.provider_compatibility.p8.v1');
assert.equal(providerMatrix.promotion_strategy, 'canary_first');
assert.equal(pluginMatrix.schema_version, 'nexus.plugin_compatibility.p8.v1');
assert.equal(pluginMatrix.tenant_self_service_third_party_install, false);
assert.equal(pluginMatrix.promotion_strategy, 'canary_first');

console.log('PASS: P8-02 release gate validates GHCR tag workflow, canary promotion, real runtime image scope, and release pause policy');

function read(path) {
  return readFileSync(path, 'utf8');
}

function readJson(path) {
  return JSON.parse(read(path));
}
