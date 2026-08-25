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

function assertInternalService(config, serviceName, servicePort, debugPort) {
  const service = config.services[serviceName];
  assert.ok(service, `${serviceName} service must exist`);
  assert.equal(service.environment.NEXUS_PUBLIC, 'false');
  assert.equal(service.environment.NEXUS_SERVICE_NAME, serviceName);
  assert.equal(service.environment.NEXUS_DEBUG_PORT, String(debugPort));
  assert.deepEqual(Object.keys(service.networks), ['nexus-dev-internal']);
  assert.equal(service.labels['nexus.service.public'], 'false');

  const publishedPorts = Object.fromEntries(service.ports.map((port) => [String(port.published), port]));
  assert.equal(publishedPorts[String(servicePort)].host_ip, '127.0.0.1');
  assert.equal(publishedPorts[String(servicePort)].target, serviceName === 'memory-gateway' || serviceName === 'hermes-adapter' ? 8080 : publishedPorts[String(servicePort)].target);
  assert.equal(publishedPorts[String(debugPort)].host_ip, '127.0.0.1');
  assert.equal(publishedPorts[String(debugPort)].target, 9229);
}

test('Hermes adapter and Memory Gateway dev compose exposure is loopback-only and internal', () => {
  const config = devComposeConfig();
  assertInternalService(config, 'hermes-adapter', 3054, 9254);
  assertInternalService(config, 'memory-gateway', 3055, 9255);
});

test('production compose does not expose Hermes dev ports native gateway or debug settings', () => {
  const prodCompose = readFileSync('deploy/docker-compose.prod.yml', 'utf8');
  for (const forbidden of [
    '3054',
    '3055',
    '9254',
    '9255',
    '--inspect',
    'NEXUS_HOT_RELOAD',
    'NEXUS_DEBUG_PORT',
    'hermes-adapter',
    'memory-gateway',
    'native gateway',
    'NEXUS_HERMES_PLANNER_ONLY_GATEWAY',
  ]) {
    assert.equal(prodCompose.includes(forbidden), false, `production compose leaked ${forbidden}`);
  }
});
