import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const openapiPath = path.join(repoRoot, 'docs/contracts/openapi.yaml');

const scheduledGoalRoutes = Object.freeze([
  '/v1/scheduled-goals/config',
  '/v1/scheduled-goals',
  '/v1/scheduled-goals/{scheduled_goal_id}',
  '/v1/scheduled-goals/{scheduled_goal_id}/cancel',
  '/v1/scheduled-goals/{scheduled_goal_id}/retry',
  '/v1/scheduled-goals/run-due',
]);

function routePattern(route) {
  return new RegExp(`^  ${route.replace(/[{}]/g, '\\$&')}:`, 'm');
}

test('P7 scheduled goals OpenAPI covers config CRUD cancel retry and manual due scan routes', async () => {
  const spec = await readFile(openapiPath, 'utf8');
  for (const route of scheduledGoalRoutes) {
    assert.match(spec, routePattern(route), `OpenAPI missing scheduled goal route ${route}`);
  }
  for (const operationId of [
    'getScheduledGoalsConfig',
    'updateScheduledGoalsConfig',
    'listScheduledGoals',
    'createScheduledGoal',
    'getScheduledGoal',
    'updateScheduledGoal',
    'cancelScheduledGoal',
    'retryScheduledGoal',
    'runDueScheduledGoals',
  ]) {
    assert.match(spec, new RegExp(`operationId: ${operationId}`));
  }
});

test('P7 scheduled goals OpenAPI documents default-off UTC cron-like manual tick semantics', async () => {
  const spec = await readFile(openapiPath, 'utf8');
  assert.match(spec, /nexus\.scheduled_goal\.p7\.v1/);
  assert.match(spec, /const: cron_like_utc/);
  assert.match(spec, /const: manual_tick/);
  assert.match(spec, /const: alpha_in_memory_limits/);
  assert.match(spec, /default: false/);
  assert.match(spec, /seconds, years, and time zones are not supported in P7 Alpha/);
  assert.match(spec, /enum: \[scheduled, running, completed, cancelled, failed, paused, blocked\]/);
});

test('P7 scheduled goals OpenAPI public schemas avoid native raw provider and credential fields', async () => {
  const spec = await readFile(openapiPath, 'utf8');
  const scheduledSection = spec.slice(spec.indexOf('    ScheduledGoalsConfig:'), spec.indexOf('    EventEnvelope:'));
  assert.doesNotMatch(scheduledSection, /Hermes|OpenClaw|DeepSeek|\bDSH\b|native_|raw_credential|credential_material|credential_ref|provider_(?:binding|runtime|agent|task|cancel)|source_ref|https?:\/\/|\/(?:opt|tmp|var|etc|home|usr)\//i);
});
