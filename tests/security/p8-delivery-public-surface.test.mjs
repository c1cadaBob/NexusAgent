import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const PUBLIC_SURFACE_FILES = [
  'docs/contracts/openapi.yaml',
  'product/api/index.ts',
  'product/sdk/src/index.ts',
  'product/web-console/src/apiClient.ts',
  'product/web-console/src/main.tsx',
  'product/docs-site/src/catalog.ts',
];

function read(path) {
  return readFileSync(path, 'utf8');
}

test('P8-04 delivery work does not add public product routes or SDK methods', () => {
  const combined = PUBLIC_SURFACE_FILES.map((path) => `--- ${path} ---\n${read(path)}`).join('\n');
  assert.doesNotMatch(combined, /\/v1\/(delivery|legal|notices|release|restore|backup|provider-rollbacks|plugin-rollbacks)/i);
  assert.doesNotMatch(combined, /createDelivery|getDelivery|legalNotice|thirdPartyNotice|providerRollback|pluginRollback/);
  assert.doesNotMatch(combined, /nexus\.delivery_readiness\.p8\.v1|nexus\.legal_notice\.p8\.v1|P8-04_/);
});

test('P8-04 delivery configs keep public API stability explicit and internal-only', () => {
  const profile = JSON.parse(read('config/delivery-readiness.p8.json'));
  assert.equal(profile.public_surface_change, false);
  assert.ok(profile.acceptance_gates.includes('P8-04_PUBLIC_API_STABILITY'));
  assert.deepEqual(profile.public_surface_files.sort(), PUBLIC_SURFACE_FILES.sort());
});
