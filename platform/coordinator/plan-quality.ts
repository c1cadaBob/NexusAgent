import { assertMonotonicMs, assertPlatformId, assertUtcTimestamp } from "../task-state/index.ts";

export const PLAN_QUALITY_SCHEMA_VERSION = "nexus.plan_quality.p7.v1";
export const PLAN_QUALITY_DEFAULT_ENABLED = false;

export type PlanQualityBand = "excellent" | "good" | "watch" | "poor";
export type PlanQualitySignalStatus = "passed" | "warning" | "failed";

export interface PlanQualitySignal {
  name: string;
  status: PlanQualitySignalStatus;
  reason_code: string;
  score_delta: number;
  observed_value: number | string | boolean;
}

export interface PlanQualityExplanation {
  reason_code: string;
  message: string;
}

export interface PlanQualityResourceBudget {
  evaluation_mode: "deterministic_static";
  estimated_units: number;
  max_plan_steps: number;
  max_signal_count: number;
  token_budget_scope: "not_applicable_p7_01";
}

export interface PlanQualityEvaluation {
  schema_version: typeof PLAN_QUALITY_SCHEMA_VERSION;
  tenant_id: string;
  user_id: string;
  agent_id: string;
  task_id: string;
  attempt_id: string;
  execution_id: string;
  conversation_id: string;
  trace_id: string;
  quality_score: number;
  quality_band: PlanQualityBand;
  signals: readonly PlanQualitySignal[];
  explanations: readonly PlanQualityExplanation[];
  resource_budget: PlanQualityResourceBudget;
  feature_enabled: true;
  evaluated_at_utc: string;
  monotonic_ms: number;
}

export interface PlanQualityInput {
  execution_plan: unknown;
  evaluated_at_utc: string;
  monotonic_ms: number;
  resource_budget?: Partial<Pick<PlanQualityResourceBudget, "max_plan_steps" | "max_signal_count">>;
}

export interface PlanQualityObservability {
  incrementMetric(input: {
    tenant_id: string;
    trace_id: string;
    user_id?: string;
    agent_id?: string;
    task_id?: string;
    attempt_id?: string;
    execution_id?: string;
    conversation_id?: string;
    name: string;
    value?: number;
    labels?: Record<string, string>;
    monotonic_ms?: number;
    recorded_at_utc?: string;
  }): unknown;
  recordLog(input: {
    tenant_id: string;
    trace_id: string;
    user_id?: string;
    agent_id?: string;
    task_id?: string;
    attempt_id?: string;
    execution_id?: string;
    conversation_id?: string;
    level: "debug" | "info" | "warn" | "error";
    message: string;
    component: string;
    fields?: Record<string, unknown>;
    monotonic_ms?: number;
    recorded_at_utc?: string;
  }): unknown;
}

export interface PlanQualityCoordinatorOptions {
  enabled?: boolean;
  observability?: PlanQualityObservability;
  evaluator?: (input: PlanQualityInput) => PlanQualityEvaluation;
  resource_budget?: Partial<Pick<PlanQualityResourceBudget, "max_plan_steps" | "max_signal_count">>;
}

export class PlanQualityError extends Error {
  readonly code: "PLATFORM_INVALID_REQUEST" | "PLATFORM_SCHEMA_VALIDATION_FAILED" | "PLATFORM_POLICY_DENIED";
  readonly details: Record<string, unknown>;

  constructor(code: PlanQualityError["code"], message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "PlanQualityError";
    this.code = code;
    this.details = details;
  }
}

interface PlanStep {
  step_id: string;
  status: "planned" | "blocked";
  depends_on: readonly string[];
}

interface ToolIntent {
  step_id: string;
  executor_policy: {
    mode: string;
    require_policy_gate: boolean;
    allow_direct_execution: boolean;
    artifact_store: string;
  };
}

interface PlanShape {
  tenant_id: string;
  user_id: string;
  agent_id: string;
  task_id: string;
  attempt_id: string;
  execution_id: string;
  conversation_id: string;
  trace_id: string;
  steps: readonly PlanStep[];
  tool_intents: readonly ToolIntent[];
  budget: {
    estimated_units: number;
    max_execution_steps: number;
    requires_approval: boolean;
  };
  dependencies: readonly { step_id: string; depends_on_step_id: string; relation: string }[];
  risks: readonly { severity: string }[];
  memory_context: {
    mode: string;
    layers: readonly string[];
    snapshot_version: number;
    direct_memory_access: string;
  };
}

export function evaluateExecutionPlanQuality(input: PlanQualityInput): PlanQualityEvaluation {
  assertUtcTimestamp(input.evaluated_at_utc, "plan_quality.evaluated_at_utc");
  assertMonotonicMs(input.monotonic_ms, "plan_quality.monotonic_ms");
  assertNoForbiddenPlanQualityContent(input.execution_plan);
  const plan = parsePlan(input.execution_plan);
  const maxPlanSteps = input.resource_budget?.max_plan_steps ?? 25;
  const maxSignalCount = input.resource_budget?.max_signal_count ?? 12;

  const signals: PlanQualitySignal[] = [];
  const addSignal = (signal: PlanQualitySignal): void => {
    if (signals.length < maxSignalCount) signals.push(signal);
  };

  const stepCount = plan.steps.length;
  const blockedStepCount = plan.steps.filter((step) => step.status === "blocked").length;
  addSignal(signal("plan_steps_present", "passed", "PLAN_STEPS_PRESENT", 0, stepCount));
  if (stepCount > maxPlanSteps) {
    addSignal(signal("plan_step_scope", "warning", "PLAN_STEP_SCOPE_HIGH", -10, stepCount));
  } else {
    addSignal(signal("plan_step_scope", "passed", "PLAN_STEP_SCOPE_OK", 0, stepCount));
  }
  if (blockedStepCount > 0) {
    addSignal(signal("blocked_steps", "warning", "PLAN_BLOCKED_STEPS_PRESENT", -Math.min(20, blockedStepCount * 10), blockedStepCount));
  } else {
    addSignal(signal("blocked_steps", "passed", "PLAN_NO_BLOCKED_STEPS", 0, blockedStepCount));
  }

  const expectedDependencyCount = plan.steps.reduce((total, step) => total + step.depends_on.length, 0);
  const dependencyCoverage = expectedDependencyCount === 0 ? 1 : plan.dependencies.length / expectedDependencyCount;
  addSignal(dependencyCoverage >= 1
    ? signal("dependency_coverage", "passed", "PLAN_DEPENDENCY_COVERAGE_OK", 0, dependencyCoverage)
    : signal("dependency_coverage", "warning", "PLAN_DEPENDENCY_COVERAGE_LOW", -15, dependencyCoverage));

  const toolIntentCoverage = plan.tool_intents.length > 0 && plan.tool_intents.every((intent) => plan.steps.some((step) => step.step_id === intent.step_id));
  addSignal(toolIntentCoverage
    ? signal("tool_intent_coverage", "passed", "PLAN_TOOL_INTENT_COVERAGE_OK", 0, plan.tool_intents.length)
    : signal("tool_intent_coverage", "failed", "PLAN_TOOL_INTENT_COVERAGE_LOW", -20, plan.tool_intents.length));

  const budgetCoversSteps = plan.budget.estimated_units >= stepCount && plan.budget.max_execution_steps >= stepCount;
  addSignal(budgetCoversSteps
    ? signal("budget_step_alignment", "passed", "PLAN_BUDGET_STEP_ALIGNMENT_OK", 0, plan.budget.max_execution_steps)
    : signal("budget_step_alignment", "warning", "PLAN_BUDGET_STEP_ALIGNMENT_LOW", -15, plan.budget.max_execution_steps));

  const highRiskCount = plan.risks.filter((risk) => risk.severity === "high" || risk.severity === "critical").length;
  addSignal(highRiskCount > 0
    ? signal("risk_severity", "warning", "PLAN_HIGH_RISK_PRESENT", -Math.min(15, highRiskCount * 5), highRiskCount)
    : signal("risk_severity", "passed", "PLAN_RISK_SEVERITY_OK", 0, highRiskCount));

  const memoryControlled = plan.memory_context.mode === "memory_gateway_snapshot" && plan.memory_context.direct_memory_access === "blocked";
  addSignal(memoryControlled
    ? signal("memory_context", "passed", "PLAN_MEMORY_CONTEXT_CONTROLLED", 0, true)
    : signal("memory_context", "failed", "PLAN_MEMORY_CONTEXT_UNCONTROLLED", -25, false));

  const executorControlled = plan.tool_intents.every((intent) =>
    intent.executor_policy.mode === "platform_executor_required"
    && intent.executor_policy.require_policy_gate === true
    && intent.executor_policy.allow_direct_execution === false
    && intent.executor_policy.artifact_store === "required",
  );
  addSignal(executorControlled
    ? signal("executor_policy", "passed", "PLAN_EXECUTOR_POLICY_CONTROLLED", 0, true)
    : signal("executor_policy", "failed", "PLAN_EXECUTOR_POLICY_UNCONTROLLED", -30, false));

  const qualityScore = clampScore(100 + signals.reduce((total, item) => total + item.score_delta, 0));
  const evaluation: PlanQualityEvaluation = {
    schema_version: PLAN_QUALITY_SCHEMA_VERSION,
    tenant_id: plan.tenant_id,
    user_id: plan.user_id,
    agent_id: plan.agent_id,
    task_id: plan.task_id,
    attempt_id: plan.attempt_id,
    execution_id: plan.execution_id,
    conversation_id: plan.conversation_id,
    trace_id: plan.trace_id,
    quality_score: qualityScore,
    quality_band: bandForScore(qualityScore),
    signals,
    explanations: signals.map((item) => ({ reason_code: item.reason_code, message: explanationFor(item.reason_code) })),
    resource_budget: {
      evaluation_mode: "deterministic_static",
      estimated_units: Math.max(1, stepCount + plan.tool_intents.length + plan.risks.length),
      max_plan_steps: maxPlanSteps,
      max_signal_count: maxSignalCount,
      token_budget_scope: "not_applicable_p7_01",
    },
    feature_enabled: true,
    evaluated_at_utc: input.evaluated_at_utc,
    monotonic_ms: input.monotonic_ms,
  };
  assertNoForbiddenPlanQualityContent(evaluation);
  return clone(evaluation) as PlanQualityEvaluation;
}

export function recordPlanQualityEvaluation(observability: PlanQualityObservability, evaluation: PlanQualityEvaluation): void {
  const context = planQualityTraceContext(evaluation);
  const labels = { quality_band: evaluation.quality_band, schema_version: evaluation.schema_version };
  observability.incrementMetric({ ...context, name: "plan_quality.score", value: evaluation.quality_score, labels, recorded_at_utc: evaluation.evaluated_at_utc, monotonic_ms: evaluation.monotonic_ms });
  observability.incrementMetric({ ...context, name: "plan_quality.signal_count", value: evaluation.signals.length, labels, recorded_at_utc: evaluation.evaluated_at_utc, monotonic_ms: evaluation.monotonic_ms + 1 });
  observability.incrementMetric({ ...context, name: "plan_quality.blocked_step_count", value: signalValue(evaluation, "blocked_steps"), labels, recorded_at_utc: evaluation.evaluated_at_utc, monotonic_ms: evaluation.monotonic_ms + 2 });
  observability.recordLog({
    ...context,
    level: "info",
    component: "plan-quality",
    message: "plan_quality.evaluated",
    fields: {
      schema_version: evaluation.schema_version,
      quality_score: evaluation.quality_score,
      quality_band: evaluation.quality_band,
      signal_reason_codes: evaluation.signals.map((item) => item.reason_code),
      resource_budget: evaluation.resource_budget,
      feature_enabled: evaluation.feature_enabled,
    },
    recorded_at_utc: evaluation.evaluated_at_utc,
    monotonic_ms: evaluation.monotonic_ms + 3,
  });
}

export function recordPlanQualityWarning(input: {
  observability?: PlanQualityObservability;
  tenant_id: string;
  task_id: string;
  attempt_id: string;
  execution_id?: string;
  conversation_id?: string;
  trace_id: string;
  recorded_at_utc: string;
  monotonic_ms: number;
  error: unknown;
}): void {
  if (!input.observability) return;
  assertUtcTimestamp(input.recorded_at_utc, "plan_quality.warning.recorded_at_utc");
  assertMonotonicMs(input.monotonic_ms, "plan_quality.warning.monotonic_ms");
  input.observability.recordLog({
    tenant_id: input.tenant_id,
    task_id: input.task_id,
    attempt_id: input.attempt_id,
    execution_id: input.execution_id,
    conversation_id: input.conversation_id,
    trace_id: input.trace_id,
    level: "warn",
    component: "plan-quality",
    message: "plan_quality.evaluation_skipped",
    fields: sanitizePlanQualityError(input.error),
    recorded_at_utc: input.recorded_at_utc,
    monotonic_ms: input.monotonic_ms,
  });
}

function parsePlan(value: unknown): PlanShape {
  const plan = record(value, "execution_plan");
  if (plan.schema_version !== "nexus.execution_plan.p3.v1") {
    throw new PlanQualityError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Plan quality requires current ExecutionPlan schema", { schema_version: String(plan.schema_version) });
  }
  const steps = array(plan.steps, "steps", 1).map((item, index): PlanStep => {
    const step = record(item, `steps.${index}`);
    return {
      step_id: stringValue(step.step_id, `steps.${index}.step_id`, /^step_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/),
      status: enumValue(step.status, `steps.${index}.status`, ["planned", "blocked"]),
      depends_on: array(step.depends_on, `steps.${index}.depends_on`, 0).map((dependency, dependencyIndex) => stringValue(dependency, `steps.${index}.depends_on.${dependencyIndex}`, /^step_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/)),
    };
  });
  const stepIds = new Set(steps.map((step) => step.step_id));
  return {
    tenant_id: assertPlatformId("tenant_id", plan.tenant_id),
    user_id: assertPlatformId("user_id", plan.user_id),
    agent_id: assertPlatformId("agent_id", plan.agent_id),
    task_id: assertPlatformId("task_id", plan.task_id),
    attempt_id: assertPlatformId("attempt_id", plan.attempt_id),
    execution_id: assertPlatformId("execution_id", plan.execution_id),
    conversation_id: assertPlatformId("conversation_id", plan.conversation_id),
    trace_id: assertPlatformId("trace_id", plan.trace_id),
    steps,
    tool_intents: array(plan.tool_intents, "tool_intents", 1).map((item, index): ToolIntent => {
      const intent = record(item, `tool_intents.${index}`);
      const step_id = stringValue(intent.step_id, `tool_intents.${index}.step_id`, /^step_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/);
      if (!stepIds.has(step_id)) throw new PlanQualityError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Tool intent references an unknown plan step", { field: `tool_intents.${index}.step_id` });
      const executorPolicy = record(intent.executor_policy, `tool_intents.${index}.executor_policy`);
      return {
        step_id,
        executor_policy: {
          mode: stringValue(executorPolicy.mode, `tool_intents.${index}.executor_policy.mode`),
          require_policy_gate: booleanValue(executorPolicy.require_policy_gate, `tool_intents.${index}.executor_policy.require_policy_gate`),
          allow_direct_execution: booleanValue(executorPolicy.allow_direct_execution, `tool_intents.${index}.executor_policy.allow_direct_execution`),
          artifact_store: stringValue(executorPolicy.artifact_store, `tool_intents.${index}.executor_policy.artifact_store`),
        },
      };
    }),
    budget: parseBudget(plan.budget),
    dependencies: array(plan.dependencies, "dependencies", 0).map((item, index) => {
      const dependency = record(item, `dependencies.${index}`);
      return {
        step_id: stringValue(dependency.step_id, `dependencies.${index}.step_id`, /^step_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/),
        depends_on_step_id: stringValue(dependency.depends_on_step_id, `dependencies.${index}.depends_on_step_id`, /^step_[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/),
        relation: stringValue(dependency.relation, `dependencies.${index}.relation`),
      };
    }),
    risks: array(plan.risks, "risks", 1).map((item, index) => ({ severity: stringValue(record(item, `risks.${index}`).severity, `risks.${index}.severity`) })),
    memory_context: parseMemoryContext(plan.memory_context),
  };
}

function parseBudget(value: unknown): PlanShape["budget"] {
  const budget = record(value, "budget");
  return {
    estimated_units: positiveInteger(budget.estimated_units, "budget.estimated_units"),
    max_execution_steps: positiveInteger(budget.max_execution_steps, "budget.max_execution_steps"),
    requires_approval: booleanValue(budget.requires_approval, "budget.requires_approval"),
  };
}

function parseMemoryContext(value: unknown): PlanShape["memory_context"] {
  const memory = record(value, "memory_context");
  return {
    mode: stringValue(memory.mode, "memory_context.mode"),
    layers: array(memory.layers, "memory_context.layers", 1).map((layer, index) => stringValue(layer, `memory_context.layers.${index}`)),
    snapshot_version: nonNegativeInteger(memory.snapshot_version, "memory_context.snapshot_version"),
    direct_memory_access: stringValue(memory.direct_memory_access, "memory_context.direct_memory_access"),
  };
}

function signal(name: string, status: PlanQualitySignalStatus, reason_code: string, score_delta: number, observed_value: number | string | boolean): PlanQualitySignal {
  return { name, status, reason_code, score_delta, observed_value };
}

function bandForScore(score: number): PlanQualityBand {
  if (score >= 90) return "excellent";
  if (score >= 75) return "good";
  if (score >= 60) return "watch";
  return "poor";
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function explanationFor(reasonCode: string): string {
  const explanations: Record<string, string> = {
    PLAN_STEPS_PRESENT: "Plan has at least one structured step.",
    PLAN_STEP_SCOPE_OK: "Plan step count is within the P7 quality budget.",
    PLAN_STEP_SCOPE_HIGH: "Plan step count exceeds the P7 quality budget.",
    PLAN_NO_BLOCKED_STEPS: "Plan has no blocked steps.",
    PLAN_BLOCKED_STEPS_PRESENT: "Plan contains blocked steps that require follow-up.",
    PLAN_DEPENDENCY_COVERAGE_OK: "Step dependencies have matching dependency records.",
    PLAN_DEPENDENCY_COVERAGE_LOW: "Some step dependencies lack matching records.",
    PLAN_TOOL_INTENT_COVERAGE_OK: "Plan contains platform-routed tool intent coverage.",
    PLAN_TOOL_INTENT_COVERAGE_LOW: "Plan lacks usable platform-routed tool intent coverage.",
    PLAN_BUDGET_STEP_ALIGNMENT_OK: "Plan budget covers planned steps.",
    PLAN_BUDGET_STEP_ALIGNMENT_LOW: "Plan budget is lower than planned steps.",
    PLAN_RISK_SEVERITY_OK: "Plan does not contain high severity risk markers.",
    PLAN_HIGH_RISK_PRESENT: "Plan contains high severity risk markers.",
    PLAN_MEMORY_CONTEXT_CONTROLLED: "Plan memory context is gateway scoped and direct access is blocked.",
    PLAN_MEMORY_CONTEXT_UNCONTROLLED: "Plan memory context is not fully gateway controlled.",
    PLAN_EXECUTOR_POLICY_CONTROLLED: "Tool intents require Policy-Gate and Artifact Store controls.",
    PLAN_EXECUTOR_POLICY_UNCONTROLLED: "Tool intents do not require platform executor controls.",
  };
  return explanations[reasonCode] ?? "Plan quality signal recorded.";
}

function planQualityTraceContext(evaluation: PlanQualityEvaluation) {
  return {
    tenant_id: evaluation.tenant_id,
    user_id: evaluation.user_id,
    agent_id: evaluation.agent_id,
    task_id: evaluation.task_id,
    attempt_id: evaluation.attempt_id,
    execution_id: evaluation.execution_id,
    conversation_id: evaluation.conversation_id,
    trace_id: evaluation.trace_id,
  };
}

function signalValue(evaluation: PlanQualityEvaluation, name: string): number {
  const observed = evaluation.signals.find((item) => item.name === name)?.observed_value;
  return typeof observed === "number" ? observed : 0;
}

function sanitizePlanQualityError(error: unknown): Record<string, unknown> {
  if (error instanceof PlanQualityError) {
    return { code: error.code, reason_code: "PLAN_QUALITY_EVALUATION_SKIPPED" };
  }
  return { code: "PLATFORM_INVALID_REQUEST", reason_code: "PLAN_QUALITY_EVALUATION_SKIPPED" };
}

function assertNoForbiddenPlanQualityContent(value: unknown): void {
  const forbiddenKey = /^(?:explanation|reasoning|final_response|model_explanation|chain_of_thought|credential_material|raw_credential|api_key|password|token|native_session|native_session_id|native_error|native_path|native_url|base_url|file_path|path|url|session_id|provider_runtime)$/i;
  const forbiddenString = /(?:credential_material|raw_credential|native_(?:url|path|session|error)|provider_runtime|https?:\/\/|\/(?:opt|tmp|var|etc|home|usr)\/)/i;
  const visit = (current: unknown): void => {
    if (typeof current === "string" && forbiddenString.test(current)) {
      throw new PlanQualityError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Plan quality input contains non-platform content");
    }
    if (!current || typeof current !== "object") return;
    if (Array.isArray(current)) {
      for (const item of current) visit(item);
      return;
    }
    for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
      if (forbiddenKey.test(key)) {
        throw new PlanQualityError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Plan quality input contains a non-platform field", { field: key });
      }
      visit(child);
    }
  };
  visit(value);
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PlanQualityError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Plan quality field must be an object", { field });
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, field: string, minItems: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length < minItems) {
    throw new PlanQualityError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Plan quality field must be an array", { field, min_items: minItems });
  }
  return value;
}

function stringValue(value: unknown, field: string, pattern?: RegExp): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new PlanQualityError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Plan quality field must be a string", { field });
  }
  if (pattern && !pattern.test(value)) {
    throw new PlanQualityError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Plan quality string field pattern is invalid", { field });
  }
  return value;
}

function enumValue<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new PlanQualityError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Plan quality enum field is invalid", { field });
  }
  return value as T;
}

function booleanValue(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new PlanQualityError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Plan quality field must be a boolean", { field });
  }
  return value;
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new PlanQualityError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Plan quality field must be a positive integer", { field });
  }
  return value as number;
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new PlanQualityError("PLATFORM_SCHEMA_VALIDATION_FAILED", "Plan quality field must be a non-negative integer", { field });
  }
  return value as number;
}

function clone(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}
