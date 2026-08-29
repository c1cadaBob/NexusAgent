import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function compose() {
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

test('LAN profile keeps internal services and inspectors off the LAN', () => {
  const config = compose();
  for (const [name, service] of Object.entries(config.services)) {
    const ports = service.ports ?? [];
    for (const port of ports) {
      if (port.target === 9229 || !['platform-api', 'web-console'].includes(name)) {
        assert.equal(port.host_ip, '127.0.0.1', `${name} published port ${port.published} must be loopback-only`);
      }
    }
  }
});

test('internal routes stay outside public catalogs and public source surfaces', () => {
  const openapi = readFileSync('docs/contracts/openapi.yaml', 'utf8');
  const sdk = readFileSync('product/sdk/src/index.ts', 'utf8');
  const consoleClient = readFileSync('product/web-console/src/apiClient.ts', 'utf8');
  assert.equal(openapi.includes('/internal/v1/'), false);
  assert.equal(sdk.includes('/internal/v1/'), false);
  assert.equal(consoleClient.includes('/internal/v1/'), false);
});

test('LAN profile does not hard-code a host-specific LAN address', () => {
  const overlay = readFileSync('deploy/docker-compose.dev.lan.yml', 'utf8');
  const vite = readFileSync('product/web-console/vite.config.ts', 'utf8');
  assert.equal(overlay.includes('192.168.0.202'), false);
  assert.equal(vite.includes('192.168.0.202'), false);
});
