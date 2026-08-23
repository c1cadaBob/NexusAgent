import assert from 'node:assert/strict';
import test from 'node:test';

import { LocalAuditLog } from '../../platform/audit/index.ts';
import { LocalObservability } from '../../platform/observability/index.ts';
import { LocalRbacPolicy } from '../../platform/rbac/index.ts';
import { LocalTenantRegistry } from '../../platform/tenancy/index.ts';

test('tenant guard rejects cross-tenant resource access before policy work', () => {
  const registry = new LocalTenantRegistry();
  registry.registerTenant({ tenant_id: 'tenant_alpha01' });
  registry.registerMember({ tenant_id: 'tenant_alpha01', user_id: 'user_alpha01', roles: ['operator'] });
  const context = registry.contextFor({ tenant_id: 'tenant_alpha01', user_id: 'user_alpha01', trace_id: 'trace_alpha01' });

  assert.throws(
    () => registry.assertTenantAccess(context, { tenant_id: 'tenant_other01', task_id: 'task_other01' }),
    /Cross-tenant access is not allowed/,
  );
});

test('RBAC guard rejects unauthorized operations', () => {
  const rbac = new LocalRbacPolicy([{ tenant_id: 'tenant_alpha01', user_id: 'user_view01', roles: ['viewer'] }]);
  const principal = rbac.principalFor({ tenant_id: 'tenant_alpha01', user_id: 'user_view01' });

  assert.throws(
    () => rbac.assertAuthorized({ principal, tenant_id: 'tenant_alpha01', required_permissions: 'credential:resolve', trace_id: 'trace_alpha01' }),
    /RBAC authorization denied/,
  );
});

test('audit guard rejects forged tenant scope and missing trace IDs', () => {
  const audit = new LocalAuditLog();

  assert.throws(
    () => audit.append({
      tenant_id: 'tenant_alpha01',
      user_id: 'user_alpha01',
      trace_id: 'trace_alpha01',
      action: 'artifact.read',
      outcome: 'denied',
      resource: { kind: 'artifact', id: 'artifact_other01', tenant_id: 'tenant_other01' },
    }),
    /resource from another tenant/,
  );
  assert.throws(
    () => audit.append({
      tenant_id: 'tenant_alpha01',
      user_id: 'user_alpha01',
      action: 'task.submit',
      outcome: 'denied',
      resource: { kind: 'task', id: 'task_alpha01', tenant_id: 'tenant_alpha01' },
    }),
    /Invalid platform identifier: trace_id/,
  );
});

test('observability guard rejects logs and metrics without trace IDs', () => {
  const observability = new LocalObservability();

  assert.throws(
    () => observability.recordLog({ tenant_id: 'tenant_alpha01', level: 'warn', component: 'security', message: 'no trace' }),
    /Invalid platform identifier: trace_id/,
  );
  assert.throws(
    () => observability.incrementMetric({ tenant_id: 'tenant_alpha01', name: 'security.denied' }),
    /Invalid platform identifier: trace_id/,
  );
});
