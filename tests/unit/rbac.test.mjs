import assert from 'node:assert/strict';
import test from 'node:test';

import { PolicyGate } from '../../platform/policy-gate/index.ts';
import { LocalRbacPolicy, RbacError } from '../../platform/rbac/index.ts';

test('LocalRbacPolicy builds platform principals from role grants', () => {
  const rbac = new LocalRbacPolicy();
  const principal = rbac.grant({
    tenant_id: 'tenant_alpha01',
    user_id: 'user_alpha01',
    roles: ['operator'],
  });

  assert.equal(principal.tenant_id, 'tenant_alpha01');
  assert.equal(principal.user_id, 'user_alpha01');
  assert.ok(principal.permissions.includes('task:submit'));
  assert.ok(principal.permissions.includes('adapter:invoke'));
  assert.equal(principal.permissions.includes('tenant:manage'), false);
});

test('LocalRbacPolicy rejects missing permissions and cross-tenant principals', () => {
  const rbac = new LocalRbacPolicy([{ tenant_id: 'tenant_alpha01', user_id: 'user_view01', roles: ['viewer'] }]);
  const principal = rbac.principalFor({ tenant_id: 'tenant_alpha01', user_id: 'user_view01' });

  const denied = rbac.authorize({
    principal,
    tenant_id: 'tenant_alpha01',
    required_permissions: 'task:submit',
    trace_id: 'trace_alpha01',
  });
  assert.equal(denied.allow, false);
  assert.equal(denied.code, 'PLATFORM_FORBIDDEN');

  const crossTenant = rbac.authorize({
    principal,
    tenant_id: 'tenant_other01',
    required_permissions: 'audit:read',
  });
  assert.equal(crossTenant.allow, false);
  assert.equal(crossTenant.code, 'PLATFORM_CROSS_TENANT_ID');
});

test('LocalRbacPolicy principal works with Policy-Gate permission checks', () => {
  const rbac = new LocalRbacPolicy([{ tenant_id: 'tenant_alpha01', user_id: 'user_alpha01', roles: ['operator'] }]);
  const gate = new PolicyGate();
  const principal = rbac.principalFor({ tenant_id: 'tenant_alpha01', user_id: 'user_alpha01' });
  const decision = gate.evaluate({
    action: 'task.submit',
    tenant_id: 'tenant_alpha01',
    task_id: 'task_alpha01',
    attempt_id: 'attempt_alpha01',
    execution_id: 'exec_alpha01',
    conversation_id: 'conv_alpha01',
    trace_id: 'trace_alpha01',
    monotonic_ms: 100,
    requested_at_utc: '2026-08-23T00:00:00Z',
    principal,
  });

  assert.equal(decision.allow, true);
  assert.equal(decision.user_id, 'user_alpha01');
});

test('LocalRbacPolicy validates role and permission names', () => {
  const rbac = new LocalRbacPolicy();

  assert.throws(
    () => rbac.grant({ tenant_id: 'tenant_alpha01', user_id: 'user_alpha01', roles: ['owner'] }),
    (error) => error instanceof RbacError && error.code === 'PLATFORM_INVALID_REQUEST',
  );
  assert.throws(
    () => rbac.assertAuthorized({
      principal: { tenant_id: 'tenant_alpha01', user_id: 'user_alpha01', roles: ['viewer'], permissions: [] },
      tenant_id: 'tenant_alpha01',
      required_permissions: 'audit:read',
    }),
    (error) => error instanceof RbacError && error.code === 'PLATFORM_FORBIDDEN',
  );
});
