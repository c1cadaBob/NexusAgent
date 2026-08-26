import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { SDK_METHOD_CATALOG } from '../../product/docs-site/src/catalog.ts';
import { SDK_SCHEMA_VERSION } from '../../product/sdk/src/index.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const openapiPath = path.join(repoRoot, 'docs/contracts/openapi.yaml');
const sdkPath = path.join(repoRoot, 'product/sdk/src/index.ts');
const sdkPackagePath = path.join(repoRoot, 'product/sdk/package.json');

async function readText(relativePath) {
  return readFile(path.join(repoRoot, relativePath), 'utf8');
}

function openapiRoutePattern(route) {
  return new RegExp(`^  ${route.replace(/[{}]/g, '\\$&')}:`, 'm');
}

test('P5 TypeScript SDK declares platform schema marker and local package boundary', async () => {
  const pkg = JSON.parse(await readFile(sdkPackagePath, 'utf8'));
  assert.equal(SDK_SCHEMA_VERSION, 'nexus.sdk.p5.v1');
  assert.equal(pkg.name, '@nexusagent/sdk');
  assert.equal(pkg.private, true);
  assert.equal(pkg.scripts.build, 'tsc -p tsconfig.json');
  assert.deepEqual(Object.keys(pkg.devDependencies), ['typescript']);
  assert.equal(Object.hasOwn(pkg, 'dependencies'), false);
});

test('P5 TypeScript SDK method catalog is covered by public OpenAPI', async () => {
  const spec = await readFile(openapiPath, 'utf8');
  const sdkSource = await readFile(sdkPath, 'utf8');
  for (const method of SDK_METHOD_CATALOG) {
    assert.match(spec, openapiRoutePattern(method.route), `OpenAPI missing ${method.route}`);
    assert.match(sdkSource, new RegExp(`${method.name}\\(`), `SDK missing ${method.name}`);
  }
});

test('P5 TypeScript SDK keeps REST-first boundary and does not add webhook routes', async () => {
  const spec = await readFile(openapiPath, 'utf8');
  const sdkSource = await readText('product/sdk/src/index.ts');
  assert.doesNotMatch(spec, /^  \/v1\/webhooks/m);
  assert.doesNotMatch(spec, /^  \/v1\/stream/m);
  assert.doesNotMatch(sdkSource, /platform\/adapters|vendor\//);
  assert.match(sdkSource, /assertPlatformPath/);
});

test('P5 TypeScript SDK examples are limited to implemented platform routes', async () => {
  const spec = await readFile(openapiPath, 'utf8');
  const examplePaths = [
    'product/sdk/examples/quickstart.mjs',
    'product/sdk/examples/memory-budget.mjs',
    'product/sdk/examples/channel-management.mjs',
    'product/sdk/examples/plugin-governance.mjs',
  ];
  for (const relativePath of examplePaths) {
    const text = await readText(relativePath);
    for (const match of text.matchAll(/client\.([A-Za-z0-9_]+)/g)) {
      const method = SDK_METHOD_CATALOG.find((item) => item.name === match[1]);
      assert.ok(method, `${relativePath} uses undocumented SDK method ${match[1]}`);
      assert.match(spec, openapiRoutePattern(method.route), `${relativePath} route not in OpenAPI: ${method.route}`);
    }
  }
});
