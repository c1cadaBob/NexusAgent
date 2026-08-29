import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

function mergedCompose() {
  return JSON.parse(execFileSync('docker', [
    'compose',
    '-f',
    'deploy/docker-compose.dev.yml',
    '-f',
    'deploy/docker-compose.dev.lan.yml',
    'config',
    '--format',
    'json',
  ], { encoding: 'utf8' }));
}

test('LAN development overlay starts real product and internal runtimes', () => {
  const config = mergedCompose();
  const services = config.services;
  assert.deepEqual(
    Object.keys(services).sort(),
    [
      'artifact-store',
      'credential-center',
      'dsh-adapter',
      'event-bus',
      'hermes-adapter',
      'memory-gateway',
      'observability',
      'openclaw-adapter',
      'platform-api',
      'web-console',
    ],
  );
  assert.match(services['platform-api'].command.join(' '), /product\/api\/server\.mjs/);
  assert.match(services['web-console'].command.join(' '), /vite(?:\.js)? --host 0\.0\.0\.0 --port 5175/);
  assert.match(services['web-console'].command.join(' '), /--store-dir \/workspace\/product\/web-console\/node_modules\/\.pnpm-store/);
  assert.match(services['web-console'].command.join(' '), /--inspect=0\.0\.0\.0:9229/);
  assert.equal(services['platform-api'].environment.NEXUS_RUNTIME_MODE, 'distributed');
  assert.match(services['openclaw-adapter'].command.join(' '), /internal-service\.mjs/);
  assert.match(services['hermes-adapter'].command.join(' '), /internal-service\.mjs/);
  assert.match(services['dsh-adapter'].command.join(' '), /internal-service\.mjs/);
  assert.equal(services['platform-api'].healthcheck.test[1].includes('/v1/health'), true);
  assert.equal(services['web-console'].healthcheck.test[1].includes('5175'), true);
  assert.equal(services['web-console'].volumes.some((volume) => volume.target === '/workspace/product/web-console/node_modules'), true);
  assert.equal(services['web-console'].volumes.some((volume) => volume.target === '/workspace/product'), false);
  assert.equal(services['web-console'].volumes.some((volume) => volume.target === '/workspace/product/web-console/src'), true);
});

test('LAN development overlay exposes only the two product edges', () => {
  const config = mergedCompose();
  const publicServices = ['platform-api', 'web-console'];
  for (const [name, service] of Object.entries(config.services)) {
    const ports = service.ports ?? [];
    if (publicServices.includes(name)) {
      assert.equal(ports[0].host_ip, '0.0.0.0', `${name} must be LAN reachable`);
    } else {
      assert.ok(ports.every((port) => port.host_ip === '127.0.0.1'), `${name} must remain loopback-only`);
    }
    const debugPorts = ports.filter((port) => port.target === 9229);
    assert.ok(debugPorts.every((port) => port.host_ip === '127.0.0.1'), `${name} debug port must remain loopback-only`);
  }
});
