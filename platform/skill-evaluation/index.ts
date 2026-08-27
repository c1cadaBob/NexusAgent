import { type PlatformClock, SystemClock } from "../clock/index.ts";
import type { PublicCapabilityDescriptor, PublicPluginInventoryEntry } from "../plugin-governance/index.ts";
import { assertPublicRequestPayload, assertPublicResponsePayload, sanitizePublicDetails } from "../public-surface/index.ts";
import { assertPlatformId } from "../task-state/index.ts";

export const SKILL_EVALUATION_SCHEMA_VERSION = "nexus.skill_evaluation.p7.v1";
export const SKILL_EVALUATION_DEFAULT_ENABLED = false;
export const SKILL_EVALUATION_MODE = "manual";
export const SKILL_EVALUATION_CORPUS = "approved_rejected_disabled";
const SKILL_EVALUATION_BLOCKED_PATTERN = /Hermes|OpenClaw|DeepSeek|\bDSH\b|native_|raw_credential|credential_material|provider_(?:binding|runtime|agent|task|cancel)|source_ref|(?:https?|wss?|ftp):\/\/|\/(?:opt|tmp|var|etc|home|usr)\//i;

export type SkillEvaluationRunStatus = "passed" | "failed" | "skipped";
export type SkillEvaluationCaseStatus = "passed" | "failed" | "skipped";
export type SkillEvaluationOutcome = "visible" | "blocked" | "skipped";

export interface SkillEvaluationConfig {
  schema_version: typeof SKILL_EVALUATION_SCHEMA_VERSION;
  tenant_id: string;
  suite_id: string;
  enabled: boolean;
  mode: typeof SKILL_EVALUATION_MODE;
  corpus: typeof SKILL_EVALUATION_CORPUS;
  resource_budget: {
    evaluation_mode: "deterministic_regression";
    max_cases: number;
  };
  updated_at_utc: string;
  monotonic_ms: number;
  trace_id: string;
}

export interface SkillEvaluationCaseResult {
  case_id: string;
  candidate_id: string;
  candidate_kind: "capability" | "plugin_inventory" | "blocked_fixture";
  capability_type?: string;
  expected_outcome: SkillEvaluationOutcome;
  actual_outcome: SkillEvaluationOutcome;
  status: SkillEvaluationCaseStatus;
  reason_codes: readonly string[];
}

export interface SkillEvaluationRunReport {
  schema_version: typeof SKILL_EVALUATION_SCHEMA_VERSION;
  tenant_id: string;
  run_id: string;
  suite_id: string;
  status: SkillEvaluationRunStatus;
  totals: {
    total_cases: number;
    passed_cases: number;
    failed_cases: number;
    skipped_cases: number;
    approved_cases: number;
    rejected_disabled_cases: number;
  };
  cases: readonly SkillEvaluationCaseResult[];
  resource_budget: {
    evaluation_mode: "deterministic_regression";
    max_cases: number;
    evaluated_cases: number;
  };
  started_at_utc: string;
  completed_at_utc: string;
  monotonic_ms: number;
  trace_id: string;
  reason_codes: readonly string[];
}

export interface SkillEvaluationCatalog {
  listCapabilities(options: { tenant_id?: string; include_disabled?: boolean }): readonly PublicCapabilityDescriptor[];
  listInventory(): readonly PublicPluginInventoryEntry[];
}

export interface SkillEvaluationObservability {
  incrementMetric(input: {
    tenant_id: string;
    user_id?: string;
    trace_id: string;
    name: string;
    value?: number;
    labels?: Record<string, string>;
    recorded_at_utc?: string;
    monotonic_ms?: number;
  }): unknown;
  recordLog(input: {
    tenant_id: string;
    user_id?: string;
    trace_id: string;
    level: "debug" | "info" | "warn" | "error";
    message: string;
    component: string;
    fields?: Record<string, unknown>;
    recorded_at_utc?: string;
    monotonic_ms?: number;
  }): unknown;
}

export class SkillEvaluationError extends Error {
  readonly code: "PLATFORM_INVALID_REQUEST" | "PLATFORM_FORBIDDEN" | "PLATFORM_NOT_FOUND" | "PLATFORM_INTERNAL_ERROR";
  readonly details: Record<string, unknown>;

  constructor(code: SkillEvaluationError["code"], message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "SkillEvaluationError";
    this.code = code;
    this.details = sanitizePublicDetails(details);
  }
}

interface StoredConfig extends SkillEvaluationConfig {}

export class LocalSkillEvaluation {
  readonly #clock: PlatformClock;
  readonly #catalog: SkillEvaluationCatalog;
  readonly #observability?: SkillEvaluationObservability;
  readonly #configs = new Map<string, StoredConfig>();
  readonly #runs = new Map<string, SkillEvaluationRunReport>();
  #sequence = 0;

  constructor(options: { clock?: PlatformClock; catalog: SkillEvaluationCatalog; observability?: SkillEvaluationObservability }) {
    this.#clock = options.clock ?? new SystemClock();
    this.#catalog = options.catalog;
    this.#observability = options.observability;
  }

  getConfig(tenant_id: string, trace_id: string): SkillEvaluationConfig {
    assertPlatformId("tenant_id", tenant_id);
    assertPlatformId("trace_id", trace_id);
    return projectConfig(this.#configForTenant(tenant_id, trace_id));
  }

  updateConfig(input: { tenant_id: string; trace_id: string; enabled?: boolean; max_cases?: number }): SkillEvaluationConfig {
    assertPublicRequestPayload(input);
    assertPlatformId("tenant_id", input.tenant_id);
    assertPlatformId("trace_id", input.trace_id);
    const current = this.#configForTenant(input.tenant_id, input.trace_id);
    if (input.enabled !== undefined && typeof input.enabled !== "boolean") {
      throw new SkillEvaluationError("PLATFORM_INVALID_REQUEST", "Skill evaluation enabled flag must be boolean", { field: "enabled" });
    }
    if (input.max_cases !== undefined && (!Number.isInteger(input.max_cases) || input.max_cases < 1 || input.max_cases > 50)) {
      throw new SkillEvaluationError("PLATFORM_INVALID_REQUEST", "Skill evaluation max_cases must be between 1 and 50", { field: "max_cases" });
    }
    const reading = this.#clock.now();
    const updated: StoredConfig = {
      ...current,
      enabled: input.enabled ?? current.enabled,
      resource_budget: {
        ...current.resource_budget,
        max_cases: input.max_cases ?? current.resource_budget.max_cases,
      },
      updated_at_utc: reading.utc_timestamp,
      monotonic_ms: reading.monotonic_ms,
      trace_id: input.trace_id,
    };
    this.#configs.set(input.tenant_id, updated);
    return projectConfig(updated);
  }

  run(input: { tenant_id: string; trace_id: string; requested_by_user_id?: string; inject_failure?: boolean }): SkillEvaluationRunReport {
    assertPublicRequestPayload(input);
    assertPlatformId("tenant_id", input.tenant_id);
    assertPlatformId("trace_id", input.trace_id);
    if (input.requested_by_user_id !== undefined) assertPlatformId("user_id", input.requested_by_user_id);
    const config = this.#configForTenant(input.tenant_id, input.trace_id);
    if (!config.enabled) {
      throw new SkillEvaluationError("PLATFORM_FORBIDDEN", "Skill evaluation is disabled", { reason_code: "SKILL_EVALUATION_DISABLED" });
    }

    const started = this.#clock.now();
    const run_id = this.#nextRunId(input.tenant_id);
    try {
      if (input.inject_failure) throw new Error("skill evaluation deterministic runner failure with native_url redacted");
      const cases = buildEvaluationCases({ tenant_id: input.tenant_id, catalog: this.#catalog, max_cases: config.resource_budget.max_cases });
      const report = buildReport({ tenant_id: input.tenant_id, trace_id: input.trace_id, run_id, config, cases, started_at_utc: started.utc_timestamp, monotonic_ms: started.monotonic_ms });
      this.#runs.set(run_id, report);
      recordSkillEvaluation(report, this.#observability, input.requested_by_user_id);
      return projectReport(report);
    } catch (error) {
      const report = buildFailureReport({ tenant_id: input.tenant_id, trace_id: input.trace_id, run_id, config, started_at_utc: started.utc_timestamp, monotonic_ms: started.monotonic_ms, error });
      this.#runs.set(run_id, report);
      recordSkillEvaluation(report, this.#observability, input.requested_by_user_id);
      return projectReport(report);
    }
  }

  listRuns(tenant_id: string): readonly SkillEvaluationRunReport[] {
    assertPlatformId("tenant_id", tenant_id);
    return [...this.#runs.values()]
      .filter((run) => run.tenant_id === tenant_id)
      .sort((left, right) => left.monotonic_ms - right.monotonic_ms)
      .map(projectReport);
  }

  getRun(tenant_id: string, run_id: string): SkillEvaluationRunReport {
    assertPlatformId("tenant_id", tenant_id);
    requireRunId(run_id);
    const report = this.#runs.get(run_id);
    if (!report || report.tenant_id !== tenant_id) {
      throw new SkillEvaluationError("PLATFORM_NOT_FOUND", "Skill evaluation run not found", { run_id });
    }
    return projectReport(report);
  }

  #configForTenant(tenant_id: string, trace_id: string): StoredConfig {
    const existing = this.#configs.get(tenant_id);
    if (existing) return existing;
    const reading = this.#clock.now();
    const config: StoredConfig = {
      schema_version: SKILL_EVALUATION_SCHEMA_VERSION,
      tenant_id,
      suite_id: suiteIdForTenant(tenant_id),
      enabled: SKILL_EVALUATION_DEFAULT_ENABLED,
      mode: SKILL_EVALUATION_MODE,
      corpus: SKILL_EVALUATION_CORPUS,
      resource_budget: { evaluation_mode: "deterministic_regression", max_cases: 25 },
      updated_at_utc: reading.utc_timestamp,
      monotonic_ms: reading.monotonic_ms,
      trace_id,
    };
    this.#configs.set(tenant_id, config);
    return config;
  }

  #nextRunId(tenant_id: string): string {
    this.#sequence += 1;
    return `skill_eval_run_${tenant_id.replace(/^tenant_/, "")}_${String(this.#sequence).padStart(4, "0")}`;
  }
}

function buildEvaluationCases(input: { tenant_id: string; catalog: SkillEvaluationCatalog; max_cases: number }): readonly SkillEvaluationCaseResult[] {
  const visible = input.catalog.listCapabilities({ tenant_id: input.tenant_id });
  const allTenantCapabilities = input.catalog.listCapabilities({ tenant_id: input.tenant_id, include_disabled: true });
  const visibleIds = new Set(visible.map((capability) => capability.capability_id));
  const visiblePluginIds = new Set(visible.map((capability) => capability.plugin_id));
  const cases: SkillEvaluationCaseResult[] = [];

  for (const capability of allTenantCapabilities.filter(isSkillLikeCapability).sort(compareCapability)) {
    if (capability.status === "approved") {
      cases.push(caseResult({
        case_id: nextCaseId(cases.length),
        candidate_id: capability.capability_id,
        candidate_kind: "capability",
        capability_type: capability.capability_type,
        expected_outcome: "visible",
        actual_outcome: visibleIds.has(capability.capability_id) ? "visible" : "blocked",
        pass_code: "SKILL_EVAL_APPROVED_VISIBLE",
        fail_code: "SKILL_EVAL_APPROVED_MISSING",
      }));
    } else if (capability.status === "disabled" || capability.status === "rejected") {
      cases.push(caseResult({
        case_id: nextCaseId(cases.length),
        candidate_id: capability.capability_id,
        candidate_kind: "capability",
        capability_type: capability.capability_type,
        expected_outcome: "blocked",
        actual_outcome: visibleIds.has(capability.capability_id) ? "visible" : "blocked",
        pass_code: "SKILL_EVAL_REJECTED_DISABLED_BLOCKED",
        fail_code: "SKILL_EVAL_REJECTED_DISABLED_VISIBLE",
      }));
    }
  }

  for (const plugin of input.catalog.listInventory().filter((entry) => entry.allowlist_status === "disabled" || entry.allowlist_status === "rejected").sort(compareInventory)) {
    cases.push(caseResult({
      case_id: nextCaseId(cases.length),
      candidate_id: plugin.plugin_id,
      candidate_kind: "plugin_inventory",
      expected_outcome: "blocked",
      actual_outcome: visiblePluginIds.has(plugin.plugin_id) ? "visible" : "blocked",
      pass_code: "SKILL_EVAL_REJECTED_DISABLED_BLOCKED",
      fail_code: "SKILL_EVAL_REJECTED_DISABLED_VISIBLE",
    }));
  }

  cases.push(caseResult({
    case_id: nextCaseId(cases.length),
    candidate_id: "plugin_disabled_skill_fixture",
    candidate_kind: "blocked_fixture",
    capability_type: "skill",
    expected_outcome: "blocked",
    actual_outcome: visiblePluginIds.has("plugin_disabled_skill_fixture") ? "visible" : "blocked",
    pass_code: "SKILL_EVAL_REJECTED_DISABLED_BLOCKED",
    fail_code: "SKILL_EVAL_REJECTED_DISABLED_VISIBLE",
  }));
  cases.push(caseResult({
    case_id: nextCaseId(cases.length),
    candidate_id: "plugin_rejected_skill_fixture",
    candidate_kind: "blocked_fixture",
    capability_type: "planner_hint",
    expected_outcome: "blocked",
    actual_outcome: visiblePluginIds.has("plugin_rejected_skill_fixture") ? "visible" : "blocked",
    pass_code: "SKILL_EVAL_REJECTED_DISABLED_BLOCKED",
    fail_code: "SKILL_EVAL_REJECTED_DISABLED_VISIBLE",
  }));

  const limited = cases.slice(0, input.max_cases);
  assertNoForbiddenSkillEvaluationContent(limited);
  assertPublicResponsePayload(limited);
  return limited;
}

function caseResult(input: Omit<SkillEvaluationCaseResult, "status" | "reason_codes"> & { pass_code: string; fail_code: string }): SkillEvaluationCaseResult {
  const status = input.actual_outcome === input.expected_outcome ? "passed" : "failed";
  return {
    case_id: input.case_id,
    candidate_id: input.candidate_id,
    candidate_kind: input.candidate_kind,
    ...(input.capability_type === undefined ? {} : { capability_type: input.capability_type }),
    expected_outcome: input.expected_outcome,
    actual_outcome: input.actual_outcome,
    status,
    reason_codes: [status === "passed" ? input.pass_code : input.fail_code],
  };
}

function buildReport(input: { tenant_id: string; trace_id: string; run_id: string; config: SkillEvaluationConfig; cases: readonly SkillEvaluationCaseResult[]; started_at_utc: string; monotonic_ms: number }): SkillEvaluationRunReport {
  const failedCases = input.cases.filter((item) => item.status === "failed").length;
  const skippedCases = input.cases.filter((item) => item.status === "skipped").length;
  const approvedCases = input.cases.filter((item) => item.expected_outcome === "visible").length;
  const rejectedDisabledCases = input.cases.filter((item) => item.expected_outcome === "blocked").length;
  const status: SkillEvaluationRunStatus = input.cases.length === 0 ? "skipped" : failedCases > 0 ? "failed" : "passed";
  const report: SkillEvaluationRunReport = {
    schema_version: SKILL_EVALUATION_SCHEMA_VERSION,
    tenant_id: input.tenant_id,
    run_id: input.run_id,
    suite_id: input.config.suite_id,
    status,
    totals: {
      total_cases: input.cases.length,
      passed_cases: input.cases.filter((item) => item.status === "passed").length,
      failed_cases: failedCases,
      skipped_cases: skippedCases,
      approved_cases: approvedCases,
      rejected_disabled_cases: rejectedDisabledCases,
    },
    cases: input.cases,
    resource_budget: { evaluation_mode: "deterministic_regression", max_cases: input.config.resource_budget.max_cases, evaluated_cases: input.cases.length },
    started_at_utc: input.started_at_utc,
    completed_at_utc: input.started_at_utc,
    monotonic_ms: input.monotonic_ms,
    trace_id: input.trace_id,
    reason_codes: status === "passed" ? ["SKILL_EVALUATION_PASSED"] : status === "skipped" ? ["SKILL_EVALUATION_SKIPPED"] : ["SKILL_EVALUATION_FAILED"],
  };
  assertNoForbiddenSkillEvaluationContent(report);
  assertPublicResponsePayload(report);
  return report;
}

function buildFailureReport(input: { tenant_id: string; trace_id: string; run_id: string; config: SkillEvaluationConfig; started_at_utc: string; monotonic_ms: number; error: unknown }): SkillEvaluationRunReport {
  const report: SkillEvaluationRunReport = {
    schema_version: SKILL_EVALUATION_SCHEMA_VERSION,
    tenant_id: input.tenant_id,
    run_id: input.run_id,
    suite_id: input.config.suite_id,
    status: "failed",
    totals: { total_cases: 0, passed_cases: 0, failed_cases: 1, skipped_cases: 0, approved_cases: 0, rejected_disabled_cases: 0 },
    cases: [],
    resource_budget: { evaluation_mode: "deterministic_regression", max_cases: input.config.resource_budget.max_cases, evaluated_cases: 0 },
    started_at_utc: input.started_at_utc,
    completed_at_utc: input.started_at_utc,
    monotonic_ms: input.monotonic_ms,
    trace_id: input.trace_id,
    reason_codes: ["SKILL_EVALUATION_RUNNER_ERROR"],
  };
  assertNoForbiddenSkillEvaluationContent(report);
  assertPublicResponsePayload({ report, details: sanitizePublicDetails({ reason: input.error instanceof Error ? input.error.message : "Skill evaluation runner failed" }) });
  return report;
}

function recordSkillEvaluation(report: SkillEvaluationRunReport, observability: SkillEvaluationObservability | undefined, user_id: string | undefined): void {
  if (!observability) return;
  const labels = { status: report.status, schema_version: report.schema_version };
  observability.incrementMetric({ tenant_id: report.tenant_id, user_id, trace_id: report.trace_id, name: "skill_evaluation.run_count", value: 1, labels, recorded_at_utc: report.completed_at_utc, monotonic_ms: report.monotonic_ms + 1 });
  observability.incrementMetric({ tenant_id: report.tenant_id, user_id, trace_id: report.trace_id, name: "skill_evaluation.case_count", value: report.totals.total_cases, labels, recorded_at_utc: report.completed_at_utc, monotonic_ms: report.monotonic_ms + 2 });
  observability.incrementMetric({ tenant_id: report.tenant_id, user_id, trace_id: report.trace_id, name: "skill_evaluation.failed_case_count", value: report.totals.failed_cases, labels, recorded_at_utc: report.completed_at_utc, monotonic_ms: report.monotonic_ms + 3 });
  observability.recordLog({
    tenant_id: report.tenant_id,
    user_id,
    trace_id: report.trace_id,
    level: report.status === "passed" ? "info" : "warn",
    message: "skill_evaluation.completed",
    component: "skill-evaluation",
    fields: {
      schema_version: report.schema_version,
      suite_id: report.suite_id,
      run_id: report.run_id,
      status: report.status,
      reason_codes: [...report.reason_codes],
      totals: { ...report.totals },
      resource_budget: { ...report.resource_budget },
    },
    recorded_at_utc: report.completed_at_utc,
    monotonic_ms: report.monotonic_ms + 4,
  });
}

function projectConfig(config: SkillEvaluationConfig): SkillEvaluationConfig {
  const projected = JSON.parse(JSON.stringify(config)) as SkillEvaluationConfig;
  assertNoForbiddenSkillEvaluationContent(projected);
  assertPublicResponsePayload(projected);
  return projected;
}

function projectReport(report: SkillEvaluationRunReport): SkillEvaluationRunReport {
  const projected = JSON.parse(JSON.stringify(report)) as SkillEvaluationRunReport;
  assertNoForbiddenSkillEvaluationContent(projected);
  assertPublicResponsePayload(projected);
  return projected;
}

function assertNoForbiddenSkillEvaluationContent(value: unknown): void {
  if (SKILL_EVALUATION_BLOCKED_PATTERN.test(JSON.stringify(value))) {
    throw new SkillEvaluationError("PLATFORM_INVALID_REQUEST", "Skill evaluation projection contains a non-platform marker", { reason_code: "SKILL_EVALUATION_SANITIZED" });
  }
}

function isSkillLikeCapability(capability: PublicCapabilityDescriptor): boolean {
  return capability.capability_type === "skill" || capability.capability_type === "planner_hint";
}

function compareCapability(left: PublicCapabilityDescriptor, right: PublicCapabilityDescriptor): number {
  return left.capability_id.localeCompare(right.capability_id);
}

function compareInventory(left: PublicPluginInventoryEntry, right: PublicPluginInventoryEntry): number {
  return left.plugin_id.localeCompare(right.plugin_id);
}

function nextCaseId(index: number): string {
  return `skill_eval_case_${String(index + 1).padStart(4, "0")}`;
}

function suiteIdForTenant(tenant_id: string): string {
  return `skill_eval_suite_${tenant_id.replace(/^tenant_/, "")}`;
}

function requireRunId(value: unknown): string {
  if (typeof value !== "string" || !/^skill_eval_run_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/.test(value)) {
    throw new SkillEvaluationError("PLATFORM_INVALID_REQUEST", "Skill evaluation run identifier is invalid", { field: "run_id" });
  }
  return value;
}
