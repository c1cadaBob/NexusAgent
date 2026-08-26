import { NexusAgentClient, createTraceFactory } from '../dist/index.js';
import { exampleClientOptions } from './support/inProcessFetch.mjs';

const trace = createTraceFactory('trace_sdk_channel');
const client = new NexusAgentClient(exampleClientOptions('dev-tenant-admin-alpha'));

const channel = await client.createChannel({
  tenant_id: 'tenant_alpha01',
  channel_name: 'feishu',
  display_name: 'Feishu SDK Example',
  account_ref: 'channel_account_sdk01',
  conversation_ref: 'channel_conversation_sdk01',
  credential_ref: 'cred_channel_sdk01',
  trace_id: trace(),
});

const enabled = await client.setChannelStatus(channel.channel_config_id, {
  status: 'enabled',
  reason: 'SDK dry-run example',
  trace_id: trace(),
});

const tested = await client.testChannel(channel.channel_config_id, { trace_id: trace() });

console.log(JSON.stringify({
  example: 'channel-management',
  channel_config_id: enabled.channel_config_id,
  channel_name: enabled.channel_name,
  credential_status: enabled.credential_status,
  test_status: tested.test_status,
  delivery_outcome: tested.delivery_outcome,
  trace_id: tested.trace_id,
}, null, 2));
