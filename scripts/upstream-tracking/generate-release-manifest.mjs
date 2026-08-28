#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const releaseGate = readJson('config/release-gate.p8.json');
const providerMatrix = readJson('config/provider-compatibility.p8.json');
const pluginMatrix = readJson('config/plugin-compatibility.p8.json');

const tag = process.env.GITHUB_REF_NAME ?? process.env.NEXUS_RELEASE_TAG ?? 'local-dry-run';
const commit = process.env.GITHUB_SHA ?? git(['rev-parse', 'HEAD']) ?? 'unknown';
const createdAt = process.env.NEXUS_RELEASE_CREATED_AT_UTC ?? '1970-01-01T00:00:00Z';

const providerPause = providerMatrix.providers.some((provider) => provider.release_pause?.active);
const pluginPause = pluginMatrix.plugins.some((plugin) => plugin.allowlist_status !== 'approved' || !plugin.rollback_target);
const externalImagePause = releaseGate.external_image_refs.some((entry) => entry.publish_blocking);

const manifest = {
  schema_version: 'nexus.release_manifest.p8.v1',
  task_id: 'P8-02',
  release_behavior: releaseGate.release_behavior,
  promotion_strategy: releaseGate.promotion_strategy,
  release_tag: tag,
  commit,
  created_at_utc: createdAt,
  published_images: releaseGate.published_images.map((image) => ({
    service: image.service,
    image: `${image.image}:${tag}`,
    dockerfile: image.dockerfile,
    health_path: image.health_path,
    promotion_state: 'candidate',
  })),
  external_image_refs: releaseGate.external_image_refs,
  provider_matrix: providerMatrix.providers.map((provider) => ({
    component: provider.component,
    provider_id: provider.provider_id,
    compatibility_state: provider.compatibility_state,
    canary_phase: provider.canary_phase,
    rollback_target: provider.rollback_target,
    release_pause: provider.release_pause,
  })),
  plugin_matrix: pluginMatrix.plugins.map((plugin) => ({
    plugin_id: plugin.plugin_id,
    capability_id: plugin.capability_id,
    compatibility_state: plugin.compatibility_state,
    canary_phase: plugin.canary_phase,
    rollback_target: plugin.rollback_target,
    allowlist_status: plugin.allowlist_status,
  })),
  release_pause: providerPause || pluginPause || externalImagePause,
  release_pause_reasons: [
    ...(providerPause ? ['provider_upstream_identity_unconfirmed'] : []),
    ...(pluginPause ? ['plugin_gate_incomplete'] : []),
    ...(externalImagePause ? ['external_internal_service_images_required'] : []),
  ],
  production_default_promotion_allowed: false,
  canary_candidate_publish_allowed: true,
};

process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return undefined;
  }
}
