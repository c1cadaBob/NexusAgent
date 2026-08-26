import { NexusAgentClient, createTraceFactory } from '../dist/index.js';
import { exampleClientOptions } from './support/inProcessFetch.mjs';

const trace = createTraceFactory('trace_sdk_plugin');
const client = new NexusAgentClient(exampleClientOptions('dev-platform-admin'));

const imported = await client.importPlugin({
  source_kind: 'package_registry',
  source_ref: 'registry:approved.sdk.example',
  display_name: 'Approved SDK Example Plugin',
  version: '1.0.0',
  expected_sha256: 'd'.repeat(64),
  license: 'MIT',
  notice_status: 'recorded',
  risk_level: 'medium',
  trace_id: trace(),
});

const approved = await client.decidePluginAdmission(imported.plugin_id, {
  decision: 'approve',
  reason: 'SDK example metadata complete',
  trace_id: trace(),
});

const disabled = await client.decidePluginAdmission(imported.plugin_id, {
  decision: 'disable',
  reason: 'SDK example cleanup',
  trace_id: trace(),
});

console.log(JSON.stringify({
  example: 'plugin-governance',
  plugin_id: imported.plugin_id,
  approved_status: approved.allowlist_status,
  disabled_status: disabled.allowlist_status,
  license: imported.license,
  notice_status: imported.notice_status,
  trace_id: disabled.trace_id,
}, null, 2));
