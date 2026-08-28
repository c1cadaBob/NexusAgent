import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const SERVICE_NAMES = [
  'platform-api',
  'web-console',
  'openclaw-adapter',
  'hermes-adapter',
  'dsh-adapter',
  'memory-gateway',
  'artifact-store',
  'event-bus',
  'credential-center',
  'observability',
];

const PUBLIC_SERVICES = new Set(['platform-api', 'web-console']);
const INTERNAL_SERVICES = SERVICE_NAMES.filter((name) => !PUBLIC_SERVICES.has(name));

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

function count(text, pattern) {
  return (text.match(pattern) ?? []).length;
}

test('production compose declares full P8 service inventory with only edge services published', () => {
  const config = prodComposeConfig();
  assert.deepEqual(Object.keys(config.services).sort(), SERVICE_NAMES.slice().sort());

  for (const serviceName of SERVICE_NAMES) {
    const service = config.services[serviceName];
    assert.ok(service.image?.includes('p8-template'), `${serviceName} uses a template image ref`);
    assert.equal(service.read_only, true, `${serviceName} must use read-only root filesystem`);
    assert.deepEqual(service.cap_drop, ['ALL'], `${serviceName} must drop Linux capabilities`);
    assert.ok(service.security_opt.includes('no-new-privileges:true'), `${serviceName} must disable privilege escalation`);
    assert.ok(service.tmpfs.includes('/tmp:size=64m,mode=1777'), `${serviceName} must use tmpfs instead of writable image FS`);
    assert.ok(service.healthcheck, `${serviceName} must declare a healthcheck`);
    assert.equal(service.environment.NEXUS_DEPLOYMENT_STAGE, 'production');
    assert.equal(service.labels['nexus.p8.debug'], 'false');
    assert.equal(service.labels['nexus.p8.hot_reload'], 'false');
    assert.equal(service.labels['nexus.p8.source_mounts'], 'false');
    assert.equal('NEXUS_DEBUG_PORT' in service.environment, false, `${serviceName} must not carry a debug port env`);
    assert.equal('NEXUS_HOT_RELOAD' in service.environment, false, `${serviceName} must not carry hot reload env`);
    assert.equal(Boolean(service.volumes), false, `${serviceName} must not use source bind mounts`);
  }

  for (const serviceName of PUBLIC_SERVICES) {
    const service = config.services[serviceName];
    assert.equal(service.labels['nexus.service.public'], 'true');
    assert.ok(Array.isArray(service.ports), `${serviceName} must publish one host port`);
    assert.equal(service.ports.length, 1, `${serviceName} must publish exactly one host port`);
    assert.equal(service.ports[0].target, 8080);
  }

  for (const serviceName of INTERNAL_SERVICES) {
    const service = config.services[serviceName];
    assert.equal(service.labels['nexus.service.public'], 'false');
    assert.equal(service.labels['nexus.p8.internal_only'], 'true');
    assert.equal(Boolean(service.ports), false, `${serviceName} must not publish host ports`);
    assert.deepEqual(Object.keys(service.networks), ['nexus-prod-internal'], `${serviceName} must only join internal network`);
  }

  assert.equal(config.networks['nexus-prod-internal'].internal, true, 'internal network must be Docker-internal');
});

test('production service catalog mirrors compose boundary and backend references', () => {
  const catalog = read('config/services.prod.yaml');
  for (const marker of [
    'P8-01 production_orchestration',
    'production_primary_path: kubernetes',
    'production_compose_path: single_node_private_fault_reproduction',
    'hot_reload: false',
    'debug_ports: false',
    'source_bind_mounts: false',
    'NEXUS_EVENT_BUS_BACKEND_REF',
    'NEXUS_ARTIFACT_BACKEND_REF',
    'NEXUS_CREDENTIAL_BACKEND_REF',
    'NEXUS_MEMORY_BACKEND_REF',
    'NEXUS_OBSERVABILITY_BACKEND_REF',
  ]) {
    assert.match(catalog, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `catalog marker missing: ${marker}`);
  }

  for (const serviceName of SERVICE_NAMES) {
    assert.match(catalog, new RegExp(`^  ${serviceName}:`, 'm'), `${serviceName} must be listed in config/services.prod.yaml`);
  }
  for (const serviceName of INTERNAL_SERVICES) {
    const servicesStart = catalog.indexOf('\nservices:');
    const blockStart = catalog.indexOf(`  ${serviceName}:`, servicesStart);
    assert.notEqual(blockStart, -1, `${serviceName} config block must exist`);
    const block = catalog.slice(blockStart, blockStart + 700);
    assert.match(block, /public: false/);
    assert.match(block, /network_scope: internal_only/);
    assert.match(block, /debug: false/);
    assert.match(block, /hot_reload: false/);
    assert.match(block, /source_mounts: false/);
  }
});

test('Kubernetes production templates include hardened workloads and public ingress boundary', () => {
  const requiredFiles = [
    'deploy/k8s/namespace.yaml',
    'deploy/k8s/serviceaccount.yaml',
    'deploy/k8s/configmap.yaml',
    'deploy/k8s/secret-template.yaml',
    'deploy/k8s/deployments.yaml',
    'deploy/k8s/services.yaml',
    'deploy/k8s/ingress.yaml',
    'deploy/k8s/network-policies.yaml',
    'deploy/k8s/kustomization.yaml',
  ];
  for (const path of requiredFiles) assert.ok(existsSync(path), `${path} must exist`);

  const deployments = read('deploy/k8s/deployments.yaml');
  for (const serviceName of SERVICE_NAMES) {
    assert.match(deployments, new RegExp(`name: ${serviceName}`), `${serviceName} deployment must exist`);
  }
  assert.equal(count(deployments, /readinessProbe:/g), SERVICE_NAMES.length);
  assert.equal(count(deployments, /livenessProbe:/g), SERVICE_NAMES.length);
  assert.equal(count(deployments, /resources:/g), SERVICE_NAMES.length);
  assert.equal(count(deployments, /runAsNonRoot: true/g), SERVICE_NAMES.length);
  assert.equal(count(deployments, /allowPrivilegeEscalation: false/g), SERVICE_NAMES.length);
  assert.equal(count(deployments, /readOnlyRootFilesystem: true/g), SERVICE_NAMES.length);
  assert.equal(count(deployments, /drop:\n\s+- ALL/g), SERVICE_NAMES.length);
  assert.match(deployments, /seccompProfile:\n\s+type: RuntimeDefault/);

  const services = read('deploy/k8s/services.yaml');
  assert.equal(count(services, /type: ClusterIP/g), SERVICE_NAMES.length);
  assert.doesNotMatch(services, /type:\s*(NodePort|LoadBalancer)/);
  for (const serviceName of INTERNAL_SERVICES) {
    const blockStart = services.indexOf(`  name: ${serviceName}`);
    assert.notEqual(blockStart, -1, `${serviceName} service block must exist`);
    const blockEnd = services.indexOf('\n---', blockStart);
    const block = services.slice(blockStart, blockEnd === -1 ? services.length : blockEnd);
    assert.match(block, /nexus\.p8\.internal_only: "true"/);
    assert.match(block, /nexus\.service\.public: "false"/);
  }

  const ingress = read('deploy/k8s/ingress.yaml');
  assert.match(ingress, /platform-api-and-web-console-only/);
  assert.match(ingress, /name: platform-api/);
  assert.match(ingress, /name: web-console/);
  for (const serviceName of INTERNAL_SERVICES) {
    assert.equal(ingress.includes(`name: ${serviceName}`), false, `${serviceName} must not be an ingress backend`);
  }

  const policies = read('deploy/k8s/network-policies.yaml');
  for (const marker of ['default_deny', 'public_ingress_only', 'platform_governed_internal_only', 'platform_egress_to_internal']) {
    assert.match(policies, new RegExp(marker), `NetworkPolicy marker missing: ${marker}`);
  }
});
