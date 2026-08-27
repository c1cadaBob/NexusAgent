export const SDK_SCHEMA_VERSION = "nexus.sdk.p5.v1";

export type TaskState =
  | "received"
  | "admitted"
  | "blocked"
  | "planning"
  | "approval_required"
  | "ready_for_execution"
  | "executing"
  | "settling"
  | "completed"
  | "failed"
  | "cancelled"
  | "archived";

export type ChannelName = "dingtalk" | "feishu" | "telegram";
export type ChannelConfigStatus = "enabled" | "disabled";
export type PluginAdmissionDecision = "approve" | "disable" | "reject";

export interface PlatformList<T> {
  items: T[];
  next_cursor?: string;
}

export interface HealthStatus {
  status: "ok" | "degraded" | "down" | "unavailable";
  checked_at: string;
  service: string;
  trace_id: string;
}

export interface PlatformTask {
  tenant_id: string;
  user_id: string;
  agent_id: string;
  task_id: string;
  attempt_id: string;
  execution_id?: string;
  conversation_id: string;
  state: TaskState;
  trace_id: string;
  summary?: string;
  artifact_ids: readonly string[];
  created_at: string;
  updated_at: string;
}

export interface PlatformEvent {
  event_id: string;
  event_type: string;
  tenant_id: string;
  task_id?: string;
  attempt_id?: string;
  execution_id?: string;
  trace_id: string;
  occurred_at: string;
  payload: Record<string, unknown>;
}

export interface TenantRecord {
  tenant_id: string;
  name: string;
  status: "active" | "disabled" | "suspended" | "archived";
  created_at: string;
}

export interface TenantUserRecord {
  tenant_id: string;
  user_id: string;
  roles: readonly string[];
  status: "active" | "disabled";
}

export interface ApprovalRecord {
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

export interface CapabilityDescriptor {
  capability_id: string;
  capability_type: string;
  display_name: string;
  plugin_id?: string;
  status: string;
  risk_level: string;
  required_permissions: readonly string[];
}

export interface SkillRecord {
  skill_id: string;
  tenant_id: string;
  display_name: string;
  description?: string;
  status: string;
  version: string;
  capability_ids?: readonly string[];
}

export interface SkillEvaluationConfig {
  schema_version: "nexus.skill_evaluation.p7.v1";
  tenant_id: string;
  suite_id: string;
  enabled: boolean;
  mode: "manual";
  corpus: "approved_rejected_disabled";
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
  expected_outcome: "visible" | "blocked" | "skipped";
  actual_outcome: "visible" | "blocked" | "skipped";
  status: "passed" | "failed" | "skipped";
  reason_codes: readonly string[];
}

export interface SkillEvaluationRunReport {
  schema_version: "nexus.skill_evaluation.p7.v1";
  tenant_id: string;
  run_id: string;
  suite_id: string;
  status: "passed" | "failed" | "skipped";
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

export interface MemoryRecord {
  memory_id: string;
  tenant_id: string;
  layer: string;
  text: string;
  version?: number;
  trace_id: string;
  score?: number;
}

export interface MemoryConflictRecord {
  schema_version: "nexus.memory_conflict.p7.v1";
  conflict_id: string;
  tenant_id: string;
  scope: {
    tenant_id: string;
    user_id?: string;
    agent_id?: string;
    conversation_id?: string;
  };
  layer: string;
  expected_version: number;
  current_version: number;
  status: "open" | "resolved" | "ignored";
  reason_codes: readonly string[];
  created_at_utc: string;
  updated_at_utc: string;
  monotonic_ms: number;
  trace_id: string;
  decided_by_user_id?: string;
  decided_at_utc?: string;
}

export interface MemoryRetentionRule {
  layer: string;
  enabled: boolean;
  ttl_days: number | null;
  action: "retain" | "soft_delete";
  immutable: boolean;
}

export interface MemoryRetentionPolicy {
  schema_version: "nexus.memory_retention.p7.v1";
  tenant_id: string;
  policy_id: string;
  enabled: boolean;
  mode: "conservative";
  rules: readonly MemoryRetentionRule[];
  resource_budget: {
    evaluation_mode: "manual_sweep";
    max_sweep_records: number;
    max_policy_rules: number;
  };
  updated_at_utc: string;
  monotonic_ms: number;
  trace_id: string;
}

export interface MemoryDeleteResult {
  schema_version: "nexus.memory_retention.p7.v1";
  tenant_id: string;
  memory_id: string;
  layer: string;
  status: "deleted" | "expired";
  reason_code: "MEMORY_MANUAL_DELETE" | "MEMORY_RETENTION_EXPIRED";
  version: number;
  deleted_at_utc: string;
  monotonic_ms: number;
  trace_id: string;
}

export interface MemoryRetentionSweepResult {
  schema_version: "nexus.memory_retention.p7.v1";
  tenant_id: string;
  policy_id: string;
  scanned_count: number;
  deleted_count: number;
  skipped_count: number;
  items: readonly MemoryDeleteResult[];
  resource_budget: {
    evaluation_mode: "manual_sweep";
    max_sweep_records: number;
    evaluated_records: number;
  };
  swept_at_utc: string;
  monotonic_ms: number;
  trace_id: string;
}

export interface TokenBudgetLimits {
  tenant_units: number;
  user_units: number;
  agent_units: number;
  task_units: number;
  max_units_per_attempt: number;
}

export interface TokenBudgetPolicy {
  schema_version: "nexus.token_budget.p7.v1";
  tenant_id: string;
  policy_id: string;
  enabled: boolean;
  dimension_mode: "all_configured";
  enforcement_scope: "task_adapter_api";
  limits: TokenBudgetLimits;
  resource_budget: {
    accounting_mode: "deterministic_estimate";
    dimensions: readonly ("tenant" | "user" | "agent" | "task")[];
  };
  updated_at_utc: string;
  monotonic_ms: number;
  trace_id: string;
}

export interface TokenBudgetDimensionStatus {
  dimension: "tenant" | "user" | "agent" | "task";
  key: string;
  limit_units: number;
  consumed_units: number;
  remaining_units: number;
  status: "approved" | "degraded";
}

export interface BudgetCheckResult {
  schema_version: "nexus.token_budget.p7.v1";
  tenant_id: string;
  user_id?: string;
  agent_id?: string;
  task_id?: string;
  attempt_id?: string;
  execution_id?: string;
  conversation_id?: string;
  trace_id: string;
  policy_id: string;
  decision_id: string;
  status: "approved" | "degraded" | "denied";
  code?: string;
  reasons?: readonly string[];
  requested_units: number;
  remaining_units: number;
  max_units_per_attempt: number;
  dimensions: readonly TokenBudgetDimensionStatus[];
  reason_codes: readonly string[];
  checked_at_utc: string;
  monotonic_ms: number;
}

export interface TokenBudgetLedgerEntry extends Omit<BudgetCheckResult, "decision_id" | "status" | "checked_at_utc"> {
  ledger_id: string;
  status: "checked" | "reserved" | "denied";
  consumed_units: number;
  recorded_at_utc: string;
}

export interface ChannelConnectionTestResult {
  schema_version: string;
  channel_config_id: string;
  tenant_id: string;
  channel_name: ChannelName;
  test_status: "passed" | "failed";
  policy_gate_status: "allowed" | "denied";
  delivery_outcome: "queued" | "not_queued";
  checked_at: string;
  trace_id: string;
}

export interface ChannelConfigRecord {
  schema_version: string;
  channel_config_id: string;
  tenant_id: string;
  channel_name: ChannelName;
  display_name: string;
  status: ChannelConfigStatus;
  capability_id: string;
  account_ref: string;
  conversation_ref: string;
  credential_status: "reference_configured" | "missing_reference";
  created_at: string;
  updated_at: string;
  trace_id: string;
  last_test?: ChannelConnectionTestResult;
}

export interface PluginInventoryEntry {
  plugin_id: string;
  display_name: string;
  source_kind: string;
  version: string;
  sha256: string;
  license: string;
  notice_status: string;
  risk_level: string;
  allowlist_status: string;
  capability_ids: readonly string[];
  trace_id: string;
}

export interface NexusAgentClientOptions {
  baseUrl: string;
  accessToken: string;
  fetchImpl?: FetchLike;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Pick<Response, "ok" | "status" | "json">>;

export class NexusAgentApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly trace_id?: string;
  readonly details: Record<string, unknown>;

  constructor(status: number, code: string, message: string, trace_id?: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "NexusAgentApiError";
    this.status = status;
    this.code = code;
    this.trace_id = trace_id;
    this.details = details;
  }
}

export class NexusAgentClient {
  readonly baseUrl: string;
  readonly accessToken: string;
  readonly #fetchImpl: FetchLike;

  constructor(options: NexusAgentClientOptions) {
    if (!options.baseUrl.trim()) throw new NexusAgentApiError(400, "PLATFORM_INVALID_REQUEST", "baseUrl is required");
    if (!options.accessToken.trim()) throw new NexusAgentApiError(401, "PLATFORM_UNAUTHENTICATED", "accessToken is required");
    this.baseUrl = trimTrailingSlash(options.baseUrl);
    this.accessToken = options.accessToken;
    this.#fetchImpl = options.fetchImpl ?? fetch;
  }

  health(): Promise<HealthStatus> {
    return this.#request<HealthStatus>("GET", "/v1/health", { auth: false });
  }

  listTasks(params: { tenant_id?: string; limit?: number; cursor?: string; state?: TaskState } = {}): Promise<PlatformList<PlatformTask>> {
    return this.#request<PlatformList<PlatformTask>>("GET", withQuery("/v1/tasks", params));
  }

  submitTask(input: { tenant_id: string; user_id: string; agent_id: string; conversation_id: string; input: string; trace_id: string; budget_units?: number }): Promise<PlatformTask> {
    return this.#request<PlatformTask>("POST", "/v1/tasks", { body: input });
  }

  getTask(task_id: string): Promise<PlatformTask> {
    return this.#request<PlatformTask>("GET", `/v1/tasks/${encodeURIComponent(task_id)}`);
  }

  cancelTask(task_id: string, input: { reason: string; trace_id: string }): Promise<PlatformTask> {
    return this.#request<PlatformTask>("POST", `/v1/tasks/${encodeURIComponent(task_id)}/cancel`, { body: input });
  }

  retryTask(task_id: string, input: { reason?: string; trace_id: string }): Promise<PlatformTask> {
    return this.#request<PlatformTask>("POST", `/v1/tasks/${encodeURIComponent(task_id)}/retry`, { body: input });
  }

  listTaskEvents(task_id: string, params: { limit?: number; cursor?: string } = {}): Promise<PlatformList<PlatformEvent>> {
    return this.#request<PlatformList<PlatformEvent>>("GET", withQuery(`/v1/tasks/${encodeURIComponent(task_id)}/events`, params));
  }

  listSkills(params: { tenant_id?: string; limit?: number; cursor?: string } = {}): Promise<PlatformList<SkillRecord>> {
    return this.#request<PlatformList<SkillRecord>>("GET", withQuery("/v1/skills", params));
  }

  listCapabilities(params: { tenant_id?: string; limit?: number; cursor?: string } = {}): Promise<PlatformList<CapabilityDescriptor>> {
    return this.#request<PlatformList<CapabilityDescriptor>>("GET", withQuery("/v1/capabilities", params));
  }

  getSkillEvaluationConfig(params: { tenant_id: string; trace_id?: string }): Promise<SkillEvaluationConfig> {
    return this.#request<SkillEvaluationConfig>("GET", withQuery("/v1/skill-evaluations/config", params));
  }

  updateSkillEvaluationConfig(input: { tenant_id: string; trace_id: string; enabled?: boolean; max_cases?: number }): Promise<SkillEvaluationConfig> {
    return this.#request<SkillEvaluationConfig>("PATCH", "/v1/skill-evaluations/config", { body: input });
  }

  runSkillEvaluation(input: { tenant_id: string; trace_id: string }): Promise<SkillEvaluationRunReport> {
    return this.#request<SkillEvaluationRunReport>("POST", "/v1/skill-evaluations/runs", { body: input });
  }

  listSkillEvaluationRuns(params: { tenant_id: string; limit?: number; cursor?: string }): Promise<PlatformList<SkillEvaluationRunReport>> {
    return this.#request<PlatformList<SkillEvaluationRunReport>>("GET", withQuery("/v1/skill-evaluations/runs", params));
  }

  getSkillEvaluationRun(run_id: string, params: { tenant_id: string }): Promise<SkillEvaluationRunReport> {
    return this.#request<SkillEvaluationRunReport>("GET", withQuery(`/v1/skill-evaluations/runs/${encodeURIComponent(run_id)}`, params));
  }

  searchMemory(input: { tenant_id: string; query: string; trace_id: string; user_id?: string; agent_id?: string; conversation_id?: string; layer?: string; limit?: number }): Promise<PlatformList<MemoryRecord>> {
    return this.#request<PlatformList<MemoryRecord>>("POST", "/v1/memory/search", { body: input });
  }

  writeMemory(input: { tenant_id: string; layer: string; text: string; trace_id: string; user_id?: string; agent_id?: string; conversation_id?: string; expected_version?: number }): Promise<MemoryRecord> {
    return this.#request<MemoryRecord>("POST", "/v1/memory", { body: input });
  }

  listMemoryConflicts(params: { tenant_id: string; status?: "open" | "resolved" | "ignored"; trace_id?: string; limit?: number; cursor?: string }): Promise<PlatformList<MemoryConflictRecord>> {
    return this.#request<PlatformList<MemoryConflictRecord>>("GET", withQuery("/v1/memory/conflicts", params));
  }

  getMemoryConflict(conflict_id: string, params: { tenant_id: string }): Promise<MemoryConflictRecord> {
    return this.#request<MemoryConflictRecord>("GET", withQuery(`/v1/memory/conflicts/${encodeURIComponent(conflict_id)}`, params));
  }

  decideMemoryConflict(conflict_id: string, input: { tenant_id: string; decision: "resolve" | "ignore"; reason: string; trace_id: string }): Promise<MemoryConflictRecord> {
    return this.#request<MemoryConflictRecord>("POST", `/v1/memory/conflicts/${encodeURIComponent(conflict_id)}/decision`, { body: input });
  }

  getMemoryRetentionPolicy(params: { tenant_id: string; trace_id?: string }): Promise<MemoryRetentionPolicy> {
    return this.#request<MemoryRetentionPolicy>("GET", withQuery("/v1/memory/retention", params));
  }

  updateMemoryRetentionPolicy(input: { tenant_id: string; trace_id: string; enabled?: boolean; rules?: readonly Partial<MemoryRetentionRule>[]; max_sweep_records?: number }): Promise<MemoryRetentionPolicy> {
    return this.#request<MemoryRetentionPolicy>("PATCH", "/v1/memory/retention", { body: input });
  }

  sweepMemoryRetention(input: { tenant_id: string; trace_id: string; max_records?: number }): Promise<MemoryRetentionSweepResult> {
    return this.#request<MemoryRetentionSweepResult>("POST", "/v1/memory/retention/sweep", { body: input });
  }

  deleteMemory(memory_id: string, input: { tenant_id: string; reason: string; trace_id: string }): Promise<MemoryDeleteResult> {
    return this.#request<MemoryDeleteResult>("POST", `/v1/memory/${encodeURIComponent(memory_id)}/delete`, { body: input });
  }

  listTenants(params: { limit?: number; cursor?: string } = {}): Promise<PlatformList<TenantRecord>> {
    return this.#request<PlatformList<TenantRecord>>("GET", withQuery("/v1/tenants", params));
  }

  listTenantUsers(tenant_id: string, params: { limit?: number; cursor?: string } = {}): Promise<PlatformList<TenantUserRecord>> {
    return this.#request<PlatformList<TenantUserRecord>>("GET", withQuery(`/v1/tenants/${encodeURIComponent(tenant_id)}/users`, params));
  }

  listPermissions(): Promise<PlatformList<string>> {
    return this.#request<PlatformList<string>>("GET", "/v1/permissions");
  }

  listApprovals(params: { tenant_id?: string; limit?: number; cursor?: string } = {}): Promise<PlatformList<ApprovalRecord>> {
    return this.#request<PlatformList<ApprovalRecord>>("GET", withQuery("/v1/approvals", params));
  }

  decideApproval(approval_id: string, input: { decision: "approve" | "reject"; reason: string; trace_id: string }): Promise<ApprovalRecord> {
    return this.#request<ApprovalRecord>("POST", `/v1/approvals/${encodeURIComponent(approval_id)}/decision`, { body: input });
  }

  getBudgetPolicy(params: { tenant_id: string; trace_id?: string }): Promise<TokenBudgetPolicy> {
    return this.#request<TokenBudgetPolicy>("GET", withQuery("/v1/budget/policy", params));
  }

  updateBudgetPolicy(input: { tenant_id: string; trace_id: string; enabled?: boolean; limits?: Partial<TokenBudgetLimits> }): Promise<TokenBudgetPolicy> {
    return this.#request<TokenBudgetPolicy>("PATCH", "/v1/budget/policy", { body: input });
  }

  listBudgetLedger(params: { tenant_id: string; user_id?: string; agent_id?: string; task_id?: string; trace_id?: string; limit?: number; cursor?: string }): Promise<PlatformList<TokenBudgetLedgerEntry>> {
    return this.#request<PlatformList<TokenBudgetLedgerEntry>>("GET", withQuery("/v1/budget/ledger", params));
  }

  checkBudget(input: { tenant_id: string; requested_units?: number; remaining_units?: number; max_units_per_attempt?: number; input?: string; user_id?: string; agent_id?: string; task_id?: string; attempt_id?: string; execution_id?: string; conversation_id?: string; trace_id: string; consume?: boolean }): Promise<BudgetCheckResult> {
    return this.#request<BudgetCheckResult>("POST", "/v1/budget/check", { body: input });
  }

  listChannels(params: { tenant_id?: string; limit?: number; cursor?: string } = {}): Promise<PlatformList<ChannelConfigRecord>> {
    return this.#request<PlatformList<ChannelConfigRecord>>("GET", withQuery("/v1/channels", params));
  }

  createChannel(input: { tenant_id: string; channel_name: ChannelName; display_name: string; account_ref: string; conversation_ref: string; credential_ref?: string; trace_id: string }): Promise<ChannelConfigRecord> {
    return this.#request<ChannelConfigRecord>("POST", "/v1/channels", { body: input });
  }

  getChannel(channel_config_id: string): Promise<ChannelConfigRecord> {
    return this.#request<ChannelConfigRecord>("GET", `/v1/channels/${encodeURIComponent(channel_config_id)}`);
  }

  updateChannel(channel_config_id: string, input: { display_name?: string; account_ref?: string; conversation_ref?: string; credential_ref?: string; trace_id: string }): Promise<ChannelConfigRecord> {
    return this.#request<ChannelConfigRecord>("PATCH", `/v1/channels/${encodeURIComponent(channel_config_id)}`, { body: input });
  }

  setChannelStatus(channel_config_id: string, input: { status: ChannelConfigStatus; reason: string; trace_id: string }): Promise<ChannelConfigRecord> {
    return this.#request<ChannelConfigRecord>("POST", `/v1/channels/${encodeURIComponent(channel_config_id)}/status`, { body: input });
  }

  testChannel(channel_config_id: string, input: { trace_id: string }): Promise<ChannelConnectionTestResult> {
    return this.#request<ChannelConnectionTestResult>("POST", `/v1/channels/${encodeURIComponent(channel_config_id)}/test`, { body: input });
  }

  listPlugins(params: { limit?: number; cursor?: string } = {}): Promise<PlatformList<PluginInventoryEntry>> {
    return this.#request<PlatformList<PluginInventoryEntry>>("GET", withQuery("/v1/admin/plugins", params));
  }

  importPlugin(input: { source_kind: string; source_ref: string; display_name: string; version: string; expected_sha256: string; license: string; notice_status: string; risk_level?: string; trace_id: string }): Promise<PluginInventoryEntry> {
    return this.#request<PluginInventoryEntry>("POST", "/v1/admin/plugins/import", { body: input });
  }

  decidePluginAdmission(plugin_id: string, input: { decision: PluginAdmissionDecision; reason: string; tenant_scope?: readonly string[]; trace_id: string }): Promise<PluginInventoryEntry> {
    return this.#request<PluginInventoryEntry>("POST", `/v1/admin/plugins/${encodeURIComponent(plugin_id)}/admission`, { body: input });
  }

  async #request<T>(method: string, path: string, options: { body?: unknown; auth?: boolean } = {}): Promise<T> {
    assertPlatformPath(path);
    const headers: Record<string, string> = { accept: "application/json" };
    if (options.auth !== false) headers.authorization = `Bearer ${this.accessToken}`;
    if (options.body !== undefined) headers["content-type"] = "application/json";

    const response = await this.#fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      throw new NexusAgentApiError(
        response.status,
        typeof payload.code === "string" ? payload.code : "PLATFORM_INTERNAL_ERROR",
        typeof payload.message === "string" ? payload.message : "Platform API request failed",
        typeof payload.trace_id === "string" ? payload.trace_id : undefined,
        payload.details && typeof payload.details === "object" ? payload.details as Record<string, unknown> : {},
      );
    }
    return payload as T;
  }
}

export function createTraceFactory(prefix = "trace_sdk"): () => string {
  let sequence = 0;
  return () => {
    sequence += 1;
    return `${prefix}${String(sequence).padStart(4, "0")}`;
  };
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function withQuery(path: string, params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const serialized = query.toString();
  return serialized ? `${path}?${serialized}` : path;
}

function assertPlatformPath(path: string): void {
  if (!path.startsWith("/v1/") || path.includes("..")) {
    throw new NexusAgentApiError(400, "PLATFORM_INVALID_REQUEST", "SDK path must target a platform route");
  }
}
