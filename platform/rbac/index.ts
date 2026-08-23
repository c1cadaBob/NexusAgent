import { assertPlatformId } from "../task-state/index.ts";
import type { PolicyPrincipal } from "../policy-gate/index.ts";

export const PLATFORM_PERMISSIONS = [
  "task:submit",
  "task:cancel",
  "adapter:invoke",
  "planner:invoke",
  "executor:invoke",
  "artifact:write",
  "artifact:read",
  "credential:resolve",
  "memory:read",
  "memory:write",
  "audit:write",
  "audit:read",
  "tenant:read",
  "tenant:manage",
  "rbac:read",
  "rbac:manage",
  "observability:read",
] as const;

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];
export type PlatformRole = "admin" | "operator" | "viewer" | "service";

export const ROLE_PERMISSIONS: Record<PlatformRole, readonly PlatformPermission[]> = Object.freeze({
  admin: PLATFORM_PERMISSIONS,
  operator: [
    "task:submit",
    "task:cancel",
    "adapter:invoke",
    "planner:invoke",
    "executor:invoke",
    "artifact:write",
    "artifact:read",
    "credential:resolve",
    "memory:read",
    "memory:write",
    "audit:read",
    "observability:read",
  ],
  viewer: ["artifact:read", "memory:read", "audit:read", "tenant:read", "rbac:read", "observability:read"],
  service: ["adapter:invoke", "planner:invoke", "executor:invoke", "artifact:write", "artifact:read", "credential:resolve", "audit:write"],
});

export interface RbacGrant {
  tenant_id: string;
  user_id: string;
  roles: readonly PlatformRole[];
  extra_permissions?: readonly PlatformPermission[];
}

export interface AuthorizationRequest {
  principal: PolicyPrincipal;
  tenant_id: string;
  required_permissions: PlatformPermission | readonly PlatformPermission[];
  trace_id?: string;
}

export interface RbacDecision {
  allow: boolean;
  tenant_id: string;
  user_id: string;
  required_permissions: readonly PlatformPermission[];
  granted_permissions: readonly string[];
  missing_permissions: readonly PlatformPermission[];
  code?: "PLATFORM_CROSS_TENANT_ID" | "PLATFORM_FORBIDDEN";
  reasons: readonly string[];
}

export class RbacError extends Error {
  readonly code: "PLATFORM_INVALID_REQUEST" | "PLATFORM_NOT_FOUND" | "PLATFORM_FORBIDDEN" | "PLATFORM_CROSS_TENANT_ID";
  readonly details: Record<string, unknown>;

  constructor(code: RbacError["code"], message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "RbacError";
    this.code = code;
    this.details = details;
  }
}

export class LocalRbacPolicy {
  readonly #grants = new Map<string, RbacGrant>();

  constructor(grants: readonly RbacGrant[] = []) {
    for (const grant of grants) {
      this.grant(grant);
    }
  }

  grant(input: RbacGrant): PolicyPrincipal {
    assertPlatformId("tenant_id", input.tenant_id);
    assertPlatformId("user_id", input.user_id);
    for (const role of input.roles) {
      assertKnownRole(role);
    }
    for (const permission of input.extra_permissions ?? []) {
      assertKnownPermission(permission);
    }

    const grant: RbacGrant = {
      tenant_id: input.tenant_id,
      user_id: input.user_id,
      roles: [...new Set(input.roles)],
      extra_permissions: input.extra_permissions ? [...new Set(input.extra_permissions)] : undefined,
    };
    this.#grants.set(this.#key(grant.tenant_id, grant.user_id), grant);
    return this.principalFor({ tenant_id: grant.tenant_id, user_id: grant.user_id });
  }

  principalFor(input: { tenant_id: string; user_id: string }): PolicyPrincipal {
    assertPlatformId("tenant_id", input.tenant_id);
    assertPlatformId("user_id", input.user_id);
    const grant = this.#grants.get(this.#key(input.tenant_id, input.user_id));
    if (!grant) {
      throw new RbacError("PLATFORM_NOT_FOUND", "RBAC grant not found", input);
    }
    return {
      tenant_id: grant.tenant_id,
      user_id: grant.user_id,
      roles: [...grant.roles],
      permissions: permissionsForGrant(grant),
    };
  }

  authorize(request: AuthorizationRequest): RbacDecision {
    assertPlatformId("tenant_id", request.tenant_id);
    if (request.trace_id !== undefined) assertPlatformId("trace_id", request.trace_id);
    const required = Array.isArray(request.required_permissions) ? request.required_permissions : [request.required_permissions];
    for (const permission of required) {
      assertKnownPermission(permission);
    }

    if (request.principal.tenant_id !== request.tenant_id) {
      return {
        allow: false,
        tenant_id: request.tenant_id,
        user_id: request.principal.user_id,
        required_permissions: required,
        granted_permissions: [...request.principal.permissions],
        missing_permissions: required,
        code: "PLATFORM_CROSS_TENANT_ID",
        reasons: ["principal tenant does not match requested tenant"],
      };
    }

    const granted = new Set(request.principal.permissions);
    const missing = required.filter((permission) => !granted.has(permission));
    return {
      allow: missing.length === 0,
      tenant_id: request.tenant_id,
      user_id: request.principal.user_id,
      required_permissions: required,
      granted_permissions: [...request.principal.permissions],
      missing_permissions: missing,
      code: missing.length > 0 ? "PLATFORM_FORBIDDEN" : undefined,
      reasons: missing.length > 0 ? [`missing permissions: ${missing.join(",")}`] : ["rbac checks passed"],
    };
  }

  assertAuthorized(request: AuthorizationRequest): RbacDecision {
    const decision = this.authorize(request);
    if (!decision.allow) {
      throw new RbacError(decision.code ?? "PLATFORM_FORBIDDEN", "RBAC authorization denied", {
        tenant_id: decision.tenant_id,
        user_id: decision.user_id,
        missing_permissions: decision.missing_permissions,
        reasons: decision.reasons,
      });
    }
    return decision;
  }

  #key(tenant_id: string, user_id: string): string {
    return `${tenant_id}:${user_id}`;
  }
}

function permissionsForGrant(grant: RbacGrant): readonly string[] {
  return [...new Set([...grant.roles.flatMap((role) => ROLE_PERMISSIONS[role]), ...(grant.extra_permissions ?? [])])];
}

function assertKnownRole(role: unknown): asserts role is PlatformRole {
  if (typeof role !== "string" || !(role in ROLE_PERMISSIONS)) {
    throw new RbacError("PLATFORM_INVALID_REQUEST", "Unknown platform role", { role });
  }
}

function assertKnownPermission(permission: unknown): asserts permission is PlatformPermission {
  if (typeof permission !== "string" || !(PLATFORM_PERMISSIONS as readonly string[]).includes(permission)) {
    throw new RbacError("PLATFORM_INVALID_REQUEST", "Unknown platform permission", { permission });
  }
}
