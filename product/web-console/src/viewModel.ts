import type {
  ApprovalRecord,
  BudgetCheckResult,
  CapabilityDescriptor,
  ChannelConfigRecord,
  ChannelConnectionTestResult,
  HealthStatus,
  MemoryRetentionPolicy,
  MemoryRetentionSweepResult,
  MemoryConflictRecord,
  MemoryRecord,
  PlatformEvent,
  PlatformTask,
  PluginInventoryEntry,
  PrincipalProfile,
  ScheduledGoalRecord,
  ScheduledGoalRunDueResult,
  ScheduledGoalsConfig,
  SkillEvaluationConfig,
  SkillEvaluationRunReport,
  SkillRecord,
  TenantRecord,
  TenantUserRecord,
  TokenBudgetLedgerEntry,
  TokenBudgetPolicy,
} from "./apiClient";

export const WEB_CONSOLE_VIEW_MODEL_VERSION = "nexus.web_console.view_model.p5.v1";

export const NAV_ITEMS = Object.freeze([
  { id: "overview", label: "Overview" },
  { id: "tenants", label: "Tenants" },
  { id: "channels", label: "Channels" },
  { id: "scheduled-goals", label: "Scheduled Goals" },
  { id: "tasks", label: "Tasks" },
  { id: "approvals", label: "Approvals" },
  { id: "skills", label: "Skills" },
  { id: "evaluations", label: "Evaluations" },
  { id: "memory", label: "Memory" },
  { id: "budget", label: "Budget" },
  { id: "plugins", label: "Plugins" },
] as const);

export type ConsoleViewId = typeof NAV_ITEMS[number]["id"];

export const PLUGIN_PUBLIC_COLUMNS = Object.freeze([
  "plugin_id",
  "display_name",
  "source_kind",
  "version",
  "sha256",
  "license",
  "notice_status",
  "risk_level",
  "allowlist_status",
  "capability_ids",
] as const);

export const CHANNEL_PUBLIC_COLUMNS = Object.freeze([
  "channel_config_id",
  "tenant_id",
  "channel_name",
  "display_name",
  "status",
  "capability_id",
  "account_ref",
  "conversation_ref",
  "credential_status",
  "updated_at",
  "trace_id",
] as const);

export interface ConsoleDataset {
  health?: HealthStatus;
  tasks: readonly PlatformTask[];
  taskEvents: readonly PlatformEvent[];
  tenants: readonly TenantRecord[];
  tenantUsers: readonly TenantUserRecord[];
  channels: readonly ChannelConfigRecord[];
  channelTest?: ChannelConnectionTestResult;
  scheduledGoals: readonly ScheduledGoalRecord[];
  scheduledGoalsConfig?: ScheduledGoalsConfig;
  scheduledGoalsRunDue?: ScheduledGoalRunDueResult;
  approvals: readonly ApprovalRecord[];
  skills: readonly SkillRecord[];
  capabilities: readonly CapabilityDescriptor[];
  skillEvaluationConfig?: SkillEvaluationConfig;
  skillEvaluationRuns?: readonly SkillEvaluationRunReport[];
  selectedSkillEvaluationRun?: SkillEvaluationRunReport;
  memory: readonly MemoryRecord[];
  memoryRetentionPolicy?: MemoryRetentionPolicy;
  memoryRetentionSweep?: MemoryRetentionSweepResult;
  memoryConflicts?: readonly MemoryConflictRecord[];
  budget?: BudgetCheckResult;
  budgetPolicy?: TokenBudgetPolicy;
  budgetLedger?: readonly TokenBudgetLedgerEntry[];
  plugins: readonly PluginInventoryEntry[];
}

export interface AgentSummary {
  agent_id: string;
  task_count: number;
  states: readonly string[];
  latest_task_id?: string;
}

export interface ConsoleDashboardModel {
  profile: {
    label: string;
    tenant_id: string;
    user_id: string;
    roles: readonly string[];
  };
  counters: {
    tasks: number;
    active_tasks: number;
    pending_approvals: number;
    approved_capabilities: number;
    channel_configs: number;
    plugin_entries: number;
    memory_records: number;
    skill_evaluation_runs: number;
    memory_conflicts: number;
    budget_ledger_entries: number;
    scheduled_goals: number;
  };
  agents: readonly AgentSummary[];
  channelRows: readonly Pick<ChannelConfigRecord, typeof CHANNEL_PUBLIC_COLUMNS[number]>[];
  scheduledGoalRows: readonly Record<string, unknown>[];
  scheduledGoalConfigRows: readonly Record<string, unknown>[];
  scheduledGoalRunDueRows: readonly Record<string, unknown>[];
  pluginRows: readonly Pick<PluginInventoryEntry, typeof PLUGIN_PUBLIC_COLUMNS[number]>[];
  memoryRetentionRows: readonly Record<string, unknown>[];
  memoryConflictRows: readonly Record<string, unknown>[];
  budgetPolicyRows: readonly Record<string, unknown>[];
  budgetLedgerRows: readonly Record<string, unknown>[];
  skillEvaluationRows: readonly Record<string, unknown>[];
  skillEvaluationCaseRows: readonly Record<string, unknown>[];
}

export function buildConsoleDashboardModel(profile: PrincipalProfile, data: ConsoleDataset): ConsoleDashboardModel {
  const model: ConsoleDashboardModel = {
    profile: {
      label: profile.label,
      tenant_id: profile.tenant_id,
      user_id: profile.user_id,
      roles: [...profile.roles],
    },
    counters: {
      tasks: data.tasks.length,
      active_tasks: data.tasks.filter((task) => !["completed", "failed", "cancelled", "archived"].includes(task.state)).length,
      pending_approvals: data.approvals.filter((approval) => approval.status === "pending").length,
      approved_capabilities: data.capabilities.filter((capability) => capability.status === "approved").length,
      channel_configs: data.channels.length,
      plugin_entries: data.plugins.length,
      memory_records: data.memory.length,
      skill_evaluation_runs: data.skillEvaluationRuns?.length ?? 0,
      memory_conflicts: data.memoryConflicts?.length ?? 0,
      budget_ledger_entries: data.budgetLedger?.length ?? 0,
      scheduled_goals: (data.scheduledGoals ?? []).length,
    },
    agents: summarizeAgents(data.tasks),
    channelRows: data.channels.map(projectChannelRow),
    scheduledGoalRows: projectScheduledGoalRows(data.scheduledGoals ?? []),
    scheduledGoalConfigRows: projectScheduledGoalConfigRows(data.scheduledGoalsConfig),
    scheduledGoalRunDueRows: projectScheduledGoalRunDueRows(data.scheduledGoalsRunDue),
    pluginRows: data.plugins.map(projectPluginRow),
    memoryRetentionRows: projectMemoryRetentionRows(data.memoryRetentionPolicy),
    memoryConflictRows: projectMemoryConflictRows(data.memoryConflicts ?? []),
    budgetPolicyRows: projectBudgetPolicyRows(data.budgetPolicy),
    budgetLedgerRows: projectBudgetLedgerRows(data.budgetLedger ?? []),
    skillEvaluationRows: projectSkillEvaluationRows(data.skillEvaluationRuns ?? []),
    skillEvaluationCaseRows: projectSkillEvaluationCaseRows(data.selectedSkillEvaluationRun),
  };
  assertConsolePublicValue(model);
  return model;
}

export function summarizeAgents(tasks: readonly PlatformTask[]): readonly AgentSummary[] {
  const agents = new Map<string, { task_count: number; states: Set<string>; latest_task_id?: string }>();
  for (const task of tasks) {
    const current = agents.get(task.agent_id) ?? { task_count: 0, states: new Set<string>() };
    current.task_count += 1;
    current.states.add(task.state);
    current.latest_task_id = task.task_id;
    agents.set(task.agent_id, current);
  }
  return [...agents.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([agent_id, value]) => ({
      agent_id,
      task_count: value.task_count,
      states: [...value.states].sort(),
      latest_task_id: value.latest_task_id,
    }));
}

export function projectChannelRow(entry: ChannelConfigRecord): Pick<ChannelConfigRecord, typeof CHANNEL_PUBLIC_COLUMNS[number]> {
  const row = {
    channel_config_id: entry.channel_config_id,
    tenant_id: entry.tenant_id,
    channel_name: entry.channel_name,
    display_name: entry.display_name,
    status: entry.status,
    capability_id: entry.capability_id,
    account_ref: entry.account_ref,
    conversation_ref: entry.conversation_ref,
    credential_status: entry.credential_status,
    updated_at: entry.updated_at,
    trace_id: entry.trace_id,
  };
  assertConsolePublicValue(row);
  return row;
}

export function projectScheduledGoalRows(goals: readonly ScheduledGoalRecord[]): readonly Record<string, unknown>[] {
  const rows = goals.map((goal) => ({
    scheduled_goal_id: goal.scheduled_goal_id,
    tenant_id: goal.tenant_id,
    user_id: goal.user_id,
    agent_id: goal.agent_id,
    conversation_id: goal.conversation_id,
    status: goal.status,
    cron: goal.cron,
    next_run_at_utc: goal.next_run_at_utc,
    last_run_status: goal.last_run_status,
    last_task_id: goal.last_task_id,
    run_count: goal.run_count,
    failure_count: goal.failure_count,
    budget_units: goal.budget_units,
    reason_codes: [...goal.reason_codes],
    trace_id: goal.trace_id,
  }));
  assertConsolePublicValue(rows);
  return rows;
}

export function projectScheduledGoalConfigRows(config: ScheduledGoalsConfig | undefined): readonly Record<string, unknown>[] {
  if (!config) return [];
  const rows = [{
    tenant_id: config.tenant_id,
    enabled: config.enabled,
    schedule_mode: config.schedule_mode,
    execution_mode: config.execution_mode,
    budget_mode: config.resource_budget.budget_mode,
    max_active_goals: config.resource_budget.max_active_goals,
    max_due_per_tick: config.resource_budget.max_due_per_tick,
    min_interval_minutes: config.resource_budget.min_interval_minutes,
    updated_at_utc: config.updated_at_utc,
    trace_id: config.trace_id,
  }];
  assertConsolePublicValue(rows);
  return rows;
}

export function projectScheduledGoalRunDueRows(result: ScheduledGoalRunDueResult | undefined): readonly Record<string, unknown>[] {
  if (!result) return [];
  const rows = result.items.length === 0
    ? [{
      tenant_id: result.tenant_id,
      status: result.status,
      scanned_count: result.scanned_count,
      due_count: result.due_count,
      submitted_count: result.submitted_count,
      blocked_count: result.blocked_count,
      failed_count: result.failed_count,
      checked_at_utc: result.checked_at_utc,
      trace_id: result.trace_id,
    }]
    : result.items.map((item) => ({
      scheduled_goal_id: item.scheduled_goal_id,
      tenant_id: item.tenant_id,
      user_id: item.user_id,
      agent_id: item.agent_id,
      task_id: item.task_id,
      status: item.status,
      next_run_at_utc: item.next_run_at_utc,
      reason_codes: [...item.reason_codes],
      trace_id: item.trace_id,
    }));
  assertConsolePublicValue(rows);
  return rows;
}

export function projectPluginRow(entry: PluginInventoryEntry): Pick<PluginInventoryEntry, typeof PLUGIN_PUBLIC_COLUMNS[number]> {
  const row = {
    plugin_id: entry.plugin_id,
    display_name: entry.display_name,
    source_kind: entry.source_kind,
    version: entry.version,
    sha256: entry.sha256,
    license: entry.license,
    notice_status: entry.notice_status,
    risk_level: entry.risk_level,
    allowlist_status: entry.allowlist_status,
    capability_ids: [...entry.capability_ids],
  };
  assertConsolePublicValue(row);
  return row;
}

export function visibleNavigation(profile: PrincipalProfile): readonly typeof NAV_ITEMS[number][] {
  return NAV_ITEMS.filter((item) => {
    if (item.id === "plugins") return profile.canManagePlugins;
    if (item.id === "channels") return profile.canReadChannels;
    if (item.id === "scheduled-goals") return profile.canReadScheduledGoals;
    if (item.id === "evaluations") return profile.canManageSkillEvaluation;
    if (item.id === "budget") return profile.canSubmitTask || profile.canManageTokenBudget;
    return true;
  });
}

export function actionEnabled(profile: PrincipalProfile, action: "submit_task" | "write_memory" | "manage_plugins" | "manage_channels" | "manage_scheduled_goals" | "manage_memory_retention" | "manage_memory_conflicts" | "manage_skill_evaluation" | "manage_token_budget"): boolean {
  if (action === "submit_task") return profile.canSubmitTask;
  if (action === "write_memory") return profile.canWriteMemory;
  if (action === "manage_channels") return profile.canManageChannels;
  if (action === "manage_scheduled_goals") return profile.canManageScheduledGoals;
  if (action === "manage_memory_retention") return profile.canManageMemoryRetention;
  if (action === "manage_memory_conflicts") return profile.canManageMemoryConflicts;
  if (action === "manage_skill_evaluation") return profile.canManageSkillEvaluation;
  if (action === "manage_token_budget") return profile.canManageTokenBudget;
  return profile.canManagePlugins;
}

export function projectMemoryRetentionRows(policy: MemoryRetentionPolicy | undefined): readonly Record<string, unknown>[] {
  if (!policy) return [];
  const rows = policy.rules.map((rule) => ({
    policy_id: policy.policy_id,
    tenant_id: policy.tenant_id,
    layer: rule.layer,
    enabled: rule.enabled,
    ttl_days: rule.ttl_days,
    action: rule.action,
    immutable: rule.immutable,
    mode: policy.mode,
    updated_at_utc: policy.updated_at_utc,
    trace_id: policy.trace_id,
  }));
  assertConsolePublicValue(rows);
  return rows;
}

export function projectMemoryConflictRows(conflicts: readonly MemoryConflictRecord[]): readonly Record<string, unknown>[] {
  const rows = conflicts.map((conflict) => ({
    conflict_id: conflict.conflict_id,
    tenant_id: conflict.tenant_id,
    layer: conflict.layer,
    status: conflict.status,
    expected_version: conflict.expected_version,
    current_version: conflict.current_version,
    reason_codes: [...conflict.reason_codes],
    scope_user_id: conflict.scope.user_id,
    scope_agent_id: conflict.scope.agent_id,
    scope_conversation_id: conflict.scope.conversation_id,
    updated_at_utc: conflict.updated_at_utc,
    trace_id: conflict.trace_id,
  }));
  assertConsolePublicValue(rows);
  return rows;
}

export function projectBudgetPolicyRows(policy: TokenBudgetPolicy | undefined): readonly Record<string, unknown>[] {
  if (!policy) return [];
  const rows = [{
    policy_id: policy.policy_id,
    tenant_id: policy.tenant_id,
    enabled: policy.enabled,
    dimension_mode: policy.dimension_mode,
    enforcement_scope: policy.enforcement_scope,
    tenant_units: policy.limits.tenant_units,
    user_units: policy.limits.user_units,
    agent_units: policy.limits.agent_units,
    task_units: policy.limits.task_units,
    max_units_per_attempt: policy.limits.max_units_per_attempt,
    updated_at_utc: policy.updated_at_utc,
    trace_id: policy.trace_id,
  }];
  assertConsolePublicValue(rows);
  return rows;
}

export function projectBudgetLedgerRows(entries: readonly TokenBudgetLedgerEntry[]): readonly Record<string, unknown>[] {
  const rows = entries.map((entry) => ({
    ledger_id: entry.ledger_id,
    policy_id: entry.policy_id,
    tenant_id: entry.tenant_id,
    user_id: entry.user_id,
    agent_id: entry.agent_id,
    task_id: entry.task_id,
    status: entry.status,
    requested_units: entry.requested_units,
    consumed_units: entry.consumed_units,
    remaining_units: entry.remaining_units,
    reason_codes: [...entry.reason_codes],
    recorded_at_utc: entry.recorded_at_utc,
    trace_id: entry.trace_id,
  }));
  assertConsolePublicValue(rows);
  return rows;
}

export function projectSkillEvaluationRows(runs: readonly SkillEvaluationRunReport[]): readonly Record<string, unknown>[] {
  const rows = runs.map((run) => ({
    run_id: run.run_id,
    tenant_id: run.tenant_id,
    suite_id: run.suite_id,
    status: run.status,
    total_cases: run.totals.total_cases,
    passed_cases: run.totals.passed_cases,
    failed_cases: run.totals.failed_cases,
    rejected_disabled_cases: run.totals.rejected_disabled_cases,
    completed_at_utc: run.completed_at_utc,
    trace_id: run.trace_id,
  }));
  assertConsolePublicValue(rows);
  return rows;
}

export function projectSkillEvaluationCaseRows(run: SkillEvaluationRunReport | undefined): readonly Record<string, unknown>[] {
  if (!run) return [];
  const rows = run.cases.map((item) => ({
    case_id: item.case_id,
    candidate_id: item.candidate_id,
    candidate_kind: item.candidate_kind,
    capability_type: item.capability_type,
    expected_outcome: item.expected_outcome,
    actual_outcome: item.actual_outcome,
    status: item.status,
    reason_codes: [...item.reason_codes],
  }));
  assertConsolePublicValue(rows);
  return rows;
}

export function assertConsolePublicValue(value: unknown): void {
  const serialized = JSON.stringify(value);
  const blocked = [
    "Her" + "mes",
    "Open" + "Claw",
    "Deep" + "Seek",
    "\\bD" + "SH\\b",
    "native" + "_",
    "raw" + "_credential",
    "credential" + "_material",
    "credential" + "_ref",
    "provider" + "_(?:agent|task|cancel|binding)",
    "source" + "_ref",
    "memory" + "_rejected_text",
    "stale" + "_payload",
    "session" + "_id",
    "file" + "_path",
    "memory" + "_path",
    "tool" + "_name",
    "https?:\\/\\/",
    "\\/(?:opt|tmp|var|etc|home|usr)\\/",
  ].join("|");
  if (new RegExp(blocked, "i").test(serialized)) {
    throw new Error("Console view-model contains a non-platform marker");
  }
}
