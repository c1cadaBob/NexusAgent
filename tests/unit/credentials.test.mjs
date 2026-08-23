import assert from 'node:assert/strict';
import test from 'node:test';

import { ManualClock } from '../../platform/clock/index.ts';
import { CredentialCenterError, LocalCredentialCenter } from '../../platform/credentials/index.ts';
import { InMemoryEventBus } from '../../platform/event-bus/index.ts';

function registerInput(overrides = {}) {
  return {
    tenant_id: 'tenant_alpha01',
    user_id: 'user_alpha01',
    agent_id: 'agent_alpha01',
    trace_id: 'trace_alpha01',
    purpose: 'executor_tool',
    material: 'super-secret-token',
    expires_at_utc: '2026-08-23T01:00:00.000Z',
    scope: ['tool:run'],
    ...overrides,
  };
}

test('LocalCredentialCenter returns references and redaction metadata only', () => {
  const center = new LocalCredentialCenter({ clock: new ManualClock({ utc_timestamp: '2026-08-23T00:00:00.000Z', monotonic_ms: 30 }) });
  const reference = center.register(registerInput());

  assert.match(reference.credential_ref, /^cred_alpha01_/);
  assert.equal(reference.redaction.logs, 'redacted');
  assert.equal(reference.redaction.events, 'redacted');
  assert.equal(reference.redaction.artifacts, 'secret_scan_required');
  assert.equal(JSON.stringify(reference).includes('super-secret-token'), false);

  const resolved = center.resolveReference('tenant_alpha01', reference.credential_ref, 'trace_alpha01');
  assert.equal(JSON.stringify(resolved).includes('super-secret-token'), false);
  assert.equal(center.auditLog().length, 2);
});

test('LocalCredentialCenter enforces tenant isolation', () => {
  const center = new LocalCredentialCenter();
  const reference = center.register(registerInput());
  assert.throws(
    () => center.resolveReference('tenant_other01', reference.credential_ref, 'trace_alpha01'),
    (error) => error instanceof CredentialCenterError && error.code === 'PLATFORM_FORBIDDEN',
  );
});

test('LocalCredentialCenter publishes events and audit without credential material', () => {
  const eventBus = new InMemoryEventBus();
  const subscription = eventBus.subscribe({ subscriber: 'audit' });
  const center = new LocalCredentialCenter({
    clock: new ManualClock({ utc_timestamp: '2026-08-23T00:00:00.000Z', monotonic_ms: 30 }),
    eventBus,
  });
  center.register(registerInput());

  const eventJson = JSON.stringify(eventBus.pull(subscription.subscription_id));
  const auditJson = JSON.stringify(center.auditLog());
  assert.match(eventJson, /credential\.lease_issued/);
  assert.equal(eventJson.includes('super-secret-token'), false);
  assert.equal(auditJson.includes('super-secret-token'), false);
  assert.match(auditJson, /material_sha256/);
});
