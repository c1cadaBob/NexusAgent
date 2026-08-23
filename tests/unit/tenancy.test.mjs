import assert from 'node:assert/strict';
import test from 'node:test';

import { LocalTenantRegistry, TenantBoundaryError, assertSameTenant } from '../../platform/tenancy/index.ts';

function registryFixture() {
  const registry = new LocalTenantRegistry();
  registry.registerTenant({ tenant_id: 'tenant_alpha01', name: 'Alpha' });
  registry.registerTenant({ tenant_id: 'tenant_other01', name: 'Other' });
  registry.registerMember({
    tenant_id: 'tenant_alpha01',
    user_id: 'user_alpha01',
    agent_ids: ['agent_alpha01'],
    roles: ['operator'],
  });
  registry.registerMember({
    tenant_id: 'tenant_alpha01',
    user_id: 'user_admin01',
    roles: ['admin'],
  });
  return registry;
}

test('LocalTenantRegistry validates tenant context and same-tenant resource access', () => {
  const registry = registryFixture();
  const context = registry.contextFor({
    tenant_id: 'tenant_alpha01',
    user_id: 'user_alpha01',
    agent_id: 'agent_alpha01',
    trace_id: 'trace_alpha01',
  });

  const allowed = registry.assertTenantAccess(context, {
    tenant_id: 'tenant_alpha01',
    user_id: 'user_alpha01',
    agent_id: 'agent_alpha01',
    task_id: 'task_alpha01',
  });

  assert.equal(allowed.tenant_id, 'tenant_alpha01');
  assert.deepEqual(allowed.roles, ['operator']);
});

test('LocalTenantRegistry rejects cross-tenant and mismatched user access', () => {
  const registry = registryFixture();
  const context = registry.contextFor({
    tenant_id: 'tenant_alpha01',
    user_id: 'user_alpha01',
    trace_id: 'trace_alpha01',
  });

  assert.throws(
    () => registry.assertTenantAccess(context, { tenant_id: 'tenant_other01', task_id: 'task_other01' }),
    (error) => error instanceof TenantBoundaryError && error.code === 'PLATFORM_CROSS_TENANT_ID',
  );
  assert.throws(
    () => registry.assertTenantAccess(context, { tenant_id: 'tenant_alpha01', user_id: 'user_other01' }),
    (error) => error instanceof TenantBoundaryError && error.code === 'PLATFORM_FORBIDDEN',
  );
});

test('LocalTenantRegistry rejects unbound agent and invalid platform IDs', () => {
  const registry = registryFixture();

  assert.throws(
    () => registry.contextFor({
      tenant_id: 'tenant_alpha01',
      user_id: 'user_alpha01',
      agent_id: 'agent_other01',
      trace_id: 'trace_alpha01',
    }),
    /Agent is not bound|User is not a member|Invalid/,
  );
  assert.throws(
    () => registry.registerTenant({ tenant_id: 'native_tenant_alpha01' }),
    /Invalid platform identifier: tenant_id/,
  );
  assert.throws(
    () => assertSameTenant({ tenant_id: 'tenant_alpha01' }, { tenant_id: 'tenant_other01' }),
    /Cross-tenant access is not allowed/,
  );
});

test('tenant admin can access same-tenant user-scoped resources', () => {
  const registry = registryFixture();
  const context = registry.contextFor({
    tenant_id: 'tenant_alpha01',
    user_id: 'user_admin01',
    trace_id: 'trace_alpha01',
  });

  const allowed = registry.assertTenantAccess(context, {
    tenant_id: 'tenant_alpha01',
    user_id: 'user_alpha01',
    task_id: 'task_alpha01',
  });

  assert.equal(allowed.user_id, 'user_admin01');
});
