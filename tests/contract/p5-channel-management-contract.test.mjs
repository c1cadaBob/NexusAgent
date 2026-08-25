import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const openapiPath = path.join(repoRoot, 'docs/contracts/openapi.yaml');

async function openapi() {
  return readFile(openapiPath, 'utf8');
}

function schemaBlock(text, schemaName) {
  const start = text.indexOf(`    ${schemaName}:`);
  assert.notEqual(start, -1, `schema not found: ${schemaName}`);
  const rest = text.slice(start + 1);
  const next = rest.search(/\n    [A-Za-z][A-Za-z0-9]+:\n/);
  return next === -1 ? rest : rest.slice(0, next);
}

function pathBlock(text, route) {
  const start = text.indexOf(`  ${route}:`);
  assert.notEqual(start, -1, `route not found: ${route}`);
  const rest = text.slice(start + 1);
  const next = rest.search(/\n  \/v1\//);
  return next === -1 ? rest : rest.slice(0, next);
}

test('P5 channel management OpenAPI covers channel routes and cursor pagination', async () => {
  const spec = await openapi();
  for (const route of [
    '/v1/channels',
    '/v1/channels/{channel_config_id}',
    '/v1/channels/{channel_config_id}/status',
    '/v1/channels/{channel_config_id}/test',
  ]) {
    assert.match(spec, new RegExp(`^  ${route.replace(/[{}]/g, '\\$&')}:`, 'm'), `missing route ${route}`);
  }
  assert.match(pathBlock(spec, '/v1/channels'), /\$ref: '#\/components\/parameters\/LimitQuery'/);
  assert.match(pathBlock(spec, '/v1/channels'), /\$ref: '#\/components\/parameters\/CursorQuery'/);
  assert.match(schemaBlock(spec, 'ChannelConfigList'), /next_cursor:/);
});

test('P5 channel management OpenAPI allowlist is limited to approved channel names', async () => {
  const channelName = schemaBlock(await openapi(), 'ChannelName');
  for (const name of ['dingtalk', 'feishu', 'telegram']) assert.match(channelName, new RegExp(`- ${name}\\b`));
  for (const name of ['wechat', 'slack', 'discord']) assert.doesNotMatch(channelName, new RegExp(`- ${name}\\b`));
});

test('P5 channel management response schemas do not expose credential references or internal markers', async () => {
  const spec = await openapi();
  for (const schemaName of ['ChannelConfig', 'ChannelConfigList', 'ChannelConnectionTestResult']) {
    const block = schemaBlock(spec, schemaName);
    assert.doesNotMatch(block, /credential_ref|provider_binding|runtime|native_|raw_credential|credential_material/i, schemaName);
  }
  assert.match(schemaBlock(spec, 'ChannelConfigCreateRequest'), /credential_ref:/);
  assert.match(schemaBlock(spec, 'ChannelConfigUpdateRequest'), /credential_ref:/);
  assert.doesNotMatch(spec, /Hermes|OpenClaw|DeepSeek|\bDSH\b/);
});
