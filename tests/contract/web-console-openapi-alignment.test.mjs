import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { PLATFORM_API_ROUTES, WEB_CONSOLE_SCHEMA_VERSION } from '../../product/web-console/src/apiClient.ts';
import { WEB_CONSOLE_VIEW_MODEL_VERSION } from '../../product/web-console/src/viewModel.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('web console route catalog is covered by public OpenAPI', async () => {
  const spec = await readFile(path.join(repoRoot, 'docs/contracts/openapi.yaml'), 'utf8');
  for (const route of PLATFORM_API_ROUTES) {
    assert.match(spec, new RegExp(`^  ${route.replace(/[{}]/g, '\\$&')}:`, 'm'), `OpenAPI missing ${route}`);
  }
});

test('web console schema markers stay platform-owned', () => {
  assert.equal(WEB_CONSOLE_SCHEMA_VERSION, 'nexus.web_console.p5.v1');
  assert.equal(WEB_CONSOLE_VIEW_MODEL_VERSION, 'nexus.web_console.view_model.p5.v1');
});

test('web console package remains a local Vite app outside the root workspace', async () => {
  const pkg = JSON.parse(await readFile(path.join(repoRoot, 'product/web-console/package.json'), 'utf8'));
  assert.equal(pkg.private, true);
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.scripts.build, 'tsc --noEmit && vite build');
  assert.equal(Object.hasOwn(pkg.dependencies, 'react'), true);
  assert.equal(Object.hasOwn(pkg.dependencies, 'react-dom'), true);
  assert.equal(Object.hasOwn(pkg.devDependencies, 'vite'), true);
  assert.equal(Object.hasOwn(pkg.devDependencies, 'typescript'), true);
});
