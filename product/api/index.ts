import http from "node:http";
import { LocalAuditLog } from "../../platform/audit/index.ts";
import { LocalChannelManagement } from "../../platform/channel-management/index.ts";
import { ManualClock, SystemClock, type PlatformClock } from "../../platform/clock/index.ts";
import { Coordinator, CoordinatorError, type CoordinatorTaskCommandRequest } from "../../platform/coordinator/index.ts";
import { LocalCredentialCenter } from "../../platform/credentials/index.ts";
import { InMemoryEventBus } from "../../platform/event-bus/index.ts";
import { LocalMemoryGateway, type MemoryLayer } from "../../platform/memory-gateway/index.ts";
import { LocalObservability } from "../../platform/observability/index.ts";
import { LocalPluginGovernance, PluginGovernanceError } from "../../platform/plugin-governance/index.ts";
import { PolicyGate } from "../../platform/policy-gate/index.ts";
import { assertPublicRequestPayload, assertPublicResponsePayload, PublicSurfaceError, sanitizePublicDetails } from "../../platform/public-surface/index.ts";
import { LocalRbacPolicy, PLATFORM_PERMISSIONS, type PlatformPermission } from "../../platform/rbac/index.ts";
import { assertPlatformId, type TaskState } from "../../platform/task-state/index.ts";
import { LocalTenantRegistry } from "../../platform/tenancy/index.ts";

export const PLATFORM_API_SCHEMA_VERSION = "nexus.platform_api.p5.v1";

type HeaderMap = Record<string, string | undefined>;
type JsonObject = Record<string, unknown>;

export interface PlatformApiRequest {
  method: string;
  path: string;
  headers?: HeaderMap;
  body?: unknown;
}

export interface PlatformApiResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

interface StoredTask {
  tenant_id: string;
  user_id: string;
  agent_id: string;
  task_id: string;
  attempt_id: string;
  execution_id: string;
  conversation_id: string;
  state: TaskState;
  trace_id: string;
  summary?: string;
  artifact_ids: readonly string[];
  created_at: string;
  updated_at: string;
}

interface ApprovalRecord {
  approval_id: string;
  tenant_id: string;
  task_id: string;
  attempt_id?: string;
  status: "pending" | "approved" | "rejected" | "expired" | "cancelled";
  reason?: string;
  requested_at: string;
  decided_at?: string;
  trace_id: string;
}

interface Principal {
  tenant_id: string;
  user_id: string;
  roles: readonly string[];
  permissions: readonly string[];
}

export interface PlatformApiOptions {
  clock?: PlatformClock;
}

export class PlatformApiError extends Error {
  readonly code:
    | "PLATFORM_INVALID_REQUEST"
    | "PLATFORM_UNAUTHENTICATED"
    | "PLATFORM_FORBIDDEN"
    | "PLATFORM_NOT_FOUND"
    | "PLATFORM_CONFLICT"
    | "PLATFORM_RATE_LIMITED"
    | "PLATFORM_INTERNAL_ERROR";
  readonly details: Record<string, unknown>;

  constructor(code: PlatformApiError["code"], message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "PlatformApiError";
    this.code = code;
    this.details = sanitizePublicDetails(details);
  }
}

export class PlatformApiApp {
  readonly clock: PlatformClock;
  readonly eventBus = new InMemoryEventBus();
  readonly policyGate = new PolicyGate();
  readonly coordinator: Coordinator;
  readonly tenancy = new LocalTenantRegistry();
  readonly rbac = new LocalRbacPolicy();
  readonly memory: LocalMemoryGateway;
  readonly credentials: LocalCredentialCenter;
  readonly audit: LocalAuditLog;
  readonly observability: LocalObservability;
  readonly pluginGovernance = new LocalPluginGovernance({ tenant_id: "tenant_alpha01", trace_id: "trace_plugin01" });
  readonly channelManagement: LocalChannelManagement;

  readonly #tasks = new Map<string, StoredTask>();
  readonly #approvals = new Map<string, ApprovalRecord>();
  readonly #tenants = new Map<string, { tenant_id: string; name: string; status: "active" | "disabled"; created_at: string }>();
  readonly #members = new Map<string, { tenant_id: string; user_id: string; roles: readonly string[]; status: "active" | "disabled" }[]>();
  #sequence = 0;

  constructor(options: PlatformApiOptions = {}) {
    this.clock = options.clock ?? new SystemClock();
    this.coordinator = new Coordinator({ policyGate: this.policyGate, eventBus: this.eventBus, clock: this.clock });
    this.memory = new LocalMemoryGateway({ clock: this.clock, eventBus: this.eventBus });
    this.credentials = new LocalCredentialCenter({ clock: this.clock, eventBus: this.eventBus });
    this.audit = new LocalAuditLog({ clock: this.clock, eventBus: this.eventBus });
    this.observability = new LocalObservability({ clock: this.clock, service: "nexusagent-platform-api", version: "p5-local" });
    this.channelManagement = new LocalChannelManagement({ clock: this.clock, coordinator: this.coordinator, eventBus: this.eventBus });
    this.#seedIdentity();
    this.#seedApprovals();
  }

  async handle(input: PlatformApiRequest): Promise<PlatformApiResponse> {
    const method = input.method.toUpperCase();
    const parsed = parsePath(input.path);
    const trace_id = traceFromBody(input.body) ?? traceFromHeaders(input.headers) ?? "trace_api01";
    let principal: Principal | undefined;
    try {
      if (method === "GET" && parsed.pathname === "/v1/health") {
        const health = this.observability.health(["api.local", "contracts.p5"]);
        return ok({
          status: health.status,
          checked_at: health.checked_at_utc,
          service: "nexusagent-platform-api",
          trace_id,
        });
      }

      principal = this.#principalFor(input.headers);
      const body = input.body === undefined ? {} : input.body;
      assertPublicRequestPayload(body);

      if (method === "POST" && parsed.pathname === "/v1/tasks") return ok(this.#createTask(asObject(body), principal), 202);
      if (method === "GET" && parsed.pathname === "/v1/tasks") return ok(paginate(this.#listTasks(parsed.query, principal), parsed.query));
      if (method === "GET" && /^\/v1\/tasks\/[^/]+$/.test(parsed.pathname)) return ok(this.#getTask(pathPart(parsed.pathname, 3), principal));
      if (method === "POST" && /^\/v1\/tasks\/[^/]+\/cancel$/.test(parsed.pathname)) return ok(this.#taskCommand(pathPart(parsed.pathname, 3), asObject(body), principal, "cancel_attempt"), 202);
      if (method === "POST" && /^\/v1\/tasks\/[^/]+\/retry$/.test(parsed.pathname)) return ok(this.#taskCommand(pathPart(parsed.pathname, 3), asObject(body), principal, "redo_attempt"), 202);
      if (method === "GET" && /^\/v1\/tasks\/[^/]+\/events$/.test(parsed.pathname)) return ok(paginate(this.#taskEvents(pathPart(parsed.pathname, 3), principal), parsed.query));

      if (method === "GET" && parsed.pathname === "/v1/skills") return ok(paginate(this.#skills(parsed.query, principal), parsed.query));
      if (method === "GET" && parsed.pathname === "/v1/capabilities") return ok(paginate(this.#capabilities(parsed.query, principal), parsed.query));

      if (method === "POST" && parsed.pathname === "/v1/memory/search") return ok({ items: this.#searchMemory(asObject(body), principal) });
      if (method === "POST" && parsed.pathname === "/v1/memory") return ok(this.#writeMemory(asObject(body), principal), 201);

      if (method === "GET" && parsed.pathname === "/v1/tenants") return ok(paginate(this.#listTenants(principal), parsed.query));
      if (method === "GET" && /^\/v1\/tenants\/[^/]+\/users$/.test(parsed.pathname)) return ok(paginate(this.#listTenantUsers(pathPart(parsed.pathname, 3), principal), parsed.query));
      if (method === "GET" && parsed.pathname === "/v1/permissions") return ok({ items: [...PLATFORM_PERMISSIONS] });

      if (method === "GET" && parsed.pathname === "/v1/approvals") return ok(paginate(this.#listApprovals(parsed.query, principal), parsed.query));
      if (method === "POST" && /^\/v1\/approvals\/[^/]+\/decision$/.test(parsed.pathname)) return ok(this.#decideApproval(pathPart(parsed.pathname, 3), asObject(body), principal));

      if (method === "POST" && parsed.pathname === "/v1/budget/check") return ok(this.#checkBudget(asObject(body), principal));

      if (method === "GET" && parsed.pathname === "/v1/channels") return ok(paginate(this.#listChannels(parsed.query, principal), parsed.query));
      if (method === "POST" && parsed.pathname === "/v1/channels") return ok(this.#createChannel(asObject(body), principal), 201);
      if (method === "GET" && /^\/v1\/channels\/[^/]+$/.test(parsed.pathname)) return ok(this.#getChannel(pathPart(parsed.pathname, 3), principal));
      if (method === "PATCH" && /^\/v1\/channels\/[^/]+$/.test(parsed.pathname)) return ok(this.#updateChannel(pathPart(parsed.pathname, 3), asObject(body), principal));
      if (method === "POST" && /^\/v1\/channels\/[^/]+\/status$/.test(parsed.pathname)) return ok(this.#setChannelStatus(pathPart(parsed.pathname, 3), asObject(body), principal));
      if (method === "POST" && /^\/v1\/channels\/[^/]+\/test$/.test(parsed.pathname)) return ok(await this.#testChannel(pathPart(parsed.pathname, 3), asObject(body), principal));

      if (method === "GET" && parsed.pathname === "/v1/admin/plugins") return ok(paginate(this.#listPluginInventory(principal), parsed.query));
      if (method === "POST" && parsed.pathname === "/v1/admin/plugins/import") return ok(this.#importPlugin(asObject(body), principal), 202);
      if (method === "POST" && /^\/v1\/admin\/plugins\/[^/]+\/admission$/.test(parsed.pathname)) return ok(this.#decidePluginAdmission(pathPart(parsed.pathname, 4), asObject(body), principal));

      throw new PlatformApiError("PLATFORM_NOT_FOUND", "Platform API route not found", { method, path: parsed.pathname });
    } catch (error) {
      this.#auditDeniedRequest(error, trace_id, principal, method);
      return errorResponse(error, trace_id);
    }
  }

  async handleNode(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const bodyText = Buffer.concat(chunks).toString("utf8");
    const body = bodyText.trim() ? JSON.parse(bodyText) as unknown : undefined;
    const headers: HeaderMap = {};
    for (const [key, value] of Object.entries(request.headers)) {
      headers[key] = Array.isArray(value) ? value.join(",") : value;
    }
    const result = await this.handle({ method: request.method ?? "GET", path: request.url ?? "/", headers, body });
    response.writeHead(result.status, result.headers);
    response.end(`${JSON.stringify(result.body)}\n`);
  }

  #createTask(body: JsonObject, principal: Principal): StoredTask {
    const tenant_id = requiredId("tenant_id", body.tenant_id);
    this.#assertTenant(principal, tenant_id);
    this.#require(principal, "task:submit");
    const user_id = requiredId("user_id", body.user_id);
    const agent_id = requiredId("agent_id", body.agent_id);
    const conversation_id = requiredId("conversation_id", body.conversation_id);
    const trace_id = requiredId("trace_id", body.trace_id);
    if (principal.user_id !== user_id && !isTenantAdmin(principal) && !isPlatformAdmin(principal)) {
      throw new PlatformApiError("PLATFORM_FORBIDDEN", "Principal cannot submit for another user");
    }
    const input = requiredText(body.input, "input");
    const reading = this.clock.now();
    const task_id = this.#nextId("task", trace_id);
    const attempt_id = this.#nextId("attempt", trace_id);
    const execution_id = this.#nextId("exec", trace_id);
    const result = this.coordinator.submitTask({
      schema_version: "nexus.task_request.v1",
      tenant_id,
      user_id,
      agent_id,
      task_id,
      attempt_id,
      execution_id,
      conversation_id,
      trace_id,
      input: { kind: "text", text: input },
      source: { kind: "api" },
      created_at_utc: reading.utc_timestamp,
      monotonic_ms: reading.monotonic_ms,
    }, { principal });
    const task: StoredTask = {
      tenant_id,
      user_id,
      agent_id,
      task_id,
      attempt_id,
      execution_id,
      conversation_id,
      state: result.snapshot.state,
      trace_id,
      summary: input.slice(0, 120),
      artifact_ids: [],
      created_at: reading.utc_timestamp,
      updated_at: reading.utc_timestamp,
    };
    this.#tasks.set(task_id, task);
    this.#audit(principal, "task.submit", result.accepted ? "allowed" : "denied", { kind: "task", id: task_id, tenant_id }, trace_id, task_id, attempt_id, execution_id, conversation_id);
    return projectTask(task);
  }

  #listTasks(query: URLSearchParams, principal: Principal): StoredTask[] {
    const tenant_id = query.get("tenant_id") ?? principal.tenant_id;
    this.#assertTenant(principal, tenant_id);
    const state = query.get("state");
    return [...this.#tasks.values()]
      .filter((task) => task.tenant_id === tenant_id)
      .filter((task) => isTenantAdmin(principal) || isPlatformAdmin(principal) || task.user_id === principal.user_id)
      .filter((task) => !state || task.state === state)
      .sort((left, right) => left.task_id.localeCompare(right.task_id))
      .map(projectTask);
  }

  #getTask(task_id: string, principal: Principal): StoredTask {
    assertPlatformId("task_id", task_id);
    const task = this.#taskForPrincipal(task_id, principal);
    return projectTask(task);
  }

  #taskCommand(task_id: string, body: JsonObject, principal: Principal, command: "cancel_attempt" | "redo_attempt"): StoredTask {
    assertPlatformId("task_id", task_id);
    const task = this.#taskForPrincipal(task_id, principal);
    this.#require(principal, command === "cancel_attempt" ? "task:cancel" : "task:submit");
    const trace_id = optionalId("trace_id", body.trace_id) ?? task.trace_id;
    const reason = requiredText(body.reason ?? `${command} requested through platform API`, "reason");
    const reading = this.clock.now();
    const request: CoordinatorTaskCommandRequest = {
      schema_version: "nexus.task_command.p4.v1",
      tenant_id: task.tenant_id,
      user_id: task.user_id,
      agent_id: task.agent_id,
      task_id: task.task_id,
      attempt_id: task.attempt_id,
      ...(command === "redo_attempt" ? { next_attempt_id: this.#nextId("attempt", trace_id) } : {}),
      execution_id: task.execution_id,
      conversation_id: task.conversation_id,
      trace_id: task.trace_id,
      command,
      requested_at_utc: reading.utc_timestamp,
      monotonic_ms: reading.monotonic_ms,
      idempotency_key: `${command}:${task.task_id}:${task.attempt_id}:${trace_id}`,
      reason,
      source: {
        kind: "api",
        request_id: this.#nextId("req", trace_id),
        client: "platform-api",
      },
    };
    const result = this.coordinator.submitTaskCommand(request, { principal });
    task.state = result.snapshot.state;
    task.attempt_id = result.snapshot.attempt_id;
    task.updated_at = reading.utc_timestamp;
    this.#audit(principal, `task.${command}`, "allowed", { kind: "task", id: task_id, tenant_id: task.tenant_id }, trace_id, task.task_id, task.attempt_id, task.execution_id, task.conversation_id);
    return projectTask(task);
  }

  #taskEvents(task_id: string, principal: Principal): readonly JsonObject[] {
    const task = this.#taskForPrincipal(task_id, principal);
    return this.coordinator.events()
      .filter((event) => event.task_id === task.task_id)
      .map(projectEvent);
  }

  #skills(query: URLSearchParams, principal: Principal): readonly JsonObject[] {
    const tenant_id = query.get("tenant_id") ?? principal.tenant_id;
    this.#assertTenant(principal, tenant_id);
    const capabilities = this.pluginGovernance.listCapabilities({ tenant_id });
    return [{
      skill_id: "skill_platform_operations",
      tenant_id,
      display_name: "Platform Operations",
      description: "Approved platform operations skill",
      status: "enabled",
      version: "p5-local",
      capability_ids: capabilities.filter((capability) => capability.capability_type === "skill" || capability.capability_type === "planner_hint").map((capability) => capability.capability_id),
    }];
  }

  #capabilities(query: URLSearchParams, principal: Principal): readonly JsonObject[] {
    const tenant_id = query.get("tenant_id") ?? principal.tenant_id;
    this.#assertTenant(principal, tenant_id);
    return this.pluginGovernance.listCapabilities({ tenant_id }).map((capability) => ({ ...capability }));
  }

  #searchMemory(body: JsonObject, principal: Principal): readonly JsonObject[] {
    const tenant_id = requiredId("tenant_id", body.tenant_id);
    this.#assertTenant(principal, tenant_id);
    this.#require(principal, "memory:read");
    const trace_id = requiredId("trace_id", body.trace_id);
    const records = this.memory.query({
      scope: {
        tenant_id,
        user_id: optionalId("user_id", body.user_id),
        agent_id: optionalId("agent_id", body.agent_id),
        conversation_id: optionalId("conversation_id", body.conversation_id),
      },
      layer: optionalMemoryLayer(body.layer),
      query: body.query === undefined ? undefined : requiredText(body.query, "query"),
      trace_id,
    });
    return records.map((record) => ({
      memory_id: record.memory_id,
      tenant_id: record.tenant_id,
      layer: record.layer,
      text: record.text,
      score: 1,
      trace_id,
    }));
  }

  #writeMemory(body: JsonObject, principal: Principal): JsonObject {
    const tenant_id = requiredId("tenant_id", body.tenant_id);
    this.#assertTenant(principal, tenant_id);
    this.#require(principal, "memory:write");
    const trace_id = requiredId("trace_id", body.trace_id);
    const record = this.memory.write({
      scope: {
        tenant_id,
        user_id: optionalId("user_id", body.user_id),
        agent_id: optionalId("agent_id", body.agent_id),
        conversation_id: optionalId("conversation_id", body.conversation_id),
      },
      layer: requiredMemoryLayer(body.layer),
      text: requiredText(body.text, "text"),
      source: "platform-api",
      trace_id,
    });
    return {
      memory_id: record.memory_id,
      tenant_id: record.tenant_id,
      layer: record.layer,
      text: record.text,
      version: record.version,
      trace_id: record.trace_id,
    };
  }

  #listTenants(principal: Principal): readonly JsonObject[] {
    if (!isPlatformAdmin(principal) && !isTenantAdmin(principal)) this.#require(principal, "tenant:read");
    return [...this.#tenants.values()]
      .filter((tenant) => isPlatformAdmin(principal) || tenant.tenant_id === principal.tenant_id)
      .map((tenant) => ({
        tenant_id: tenant.tenant_id,
        name: tenant.name,
        status: tenant.status === "disabled" ? "suspended" : "active",
        created_at: tenant.created_at,
      }));
  }

  #listTenantUsers(tenant_id: string, principal: Principal): readonly JsonObject[] {
    assertPlatformId("tenant_id", tenant_id);
    this.#assertTenant(principal, tenant_id);
    this.#require(principal, "rbac:read");
    return (this.#members.get(tenant_id) ?? []).map((member) => ({
      tenant_id: member.tenant_id,
      user_id: member.user_id,
      roles: [...member.roles],
      status: member.status,
    }));
  }

  #listApprovals(query: URLSearchParams, principal: Principal): readonly ApprovalRecord[] {
    const tenant_id = query.get("tenant_id") ?? principal.tenant_id;
    this.#assertTenant(principal, tenant_id);
    return [...this.#approvals.values()]
      .filter((approval) => approval.tenant_id === tenant_id)
      .map(projectApproval);
  }

  #decideApproval(approval_id: string, body: JsonObject, principal: Principal): ApprovalRecord {
    if (!/^approval_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/.test(approval_id)) {
      throw new PlatformApiError("PLATFORM_INVALID_REQUEST", "Approval identifier is invalid");
    }
    const approval = this.#approvals.get(approval_id);
    if (!approval) throw new PlatformApiError("PLATFORM_NOT_FOUND", "Approval not found", { approval_id });
    this.#assertTenant(principal, approval.tenant_id);
    this.#require(principal, "task:submit");
    const decision = requiredText(body.decision, "decision");
    if (decision !== "approve" && decision !== "reject") throw new PlatformApiError("PLATFORM_INVALID_REQUEST", "Approval decision is unsupported");
    approval.status = decision === "approve" ? "approved" : "rejected";
    approval.reason = requiredText(body.reason, "reason");
    approval.trace_id = requiredId("trace_id", body.trace_id);
    approval.decided_at = this.clock.now().utc_timestamp;
    return projectApproval(approval);
  }

  #checkBudget(body: JsonObject, principal: Principal): JsonObject {
    const tenant_id = requiredId("tenant_id", body.tenant_id);
    this.#assertTenant(principal, tenant_id);
    const trace_id = requiredId("trace_id", body.trace_id);
    const requested_units = positiveInteger(body.requested_units, "requested_units");
    const remaining_units = nonNegativeInteger(body.remaining_units, "remaining_units");
    const max_units_per_attempt = body.max_units_per_attempt === undefined ? undefined : positiveInteger(body.max_units_per_attempt, "max_units_per_attempt");
    const reading = this.clock.now();
    const decision = this.policyGate.evaluate({
      action: "task.submit",
      tenant_id,
      execution_id: this.#nextId("exec", trace_id),
      trace_id,
      monotonic_ms: reading.monotonic_ms,
      requested_at_utc: reading.utc_timestamp,
      principal,
      budget: { requested_units, remaining_units, max_units_per_attempt },
    });
    return {
      tenant_id,
      trace_id,
      status: decision.allow ? "approved" : "denied",
      requested_units,
      remaining_units,
      ...(decision.code === undefined ? {} : { code: decision.code }),
      reasons: [...decision.reasons],
    };
  }

  #listChannels(query: URLSearchParams, principal: Principal): readonly JsonObject[] {
    const tenant_id = query.get("tenant_id") ?? principal.tenant_id;
    this.#assertTenant(principal, tenant_id);
    this.#require(principal, "tenant:read");
    return this.channelManagement.list({ tenant_id }).map((channel) => ({ ...channel }));
  }

  #createChannel(body: JsonObject, principal: Principal): JsonObject {
    const tenant_id = requiredId("tenant_id", body.tenant_id);
    this.#assertTenant(principal, tenant_id);
    this.#require(principal, "tenant:manage");
    return this.channelManagement.create({
      tenant_id,
      channel_name: requiredText(body.channel_name, "channel_name") as never,
      display_name: requiredText(body.display_name, "display_name"),
      account_ref: requiredText(body.account_ref, "account_ref"),
      conversation_ref: requiredText(body.conversation_ref, "conversation_ref"),
      ...(body.credential_ref === undefined ? {} : { credential_ref: requiredText(body.credential_ref, "credential_ref") }),
      trace_id: requiredId("trace_id", body.trace_id),
    });
  }

  #getChannel(channel_config_id: string, principal: Principal): JsonObject {
    const channel = this.channelManagement.get(channel_config_id);
    this.#assertTenant(principal, channel.tenant_id);
    this.#require(principal, "tenant:read");
    return { ...channel };
  }

  #updateChannel(channel_config_id: string, body: JsonObject, principal: Principal): JsonObject {
    const channel = this.channelManagement.get(channel_config_id);
    this.#assertTenant(principal, channel.tenant_id);
    this.#require(principal, "tenant:manage");
    return this.channelManagement.update(channel_config_id, {
      ...(body.display_name === undefined ? {} : { display_name: requiredText(body.display_name, "display_name") }),
      ...(body.account_ref === undefined ? {} : { account_ref: requiredText(body.account_ref, "account_ref") }),
      ...(body.conversation_ref === undefined ? {} : { conversation_ref: requiredText(body.conversation_ref, "conversation_ref") }),
      ...(body.credential_ref === undefined ? {} : { credential_ref: requiredText(body.credential_ref, "credential_ref") }),
      trace_id: requiredId("trace_id", body.trace_id),
    });
  }

  #setChannelStatus(channel_config_id: string, body: JsonObject, principal: Principal): JsonObject {
    const channel = this.channelManagement.get(channel_config_id);
    this.#assertTenant(principal, channel.tenant_id);
    this.#require(principal, "tenant:manage");
    return this.channelManagement.setStatus(channel_config_id, {
      status: requiredText(body.status, "status") as never,
      reason: requiredText(body.reason, "reason"),
      trace_id: requiredId("trace_id", body.trace_id),
    });
  }

  async #testChannel(channel_config_id: string, body: JsonObject, principal: Principal): Promise<JsonObject> {
    const channel = this.channelManagement.get(channel_config_id);
    this.#assertTenant(principal, channel.tenant_id);
    this.#require(principal, "tenant:manage");
    return this.channelManagement.testConnection(channel_config_id, { trace_id: requiredId("trace_id", body.trace_id) }, principal);
  }

  #listPluginInventory(principal: Principal): readonly JsonObject[] {
    this.#requirePlatformAdmin(principal);
    return this.pluginGovernance.listInventory().map((entry) => ({ ...entry }));
  }

  #importPlugin(body: JsonObject, principal: Principal): JsonObject {
    this.#requirePlatformAdmin(principal);
    return this.pluginGovernance.importPlugin({
      source_kind: requiredText(body.source_kind, "source_kind") as never,
      source_ref: requiredText(body.source_ref, "source_ref"),
      display_name: requiredText(body.display_name, "display_name"),
      version: requiredText(body.version, "version"),
      expected_sha256: requiredText(body.expected_sha256, "expected_sha256"),
      license: requiredText(body.license, "license"),
      notice_status: requiredText(body.notice_status, "notice_status") as never,
      risk_level: body.risk_level === undefined ? undefined : requiredText(body.risk_level, "risk_level") as never,
      trace_id: requiredId("trace_id", body.trace_id),
    });
  }

  #decidePluginAdmission(plugin_id: string, body: JsonObject, principal: Principal): JsonObject {
    this.#requirePlatformAdmin(principal);
    return this.pluginGovernance.decideAdmission(plugin_id, {
      decision: requiredText(body.decision, "decision") as never,
      reason: requiredText(body.reason, "reason"),
      trace_id: requiredId("trace_id", body.trace_id),
    });
  }

  #principalFor(headers: HeaderMap | undefined): Principal {
    const authorization = headerValue(headers, "authorization");
    const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : undefined;
    if (!token) throw new PlatformApiError("PLATFORM_UNAUTHENTICATED", "Authentication is required");
    const grant = (tenant_id: string, user_id: string, roles: readonly string[], extra: readonly string[] = []): Principal => {
      const principal = this.rbac.principalFor({ tenant_id, user_id });
      return { ...principal, roles: [...new Set([...roles, ...principal.roles])], permissions: [...new Set([...principal.permissions, ...extra])] };
    };
    if (token === "dev-platform-admin") return grant("tenant_alpha01", "user_platform_admin", ["platform-admin", "admin"], ["task:submit", "task:cancel"]);
    if (token === "dev-tenant-admin-alpha") return grant("tenant_alpha01", "user_tenant_admin", ["tenant-admin", "admin"]);
    if (token === "dev-operator-alpha") return grant("tenant_alpha01", "user_alpha01", ["operator"]);
    if (token === "dev-viewer-alpha") return grant("tenant_alpha01", "user_viewer01", ["viewer"]);
    throw new PlatformApiError("PLATFORM_UNAUTHENTICATED", "Authentication credential is invalid");
  }

  #taskForPrincipal(task_id: string, principal: Principal): StoredTask {
    const task = this.#tasks.get(task_id);
    if (!task) throw new PlatformApiError("PLATFORM_NOT_FOUND", "Task not found", { task_id });
    this.#assertTenant(principal, task.tenant_id);
    if (task.user_id !== principal.user_id && !isTenantAdmin(principal) && !isPlatformAdmin(principal)) {
      throw new PlatformApiError("PLATFORM_FORBIDDEN", "Principal cannot access this task", { task_id });
    }
    return task;
  }

  #assertTenant(principal: Principal, tenant_id: string): void {
    assertPlatformId("tenant_id", tenant_id);
    if (principal.tenant_id !== tenant_id && !isPlatformAdmin(principal)) {
      throw new PlatformApiError("PLATFORM_FORBIDDEN", "Cross-tenant access is not allowed", { tenant_id });
    }
  }

  #require(principal: Principal, permission: PlatformPermission): void {
    if (!principal.permissions.includes(permission)) {
      throw new PlatformApiError("PLATFORM_FORBIDDEN", "Principal is missing a required permission", { permission });
    }
  }

  #requirePlatformAdmin(principal: Principal): void {
    if (!isPlatformAdmin(principal)) {
      throw new PlatformApiError("PLATFORM_FORBIDDEN", "Platform administrator role is required");
    }
  }

  #auditDeniedRequest(error: unknown, trace_id: string, principal: Principal | undefined, method: string): void {
    if (!principal) return;
    const code = errorCode(error);
    if (code === "PLATFORM_UNAUTHENTICATED") return;
    try {
      this.audit.append({
        tenant_id: principal.tenant_id,
        user_id: principal.user_id,
        trace_id,
        action: "api.request.denied",
        outcome: "denied",
        resource: { kind: "trace", id: trace_id, tenant_id: principal.tenant_id },
        details: {
          code,
          method,
          reason: error instanceof Error ? error.message : "Platform API request denied",
        },
      });
    } catch {
      // Denied-audit capture must never change the public API failure mode.
    }
  }

  #audit(
    principal: Principal,
    action: string,
    outcome: "allowed" | "denied" | "failed" | "recorded",
    resource: { kind: "tenant" | "user" | "task" | "attempt" | "execution" | "artifact" | "credential" | "memory" | "policy" | "audit" | "trace"; id: string; tenant_id?: string },
    trace_id: string,
    task_id?: string,
    attempt_id?: string,
    execution_id?: string,
    conversation_id?: string,
  ): void {
    this.audit.append({
      tenant_id: principal.tenant_id,
      user_id: principal.user_id,
      trace_id,
      action,
      outcome,
      resource,
      task_id,
      attempt_id,
      execution_id,
      conversation_id,
    });
  }

  #nextId(prefix: "task" | "attempt" | "exec" | "req", trace_id: string): string {
    this.#sequence += 1;
    return `${prefix}_${trace_id.replace(/^trace_/, "")}_${String(this.#sequence).padStart(4, "0")}`;
  }

  #seedIdentity(): void {
    const created_at = "2026-08-25T00:00:00.000Z";
    for (const tenant of [
      { tenant_id: "tenant_alpha01", name: "Alpha Tenant", status: "active" as const, created_at },
      { tenant_id: "tenant_beta01", name: "Beta Tenant", status: "active" as const, created_at },
    ]) {
      this.tenancy.registerTenant({ tenant_id: tenant.tenant_id, name: tenant.name });
      this.#tenants.set(tenant.tenant_id, tenant);
    }
    const members = [
      { tenant_id: "tenant_alpha01", user_id: "user_platform_admin", roles: ["admin", "platform-admin"], status: "active" as const },
      { tenant_id: "tenant_alpha01", user_id: "user_tenant_admin", roles: ["admin", "tenant-admin"], status: "active" as const },
      { tenant_id: "tenant_alpha01", user_id: "user_alpha01", roles: ["operator"], status: "active" as const },
      { tenant_id: "tenant_alpha01", user_id: "user_viewer01", roles: ["viewer"], status: "active" as const },
      { tenant_id: "tenant_beta01", user_id: "user_beta01", roles: ["operator"], status: "active" as const },
    ];
    for (const member of members) {
      const platformRoles = member.roles.filter((role) => role === "admin" || role === "operator" || role === "viewer" || role === "service") as ("admin" | "operator" | "viewer" | "service")[];
      this.tenancy.registerMember({ tenant_id: member.tenant_id, user_id: member.user_id, roles: member.roles, agent_ids: ["agent_alpha01", "agent_beta01"] });
      this.rbac.grant({ tenant_id: member.tenant_id, user_id: member.user_id, roles: platformRoles.length ? platformRoles : ["viewer"] });
      const list = this.#members.get(member.tenant_id) ?? [];
      list.push(member);
      this.#members.set(member.tenant_id, list);
    }
  }

  #seedApprovals(): void {
    this.#approvals.set("approval_alpha01", {
      approval_id: "approval_alpha01",
      tenant_id: "tenant_alpha01",
      task_id: "task_seed01",
      attempt_id: "attempt_seed01",
      status: "pending",
      reason: "Seed approval for platform API contract tests",
      requested_at: "2026-08-25T00:00:00.000Z",
      trace_id: "trace_approval01",
    });
  }
}

export function createPlatformApi(options: PlatformApiOptions = {}): PlatformApiApp {
  return new PlatformApiApp(options);
}

export function createManualPlatformApi(): PlatformApiApp {
  return createPlatformApi({ clock: new ManualClock({ utc_timestamp: "2026-08-25T00:00:00.000Z", monotonic_ms: 100 }) });
}

export function listenPlatformApi(options: PlatformApiOptions & { port?: number; host?: string } = {}): http.Server {
  const app = createPlatformApi(options);
  const server = http.createServer((request, response) => {
    void app.handleNode(request, response);
  });
  server.listen(options.port ?? 8080, options.host ?? "0.0.0.0");
  return server;
}

function ok(body: unknown, status = 200): PlatformApiResponse {
  assertPublicResponsePayload(body);
  return { status, headers: jsonHeaders(), body };
}

function errorResponse(error: unknown, trace_id: string): PlatformApiResponse {
  const code = errorCode(error);
  const body = {
    code,
    message: error instanceof Error ? error.message : "Platform API request failed",
    trace_id,
    details: errorDetails(error),
  };
  assertPublicResponsePayload(body);
  return { status: statusForCode(code), headers: jsonHeaders(), body };
}

function errorCode(error: unknown): string {
  if (error instanceof PlatformApiError || error instanceof PublicSurfaceError || error instanceof CoordinatorError || error instanceof PluginGovernanceError) return error.code;
  if (error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string") return (error as { code: string }).code;
  return "PLATFORM_INTERNAL_ERROR";
}

function errorDetails(error: unknown): Record<string, unknown> {
  if (error && typeof error === "object" && "details" in error && typeof (error as { details?: unknown }).details === "object") {
    return sanitizePublicDetails((error as { details: Record<string, unknown> }).details);
  }
  return {};
}

function statusForCode(code: string): number {
  if (code === "PLATFORM_UNAUTHENTICATED") return 401;
  if (code === "PLATFORM_FORBIDDEN" || code === "PLATFORM_POLICY_DENIED" || code === "PLATFORM_CROSS_TENANT_ID") return 403;
  if (code === "PLATFORM_NOT_FOUND") return 404;
  if (code === "PLATFORM_CONFLICT" || code === "PLATFORM_TASK_NOT_CANCELABLE" || code === "PLATFORM_APPROVAL_REQUIRED") return 409;
  if (code === "PLATFORM_RATE_LIMITED") return 429;
  if (code === "PLATFORM_INTERNAL_ERROR") return 500;
  return 400;
}

function jsonHeaders(): Record<string, string> {
  return { "content-type": "application/json; charset=utf-8" };
}

function parsePath(path: string): { pathname: string; query: URLSearchParams } {
  const [pathname, query = ""] = path.split("?", 2);
  return { pathname: pathname || "/", query: new URLSearchParams(query) };
}

function paginate<T>(items: readonly T[], query: URLSearchParams): { items: T[]; next_cursor?: string } {
  const limit = parseLimit(query.get("limit"));
  const offset = parseCursor(query.get("cursor"));
  const page = items.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  return nextOffset < items.length ? { items: page, next_cursor: `cursor_${nextOffset}` } : { items: page };
}

function parseLimit(value: string | null): number {
  if (value === null) return 50;
  if (!/^\d+$/.test(value)) throw new PlatformApiError("PLATFORM_INVALID_REQUEST", "Pagination limit is invalid", { field: "limit" });
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new PlatformApiError("PLATFORM_INVALID_REQUEST", "Pagination limit must be between 1 and 100", { field: "limit" });
  }
  return parsed;
}

function parseCursor(value: string | null): number {
  if (value === null) return 0;
  const match = /^cursor_(\d{1,10})$/.exec(value);
  if (!match) throw new PlatformApiError("PLATFORM_INVALID_REQUEST", "Pagination cursor is invalid", { field: "cursor" });
  return Number(match[1]);
}

function pathPart(pathname: string, index: number): string {
  return decodeURIComponent(pathname.split("/")[index] ?? "");
}

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PlatformApiError("PLATFORM_INVALID_REQUEST", "JSON object body is required");
  return value as JsonObject;
}

function requiredId(key: "tenant_id" | "user_id" | "agent_id" | "task_id" | "attempt_id" | "execution_id" | "conversation_id" | "artifact_id" | "trace_id", value: unknown): string {
  return assertPlatformId(key, value);
}

function optionalId(key: "tenant_id" | "user_id" | "agent_id" | "task_id" | "attempt_id" | "execution_id" | "conversation_id" | "artifact_id" | "trace_id", value: unknown): string | undefined {
  return value === undefined ? undefined : requiredId(key, value);
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new PlatformApiError("PLATFORM_INVALID_REQUEST", "Text field is required", { field });
  return value;
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || Number(value) <= 0) throw new PlatformApiError("PLATFORM_INVALID_REQUEST", "Positive integer field is required", { field });
  return Number(value);
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || Number(value) < 0) throw new PlatformApiError("PLATFORM_INVALID_REQUEST", "Non-negative integer field is required", { field });
  return Number(value);
}

function requiredMemoryLayer(value: unknown): MemoryLayer {
  const layer = optionalMemoryLayer(value);
  if (!layer) throw new PlatformApiError("PLATFORM_INVALID_REQUEST", "Memory layer is required");
  return layer;
}

function optionalMemoryLayer(value: unknown): MemoryLayer | undefined {
  if (value === undefined) return undefined;
  if (["session", "user", "agent_skill", "organization", "audit_snapshot"].includes(String(value))) return value as MemoryLayer;
  throw new PlatformApiError("PLATFORM_INVALID_REQUEST", "Memory layer is unsupported", { layer: value });
}

function projectTask(task: StoredTask): StoredTask {
  const projected = JSON.parse(JSON.stringify(task)) as StoredTask;
  assertPublicResponsePayload(projected);
  return projected;
}

function projectApproval(approval: ApprovalRecord): ApprovalRecord {
  const projected = JSON.parse(JSON.stringify(approval)) as ApprovalRecord;
  assertPublicResponsePayload(projected);
  return projected;
}

function projectEvent(event: JsonObject): JsonObject {
  const payload = event.payload && typeof event.payload === "object" ? event.payload as JsonObject : {};
  const publicPayload: JsonObject = {};
  for (const key of ["state", "previous_state", "state_layer", "outcome", "reason", "command", "audit_action"] as const) {
    if (payload[key] !== undefined) publicPayload[key] = payload[key];
  }
  const projected: JsonObject = {
    event_id: event.event_id,
    event_type: event.event_type,
    tenant_id: event.tenant_id,
    task_id: event.task_id,
    attempt_id: event.attempt_id,
    execution_id: event.execution_id,
    trace_id: event.trace_id,
    occurred_at: event.occurred_at_utc,
    payload: publicPayload,
  };
  assertPublicResponsePayload(projected);
  return projected;
}

function isPlatformAdmin(principal: Principal): boolean {
  return principal.roles.includes("platform-admin");
}

function isTenantAdmin(principal: Principal): boolean {
  return principal.roles.includes("tenant-admin") || principal.roles.includes("admin");
}

function headerValue(headers: HeaderMap | undefined, key: string): string | undefined {
  if (!headers) return undefined;
  const lower = key.toLowerCase();
  for (const [headerKey, value] of Object.entries(headers)) {
    if (headerKey.toLowerCase() === lower) return value;
  }
  return undefined;
}

function traceFromBody(body: unknown): string | undefined {
  if (body && typeof body === "object" && !Array.isArray(body) && typeof (body as { trace_id?: unknown }).trace_id === "string") return (body as { trace_id: string }).trace_id;
  return undefined;
}

function traceFromHeaders(headers: HeaderMap | undefined): string | undefined {
  const value = headerValue(headers, "x-trace-id");
  return value && /^trace_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/.test(value) ? value : undefined;
}
