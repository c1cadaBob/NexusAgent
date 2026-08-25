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

test('openclaw-adapter dev compose exposure is loopback-only and internal', () => {
  const config = devComposeConfig();
  const service = config.services['openclaw-adapter'];
  assert.ok(service, 'openclaw-adapter service must exist');
  assert.equal(service.environment.NEXUS_PUBLIC, 'false');
  assert.equal(service.environment.NEXUS_SERVICE_NAME, 'openclaw-adapter');
  assert.equal(service.environment.NEXUS_DEBUG_PORT, '9252');
  assert.deepEqual(Object.keys(service.networks), ['nexus-dev-internal']);
  assert.equal(service.labels['nexus.service.public'], 'false');

  const publishedPorts = Object.fromEntries(service.ports.map((port) => [String(port.published), port]));
  assert.equal(publishedPorts['3052'].host_ip, '127.0.0.1');
  assert.equal(publishedPorts['3052'].target, 8080);
  assert.equal(publishedPorts['9252'].host_ip, '127.0.0.1');
  assert.equal(publishedPorts['9252'].target, 9229);
});

test('production compose does not expose OpenClaw dev ports native gateway or debug settings', () => {
  const prodCompose = readFileSync('deploy/docker-compose.prod.yml', 'utf8');
  for (const forbidden of [
    '3052',
    '9252',
    '--inspect',
    'NEXUS_HOT_RELOAD',
    'NEXUS_DEBUG_PORT',
    'openclaw-adapter',
    'tools.invoke',
    'agentCommandFromGatewayIngress',
  ]) {
    assert.equal(prodCompose.includes(forbidden), false, `production compose leaked ${forbidden}`);
  }
});
