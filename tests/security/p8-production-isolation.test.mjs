import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const INTERNAL_SERVICES = [
  'openclaw-adapter',
  'hermes-adapter',
  'dsh-adapter',
  'memory-gateway',
  'artifact-store',
  'event-bus',
  'credential-center',
  'observability',
];

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

test('production compose contains no dev mode, debug, bind mount, or clear credential markers', () => {
  const compose = read('deploy/docker-compose.prod.yml');
  for (const forbidden of [
    '--watch',
    '--inspect',
    'NEXUS_HOT_RELOAD',
    'NEXUS_DEBUG_PORT',
    '9229',
    '9250',
    '9251',
    '9252',
    '9253',
    '9254',
    '9255',
    '9256',
    '9257',
    '9258',
    '9259',
    'type: bind',
    'source: ../',
    '/opt/project',
    'api_key',
    'password:',
    'credential_material',
    'raw_credential',
    'tools.invoke',
    'agentCommandFromGatewayIngress',
    'native gateway',
  ]) {
    assert.equal(compose.includes(forbidden), false, `production compose leaked forbidden marker: ${forbidden}`);
  }
});

test('internal production services have no public ports or public network attachment', () => {
  const config = prodComposeConfig();
  for (const serviceName of INTERNAL_SERVICES) {
    const service = config.services[serviceName];
    assert.ok(service, `${serviceName} must exist in production compose`);
    assert.equal(Boolean(service.ports), false, `${serviceName} must not publish host ports`);
    assert.deepEqual(Object.keys(service.networks), ['nexus-prod-internal'], `${serviceName} must only join internal network`);
    assert.equal(service.labels['nexus.p8.internal_only'], 'true');
    assert.equal(service.labels['nexus.service.public'], 'false');
    assert.equal(service.environment.NEXUS_SERVICE_PUBLIC, 'false');
  }

  const publicPorts = Object.entries(config.services)
    .filter(([, service]) => Array.isArray(service.ports))
    .map(([name]) => name)
    .sort();
  assert.deepEqual(publicPorts, ['platform-api', 'web-console']);
});

test('Kubernetes manifests deny host escape, debug exposure, and internal public endpoints', () => {
  const combined = walkFiles('deploy/k8s')
    .filter((path) => /\.ya?ml$/.test(path))
    .map((path) => read(path))
    .join('\n--- file ---\n');

  for (const forbidden of [
    'hostNetwork:',
    'hostPath:',
    'privileged: true',
    'allowPrivilegeEscalation: true',
    'readOnlyRootFilesystem: false',
    'type: NodePort',
    'type: LoadBalancer',
    '--watch',
    '--inspect',
    'NEXUS_HOT_RELOAD',
    'NEXUS_DEBUG_PORT',
    '/opt/project',
    'tools.invoke',
    'agentCommandFromGatewayIngress',
    'native gateway',
  ]) {
    assert.equal(combined.includes(forbidden), false, `Kubernetes manifests leaked forbidden marker: ${forbidden}`);
  }

  const ingress = read('deploy/k8s/ingress.yaml');
  for (const serviceName of INTERNAL_SERVICES) {
    assert.equal(ingress.includes(`name: ${serviceName}`), false, `${serviceName} must not be publicly routed`);
  }
});

test('secret template only contains placeholders and no committed secret material', () => {
  const secretTemplate = read('deploy/k8s/secret-template.yaml');
  assert.match(secretTemplate, /placeholder-only/);
  const values = [...secretTemplate.matchAll(/^\s+[A-Z0-9_]+:\s*(.+)$/gm)].map((match) => match[1].trim());
  assert.ok(values.length >= 5, 'secret template must include expected placeholder keys');
  for (const value of values) {
    assert.equal(value, '__SET_BY_SECRET_MANAGER__', `secret value must be placeholder-only, got ${value}`);
  }

  for (const highConfidence of [/AKIA[0-9A-Z]{16}/, /-----BEGIN [A-Z ]+PRIVATE KEY-----/, /ghp_[A-Za-z0-9_]{30,}/, /xox[baprs]-[A-Za-z0-9-]{20,}/]) {
    assert.doesNotMatch(secretTemplate, highConfidence);
  }
});
