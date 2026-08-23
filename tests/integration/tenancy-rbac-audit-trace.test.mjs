import assert from 'node:assert/strict';
import test from 'node:test';

import { LocalAuditLog } from '../../platform/audit/index.ts';
import { ManualClock } from '../../platform/clock/index.ts';
import { InMemoryEventBus } from '../../platform/event-bus/index.ts';
import { LocalObservability } from '../../platform/observability/index.ts';
import { PolicyGate } from '../../platform/policy-gate/index.ts';
import { LocalRbacPolicy } from '../../platform/rbac/index.ts';
import { LocalTenantRegistry } from '../../platform/tenancy/index.ts';

test('Tenancy, RBAC, Policy-Gate, Audit, and Observability share trace-linked control flow', () => {
  const clock = new ManualClock({ utc_timestamp: '2026-08-23T00:00:00.000Z', monotonic_ms: 100 });
  const eventBus = new InMemoryEventBus();
  const tenancy = new LocalTenantRegistry();
  const rbac = new LocalRbacPolicy();
  const gate = new PolicyGate();
  const audit = new LocalAuditLog({ clock, eventBus });
  const observability = new LocalObservability({ clock, service: 'p1-policy-spine', version: 'p1-local' });

  tenancy.registerTenant({ tenant_id: 'tenant_alpha01' });
  tenancy.registerMember({ tenant_id: 'tenant_alpha01', user_id: 'user_alpha01', agent_ids: ['agent_alpha01'], roles: ['operator'] });
  const context = tenancy.contextFor({
    tenant_id: 'tenant_alpha01',
    user_id: 'user_alpha01',
    agent_id: 'agent_alpha01',
    trace_id: 'trace_alpha01',
  });
  tenancy.assertTenantAccess(context, { tenant_id: 'tenant_alpha01', user_id: 'user_alpha01', agent_id: 'agent_alpha01', task_id: 'task_alpha01' });

  const principal = rbac.grant({ tenant_id: 'tenant_alpha01', user_id: 'user_alpha01', roles: ['operator'] });
  rbac.assertAuthorized({ principal, tenant_id: 'tenant_alpha01', required_permissions: ['task:submit', 'audit:read'], trace_id: 'trace_alpha01' });
  const decision = gate.evaluate({
    action: 'task.submit',
    tenant_id: 'tenant_alpha01',
    task_id: 'task_alpha01',
    attempt_id: 'attempt_alpha01',
    execution_id: 'exec_alpha01',
    conversation_id: 'conv_alpha01',
    trace_id: 'trace_alpha01',
    monotonic_ms: 100,
    requested_at_utc: '2026-08-23T00:00:00.000Z',
    principal,
  });
  assert.equal(decision.allow, true);

  const record = audit.append({
    tenant_id: 'tenant_alpha01',
    user_id: 'user_alpha01',
    trace_id: 'trace_alpha01',
    task_id: 'task_alpha01',
    attempt_id: 'attempt_alpha01',
    execution_id: 'exec_alpha01',
    conversation_id: 'conv_alpha01',
    action: 'task.submit',
    outcome: 'allowed',
    resource: { kind: 'task', id: 'task_alpha01', tenant_id: 'tenant_alpha01' },
    policy_decision_id: decision.decision_id,
  });
  observability.recordLog({
    tenant_id: 'tenant_alpha01',
    user_id: 'user_alpha01',
    task_id: 'task_alpha01',
    execution_id: 'exec_alpha01',
    trace_id: 'trace_alpha01',
    level: 'info',
    component: 'policy-spine',
    message: 'task submitted through tenant and rbac controls',
    monotonic_ms: 101,
  });

  assert.equal(audit.query({ tenant_id: 'tenant_alpha01', trace_id: 'trace_alpha01' })[0].audit_id, record.audit_id);
  assert.equal(eventBus.history()[0].event.event_type, 'audit.recorded');
  assert.equal(observability.timeline({ trace_id: 'trace_alpha01' })[0].summary, 'task submitted through tenant and rbac controls');
});
