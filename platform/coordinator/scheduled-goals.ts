import { type PlatformClock, SystemClock } from "../clock/index.ts";
import { type EventBus, type PlatformEventEnvelope } from "../event-bus/index.ts";
import { type TraceContext } from "../observability/index.ts";
import { assertPublicRequestPayload, assertPublicResponsePayload, sanitizePublicDetails } from "../public-surface/index.ts";
import { type PolicyPrincipal } from "../policy-gate/index.ts";
import { assertMonotonicMs, assertPlatformId, assertUtcTimestamp } from "../task-state/index.ts";
import type { Coordinator, SubmitTaskResult } from "./index.ts";
import { estimateTokenBudgetUnits } from "./token-budget.ts";

export const SCHEDULED_GOALS_SCHEMA_VERSION = "nexus.scheduled_goal.p7.v1";
export const SCHEDULED_GOALS_DEFAULT_ENABLED = false;
export const SCHEDULED_GOALS_SCHEDULE_MODE = "cron_like_utc";
export const SCHEDULED_GOALS_EXECUTION_MODE = "manual_tick";
export const SCHEDULED_GOALS_RESOURCE_BUDGET_MODE = "alpha_in_memory_limits";
const SCHEDULED_GOALS_BLOCKED_PATTERN = /native[_-]?(?:url|path|session|error|agent|tool|memory|runtime)|raw_credential|credential_material|provider[_-]?(?:binding|runtime|agent|task|cancel)|(?:https?|wss?|ftp):\/\/|\/(?:opt|tmp|var|etc|home|usr)\//i;

export type ScheduledGoalStatus = "scheduled" | "running" | "completed" | "cancelled" | "failed" | "paused" | "blocked";
export type ScheduledGoalRunStatus = "submitted" | "blocked" | "failed" | "skipped";
export type ScheduledGoalReasonCode =
  | "SCHEDULED_GOALS_DISABLED"
  | "SCHEDULED_GOAL_CREATED"
  | "SCHEDULED_GOAL_UPDATED"
  | "SCHEDULED_GOAL_CANCELLED"
  | "SCHEDULED_GOAL_RETRIED"
  | "SCHEDULED_GOAL_DUE"
  | "SCHEDULED_GOAL_SUBMITTED"
  | "SCHEDULED_GOAL_BLOCKED"
  | "SCHEDULED_GOAL_FAILED";

export interface ScheduledGoalsConfig {
  schema_version: typeof SCHEDULED_GOALS_SCHEMA_VERSION;
  tenant_id: string;
  enabled: boolean;
  schedule_mode: typeof SCHEDULED_GOALS_SCHEDULE_MODE;
  execution_mode: typeof SCHEDULED_GOALS_EXECUTION_MODE;
  resource_budget: {
    budget_mode: typeof SCHEDULED_GOALS_RESOURCE_BUDGET_MODE;
    max_active_goals: number;
    max_due_per_tick: number;
    min_interval_minutes: number;
  };
  updated_at_utc: string;
  monotonic_ms: number;
  trace_id: string;
}

export interface ScheduledGoalRecord extends TraceContext {
  schema_version: typeof SCHEDULED_GOALS_SCHEMA_VERSION;
  scheduled_goal_id: string;
  status: ScheduledGoalStatus;
  cron: string;
  input: string;
  next_run_at_utc: string;
  last_run_at_utc?: string;
  last_run_status?: ScheduledGoalRunStatus;
  last_task_id?: string;
  last_attempt_id?: string;
  last_execution_id?: string;
  run_count: number;
  failure_count: number;
  budget_units: number;
  reason_codes: readonly ScheduledGoalReasonCode[];
  created_at_utc: string;
  updated_at_utc: string;
  monotonic_ms: number;
}

export interface ScheduledGoalCreateInput extends TraceContext {
  cron: string;
  input: string;
  budget_units?: number;
}

export interface ScheduledGoalUpdateInput {
  trace_id: string;
  cron?: string;
  input?: string;
  agent_id?: string;
  conversation_id?: string;
  budget_units?: number;
  status?: "scheduled" | "paused";
}

export interface ScheduledGoalActionInput {
  trace_id: string;
  reason: string;
}

export interface ScheduledGoalRunDueInput {
  tenant_id: string;
  trace_id: string;
  principal: PolicyPrincipal;
  owner_user_id?: string;
}

export interface ScheduledGoalRunDueItem extends TraceContext {
  scheduled_goal_id: string;
  status: ScheduledGoalRunStatus;
  task_id?: string;
  attempt_id?: string;
  execution_id?: string;
  next_run_at_utc?: string;
  reason_codes: readonly ScheduledGoalReasonCode[];
}

export interface ScheduledGoalRunDueResult {
  schema_version: typeof SCHEDULED_GOALS_SCHEMA_VERSION;
  tenant_id: string;
  trace_id: string;
  status: "completed" | "skipped";
  scanned_count: number;
  due_count: number;
  submitted_count: number;
  blocked_count: number;
  failed_count: number;
  items: readonly ScheduledGoalRunDueItem[];
  resource_budget: ScheduledGoalsConfig["resource_budget"];
  checked_at_utc: string;
  monotonic_ms: number;
}

export interface ScheduledGoalObservability {
  incrementMetric(input: TraceContext & { name: string; value?: number; labels?: Record<string, string>; monotonic_ms?: number; recorded_at_utc?: string }): unknown;
  recordLog(input: TraceContext & { level: "debug" | "info" | "warn" | "error"; message: string; component: string; fields?: Record<string, unknown>; monotonic_ms?: number; recorded_at_utc?: string }): unknown;
}

export class ScheduledGoalsError extends Error {
  readonly code: "PLATFORM_INVALID_REQUEST" | "PLATFORM_FORBIDDEN" | "PLATFORM_NOT_FOUND" | "PLATFORM_CONFLICT" | "PLATFORM_RATE_LIMITED" | "PLATFORM_INTERNAL_ERROR";
  readonly details: Record<string, unknown>;

  constructor(code: ScheduledGoalsError["code"], message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "ScheduledGoalsError";
    this.code = code;
    this.details = sanitizePublicDetails(details);
  }
}

interface StoredScheduledGoal extends ScheduledGoalRecord {
  parsed_cron: ParsedCron;
}

interface ParsedCron {
  expression: string;
  minute: readonly number[];
  hour: readonly number[];
  day_of_month: readonly number[];
  month: readonly number[];
  day_of_week: readonly number[];
}

export class LocalScheduledGoals {
  readonly #clock: PlatformClock;
  readonly #coordinator: Coordinator;
  readonly #eventBus?: EventBus;
  readonly #observability?: ScheduledGoalObservability;
  readonly #configs = new Map<string, ScheduledGoalsConfig>();
  readonly #goals = new Map<string, StoredScheduledGoal>();
  #sequence = 0;

  constructor(options: { clock?: PlatformClock; coordinator: Coordinator; eventBus?: EventBus; observability?: ScheduledGoalObservability }) {
    this.#clock = options.clock ?? new SystemClock();
    this.#coordinator = options.coordinator;
    this.#eventBus = options.eventBus;
    this.#observability = options.observability;
  }

  getConfig(tenant_id: string, trace_id: string): ScheduledGoalsConfig {
    assertPlatformId("tenant_id", tenant_id);
    assertPlatformId("trace_id", trace_id);
    return projectConfig(this.#configForTenant(tenant_id, trace_id));
  }

  updateConfig(input: { tenant_id: string; trace_id: string; enabled?: boolean; max_active_goals?: number; max_due_per_tick?: number; min_interval_minutes?: number }): ScheduledGoalsConfig {
    assertPublicRequestPayload(input);
    assertNoForbiddenScheduledGoalContent(input);
    assertPlatformId("tenant_id", input.tenant_id);
    assertPlatformId("trace_id", input.trace_id);
    const current = this.#configForTenant(input.tenant_id, input.trace_id);
    const reading = this.#clock.now();
    const updated: ScheduledGoalsConfig = {
      ...current,
      enabled: input.enabled ?? current.enabled,
      resource_budget: {
        budget_mode: SCHEDULED_GOALS_RESOURCE_BUDGET_MODE,
        max_active_goals: boundedInteger(input.max_active_goals ?? current.resource_budget.max_active_goals, "max_active_goals", 1, 500),
        max_due_per_tick: boundedInteger(input.max_due_per_tick ?? current.resource_budget.max_due_per_tick, "max_due_per_tick", 1, 100),
        min_interval_minutes: boundedInteger(input.min_interval_minutes ?? current.resource_budget.min_interval_minutes, "min_interval_minutes", 1, 1440),
      },
      updated_at_utc: reading.utc_timestamp,
      monotonic_ms: reading.monotonic_ms,
      trace_id: input.trace_id,
    };
    this.#configs.set(input.tenant_id, projectConfig(updated));
    this.#recordObservability("scheduled_goals.config_updated", updated, reading, { enabled: String(updated.enabled) });
    return projectConfig(updated);
  }

  create(input: ScheduledGoalCreateInput): ScheduledGoalRecord {
    assertPublicRequestPayload(input);
    assertNoForbiddenScheduledGoalContent(input);
    assertTrace(input);
    assertPlatformId("user_id", input.user_id);
    assertPlatformId("agent_id", input.agent_id);
    assertPlatformId("conversation_id", input.conversation_id);
    const config = this.#configForTenant(input.tenant_id, input.trace_id);
    if (this.#activeGoalCount(input.tenant_id) >= config.resource_budget.max_active_goals) {
      throw new ScheduledGoalsError("PLATFORM_RATE_LIMITED", "Scheduled goal active limit is exhausted", { reason_code: "SCHEDULED_GOAL_BLOCKED" });
    }
    const parsed = parseCron(input.cron, config.resource_budget.min_interval_minutes);
    const text = requiredText(input.input, "input");
    const reading = this.#clock.now();
    const goal: StoredScheduledGoal = {
      schema_version: SCHEDULED_GOALS_SCHEMA_VERSION,
      scheduled_goal_id: this.#nextGoalId(input.tenant_id),
      tenant_id: input.tenant_id,
      user_id: input.user_id,
      agent_id: input.agent_id,
      conversation_id: input.conversation_id,
      trace_id: input.trace_id,
      status: "scheduled",
      cron: parsed.expression,
      parsed_cron: parsed,
      input: text,
      next_run_at_utc: nextCronRunAt(parsed, reading.utc_timestamp),
      run_count: 0,
      failure_count: 0,
      budget_units: input.budget_units ?? estimateTokenBudgetUnits(text),
      reason_codes: ["SCHEDULED_GOAL_CREATED"],
      created_at_utc: reading.utc_timestamp,
      updated_at_utc: reading.utc_timestamp,
      monotonic_ms: reading.monotonic_ms,
    };
    this.#goals.set(goal.scheduled_goal_id, cloneGoal(goal));
    this.#publishGoalEvent("scheduled_goal.created", goal, reading, { reason_codes: goal.reason_codes });
    this.#recordObservability("scheduled_goals.created", goal, reading, { status: goal.status });
    return projectGoal(goal);
  }

  list(input: { tenant_id: string; user_id?: string; status?: ScheduledGoalStatus }): readonly ScheduledGoalRecord[] {
    assertPlatformId("tenant_id", input.tenant_id);
    if (input.user_id !== undefined) assertPlatformId("user_id", input.user_id);
    if (input.status !== undefined) requireStatus(input.status);
    return [...this.#goals.values()]
      .filter((goal) => goal.tenant_id === input.tenant_id)
      .filter((goal) => input.user_id === undefined || goal.user_id === input.user_id)
      .filter((goal) => input.status === undefined || goal.status === input.status)
      .sort((left, right) => left.next_run_at_utc.localeCompare(right.next_run_at_utc) || left.scheduled_goal_id.localeCompare(right.scheduled_goal_id))
      .map(projectGoal);
  }

  get(scheduled_goal_id: string): ScheduledGoalRecord {
    return projectGoal(this.#get(scheduled_goal_id));
  }

  update(scheduled_goal_id: string, input: ScheduledGoalUpdateInput): ScheduledGoalRecord {
    assertPublicRequestPayload(input);
    assertNoForbiddenScheduledGoalContent(input);
    const goal = this.#get(scheduled_goal_id);
    assertPlatformId("trace_id", input.trace_id);
    const config = this.#configForTenant(goal.tenant_id, input.trace_id);
    if (goal.status === "cancelled" && input.status !== "scheduled") {
      throw new ScheduledGoalsError("PLATFORM_CONFLICT", "Cancelled scheduled goal must be retried before update", { scheduled_goal_id });
    }
    if (input.agent_id !== undefined) goal.agent_id = assertPlatformId("agent_id", input.agent_id);
    if (input.conversation_id !== undefined) goal.conversation_id = assertPlatformId("conversation_id", input.conversation_id);
    if (input.input !== undefined) {
      goal.input = requiredText(input.input, "input");
      goal.budget_units = input.budget_units ?? estimateTokenBudgetUnits(goal.input);
    }
    if (input.budget_units !== undefined) goal.budget_units = boundedInteger(input.budget_units, "budget_units", 1, 5000);
    if (input.cron !== undefined) {
      goal.parsed_cron = parseCron(input.cron, config.resource_budget.min_interval_minutes);
      goal.cron = goal.parsed_cron.expression;
      goal.next_run_at_utc = nextCronRunAt(goal.parsed_cron, this.#clock.now().utc_timestamp);
    }
    if (input.status !== undefined) goal.status = input.status;
    const reading = this.#clock.now();
    goal.trace_id = input.trace_id;
    goal.reason_codes = ["SCHEDULED_GOAL_UPDATED"];
    goal.updated_at_utc = reading.utc_timestamp;
    goal.monotonic_ms = reading.monotonic_ms;
    this.#goals.set(goal.scheduled_goal_id, cloneGoal(goal));
    this.#publishGoalEvent("scheduled_goal.updated", goal, reading, { reason_codes: goal.reason_codes });
    this.#recordObservability("scheduled_goals.updated", goal, reading, { status: goal.status });
    return projectGoal(goal);
  }

  cancel(scheduled_goal_id: string, input: ScheduledGoalActionInput, principal: PolicyPrincipal): ScheduledGoalRecord {
    assertPublicRequestPayload(input);
    assertNoForbiddenScheduledGoalContent(input);
    const goal = this.#get(scheduled_goal_id);
    assertPlatformId("trace_id", input.trace_id);
    requiredText(input.reason, "reason");
    const reading = this.#clock.now();
    const taskTraceId = goal.trace_id;
    if (goal.last_task_id && goal.last_attempt_id && goal.last_execution_id) {
      try {
        this.#coordinator.submitTaskCommand({
          schema_version: "nexus.task_command.p4.v1",
          tenant_id: goal.tenant_id,
          user_id: goal.user_id ?? principal.user_id,
          agent_id: goal.agent_id ?? "agent_scheduled_goals",
          task_id: goal.last_task_id,
          attempt_id: goal.last_attempt_id,
          execution_id: goal.last_execution_id,
          conversation_id: goal.conversation_id ?? "conv_scheduled_goals",
          trace_id: taskTraceId,
          command: "cancel_attempt",
          requested_at_utc: reading.utc_timestamp,
          monotonic_ms: reading.monotonic_ms,
          idempotency_key: `scheduled-goal-cancel:${scheduled_goal_id}:${goal.last_attempt_id}:${taskTraceId}`,
          reason: input.reason,
          source: { kind: "api", request_id: this.#nextRequestId(taskTraceId), client: "platform-api" },
        }, { principal });
      } catch (error) {
        this.#recordObservability("scheduled_goals.cancel_warning", goal, reading, { code: errorCode(error) }, "warn");
      }
    }
    goal.status = "cancelled";
    goal.trace_id = input.trace_id;
    goal.reason_codes = ["SCHEDULED_GOAL_CANCELLED"];
    goal.updated_at_utc = reading.utc_timestamp;
    goal.monotonic_ms = reading.monotonic_ms;
    this.#goals.set(goal.scheduled_goal_id, cloneGoal(goal));
    this.#publishGoalEvent("scheduled_goal.cancelled", goal, reading, { reason_codes: goal.reason_codes });
    this.#recordObservability("scheduled_goals.cancelled", goal, reading, { status: goal.status });
    return projectGoal(goal);
  }

  retry(scheduled_goal_id: string, input: ScheduledGoalActionInput): ScheduledGoalRecord {
    assertPublicRequestPayload(input);
    assertNoForbiddenScheduledGoalContent(input);
    const goal = this.#get(scheduled_goal_id);
    assertPlatformId("trace_id", input.trace_id);
    requiredText(input.reason, "reason");
    if (!["cancelled", "failed", "completed"].includes(goal.status)) {
      throw new ScheduledGoalsError("PLATFORM_CONFLICT", "Only cancelled, failed, or completed scheduled goals can be retried", {
        scheduled_goal_id,
        status: goal.status,
      });
    }
    const reading = this.#clock.now();
    goal.status = "scheduled";
    goal.next_run_at_utc = nextCronRunAt(goal.parsed_cron, reading.utc_timestamp);
    goal.trace_id = input.trace_id;
    goal.reason_codes = ["SCHEDULED_GOAL_RETRIED"];
    goal.updated_at_utc = reading.utc_timestamp;
    goal.monotonic_ms = reading.monotonic_ms;
    this.#goals.set(goal.scheduled_goal_id, cloneGoal(goal));
    this.#publishGoalEvent("scheduled_goal.updated", goal, reading, { reason_codes: goal.reason_codes });
    this.#recordObservability("scheduled_goals.retried", goal, reading, { status: goal.status });
    return projectGoal(goal);
  }

  runDue(input: ScheduledGoalRunDueInput): ScheduledGoalRunDueResult {
    assertPublicRequestPayload({ tenant_id: input.tenant_id, trace_id: input.trace_id, owner_user_id: input.owner_user_id });
    assertNoForbiddenScheduledGoalContent({ tenant_id: input.tenant_id, trace_id: input.trace_id, owner_user_id: input.owner_user_id });
    assertPlatformId("tenant_id", input.tenant_id);
    assertPlatformId("trace_id", input.trace_id);
    if (input.owner_user_id !== undefined) assertPlatformId("user_id", input.owner_user_id);
    const config = this.#configForTenant(input.tenant_id, input.trace_id);
    const reading = this.#clock.now();
    const candidates = this.list({ tenant_id: input.tenant_id, user_id: input.owner_user_id, status: "scheduled" });
    const due = candidates.filter((goal) => Date.parse(goal.next_run_at_utc) <= Date.parse(reading.utc_timestamp));

    if (!config.enabled) {
      const result = this.#runDueResult(input.tenant_id, input.trace_id, "skipped", candidates.length, due.length, [], reading, config.resource_budget);
      this.#recordObservability("scheduled_goals.tick_skipped", { tenant_id: input.tenant_id, trace_id: input.trace_id }, reading, { reason_code: "SCHEDULED_GOALS_DISABLED" });
      return projectRunDueResult(result);
    }

    const limited = due.slice(0, config.resource_budget.max_due_per_tick);
    const items: ScheduledGoalRunDueItem[] = [];
    for (const projected of limited) {
      const goal = this.#get(projected.scheduled_goal_id);
      const item = this.#submitDueGoal(goal, input, reading);
      items.push(item);
    }
    const result = this.#runDueResult(input.tenant_id, input.trace_id, "completed", candidates.length, due.length, items, reading, config.resource_budget);
    this.#recordObservability("scheduled_goals.tick_completed", { tenant_id: input.tenant_id, trace_id: input.trace_id }, reading, {
      due_count: String(result.due_count),
      submitted_count: String(result.submitted_count),
      blocked_count: String(result.blocked_count),
    });
    return projectRunDueResult(result);
  }

  #submitDueGoal(goal: StoredScheduledGoal, input: ScheduledGoalRunDueInput, reading: { utc_timestamp: string; monotonic_ms: number }): ScheduledGoalRunDueItem {
    const suffix = `${input.trace_id.replace(/^trace_/, "")}_${String(++this.#sequence).padStart(4, "0")}`;
    const task_id = `task_scheduled_${suffix}`;
    const attempt_id = `attempt_scheduled_${suffix}`;
    const execution_id = `exec_scheduled_${suffix}`;
    goal.status = "running";
    goal.trace_id = input.trace_id;
    goal.updated_at_utc = reading.utc_timestamp;
    goal.monotonic_ms = reading.monotonic_ms;
    this.#publishGoalEvent("scheduled_goal.started", goal, reading, { reason_codes: ["SCHEDULED_GOAL_DUE"] });
    try {
      const submitted: SubmitTaskResult = this.#coordinator.submitTask({
        schema_version: "nexus.task_request.v1",
        tenant_id: goal.tenant_id,
        user_id: goal.user_id ?? input.principal.user_id,
        agent_id: goal.agent_id ?? "agent_scheduled_goals",
        task_id,
        attempt_id,
        execution_id,
        conversation_id: goal.conversation_id ?? "conv_scheduled_goals",
        trace_id: input.trace_id,
        input: { kind: "text", text: goal.input, metadata: { scheduled_goal_id: goal.scheduled_goal_id } },
        source: { kind: "scheduler" },
        policy_context: { schedule_mode: SCHEDULED_GOALS_SCHEDULE_MODE, execution_mode: SCHEDULED_GOALS_EXECUTION_MODE },
        idempotency_key: `scheduled-goal:${goal.scheduled_goal_id}:${goal.next_run_at_utc}`,
        created_at_utc: reading.utc_timestamp,
        monotonic_ms: reading.monotonic_ms,
      }, { principal: input.principal, token_budget_units: goal.budget_units });
      goal.run_count += 1;
      goal.last_run_at_utc = reading.utc_timestamp;
      goal.last_task_id = task_id;
      goal.last_attempt_id = attempt_id;
      goal.last_execution_id = execution_id;
      goal.next_run_at_utc = nextCronRunAt(goal.parsed_cron, reading.utc_timestamp);
      goal.status = submitted.accepted ? "scheduled" : "blocked";
      goal.last_run_status = submitted.accepted ? "submitted" : "blocked";
      goal.reason_codes = [submitted.accepted ? "SCHEDULED_GOAL_SUBMITTED" : "SCHEDULED_GOAL_BLOCKED"];
      if (!submitted.accepted) goal.failure_count += 1;
      goal.updated_at_utc = reading.utc_timestamp;
      goal.monotonic_ms = reading.monotonic_ms + 1;
      this.#goals.set(goal.scheduled_goal_id, cloneGoal(goal));
      this.#publishGoalEvent(submitted.accepted ? "scheduled_goal.completed" : "scheduled_goal.blocked", goal, { utc_timestamp: reading.utc_timestamp, monotonic_ms: reading.monotonic_ms + 1 }, {
        task_id,
        attempt_id,
        execution_id,
        reason_codes: goal.reason_codes,
      });
      this.#recordObservability(submitted.accepted ? "scheduled_goals.submitted" : "scheduled_goals.blocked", goal, { utc_timestamp: reading.utc_timestamp, monotonic_ms: reading.monotonic_ms + 1 }, { status: goal.last_run_status });
      return {
        tenant_id: goal.tenant_id,
        user_id: goal.user_id,
        agent_id: goal.agent_id,
        task_id,
        attempt_id,
        execution_id,
        conversation_id: goal.conversation_id,
        trace_id: input.trace_id,
        scheduled_goal_id: goal.scheduled_goal_id,
        status: goal.last_run_status,
        next_run_at_utc: goal.next_run_at_utc,
        reason_codes: goal.reason_codes,
      };
    } catch (error) {
      goal.run_count += 1;
      goal.failure_count += 1;
      goal.last_run_at_utc = reading.utc_timestamp;
      goal.status = "failed";
      goal.last_run_status = "failed";
      goal.reason_codes = ["SCHEDULED_GOAL_FAILED"];
      goal.updated_at_utc = reading.utc_timestamp;
      goal.monotonic_ms = reading.monotonic_ms + 1;
      this.#goals.set(goal.scheduled_goal_id, cloneGoal(goal));
      this.#publishGoalEvent("scheduled_goal.blocked", goal, { utc_timestamp: reading.utc_timestamp, monotonic_ms: reading.monotonic_ms + 1 }, { reason_codes: goal.reason_codes, code: errorCode(error) });
      this.#recordObservability("scheduled_goals.failed", goal, { utc_timestamp: reading.utc_timestamp, monotonic_ms: reading.monotonic_ms + 1 }, { code: errorCode(error) }, "warn");
      return {
        tenant_id: goal.tenant_id,
        user_id: goal.user_id,
        agent_id: goal.agent_id,
        conversation_id: goal.conversation_id,
        trace_id: input.trace_id,
        scheduled_goal_id: goal.scheduled_goal_id,
        status: "failed",
        reason_codes: goal.reason_codes,
      };
    }
  }

  #runDueResult(
    tenant_id: string,
    trace_id: string,
    status: ScheduledGoalRunDueResult["status"],
    scanned_count: number,
    due_count: number,
    items: readonly ScheduledGoalRunDueItem[],
    reading: { utc_timestamp: string; monotonic_ms: number },
    resource_budget: ScheduledGoalsConfig["resource_budget"],
  ): ScheduledGoalRunDueResult {
    return {
      schema_version: SCHEDULED_GOALS_SCHEMA_VERSION,
      tenant_id,
      trace_id,
      status,
      scanned_count,
      due_count,
      submitted_count: items.filter((item) => item.status === "submitted").length,
      blocked_count: items.filter((item) => item.status === "blocked").length,
      failed_count: items.filter((item) => item.status === "failed").length,
      items: items.map((item) => ({ ...item, reason_codes: [...item.reason_codes] })),
      resource_budget: { ...resource_budget },
      checked_at_utc: reading.utc_timestamp,
      monotonic_ms: reading.monotonic_ms,
    };
  }

  #configForTenant(tenant_id: string, trace_id: string): ScheduledGoalsConfig {
    const existing = this.#configs.get(tenant_id);
    if (existing) return existing;
    const reading = this.#clock.now();
    const config: ScheduledGoalsConfig = {
      schema_version: SCHEDULED_GOALS_SCHEMA_VERSION,
      tenant_id,
      enabled: SCHEDULED_GOALS_DEFAULT_ENABLED,
      schedule_mode: SCHEDULED_GOALS_SCHEDULE_MODE,
      execution_mode: SCHEDULED_GOALS_EXECUTION_MODE,
      resource_budget: {
        budget_mode: SCHEDULED_GOALS_RESOURCE_BUDGET_MODE,
        max_active_goals: 100,
        max_due_per_tick: 25,
        min_interval_minutes: 5,
      },
      updated_at_utc: reading.utc_timestamp,
      monotonic_ms: reading.monotonic_ms,
      trace_id,
    };
    this.#configs.set(tenant_id, projectConfig(config));
    return config;
  }

  #activeGoalCount(tenant_id: string): number {
    return [...this.#goals.values()].filter((goal) => goal.tenant_id === tenant_id && ["scheduled", "paused", "blocked"].includes(goal.status)).length;
  }

  #get(scheduled_goal_id: string): StoredScheduledGoal {
    assertScheduledGoalId(scheduled_goal_id);
    const goal = this.#goals.get(scheduled_goal_id);
    if (!goal) throw new ScheduledGoalsError("PLATFORM_NOT_FOUND", "Scheduled goal not found", { scheduled_goal_id });
    return cloneGoal(goal);
  }

  #nextGoalId(tenant_id: string): string {
    this.#sequence += 1;
    return `scheduled_goal_${tenant_id.replace(/^tenant_/, "")}_${String(this.#sequence).padStart(4, "0")}`;
  }

  #nextRequestId(trace_id: string): string {
    this.#sequence += 1;
    return `req_${trace_id.replace(/^trace_/, "")}_${String(this.#sequence).padStart(4, "0")}`;
  }

  #publishGoalEvent(event_type: PlatformEventEnvelope["event_type"], goal: TraceContext & { scheduled_goal_id?: string; status?: string }, reading: { utc_timestamp: string; monotonic_ms: number }, payload: Record<string, unknown>): void {
    this.#eventBus?.publish({
      schema_version: "nexus.event_envelope.v1",
      event_id: `event_${goal.trace_id.replace(/^trace_/, "")}_${String(++this.#sequence).padStart(4, "0")}`,
      event_type,
      tenant_id: goal.tenant_id,
      user_id: goal.user_id,
      agent_id: goal.agent_id,
      task_id: goal.task_id,
      attempt_id: goal.attempt_id,
      execution_id: goal.execution_id,
      conversation_id: goal.conversation_id,
      trace_id: goal.trace_id,
      occurred_at_utc: reading.utc_timestamp,
      monotonic_ms: reading.monotonic_ms,
      producer: { service: "coordinator", component: "scheduled-goals" },
      subject: { kind: "scheduled_goal", id: goal.scheduled_goal_id ?? goal.trace_id },
      payload: sanitizePublicDetails({ ...payload, status: goal.status }),
    } as PlatformEventEnvelope);
  }

  #recordObservability(name: string, context: TraceContext, reading: { utc_timestamp: string; monotonic_ms: number }, labels: Record<string, string> = {}, level: "info" | "warn" = "info"): void {
    this.#observability?.incrementMetric({
      tenant_id: context.tenant_id,
      user_id: context.user_id,
      agent_id: context.agent_id,
      task_id: context.task_id,
      attempt_id: context.attempt_id,
      execution_id: context.execution_id,
      conversation_id: context.conversation_id,
      trace_id: context.trace_id,
      name,
      value: 1,
      labels,
      recorded_at_utc: reading.utc_timestamp,
      monotonic_ms: reading.monotonic_ms,
    });
    this.#observability?.recordLog({
      tenant_id: context.tenant_id,
      user_id: context.user_id,
      agent_id: context.agent_id,
      task_id: context.task_id,
      attempt_id: context.attempt_id,
      execution_id: context.execution_id,
      conversation_id: context.conversation_id,
      trace_id: context.trace_id,
      level,
      message: name,
      component: "scheduled-goals",
      fields: labels,
      recorded_at_utc: reading.utc_timestamp,
      monotonic_ms: reading.monotonic_ms,
    });
  }
}

export function assertScheduledGoalId(value: unknown): string {
  if (typeof value !== "string" || !/^scheduled_goal_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/.test(value)) {
    throw new ScheduledGoalsError("PLATFORM_INVALID_REQUEST", "Scheduled goal identifier is invalid", { field: "scheduled_goal_id" });
  }
  return value;
}

function parseCron(expression: string, minIntervalMinutes: number): ParsedCron {
  if (typeof expression !== "string" || !expression.trim()) throw new ScheduledGoalsError("PLATFORM_INVALID_REQUEST", "Cron schedule is required", { field: "cron" });
  const fields = expression.trim().replace(/\s+/g, " ").split(" ");
  if (fields.length !== 5) throw new ScheduledGoalsError("PLATFORM_INVALID_REQUEST", "Cron schedule must use five UTC fields", { field: "cron" });
  const parsed: ParsedCron = {
    expression: fields.join(" "),
    minute: parseCronField(fields[0], 0, 59, "minute"),
    hour: parseCronField(fields[1], 0, 23, "hour"),
    day_of_month: parseCronField(fields[2], 1, 31, "day_of_month"),
    month: parseCronField(fields[3], 1, 12, "month"),
    day_of_week: parseCronField(fields[4], 0, 6, "day_of_week"),
  };
  const first = nextCronRunAt(parsed, "2026-08-27T00:00:00.000Z");
  const second = nextCronRunAt(parsed, first);
  const intervalMinutes = (Date.parse(second) - Date.parse(first)) / 60000;
  if (intervalMinutes < minIntervalMinutes) {
    throw new ScheduledGoalsError("PLATFORM_RATE_LIMITED", "Cron schedule is more frequent than the alpha resource budget", { min_interval_minutes: minIntervalMinutes });
  }
  return parsed;
}

function parseCronField(field: string, min: number, max: number, name: string): readonly number[] {
  const values = new Set<number>();
  for (const part of field.split(",")) {
    if (!part) throw new ScheduledGoalsError("PLATFORM_INVALID_REQUEST", "Cron field is invalid", { field: name });
    const [rangePart, stepPart] = part.split("/", 2);
    const step = stepPart === undefined ? 1 : boundedInteger(Number(stepPart), `${name}_step`, 1, max - min + 1);
    const [start, end] = rangePart === "*"
      ? [min, max]
      : rangePart.includes("-")
        ? rangePart.split("-", 2).map((item) => boundedInteger(Number(item), name, min, max)) as [number, number]
        : [boundedInteger(Number(rangePart), name, min, max), boundedInteger(Number(rangePart), name, min, max)];
    if (start > end) throw new ScheduledGoalsError("PLATFORM_INVALID_REQUEST", "Cron range is invalid", { field: name });
    for (let value = start; value <= end; value += step) values.add(value);
  }
  return [...values].sort((left, right) => left - right);
}

function nextCronRunAt(parsed: ParsedCron, afterUtc: string): string {
  assertUtcTimestamp(afterUtc, "scheduled_goal.after_utc");
  const start = Math.floor(Date.parse(afterUtc) / 60000) * 60000 + 60000;
  const horizonMinutes = 366 * 24 * 60;
  for (let offset = 0; offset < horizonMinutes; offset += 1) {
    const candidate = new Date(start + offset * 60000);
    if (
      parsed.minute.includes(candidate.getUTCMinutes())
      && parsed.hour.includes(candidate.getUTCHours())
      && parsed.day_of_month.includes(candidate.getUTCDate())
      && parsed.month.includes(candidate.getUTCMonth() + 1)
      && parsed.day_of_week.includes(candidate.getUTCDay())
    ) {
      return candidate.toISOString();
    }
  }
  throw new ScheduledGoalsError("PLATFORM_INVALID_REQUEST", "Cron schedule has no due time within the alpha horizon", { field: "cron" });
}

function assertTrace(context: TraceContext): void {
  assertPlatformId("tenant_id", context.tenant_id);
  assertPlatformId("trace_id", context.trace_id);
  if (context.user_id !== undefined) assertPlatformId("user_id", context.user_id);
  if (context.agent_id !== undefined) assertPlatformId("agent_id", context.agent_id);
  if (context.task_id !== undefined) assertPlatformId("task_id", context.task_id);
  if (context.attempt_id !== undefined) assertPlatformId("attempt_id", context.attempt_id);
  if (context.execution_id !== undefined) assertPlatformId("execution_id", context.execution_id);
  if (context.conversation_id !== undefined) assertPlatformId("conversation_id", context.conversation_id);
}

function boundedInteger(value: unknown, field: string, min: number, max: number): number {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    throw new ScheduledGoalsError("PLATFORM_INVALID_REQUEST", "Integer field is outside the supported range", { field, min, max });
  }
  return Number(value);
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new ScheduledGoalsError("PLATFORM_INVALID_REQUEST", "Text field is required", { field });
  return value.trim();
}

function assertNoForbiddenScheduledGoalContent(value: unknown): void {
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item);
      return;
    }
    if (candidate && typeof candidate === "object") {
      for (const [key, item] of Object.entries(candidate)) {
        if (SCHEDULED_GOALS_BLOCKED_PATTERN.test(key)) {
          throw new ScheduledGoalsError("PLATFORM_INVALID_REQUEST", "Scheduled goal payload contains a non-platform field", { field: key });
        }
        visit(item);
      }
      return;
    }
    if (typeof candidate === "string" && SCHEDULED_GOALS_BLOCKED_PATTERN.test(candidate)) {
      throw new ScheduledGoalsError("PLATFORM_INVALID_REQUEST", "Scheduled goal payload contains a non-platform marker");
    }
  };
  visit(value);
}

function requireStatus(value: unknown): ScheduledGoalStatus {
  if (["scheduled", "running", "completed", "cancelled", "failed", "paused", "blocked"].includes(String(value))) return value as ScheduledGoalStatus;
  throw new ScheduledGoalsError("PLATFORM_INVALID_REQUEST", "Scheduled goal status is unsupported", { status: value });
}

function projectConfig(config: ScheduledGoalsConfig): ScheduledGoalsConfig {
  const projected = JSON.parse(JSON.stringify(config)) as ScheduledGoalsConfig;
  assertMonotonicMs(projected.monotonic_ms, "scheduled_goal.monotonic_ms");
  assertPublicResponsePayload(projected);
  return projected;
}

function projectGoal(goal: StoredScheduledGoal | ScheduledGoalRecord): ScheduledGoalRecord {
  const { parsed_cron: _parsed, ...publicGoal } = goal as StoredScheduledGoal;
  const projected = JSON.parse(JSON.stringify(publicGoal)) as ScheduledGoalRecord;
  assertPublicResponsePayload(projected);
  return projected;
}

function projectRunDueResult(result: ScheduledGoalRunDueResult): ScheduledGoalRunDueResult {
  const projected = JSON.parse(JSON.stringify(result)) as ScheduledGoalRunDueResult;
  assertPublicResponsePayload(projected);
  return projected;
}

function cloneGoal(goal: StoredScheduledGoal): StoredScheduledGoal {
  return JSON.parse(JSON.stringify(goal)) as StoredScheduledGoal;
}

function errorCode(error: unknown): string {
  return error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : "PLATFORM_INTERNAL_ERROR";
}
