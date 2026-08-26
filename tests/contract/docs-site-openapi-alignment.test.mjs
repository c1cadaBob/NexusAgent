import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { DOCS_ROUTE_MATRIX, DOCS_SITE_SCHEMA_VERSION, SDK_METHOD_CATALOG } from '../../product/docs-site/src/catalog.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const openapiPath = path.join(repoRoot, 'docs/contracts/openapi.yaml');

function openapiRoutePattern(route) {
  return new RegExp(`^  ${route.replace(/[{}]/g, '\\$&')}:`, 'm');
}

test('docs site route matrix is covered by public OpenAPI', async () => {
  const spec = await readFile(openapiPath, 'utf8');
  assert.equal(DOCS_SITE_SCHEMA_VERSION, 'nexus.docs_site.p5.v1');
  assert.equal(DOCS_ROUTE_MATRIX.length, 26);
  for (const route of DOCS_ROUTE_MATRIX) {
    assert.match(spec, openapiRoutePattern(route.path), `OpenAPI missing docs route ${route.path}`);
  }
});

test('docs site SDK method catalog points to implemented SDK methods', async () => {
  const sdkSource = await readFile(path.join(repoRoot, 'product/sdk/src/index.ts'), 'utf8');
  for (const method of SDK_METHOD_CATALOG) {
    assert.match(sdkSource, new RegExp(`${method.name}\\(`), `SDK source missing ${method.name}`);
  }
});

test('docs site remains a local Vite React app with Swiss token markers', async () => {
  const pkg = JSON.parse(await readFile(path.join(repoRoot, 'product/docs-site/package.json'), 'utf8'));
  const css = await readFile(path.join(repoRoot, 'product/docs-site/src/styles.css'), 'utf8');
  assert.equal(pkg.name, '@nexusagent/docs-site');
  assert.equal(pkg.private, true);
  assert.equal(pkg.scripts.build, 'tsc --noEmit && vite build');
  assert.equal(Object.hasOwn(pkg.dependencies, 'react'), true);
  assert.equal(Object.hasOwn(pkg.dependencies, 'react-dom'), true);
  assert.equal(Object.hasOwn(pkg.devDependencies, 'vite'), true);
  assert.match(css, /#ffffff/i);
  assert.match(css, /#f7f7f8/i);
  assert.match(css, /#002fa7/i);
  assert.match(css, /Helvetica Neue/);
  assert.match(css, /1px solid/);
});
