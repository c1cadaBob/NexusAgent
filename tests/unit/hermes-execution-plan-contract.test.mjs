import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildHermesExecutionPlanFixture,
  buildHermesExecutionPlanProviderFixtures,
  HERMES_EXECUTION_PLAN_SCHEMA_VERSION,
  HERMES_LEGACY_EXECUTION_PLAN_SCHEMA_VERSION,
  HermesExecutionPlanContractError,
  validateHermesExecutionPlan,
} from '../../platform/adapters/hermes/index.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(repoRoot, relativePath), 'utf8'));
}

test('P3 ExecutionPlan schema is the current platform contract and preserves P0 marker', async () => {
  const schema = await readJson('platform/contracts/execution-plan.schema.json');

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema_version.const, HERMES_EXECUTION_PLAN_SCHEMA_VERSION);
  assert.equal(JSON.stringify(schema).includes(HERMES_LEGACY_EXECUTION_PLAN_SCHEMA_VERSION), true);

  for (const field of [
    'tenant_id',
    'user_id',
    'agent_id',
    'task_id',
    'attempt_id',
    'execution_id',
    'conversation_id',
    'trace_id',
    'objective',
    'steps',
    'tool_intents',
    'budget',
    'dependencies',
    'risks',
    'memory_context',
    'trace',
  ]) {
    assert.ok(schema.required.includes(field), `ExecutionPlan missing ${field}`);
  }
  assert.equal(JSON.stringify(schema).includes('final_response'), false);
  assert.equal(JSON.stringify(schema).includes('reasoning'), false);
});

test('P3 ExecutionPlan fixture validates required IDs steps dependencies tool intents budget risks and memory context', () => {
  const plan = buildHermesExecutionPlanFixture();
  const validated = validateHermesExecutionPlan(plan);

  assert.equal(validated.schema_version, HERMES_EXECUTION_PLAN_SCHEMA_VERSION);
  assert.equal(validated.tenant_id, 'tenant_alpha01');
  assert.equal(validated.steps.length, 3);
  assert.equal(validated.dependencies.length, 2);
  assert.equal(validated.tool_intents[0].executor_policy.require_policy_gate, true);
  assert.equal(validated.tool_intents[0].executor_policy.allow_direct_execution, false);
  assert.equal(validated.budget.max_execution_steps >= validated.steps.length, true);
  assert.equal(validated.risks[0].severity, 'medium');
  assert.deepEqual(validated.memory_context.layers, ['session', 'user', 'agent_skill']);
});

test('baseline and candidate planner providers reuse the same P3 plan contract fixture', () => {
  for (const { provider, plan } of buildHermesExecutionPlanProviderFixtures()) {
    assert.equal(provider.schema_versions.includes(HERMES_EXECUTION_PLAN_SCHEMA_VERSION), true);
    assert.equal(validateHermesExecutionPlan(plan).schema_version, HERMES_EXECUTION_PLAN_SCHEMA_VERSION);
  }
});

test('ExecutionPlan validator rejects missing strict fields and explanation content', () => {
  const plan = buildHermesExecutionPlanFixture();
  const withoutBudget = { ...plan };
  delete withoutBudget.budget;

  assert.throws(
    () => validateHermesExecutionPlan(withoutBudget),
    (error) => error instanceof HermesExecutionPlanContractError && error.code === 'PLATFORM_SCHEMA_VALIDATION_FAILED',
  );
  assert.throws(
    () => validateHermesExecutionPlan({ ...plan, explanation: 'model said because' }),
    (error) => error instanceof HermesExecutionPlanContractError && error.code === 'PLATFORM_SCHEMA_VALIDATION_FAILED',
  );
  assert.throws(
    () => validateHermesExecutionPlan({ ...plan, final_response: 'natural language answer' }),
    (error) => error instanceof HermesExecutionPlanContractError && error.code === 'PLATFORM_SCHEMA_VALIDATION_FAILED',
  );
});
