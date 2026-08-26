import { NexusAgentClient, createTraceFactory } from '../dist/index.js';
import { exampleClientOptions } from './support/inProcessFetch.mjs';

const trace = createTraceFactory('trace_sdk_quickstart');
const client = new NexusAgentClient(exampleClientOptions('dev-operator-alpha'));

const task = await client.submitTask({
  tenant_id: 'tenant_alpha01',
  user_id: 'user_alpha01',
  agent_id: 'agent_alpha01',
  conversation_id: 'conv_sdk_quickstart01',
  input: 'Summarize the P5 platform task queue',
  trace_id: trace(),
});

const events = await client.listTaskEvents(task.task_id, { limit: 10 });

console.log(JSON.stringify({
  example: 'quickstart',
  task_id: task.task_id,
  state: task.state,
  event_count: events.items.length,
  trace_id: task.trace_id,
}, null, 2));
