import assert from 'node:assert/strict';
import test from 'node:test';

import { LocalAuditLog, AuditLogError } from '../../platform/audit/index.ts';
import { ManualClock } from '../../platform/clock/index.ts';
import { InMemoryEventBus } from '../../platform/event-bus/index.ts';

function auditInput(overrides = {}) {
  return {
    tenant_id: 'tenant_alpha01',
    user_id: 'user_alpha01',
    trace_id: 'trace_alpha01',
    task_id: 'task_alpha01',
    action: 'task.submit',
    outcome: 'allowed',
    resource: { kind: 'task', id: 'task_alpha01', tenant_id: 'tenant_alpha01' },
    details: { source: 'unit-test' },
    ...overrides,
  };
}

test('LocalAuditLog appends queryable hash-chained audit records', () => {
  const clock = new ManualClock({ utc_timestamp: '2026-08-23T00:00:00.000Z', monotonic_ms: 100 });
  const audit = new LocalAuditLog({ clock });

  const first = audit.append(auditInput());
  clock.advance(5);
  const second = audit.append(auditInput({ action: 'adapter.invoke', outcome: 'recorded' }));

  assert.equal(first.previous_hash, 'GENESIS');
  assert.equal(second.previous_hash, first.current_hash);
  assert.equal(audit.verifyChain(), true);
  assert.equal(audit.query({ tenant_id: 'tenant_alpha01', trace_id: 'trace_alpha01' }).length, 2);
  assert.equal(audit.query({ action: 'adapter.invoke' })[0].audit_id, second.audit_id);
});

test('LocalAuditLog rejects missing trace_id and cross-tenant resource claims', () => {
  const audit = new LocalAuditLog();

  assert.throws(
    () => audit.append(auditInput({ trace_id: undefined })),
    /Invalid platform identifier: trace_id/,
  );
  assert.throws(
    () => audit.append(auditInput({ resource: { kind: 'task', id: 'task_other01', tenant_id: 'tenant_other01' } })),
    (error) => error instanceof AuditLogError && error.code === 'PLATFORM_CROSS_TENANT_ID',
  );
});

test('LocalAuditLog detects tampered audit record copies', () => {
  const audit = new LocalAuditLog();
  audit.append(auditInput());
  const records = audit.query();
  const tampered = [{ ...records[0], action: 'task.cancel' }];

  assert.equal(audit.verifyChain(records), true);
  assert.equal(audit.verifyChain(tampered), false);
  assert.throws(
    () => audit.assertChainValid(tampered),
    (error) => error instanceof AuditLogError && error.code === 'PLATFORM_AUDIT_CHAIN_BROKEN',
  );
});

test('LocalAuditLog publishes metadata-only audit events to Event Bus', () => {
  const eventBus = new InMemoryEventBus();
  const audit = new LocalAuditLog({ eventBus });
  const record = audit.append(auditInput());
  const [published] = eventBus.history();

  assert.equal(published.event.event_type, 'audit.recorded');
  assert.equal(published.event.subject.id, record.audit_id);
  assert.equal(published.event.trace_id, 'trace_alpha01');
  assert.equal(JSON.stringify(published.event).includes('unit-test'), false);
});
