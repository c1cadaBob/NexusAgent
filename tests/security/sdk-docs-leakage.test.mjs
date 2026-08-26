import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createManualPlatformApi } from '../../product/api/index.ts';
import { NexusAgentClient } from '../../product/sdk/src/index.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const blockedPublicPattern = /Hermes|OpenClaw|DeepSeek|\bDSH\b|native_|raw_credential|credential_material|provider_binding|runtime/i;

async function collectFiles(root) {
  const files = [];
  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      const relative = path.relative(repoRoot, absolute);
      if (entry.isDirectory()) {
        if (['node_modules', 'dist'].includes(entry.name)) continue;
        await visit(absolute);
      } else if (!entry.name.endsWith('.yaml') && !entry.name.endsWith('.lock')) {
        files.push(relative);
      }
    }
  }
  await visit(path.join(repoRoot, root));
  return files;
}

test('SDK and developer docs public source avoids internal markers and implementation imports', async () => {
  const files = [...await collectFiles('product/sdk'), ...await collectFiles('product/docs-site')];
  assert.equal(files.length > 0, true);
  for (const file of files) {
    const text = await readFile(path.join(repoRoot, file), 'utf8');
    assert.doesNotMatch(text, blockedPublicPattern, `${file} leaks blocked public marker`);
    assert.doesNotMatch(text, /platform\/adapters|vendor\//, `${file} references implementation path`);
  }
});

test('SDK channel response projection does not echo credential references', async () => {
  const app = createManualPlatformApi();
  const fetchImpl = async (url, init = {}) => {
    const parsed = new URL(String(url));
    const headers = Object.fromEntries(Object.entries(init.headers ?? {}).map(([key, value]) => [key.toLowerCase(), String(value)]));
    const body = init.body === undefined ? undefined : JSON.parse(String(init.body));
    const response = await app.handle({ method: init.method ?? 'GET', path: `${parsed.pathname}${parsed.search}`, headers, body });
    return { ok: response.status >= 200 && response.status < 300, status: response.status, json: async () => response.body };
  };
  const client = new NexusAgentClient({ baseUrl: 'http://sdk-security.test', accessToken: 'dev-tenant-admin-alpha', fetchImpl });
  const response = await client.createChannel({
    tenant_id: 'tenant_alpha01',
    channel_name: 'dingtalk',
    display_name: 'SDK Security Channel',
    account_ref: 'channel_account_sdksecurity01',
    conversation_ref: 'channel_conversation_sdksecurity01',
    credential_ref: 'cred_channel_sdksecurity01',
    trace_id: 'trace_sdk_security01',
  });
  assert.equal(response.credential_status, 'reference_configured');
  assert.equal(Object.hasOwn(response, 'credential_ref'), false);
  assert.doesNotMatch(JSON.stringify(response), /cred_channel_sdksecurity01/);
});

test('developer docs state plugin governance tenant self-service boundary', async () => {
  const docsText = await readFile(path.join(repoRoot, 'product/docs-site/src/main.tsx'), 'utf8');
  const readmeText = await readFile(path.join(repoRoot, 'product/sdk/README.md'), 'utf8');
  for (const text of [docsText, readmeText]) {
    assert.match(text, /Tenant self-service third-party plugin installation is not supported in P5 Alpha/);
  }
});
