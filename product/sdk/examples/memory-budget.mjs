import { NexusAgentClient, createTraceFactory } from '../dist/index.js';
import { exampleClientOptions } from './support/inProcessFetch.mjs';

const trace = createTraceFactory('trace_sdk_memory');
const client = new NexusAgentClient(exampleClientOptions('dev-operator-alpha'));

const memory = await client.writeMemory({
  tenant_id: 'tenant_alpha01',
  user_id: 'user_alpha01',
  agent_id: 'agent_alpha01',
  conversation_id: 'conv_sdk_memory01',
  layer: 'user',
  text: 'P5 SDK memory example record',
  trace_id: trace(),
});

const search = await client.searchMemory({
  tenant_id: 'tenant_alpha01',
  user_id: 'user_alpha01',
  layer: 'user',
  query: 'SDK memory example',
  trace_id: trace(),
});

const budget = await client.checkBudget({
  tenant_id: 'tenant_alpha01',
  requested_units: 10,
  remaining_units: 25,
  max_units_per_attempt: 20,
  trace_id: trace(),
});

console.log(JSON.stringify({
  example: 'memory-budget',
  memory_id: memory.memory_id,
  search_count: search.items.length,
  budget_status: budget.status,
  trace_id: budget.trace_id,
}, null, 2));
