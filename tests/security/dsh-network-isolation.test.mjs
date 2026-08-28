import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function devComposeConfig() {
  return JSON.parse(execFileSync('docker', [
    'compose',
    '-f',
    'deploy/docker-compose.dev.yml',
    'config',
    '--format',
    'json',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }));
}

function prodComposeConfig() {
  return JSON.parse(execFileSync('docker', [
    'compose',
    '-f',
    'deploy/docker-compose.prod.yml',
    'config',
    '--format',
    'json',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }));
}

test('dsh-adapter dev compose exposure is loopback-only and internal', () => {
  const config = devComposeConfig();
  const service = config.services['dsh-adapter'];
  assert.ok(service, 'dsh-adapter service must exist');

  assert.equal(service.environment.NEXUS_PUBLIC, 'false');
  assert.equal(service.environment.NEXUS_SERVICE_NAME, 'dsh-adapter');
  assert.equal(service.environment.NEXUS_DEBUG_PORT, '9253');
  assert.deepEqual(Object.keys(service.networks), ['nexus-dev-internal']);

  const publishedPorts = Object.fromEntries(service.ports.map((port) => [String(port.published), port]));
  assert.equal(publishedPorts['3053'].host_ip, '127.0.0.1');
  assert.equal(publishedPorts['3053'].target, 8080);
  assert.equal(publishedPorts['9253'].host_ip, '127.0.0.1');
  assert.equal(publishedPorts['9253'].target, 9229);
  assert.equal(service.labels['nexus.service.public'], 'false');
});

test('production compose keeps DSH adapter internal without dev ports or debug/hot reload settings', () => {
  const config = prodComposeConfig();
  const service = config.services['dsh-adapter'];
  assert.ok(service, 'P8 production compose may include DSH adapter as an internal executor workload');
  assert.equal(Boolean(service.ports), false, 'dsh-adapter must not publish host ports in production');
  assert.deepEqual(Object.keys(service.networks), ['nexus-prod-internal']);
  assert.equal(service.environment.NEXUS_SERVICE_PUBLIC, 'false');
  assert.equal(service.environment.NEXUS_EXECUTOR_ONLY, 'true');
  assert.equal(service.environment.NEXUS_PROVIDER_ENTRYPOINTS, 'platform-governed');
  assert.equal(service.labels['nexus.p8.internal_only'], 'true');
  assert.equal(service.labels['nexus.service.public'], 'false');

  const prodCompose = readFileSync('deploy/docker-compose.prod.yml', 'utf8');
  for (const forbidden of ['3053', '9253', '--inspect', 'NEXUS_HOT_RELOAD', 'NEXUS_DEBUG_PORT']) {
    assert.equal(prodCompose.includes(forbidden), false, `production compose leaked ${forbidden}`);
  }
});
