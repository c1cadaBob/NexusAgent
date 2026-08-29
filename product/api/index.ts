import http from "node:http";
import { LocalAuditLog } from "../../platform/audit/index.ts";
import { LocalChannelManagement } from "../../platform/channel-management/index.ts";
import { ManualClock, SystemClock, type PlatformClock } from "../../platform/clock/index.ts";
import {
  Coordinator,
  CoordinatorError,
  estimateTokenBudgetUnits,
  LocalTokenBudget,
  LocalScheduledGoals,
  ScheduledGoalsError,
  type CoordinatorTaskCommandRequest,
  type ScheduledGoalRecord,
  type ScheduledGoalRunDueItem,
  type ScheduledGoalStatus,
  type TokenBudgetLimits,
} from "../../platform/coordinator/index.ts";
import { LocalCredentialCenter } from "../../platform/credentials/index.ts";
import { InMemoryEventBus, type EventBus } from "../../platform/event-bus/index.ts";
import { LocalMemoryGateway, MemoryGatewayError, type MemoryLayer } from "../../platform/memory-gateway/index.ts";
import { LocalObservability } from "../../platform/observability/index.ts";
import { LocalPluginGovernance, PluginGovernanceError } from "../../platform/plugin-governance/index.ts";
import { PolicyGate } from "../../platform/policy-gate/index.ts";
import { assertPublicRequestPayload, assertPublicResponsePayload, PublicSurfaceError, sanitizePublicDetails } from "../../platform/public-surface/index.ts";
import { LocalRbacPolicy, PLATFORM_PERMISSIONS, type PlatformPermission } from "../../platform/rbac/index.ts";
import { LocalSkillEvaluation } from "../../platform/skill-evaluation/index.ts";
import { assertPlatformId, type TaskState } from "../../platform/task-state/index.ts";
import { LocalTenantRegistry } from "../../platform/tenancy/index.ts";
import {
  createDistributedPlatformRuntime,
  type DistributedAuditLog,
  type DistributedCredentialCenter,
  type DistributedMemoryGateway,
  type DistributedObservability,
  type DistributedPlatformRuntime,
  type InternalRuntimeOptions,
} from "../../platform/internal-http/index.ts";

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
  input: string;
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
  runtime?: "in_process" | "distributed";
  internal?: InternalRuntimeOptions;
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
  readonly eventBus: EventBus;
  readonly policyGate = new PolicyGate();
  readonly coordinator: Coordinator;
  readonly tenancy = new LocalTenantRegistry();
  readonly rbac = new LocalRbacPolicy();
  readonly memory: LocalMemoryGateway | DistributedMemoryGateway;
  readonly credentials: LocalCredentialCenter | DistributedCredentialCenter;
  readonly audit: LocalAuditLog | DistributedAuditLog;
  readonly observability: LocalObservability | DistributedObservability;
  readonly tokenBudget: LocalTokenBudget;
  readonly scheduledGoals: LocalScheduledGoals;
  readonly pluginGovernance = new LocalPluginGovernance({ tenant_id: "tenant_alpha01", trace_id: "trace_plugin01" });
  readonly channelManagement: LocalChannelManagement;
  readonly skillEvaluation: LocalSkillEvaluation;

  readonly #tasks = new Map<string, StoredTask>();
  readonly #approvals = new Map<string, ApprovalRecord>();
  readonly #tenants = new Map<string, { tenant_id: string; name: string; status: "active" | "disabled"; created_at: string }>();
  readonly #members = new Map<string, { tenant_id: string; user_id: string; roles: readonly string[]; status: "active" | "disabled" }[]>();
  #sequence = 0;

  constructor(options: PlatformApiOptions = {}) {
    this.clock = options.clock ?? new SystemClock();
    const distributed: DistributedPlatformRuntime | undefined = options.runtime === "distributed"
      ? createDistributedPlatformRuntime(options.internal)
      : undefined;
    this.eventBus = distributed?.eventBus ?? new InMemoryEventBus();
    this.observability = distributed?.observability ?? new LocalObservability({ clock: this.clock, service: "nexusagent-platform-api", version: "p5-local" });
    this.tokenBudget = new LocalTokenBudget({ clock: this.clock, eventBus: this.eventBus, observability: this.observability });
    this.coordinator = new Coordinator({
      policyGate: this.policyGate,
      eventBus: this.eventBus,
      clock: this.clock,
      tokenBudget: { enabled: true, service: this.tokenBudget },
    });
    this.memory = distributed?.memory ?? new LocalMemoryGateway({ clock: this.clock, eventBus: this.eventBus, observability: this.observability });
    this.credentials = distributed?.credentials ?? new LocalCredentialCenter({ clock: this.clock, eventBus: this.eventBus });
    this.audit = distributed?.audit ?? new LocalAuditLog({ clock: this.clock, eventBus: this.eventBus });
    const channelAdapter = distributed?.adapters.find((adapter) => adapter.kind === "channel");
    for (const adapter of distributed?.adapters ?? []) {
      if (adapter.kind !== "channel") this.coordinator.registerAdapter(adapter);
    }
    this.scheduledGoals = new LocalScheduledGoals({ clock: this.clock, coordinator: this.coordinator, eventBus: this.eventBus, observability: this.observability });
    this.channelManagement = new LocalChannelManagement({ clock: this.clock, coordinator: this.coordinator, eventBus: this.eventBus, channelAdapter });
    this.skillEvaluation = new LocalSkillEvaluation({ clock: this.clock, catalog: this.pluginGovernance, observability: this.observability });
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
        const health = await Promise.resolve(this.observability.health(["api.local", "contracts.p5"]));
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

      if (method === "GET" && parsed.pathname === "/v1/scheduled-goals/config") return ok(this.#getScheduledGoalsConfig(parsed.query, principal));
      if (method === "PATCH" && parsed.pathname === "/v1/scheduled-goals/config") return ok(this.#updateScheduledGoalsConfig(asObject(body), principal));
      if (method === "GET" && parsed.pathname === "/v1/scheduled-goals") return ok(paginate(this.#listScheduledGoals(parsed.query, principal), parsed.query));
      if (method === "POST" && parsed.pathname === "/v1/scheduled-goals") return ok(this.#createScheduledGoal(asObject(body), principal), 201);
      if (method === "POST" && parsed.pathname === "/v1/scheduled-goals/run-due") return ok(this.#runDueScheduledGoals(asObject(body), principal), 202);
      if (method === "GET" && /^\/v1\/scheduled-goals\/[^/]+$/.test(parsed.pathname)) return ok(this.#getScheduledGoal(pathPart(parsed.pathname, 3), principal));
      if (method === "PATCH" && /^\/v1\/scheduled-goals\/[^/]+$/.test(parsed.pathname)) return ok(this.#updateScheduledGoal(pathPart(parsed.pathname, 3), asObject(body), principal));
      if (method === "POST" && /^\/v1\/scheduled-goals\/[^/]+\/cancel$/.test(parsed.pathname)) return ok(this.#cancelScheduledGoal(pathPart(parsed.pathname, 3), asObject(body), principal), 202);
      if (method === "POST" && /^\/v1\/scheduled-goals\/[^/]+\/retry$/.test(parsed.pathname)) return ok(this.#retryScheduledGoal(pathPart(parsed.pathname, 3), asObject(body), principal), 202);

      if (method === "GET" && parsed.pathname === "/v1/skills") return ok(paginate(this.#skills(parsed.query, principal), parsed.query));
      if (method === "GET" && parsed.pathname === "/v1/capabilities") return ok(paginate(this.#capabilities(parsed.query, principal), parsed.query));

      if (method === "GET" && parsed.pathname === "/v1/skill-evaluations/config") return ok(this.#getSkillEvaluationConfig(parsed.query, principal));
      if (method === "PATCH" && parsed.pathname === "/v1/skill-evaluations/config") return ok(this.#updateSkillEvaluationConfig(asObject(body), principal));
      if (method === "POST" && parsed.pathname === "/v1/skill-evaluations/runs") return ok(this.#runSkillEvaluation(asObject(body), principal), 202);
      if (method === "GET" && parsed.pathname === "/v1/skill-evaluations/runs") return ok(paginate(this.#listSkillEvaluationRuns(parsed.query, principal), parsed.query));
      if (method === "GET" && /^\/v1\/skill-evaluations\/runs\/[^/]+$/.test(parsed.pathname)) return ok(this.#getSkillEvaluationRun(pathPart(parsed.pathname, 4), parsed.query, principal));

      if (method === "POST" && parsed.pathname === "/v1/memory/search") return ok({ items: await this.#searchMemory(asObject(body), principal) });
      if (method === "POST" && parsed.pathname === "/v1/memory") return ok(await this.#writeMemory(asObject(body), principal), 201);
      if (method === "GET" && parsed.pathname === "/v1/memory/retention") return ok(await this.#getMemoryRetention(parsed.query, principal));
      if (method === "PATCH" && parsed.pathname === "/v1/memory/retention") return ok(await this.#updateMemoryRetention(asObject(body), principal));
      if (method === "POST" && parsed.pathname === "/v1/memory/retention/sweep") return ok(await this.#sweepMemoryRetention(asObject(body), principal));
      if (method === "GET" && parsed.pathname === "/v1/memory/conflicts") return ok(paginate(await this.#listMemoryConflicts(parsed.query, principal), parsed.query));
      if (method === "GET" && /^\/v1\/memory\/conflicts\/[^/]+$/.test(parsed.pathname)) return ok(await this.#getMemoryConflict(pathPart(parsed.pathname, 4), parsed.query, principal));
      if (method === "POST" && /^\/v1\/memory\/conflicts\/[^/]+\/decision$/.test(parsed.pathname)) return ok(await this.#decideMemoryConflict(pathPart(parsed.pathname, 4), asObject(body), principal));
      if (method === "POST" && /^\/v1\/memory\/[^/]+\/delete$/.test(parsed.pathname)) return ok(await this.#deleteMemory(pathPart(parsed.pathname, 3), asObject(body), principal));

      if (method === "GET" && parsed.pathname === "/v1/tenants") return ok(paginate(this.#listTenants(principal), parsed.query));
      if (method === "GET" && /^\/v1\/tenants\/[^/]+\/users$/.test(parsed.pathname)) return ok(paginate(this.#listTenantUsers(pathPart(parsed.pathname, 3), principal), parsed.query));
      if (method === "GET" && parsed.pathname === "/v1/permissions") return ok({ items: [...PLATFORM_PERMISSIONS] });

      if (method === "GET" && parsed.pathname === "/v1/approvals") return ok(paginate(this.#listApprovals(parsed.query, principal), parsed.query));
      if (method === "POST" && /^\/v1\/approvals\/[^/]+\/decision$/.test(parsed.pathname)) return ok(this.#decideApproval(pathPart(parsed.pathname, 3), asObject(body), principal));

      if (method === "GET" && parsed.pathname === "/v1/budget/policy") return ok(this.#getBudgetPolicy(parsed.query, principal));
      if (method === "PATCH" && parsed.pathname === "/v1/budget/policy") return ok(this.#updateBudgetPolicy(asObject(body), principal));
      if (method === "GET" && parsed.pathname === "/v1/budget/ledger") return ok(paginate(this.#listBudgetLedger(parsed.query, principal), parsed.query));
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
    const token_budget_units = body.budget_units === undefined ? undefined : positiveInteger(body.budget_units, "budget_units");
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
    }, { principal, token_budget_units });
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
      input,
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
    const conversation_id = optionalId("conversation_id", query.get("conversation_id") ?? undefined);
    const state = query.get("state");
    return [...this.#tasks.values()]
      .filter((task) => task.tenant_id === tenant_id)
      .filter((task) => conversation_id === undefined || task.conversation_id === conversation_id)
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

  #getScheduledGoalsConfig(query: URLSearchParams, principal: Principal): JsonObject {
    const tenant_id = query.get("tenant_id") ?? principal.tenant_id;
    this.#assertTenant(principal, tenant_id);
    if (!principal.permissions.includes("tenant:read")) this.#require(principal, "task:submit");
    const trace_id = query.get("trace_id") ?? "trace_scheduled_goals01";
    return this.scheduledGoals.getConfig(tenant_id, requiredId("trace_id", trace_id)) as unknown as JsonObject;
  }

  #updateScheduledGoalsConfig(body: JsonObject, principal: Principal): JsonObject {
    const tenant_id = requiredId("tenant_id", body.tenant_id);
    this.#assertTenant(principal, tenant_id);
    this.#require(principal, "tenant:manage");
    const config = this.scheduledGoals.updateConfig({
      tenant_id,
      trace_id: requiredId("trace_id", body.trace_id),
      ...(body.enabled === undefined ? {} : { enabled: requiredBoolean(body.enabled, "enabled") }),
      ...(body.max_active_goals === undefined ? {} : { max_active_goals: positiveInteger(body.max_active_goals, "max_active_goals") }),
      ...(body.max_due_per_tick === undefined ? {} : { max_due_per_tick: positiveInteger(body.max_due_per_tick, "max_due_per_tick") }),
      ...(body.min_interval_minutes === undefined ? {} : { min_interval_minutes: positiveInteger(body.min_interval_minutes, "min_interval_minutes") }),
    });
    this.#audit(principal, "scheduled_goal.config.update", "allowed", { kind: "policy", id: `scheduled_goals_${tenant_id}`, tenant_id }, config.trace_id);
    return config as unknown as JsonObject;
  }

  #listScheduledGoals(query: URLSearchParams, principal: Principal): readonly JsonObject[] {
    const tenant_id = query.get("tenant_id") ?? principal.tenant_id;
    this.#assertTenant(principal, tenant_id);
    const user_id = isTenantAdmin(principal) || isPlatformAdmin(principal) || principal.permissions.includes("tenant:read")
      ? optionalId("user_id", query.get("user_id") ?? undefined)
      : principal.user_id;
    const status = query.get("status") ?? undefined;
    if (!isTenantAdmin(principal) && !isPlatformAdmin(principal) && !principal.permissions.includes("tenant:read")) this.#require(principal, "task:submit");
    return this.scheduledGoals.list({ tenant_id, user_id, status: optionalScheduledGoalStatus(status) }) as unknown as JsonObject[];
  }

  #createScheduledGoal(body: JsonObject, principal: Principal): JsonObject {
    const tenant_id = requiredId("tenant_id", body.tenant_id);
    this.#assertTenant(principal, tenant_id);
    this.#require(principal, "task:submit");
    const user_id = optionalId("user_id", body.user_id) ?? principal.user_id;
    if (principal.user_id !== user_id && !isTenantAdmin(principal) && !isPlatformAdmin(principal)) {
      throw new PlatformApiError("PLATFORM_FORBIDDEN", "Principal cannot schedule a goal for another user", { user_id });
    }
    const goal = this.scheduledGoals.create({
      tenant_id,
      user_id,
      agent_id: requiredId("agent_id", body.agent_id),
      conversation_id: requiredId("conversation_id", body.conversation_id),
      trace_id: requiredId("trace_id", body.trace_id),
      cron: requiredText(body.cron, "cron"),
      input: requiredText(body.input, "input"),
      ...(body.budget_units === undefined ? {} : { budget_units: positiveInteger(body.budget_units, "budget_units") }),
    });
    this.#audit(principal, "scheduled_goal.create", "allowed", { kind: "task", id: goal.scheduled_goal_id, tenant_id }, goal.trace_id);
    return goal as unknown as JsonObject;
  }

  #getScheduledGoal(scheduled_goal_id: string, principal: Principal): JsonObject {
    const goal = this.scheduledGoals.get(scheduled_goal_id);
    this.#assertScheduledGoalAccess(goal, principal, false);
    return goal as unknown as JsonObject;
  }

  #updateScheduledGoal(scheduled_goal_id: string, body: JsonObject, principal: Principal): JsonObject {
    const existing = this.scheduledGoals.get(scheduled_goal_id);
    this.#assertScheduledGoalAccess(existing, principal, true);
    const goal = this.scheduledGoals.update(scheduled_goal_id, {
      trace_id: requiredId("trace_id", body.trace_id),
      ...(body.cron === undefined ? {} : { cron: requiredText(body.cron, "cron") }),
      ...(body.input === undefined ? {} : { input: requiredText(body.input, "input") }),
      ...(body.agent_id === undefined ? {} : { agent_id: requiredId("agent_id", body.agent_id) }),
      ...(body.conversation_id === undefined ? {} : { conversation_id: requiredId("conversation_id", body.conversation_id) }),
      ...(body.budget_units === undefined ? {} : { budget_units: positiveInteger(body.budget_units, "budget_units") }),
      ...(body.status === undefined ? {} : { status: requiredScheduledGoalPatchStatus(body.status) }),
    });
    this.#audit(principal, "scheduled_goal.update", "allowed", { kind: "task", id: goal.scheduled_goal_id, tenant_id: goal.tenant_id }, goal.trace_id);
    return goal as unknown as JsonObject;
  }

  #cancelScheduledGoal(scheduled_goal_id: string, body: JsonObject, principal: Principal): JsonObject {
    const existing = this.scheduledGoals.get(scheduled_goal_id);
    this.#assertScheduledGoalAccess(existing, principal, true);
    const goal = this.scheduledGoals.cancel(scheduled_goal_id, {
      trace_id: requiredId("trace_id", body.trace_id),
      reason: requiredText(body.reason, "reason"),
    }, principal);
    this.#syncScheduledTaskFromGoal(goal as unknown as ScheduledGoalRunDueItem, "cancelled");
    this.#audit(principal, "scheduled_goal.cancel", "allowed", { kind: "task", id: goal.scheduled_goal_id, tenant_id: goal.tenant_id }, goal.trace_id, goal.last_task_id, goal.last_attempt_id, goal.last_execution_id, goal.conversation_id);
    return goal as unknown as JsonObject;
  }

  #retryScheduledGoal(scheduled_goal_id: string, body: JsonObject, principal: Principal): JsonObject {
    const existing = this.scheduledGoals.get(scheduled_goal_id);
    this.#assertScheduledGoalAccess(existing, principal, true);
    const goal = this.scheduledGoals.retry(scheduled_goal_id, {
      trace_id: requiredId("trace_id", body.trace_id),
      reason: requiredText(body.reason, "reason"),
    });
    this.#audit(principal, "scheduled_goal.retry", "allowed", { kind: "task", id: goal.scheduled_goal_id, tenant_id: goal.tenant_id }, goal.trace_id);
    return goal as unknown as JsonObject;
  }

  #runDueScheduledGoals(body: JsonObject, principal: Principal): JsonObject {
    const tenant_id = requiredId("tenant_id", body.tenant_id);
    this.#assertTenant(principal, tenant_id);
    this.#require(principal, "task:submit");
    const owner_user_id = isTenantAdmin(principal) || isPlatformAdmin(principal)
      ? optionalId("user_id", body.user_id)
      : principal.user_id;
    if (body.user_id !== undefined && owner_user_id !== body.user_id) {
      throw new PlatformApiError("PLATFORM_FORBIDDEN", "Principal cannot run due goals for another user", { user_id: body.user_id });
    }
    const result = this.scheduledGoals.runDue({
      tenant_id,
      trace_id: requiredId("trace_id", body.trace_id),
      principal,
      owner_user_id,
    });
    for (const item of result.items) this.#syncScheduledTaskFromGoal(item, item.status === "submitted" ? "admitted" : item.status === "blocked" ? "blocked" : "failed");
    this.#audit(principal, "scheduled_goal.run_due", "allowed", { kind: "task", id: `scheduled_goal_tick_${tenant_id}`, tenant_id }, result.trace_id);
    return result as unknown as JsonObject;
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

  #getSkillEvaluationConfig(query: URLSearchParams, principal: Principal): JsonObject {
    const tenant_id = query.get("tenant_id") ?? principal.tenant_id;
    this.#assertTenant(principal, tenant_id);
    this.#require(principal, "tenant:manage");
    const trace_id = query.get("trace_id") ?? "trace_skill_eval01";
    return this.skillEvaluation.getConfig(tenant_id, requiredId("trace_id", trace_id)) as unknown as JsonObject;
  }

  #updateSkillEvaluationConfig(body: JsonObject, principal: Principal): JsonObject {
    const tenant_id = requiredId("tenant_id", body.tenant_id);
    this.#assertTenant(principal, tenant_id);
    this.#require(principal, "tenant:manage");
    return this.skillEvaluation.updateConfig({
      tenant_id,
      trace_id: requiredId("trace_id", body.trace_id),
      ...(body.enabled === undefined ? {} : { enabled: requiredBoolean(body.enabled, "enabled") }),
      ...(body.max_cases === undefined ? {} : { max_cases: positiveInteger(body.max_cases, "max_cases") }),
    }) as unknown as JsonObject;
  }

  #runSkillEvaluation(body: JsonObject, principal: Principal): JsonObject {
    const tenant_id = requiredId("tenant_id", body.tenant_id);
    this.#assertTenant(principal, tenant_id);
    this.#require(principal, "tenant:manage");
    return this.skillEvaluation.run({
      tenant_id,
      trace_id: requiredId("trace_id", body.trace_id),
      requested_by_user_id: principal.user_id,
    }) as unknown as JsonObject;
  }

  #listSkillEvaluationRuns(query: URLSearchParams, principal: Principal): readonly JsonObject[] {
    const tenant_id = query.get("tenant_id") ?? principal.tenant_id;
    this.#assertTenant(principal, tenant_id);
    this.#require(principal, "tenant:manage");
    return this.skillEvaluation.listRuns(tenant_id) as unknown as JsonObject[];
  }

  #getSkillEvaluationRun(run_id: string, query: URLSearchParams, principal: Principal): JsonObject {
    const tenant_id = query.get("tenant_id") ?? principal.tenant_id;
    this.#assertTenant(principal, tenant_id);
    this.#require(principal, "tenant:manage");
    return this.skillEvaluation.getRun(tenant_id, run_id) as unknown as JsonObject;
  }

  async #searchMemory(body: JsonObject, principal: Principal): Promise<readonly JsonObject[]> {
    const tenant_id = requiredId("tenant_id", body.tenant_id);
    this.#assertTenant(principal, tenant_id);
    this.#require(principal, "memory:read");
    const trace_id = requiredId("trace_id", body.trace_id);
    const records = await Promise.resolve(this.memory.query({
      scope: {
        tenant_id,
        user_id: optionalId("user_id", body.user_id),
        agent_id: optionalId("agent_id", body.agent_id),
        conversation_id: optionalId("conversation_id", body.conversation_id),
      },
      layer: optionalMemoryLayer(body.layer),
      query: body.query === undefined ? undefined : requiredText(body.query, "query"),
      trace_id,
    }));
    return records.map((record) => ({
      memory_id: record.memory_id,
      tenant_id: record.tenant_id,
      layer: record.layer,
      text: record.text,
      score: 1,
      trace_id,
    }));
  }

  async #writeMemory(body: JsonObject, principal: Principal): Promise<JsonObject> {
    const tenant_id = requiredId("tenant_id", body.tenant_id);
    this.#assertTenant(principal, tenant_id);
    this.#require(principal, "memory:write");
    const trace_id = requiredId("trace_id", body.trace_id);
    const record = await Promise.resolve(this.memory.write({
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
      ...(body.expected_version === undefined ? {} : { expected_version: nonNegativeInteger(body.expected_version, "expected_version") }),
    }));
    return {
      memory_id: record.memory_id,
      tenant_id: record.tenant_id,
      layer: record.layer,
      text: record.text,
      version: record.version,
      trace_id: record.trace_id,
    };
  }

  async #getMemoryRetention(query: URLSearchParams, principal: Principal): Promise<JsonObject> {
    const tenant_id = query.get("tenant_id") ?? principal.tenant_id;
    this.#assertTenant(principal, tenant_id);
    this.#require(principal, "tenant:manage");
    const trace_id = query.get("trace_id") ?? "trace_memory_retention01";
    return await Promise.resolve(this.memory.getRetentionPolicy(tenant_id, requiredId("trace_id", trace_id))) as JsonObject;
  }

  async #updateMemoryRetention(body: JsonObject, principal: Principal): Promise<JsonObject> {
    const tenant_id = requiredId("tenant_id", body.tenant_id);
    this.#assertTenant(principal, tenant_id);
    this.#require(principal, "tenant:manage");
    return await Promise.resolve(this.memory.updateRetentionPolicy({
      tenant_id,
      trace_id: requiredId("trace_id", body.trace_id),
      ...(body.enabled === undefined ? {} : { enabled: requiredBoolean(body.enabled, "enabled") }),
      ...(body.rules === undefined ? {} : { rules: requiredArray(body.rules, "rules") as never }),
      ...(body.max_sweep_records === undefined ? {} : { max_sweep_records: positiveInteger(body.max_sweep_records, "max_sweep_records") }),
    })) as JsonObject;
  }

  async #sweepMemoryRetention(body: JsonObject, principal: Principal): Promise<JsonObject> {
    const tenant_id = requiredId("tenant_id", body.tenant_id);
    this.#assertTenant(principal, tenant_id);
    this.#require(principal, "tenant:manage");
    return await Promise.resolve(this.memory.sweepRetention({
      tenant_id,
      trace_id: requiredId("trace_id", body.trace_id),
      requested_by_user_id: principal.user_id,
      ...(body.max_records === undefined ? {} : { max_records: positiveInteger(body.max_records, "max_records") }),
    })) as JsonObject;
  }

  async #listMemoryConflicts(query: URLSearchParams, principal: Principal): Promise<readonly JsonObject[]> {
    const tenant_id = query.get("tenant_id") ?? principal.tenant_id;
    this.#assertTenant(principal, tenant_id);
    this.#require(principal, "tenant:manage");
    const trace_id = query.get("trace_id") ?? "trace_memory_conflict01";
    const status = query.get("status") ?? undefined;
    return await Promise.resolve(this.memory.listConflicts(tenant_id, requiredId("trace_id", trace_id), optionalMemoryConflictStatus(status))) as readonly JsonObject[];
  }

  async #getMemoryConflict(conflict_id: string, query: URLSearchParams, principal: Principal): Promise<JsonObject> {
    const tenant_id = query.get("tenant_id") ?? principal.tenant_id;
    this.#assertTenant(principal, tenant_id);
    this.#require(principal, "tenant:manage");
    return await Promise.resolve(this.memory.getConflict(tenant_id, requiredConflictId(conflict_id))) as JsonObject;
  }

  async #decideMemoryConflict(conflict_id: string, body: JsonObject, principal: Principal): Promise<JsonObject> {
    const tenant_id = requiredId("tenant_id", body.tenant_id);
    this.#assertTenant(principal, tenant_id);
    this.#require(principal, "tenant:manage");
    return await Promise.resolve(this.memory.decideConflict({
      tenant_id,
      conflict_id: requiredConflictId(conflict_id),
      decision: requiredMemoryConflictDecision(body.decision),
      reason: requiredText(body.reason, "reason"),
      trace_id: requiredId("trace_id", body.trace_id),
      decided_by_user_id: principal.user_id,
    })) as JsonObject;
  }

  async #deleteMemory(memory_id: string, body: JsonObject, principal: Principal): Promise<JsonObject> {
    const tenant_id = requiredId("tenant_id", body.tenant_id);
    this.#assertTenant(principal, tenant_id);
    this.#require(principal, "tenant:manage");
    return await Promise.resolve(this.memory.softDeleteMemory({
      tenant_id,
      memory_id,
      trace_id: requiredId("trace_id", body.trace_id),
      reason: requiredText(body.reason, "reason"),
      requested_by_user_id: principal.user_id,
      delete_kind: "manual",
    })) as JsonObject;
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

  #getBudgetPolicy(query: URLSearchParams, principal: Principal): JsonObject {
    const tenant_id = query.get("tenant_id") ?? principal.tenant_id;
    this.#assertTenant(principal, tenant_id);
    this.#require(principal, "tenant:manage");
    const trace_id = query.get("trace_id") ?? "trace_budget_policy01";
    return this.tokenBudget.getPolicy(tenant_id, requiredId("trace_id", trace_id)) as unknown as JsonObject;
  }

  #updateBudgetPolicy(body: JsonObject, principal: Principal): JsonObject {
    const tenant_id = requiredId("tenant_id", body.tenant_id);
    this.#assertTenant(principal, tenant_id);
    this.#require(principal, "tenant:manage");
    return this.tokenBudget.updatePolicy({
      tenant_id,
      trace_id: requiredId("trace_id", body.trace_id),
      ...(body.enabled === undefined ? {} : { enabled: requiredBoolean(body.enabled, "enabled") }),
      ...(body.limits === undefined ? {} : { limits: budgetLimitsPatch(asObject(body.limits)) }),
    }) as unknown as JsonObject;
  }

  #listBudgetLedger(query: URLSearchParams, principal: Principal): readonly JsonObject[] {
    const tenant_id = query.get("tenant_id") ?? principal.tenant_id;
    this.#assertTenant(principal, tenant_id);
    this.#require(principal, "tenant:manage");
    return this.tokenBudget.listLedger(tenant_id, {
      user_id: optionalId("user_id", query.get("user_id") ?? undefined),
      agent_id: optionalId("agent_id", query.get("agent_id") ?? undefined),
      task_id: optionalId("task_id", query.get("task_id") ?? undefined),
      trace_id: optionalId("trace_id", query.get("trace_id") ?? undefined),
    }) as unknown as JsonObject[];
  }

  #checkBudget(body: JsonObject, principal: Principal): JsonObject {
    const tenant_id = requiredId("tenant_id", body.tenant_id);
    this.#assertTenant(principal, tenant_id);
    this.#require(principal, "task:submit");
    const trace_id = requiredId("trace_id", body.trace_id);
    const user_id = optionalId("user_id", body.user_id) ?? principal.user_id;
    if (user_id !== principal.user_id && !isTenantAdmin(principal) && !isPlatformAdmin(principal)) {
      throw new PlatformApiError("PLATFORM_FORBIDDEN", "Principal cannot check budget for another user", { user_id });
    }
    const requested_units = body.requested_units === undefined
      ? estimateTokenBudgetUnits(requiredText(body.input, "input"))
      : positiveInteger(body.requested_units, "requested_units");
    if (body.remaining_units !== undefined || body.max_units_per_attempt !== undefined) {
      const legacyRemainingUnits = nonNegativeInteger(body.remaining_units ?? requested_units, "remaining_units");
      const legacyMaxUnitsPerAttempt = body.max_units_per_attempt === undefined ? undefined : nonNegativeInteger(body.max_units_per_attempt, "max_units_per_attempt");
      const reading = this.clock.now();
      const legacyDecision = this.policyGate.evaluate({
        action: "task.submit",
        tenant_id,
        task_id: optionalId("task_id", body.task_id) ?? "task_budget_check01",
        attempt_id: optionalId("attempt_id", body.attempt_id) ?? "attempt_budget_check01",
        execution_id: optionalId("execution_id", body.execution_id) ?? "exec_budget_check01",
        conversation_id: optionalId("conversation_id", body.conversation_id) ?? "conv_budget_check01",
        trace_id,
        monotonic_ms: reading.monotonic_ms,
        requested_at_utc: reading.utc_timestamp,
        principal,
        budget: {
          requested_units,
          remaining_units: legacyRemainingUnits,
          ...(legacyMaxUnitsPerAttempt === undefined ? {} : { max_units_per_attempt: legacyMaxUnitsPerAttempt }),
        },
      });
      if (!legacyDecision.allow) {
        return {
          schema_version: "nexus.token_budget.p7.v1",
          tenant_id,
          user_id,
          trace_id,
          policy_id: `policy_${tenant_id}_token_budget`,
          decision_id: legacyDecision.decision_id,
          status: "denied",
          code: legacyDecision.code ?? "PLATFORM_RATE_LIMITED",
          requested_units,
          remaining_units: legacyRemainingUnits,
          max_units_per_attempt: legacyMaxUnitsPerAttempt ?? legacyRemainingUnits,
          reasons: legacyDecision.reasons,
          reason_codes: ["TOKEN_BUDGET_EXCEEDED"],
          checked_at_utc: reading.utc_timestamp,
          monotonic_ms: reading.monotonic_ms,
        };
      }
    }
    return this.tokenBudget.check({
      tenant_id,
      user_id,
      agent_id: optionalId("agent_id", body.agent_id),
      task_id: optionalId("task_id", body.task_id),
      attempt_id: optionalId("attempt_id", body.attempt_id),
      execution_id: optionalId("execution_id", body.execution_id),
      conversation_id: optionalId("conversation_id", body.conversation_id),
      trace_id,
      requested_units,
      reason_code: "api_check",
    }, { consume: body.consume === true }) as unknown as JsonObject;
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

  #assertScheduledGoalAccess(goal: ScheduledGoalRecord, principal: Principal, manage: boolean): void {
    this.#assertTenant(principal, goal.tenant_id);
    if (manage) {
      if (goal.user_id === principal.user_id) {
        this.#require(principal, "task:submit");
        return;
      }
      this.#require(principal, "tenant:manage");
      return;
    }
    if (goal.user_id !== principal.user_id && !isTenantAdmin(principal) && !isPlatformAdmin(principal)) {
      this.#require(principal, "tenant:read");
    }
  }

  #syncScheduledTaskFromGoal(item: ScheduledGoalRunDueItem | ScheduledGoalRecord, state: TaskState): void {
    const task_id = "task_id" in item && item.task_id ? item.task_id : "last_task_id" in item ? item.last_task_id : undefined;
    const attempt_id = "attempt_id" in item && item.attempt_id ? item.attempt_id : "last_attempt_id" in item ? item.last_attempt_id : undefined;
    const execution_id = "execution_id" in item && item.execution_id ? item.execution_id : "last_execution_id" in item ? item.last_execution_id : undefined;
    if (!task_id || !attempt_id || !execution_id) return;
    const existing = this.#tasks.get(task_id);
    const reading = this.clock.now();
    const input = "input" in item && typeof item.input === "string"
      ? item.input
      : existing?.input ?? "Scheduled goal task";
    this.#tasks.set(task_id, {
      tenant_id: item.tenant_id,
      user_id: item.user_id ?? "user_scheduled_goals",
      agent_id: item.agent_id ?? "agent_scheduled_goals",
      task_id,
      attempt_id,
      execution_id,
      conversation_id: item.conversation_id ?? "conv_scheduled_goals",
      state,
      trace_id: item.trace_id,
      input,
      summary: "Scheduled goal task",
      artifact_ids: existing?.artifact_ids ?? [],
      created_at: existing?.created_at ?? reading.utc_timestamp,
      updated_at: reading.utc_timestamp,
    });
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
      tenant_id: resource.tenant_id ?? principal.tenant_id,
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
  if (error instanceof PlatformApiError || error instanceof PublicSurfaceError || error instanceof CoordinatorError || error instanceof PluginGovernanceError || error instanceof ScheduledGoalsError) return error.code;
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

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new PlatformApiError("PLATFORM_INVALID_REQUEST", "Boolean field is required", { field });
  return value;
}

function requiredArray(value: unknown, field: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new PlatformApiError("PLATFORM_INVALID_REQUEST", "Array field is required", { field });
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

function requiredConflictId(value: unknown): string {
  if (typeof value !== "string" || !/^conflict_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/.test(value)) {
    throw new PlatformApiError("PLATFORM_INVALID_REQUEST", "Memory conflict identifier is invalid", { field: "conflict_id" });
  }
  return value;
}

function optionalMemoryConflictStatus(value: unknown): "open" | "resolved" | "ignored" | undefined {
  if (value === undefined) return undefined;
  if (["open", "resolved", "ignored"].includes(String(value))) return value as "open" | "resolved" | "ignored";
  throw new PlatformApiError("PLATFORM_INVALID_REQUEST", "Memory conflict status is unsupported", { status: value });
}

function optionalScheduledGoalStatus(value: unknown): ScheduledGoalStatus | undefined {
  if (value === undefined) return undefined;
  if (["scheduled", "running", "completed", "cancelled", "failed", "paused", "blocked"].includes(String(value))) return value as ScheduledGoalStatus;
  throw new PlatformApiError("PLATFORM_INVALID_REQUEST", "Scheduled goal status is unsupported", { status: value });
}

function requiredScheduledGoalPatchStatus(value: unknown): "scheduled" | "paused" {
  if (value === "scheduled" || value === "paused") return value;
  throw new PlatformApiError("PLATFORM_INVALID_REQUEST", "Scheduled goal patch status is unsupported", { status: value });
}

function requiredMemoryConflictDecision(value: unknown): "resolve" | "ignore" {
  if (value === "resolve" || value === "ignore") return value;
  throw new PlatformApiError("PLATFORM_INVALID_REQUEST", "Memory conflict decision is unsupported", { decision: value });
}

function budgetLimitsPatch(value: JsonObject): Partial<TokenBudgetLimits> {
  const allowed = new Set(["tenant_units", "user_units", "agent_units", "task_units", "max_units_per_attempt"]);
  const limits: Partial<TokenBudgetLimits> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!allowed.has(key)) throw new PlatformApiError("PLATFORM_INVALID_REQUEST", "Token budget limit field is unsupported", { field: key });
    limits[key as keyof TokenBudgetLimits] = positiveInteger(item, key);
  }
  return limits;
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
