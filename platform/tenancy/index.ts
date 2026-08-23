import { assertPlatformId } from "../task-state/index.ts";

export type TenantStatus = "active" | "disabled";

export interface TenantContext {
  tenant_id: string;
  user_id: string;
  trace_id: string;
  agent_id?: string;
  roles?: readonly string[];
}

export interface TenantResourceScope {
  tenant_id: string;
  user_id?: string;
  agent_id?: string;
  task_id?: string;
  attempt_id?: string;
  execution_id?: string;
  conversation_id?: string;
  artifact_id?: string;
  trace_id?: string;
}

export interface TenantRegistration {
  tenant_id: string;
  name?: string;
  status?: TenantStatus;
}

export interface TenantMemberRegistration {
  tenant_id: string;
  user_id: string;
  agent_ids?: readonly string[];
  roles?: readonly string[];
  status?: TenantStatus;
}

export interface TenantMember {
  tenant_id: string;
  user_id: string;
  agent_ids: readonly string[];
  roles: readonly string[];
  status: TenantStatus;
}

interface StoredTenant {
  tenant_id: string;
  name?: string;
  status: TenantStatus;
}

export class TenantBoundaryError extends Error {
  readonly code: "PLATFORM_INVALID_REQUEST" | "PLATFORM_NOT_FOUND" | "PLATFORM_FORBIDDEN" | "PLATFORM_CROSS_TENANT_ID";
  readonly details: Record<string, unknown>;

  constructor(code: TenantBoundaryError["code"], message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "TenantBoundaryError";
    this.code = code;
    this.details = details;
  }
}

export function assertSameTenant(left: { tenant_id: string }, right: { tenant_id: string }): void {
  assertPlatformId("tenant_id", left.tenant_id);
  assertPlatformId("tenant_id", right.tenant_id);
  if (left.tenant_id !== right.tenant_id) {
    throw new TenantBoundaryError("PLATFORM_CROSS_TENANT_ID", "Cross-tenant access is not allowed", {
      left_tenant_id: left.tenant_id,
      right_tenant_id: right.tenant_id,
    });
  }
}

export class LocalTenantRegistry {
  readonly #tenants = new Map<string, StoredTenant>();
  readonly #members = new Map<string, Map<string, TenantMember>>();

  registerTenant(input: TenantRegistration): StoredTenant {
    assertPlatformId("tenant_id", input.tenant_id);
    const tenant: StoredTenant = {
      tenant_id: input.tenant_id,
      name: input.name,
      status: input.status ?? "active",
    };
    this.#tenants.set(tenant.tenant_id, tenant);
    if (!this.#members.has(tenant.tenant_id)) {
      this.#members.set(tenant.tenant_id, new Map());
    }
    return { ...tenant };
  }

  registerMember(input: TenantMemberRegistration): TenantMember {
    assertPlatformId("tenant_id", input.tenant_id);
    assertPlatformId("user_id", input.user_id);
    for (const agent_id of input.agent_ids ?? []) {
      assertPlatformId("agent_id", agent_id);
    }
    if (!this.#tenants.has(input.tenant_id)) {
      this.registerTenant({ tenant_id: input.tenant_id });
    }
    const member: TenantMember = {
      tenant_id: input.tenant_id,
      user_id: input.user_id,
      agent_ids: [...new Set(input.agent_ids ?? [])],
      roles: [...new Set(input.roles ?? [])],
      status: input.status ?? "active",
    };
    this.#members.get(input.tenant_id)?.set(input.user_id, member);
    return cloneMember(member);
  }

  contextFor(input: TenantContext): TenantContext {
    this.#assertContext(input);
    const member = this.#member(input.tenant_id, input.user_id);
    if (input.agent_id && !member.agent_ids.includes(input.agent_id) && !(input.roles ?? member.roles).includes("admin")) {
      throw new TenantBoundaryError("PLATFORM_FORBIDDEN", "Agent is not bound to tenant member", {
        tenant_id: input.tenant_id,
        user_id: input.user_id,
        agent_id: input.agent_id,
      });
    }
    return {
      tenant_id: input.tenant_id,
      user_id: input.user_id,
      agent_id: input.agent_id,
      trace_id: input.trace_id,
      roles: input.roles ? [...input.roles] : member.roles,
    };
  }

  assertTenantAccess(context: TenantContext, resource: TenantResourceScope): TenantContext {
    this.#assertContext(context);
    this.#assertResource(resource);
    assertSameTenant(context, resource);

    const member = this.#member(context.tenant_id, context.user_id);
    if (member.status !== "active") {
      throw new TenantBoundaryError("PLATFORM_FORBIDDEN", "Tenant member is disabled", {
        tenant_id: context.tenant_id,
        user_id: context.user_id,
      });
    }

    const roles = new Set(context.roles ?? member.roles);
    const hasTenantAdminScope = roles.has("admin") || roles.has("tenant-admin");
    if (resource.user_id && resource.user_id !== context.user_id && !hasTenantAdminScope) {
      throw new TenantBoundaryError("PLATFORM_FORBIDDEN", "User cannot access another user's tenant-scoped resource", {
        tenant_id: context.tenant_id,
        user_id: context.user_id,
        resource_user_id: resource.user_id,
      });
    }

    if (context.agent_id) {
      if (!member.agent_ids.includes(context.agent_id) && !hasTenantAdminScope) {
        throw new TenantBoundaryError("PLATFORM_FORBIDDEN", "Agent is not bound to tenant member", {
          tenant_id: context.tenant_id,
          user_id: context.user_id,
          agent_id: context.agent_id,
        });
      }
      if (resource.agent_id && resource.agent_id !== context.agent_id && !hasTenantAdminScope) {
        throw new TenantBoundaryError("PLATFORM_FORBIDDEN", "Agent cannot access another agent's resource", {
          tenant_id: context.tenant_id,
          agent_id: context.agent_id,
          resource_agent_id: resource.agent_id,
        });
      }
    }

    return { ...context, roles: context.roles ? [...context.roles] : undefined };
  }

  member(tenant_id: string, user_id: string): TenantMember {
    return cloneMember(this.#member(tenant_id, user_id));
  }

  #member(tenant_id: string, user_id: string): TenantMember {
    assertPlatformId("tenant_id", tenant_id);
    assertPlatformId("user_id", user_id);
    const tenant = this.#tenants.get(tenant_id);
    if (!tenant) {
      throw new TenantBoundaryError("PLATFORM_NOT_FOUND", "Tenant is not registered", { tenant_id });
    }
    if (tenant.status !== "active") {
      throw new TenantBoundaryError("PLATFORM_FORBIDDEN", "Tenant is disabled", { tenant_id });
    }
    const member = this.#members.get(tenant_id)?.get(user_id);
    if (!member) {
      throw new TenantBoundaryError("PLATFORM_FORBIDDEN", "User is not a member of tenant", { tenant_id, user_id });
    }
    return member;
  }

  #assertContext(context: TenantContext): void {
    assertPlatformId("tenant_id", context.tenant_id);
    assertPlatformId("user_id", context.user_id);
    assertPlatformId("trace_id", context.trace_id);
    if (context.agent_id !== undefined) assertPlatformId("agent_id", context.agent_id);
  }

  #assertResource(resource: TenantResourceScope): void {
    assertPlatformId("tenant_id", resource.tenant_id);
    if (resource.user_id !== undefined) assertPlatformId("user_id", resource.user_id);
    if (resource.agent_id !== undefined) assertPlatformId("agent_id", resource.agent_id);
    if (resource.task_id !== undefined) assertPlatformId("task_id", resource.task_id);
    if (resource.attempt_id !== undefined) assertPlatformId("attempt_id", resource.attempt_id);
    if (resource.execution_id !== undefined) assertPlatformId("execution_id", resource.execution_id);
    if (resource.conversation_id !== undefined) assertPlatformId("conversation_id", resource.conversation_id);
    if (resource.artifact_id !== undefined) assertPlatformId("artifact_id", resource.artifact_id);
    if (resource.trace_id !== undefined) assertPlatformId("trace_id", resource.trace_id);
  }
}

function cloneMember(member: TenantMember): TenantMember {
  return {
    tenant_id: member.tenant_id,
    user_id: member.user_id,
    agent_ids: [...member.agent_ids],
    roles: [...member.roles],
    status: member.status,
  };
}
