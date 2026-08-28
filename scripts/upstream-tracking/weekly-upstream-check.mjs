#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const args = new Set(process.argv.slice(2));
const strict = args.has('--strict');
const remoteRequested = args.has('--remote') || process.env.NEXUS_UPSTREAM_REMOTE_CHECK === '1';
const matrix = readJson('config/provider-compatibility.p8.json');

const results = matrix.providers.map((provider) => checkProvider(provider, { remoteRequested }));
const releasePause = results.some((result) => result.release_pause);
const report = {
  schema_version: 'nexus.upstream_check_report.p8.v1',
  task_id: 'P8-02',
  upstream_check_mode: matrix.upstream_check_mode,
  remote_check_requested: remoteRequested,
  release_pause: releasePause,
  promotion_strategy: matrix.promotion_strategy,
  results,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (strict && results.some((result) => result.status !== 'ok')) process.exitCode = 1;

function checkProvider(provider, options) {
  const base = {
    component: provider.component,
    provider_id: provider.provider_id,
    version: provider.version,
    vendor_path: provider.vendor_path,
    canary_phase: provider.canary_phase,
    rollback_target: provider.rollback_target,
  };
  if (provider.upstream_remote === 'unconfirmed' || provider.upstream_commit === 'unconfirmed') {
    return {
      ...base,
      status: 'identity_unconfirmed',
      release_pause: true,
      reason_codes: ['UPSTREAM_IDENTITY_UNCONFIRMED'],
    };
  }
  if (!options.remoteRequested) {
    return {
      ...base,
      status: 'static_only',
      release_pause: false,
      reason_codes: ['REMOTE_CHECK_NOT_REQUESTED'],
    };
  }
  try {
    execFileSync('git', ['ls-remote', provider.upstream_remote, provider.upstream_commit], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15000,
    });
    return { ...base, status: 'ok', release_pause: false, reason_codes: [] };
  } catch {
    return {
      ...base,
      status: 'remote_unavailable',
      release_pause: true,
      reason_codes: ['UPSTREAM_REMOTE_UNAVAILABLE'],
    };
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
