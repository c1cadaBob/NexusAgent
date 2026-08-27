export const DOCS_SITE_SCHEMA_VERSION = "nexus.docs_site.p5.v1";

export interface RouteDoc {
  method: "GET" | "POST" | "PATCH";
  path: string;
  area: string;
  purpose: string;
}

export interface SdkMethodDoc {
  name: string;
  route: string;
  role: "unauthenticated" | "operator" | "tenant admin" | "platform admin";
}

export const DOCS_ROUTE_MATRIX: readonly RouteDoc[] = Object.freeze([
  { method: "GET", path: "/v1/health", area: "Health", purpose: "Read service health" },
  { method: "POST", path: "/v1/tasks", area: "Tasks", purpose: "Submit a task" },
  { method: "GET", path: "/v1/tasks", area: "Tasks", purpose: "List visible tasks" },
  { method: "GET", path: "/v1/tasks/{task_id}", area: "Tasks", purpose: "Read one task" },
  { method: "POST", path: "/v1/tasks/{task_id}/cancel", area: "Tasks", purpose: "Request cancellation" },
  { method: "POST", path: "/v1/tasks/{task_id}/retry", area: "Tasks", purpose: "Start another attempt" },
  { method: "GET", path: "/v1/tasks/{task_id}/events", area: "Events", purpose: "Read task events" },
  { method: "GET", path: "/v1/scheduled-goals/config", area: "Scheduled goals", purpose: "Read scheduled goal config" },
  { method: "PATCH", path: "/v1/scheduled-goals/config", area: "Scheduled goals", purpose: "Update scheduled goal config" },
  { method: "GET", path: "/v1/scheduled-goals", area: "Scheduled goals", purpose: "List scheduled goals" },
  { method: "POST", path: "/v1/scheduled-goals", area: "Scheduled goals", purpose: "Create scheduled goal" },
  { method: "GET", path: "/v1/scheduled-goals/{scheduled_goal_id}", area: "Scheduled goals", purpose: "Read scheduled goal" },
  { method: "PATCH", path: "/v1/scheduled-goals/{scheduled_goal_id}", area: "Scheduled goals", purpose: "Update scheduled goal" },
  { method: "POST", path: "/v1/scheduled-goals/{scheduled_goal_id}/cancel", area: "Scheduled goals", purpose: "Cancel scheduled goal" },
  { method: "POST", path: "/v1/scheduled-goals/{scheduled_goal_id}/retry", area: "Scheduled goals", purpose: "Retry scheduled goal" },
  { method: "POST", path: "/v1/scheduled-goals/run-due", area: "Scheduled goals", purpose: "Run manual due scan" },
  { method: "GET", path: "/v1/skills", area: "Skills", purpose: "List skills" },
  { method: "GET", path: "/v1/capabilities", area: "Capabilities", purpose: "List approved capabilities" },
  { method: "GET", path: "/v1/skill-evaluations/config", area: "Skill evaluations", purpose: "Read evaluation config" },
  { method: "PATCH", path: "/v1/skill-evaluations/config", area: "Skill evaluations", purpose: "Update evaluation config" },
  { method: "POST", path: "/v1/skill-evaluations/runs", area: "Skill evaluations", purpose: "Run evaluation" },
  { method: "GET", path: "/v1/skill-evaluations/runs", area: "Skill evaluations", purpose: "List evaluation runs" },
  { method: "GET", path: "/v1/skill-evaluations/runs/{run_id}", area: "Skill evaluations", purpose: "Read evaluation run" },
  { method: "POST", path: "/v1/memory/search", area: "Memory", purpose: "Search memory" },
  { method: "POST", path: "/v1/memory", area: "Memory", purpose: "Write memory" },
  { method: "GET", path: "/v1/memory/retention", area: "Memory", purpose: "Read retention policy" },
  { method: "PATCH", path: "/v1/memory/retention", area: "Memory", purpose: "Update retention policy" },
  { method: "POST", path: "/v1/memory/retention/sweep", area: "Memory", purpose: "Run retention sweep" },
  { method: "GET", path: "/v1/memory/conflicts", area: "Memory", purpose: "List memory conflicts" },
  { method: "GET", path: "/v1/memory/conflicts/{conflict_id}", area: "Memory", purpose: "Read memory conflict" },
  { method: "POST", path: "/v1/memory/conflicts/{conflict_id}/decision", area: "Memory", purpose: "Record conflict decision" },
  { method: "POST", path: "/v1/memory/{memory_id}/delete", area: "Memory", purpose: "Soft delete memory" },
  { method: "GET", path: "/v1/tenants", area: "Tenants", purpose: "List tenants" },
  { method: "GET", path: "/v1/tenants/{tenant_id}/users", area: "Tenants", purpose: "List tenant users" },
  { method: "GET", path: "/v1/permissions", area: "Permissions", purpose: "List permissions" },
  { method: "GET", path: "/v1/approvals", area: "Approvals", purpose: "List approvals" },
  { method: "POST", path: "/v1/approvals/{approval_id}/decision", area: "Approvals", purpose: "Record a decision" },
  { method: "POST", path: "/v1/budget/check", area: "Budget", purpose: "Check budget admission" },
  { method: "GET", path: "/v1/budget/policy", area: "Budget", purpose: "Read budget policy" },
  { method: "PATCH", path: "/v1/budget/policy", area: "Budget", purpose: "Update budget policy" },
  { method: "GET", path: "/v1/budget/ledger", area: "Budget", purpose: "List budget ledger" },
  { method: "GET", path: "/v1/channels", area: "Channels", purpose: "List channel configs" },
  { method: "POST", path: "/v1/channels", area: "Channels", purpose: "Create channel config" },
  { method: "GET", path: "/v1/channels/{channel_config_id}", area: "Channels", purpose: "Read channel config" },
  { method: "PATCH", path: "/v1/channels/{channel_config_id}", area: "Channels", purpose: "Update channel config" },
  { method: "POST", path: "/v1/channels/{channel_config_id}/status", area: "Channels", purpose: "Set channel status" },
  { method: "POST", path: "/v1/channels/{channel_config_id}/test", area: "Channels", purpose: "Run channel dry-run" },
  { method: "GET", path: "/v1/admin/plugins", area: "Plugin governance", purpose: "List plugin inventory" },
  { method: "POST", path: "/v1/admin/plugins/import", area: "Plugin governance", purpose: "Import plugin metadata" },
  { method: "POST", path: "/v1/admin/plugins/{plugin_id}/admission", area: "Plugin governance", purpose: "Set admission state" },
] as const);

export const SDK_METHOD_CATALOG: readonly SdkMethodDoc[] = Object.freeze([
  { name: "health", route: "/v1/health", role: "unauthenticated" },
  { name: "submitTask", route: "/v1/tasks", role: "operator" },
  { name: "listTasks", route: "/v1/tasks", role: "operator" },
  { name: "getTask", route: "/v1/tasks/{task_id}", role: "operator" },
  { name: "cancelTask", route: "/v1/tasks/{task_id}/cancel", role: "operator" },
  { name: "retryTask", route: "/v1/tasks/{task_id}/retry", role: "operator" },
  { name: "listTaskEvents", route: "/v1/tasks/{task_id}/events", role: "operator" },
  { name: "getScheduledGoalsConfig", route: "/v1/scheduled-goals/config", role: "operator" },
  { name: "updateScheduledGoalsConfig", route: "/v1/scheduled-goals/config", role: "tenant admin" },
  { name: "listScheduledGoals", route: "/v1/scheduled-goals", role: "operator" },
  { name: "createScheduledGoal", route: "/v1/scheduled-goals", role: "operator" },
  { name: "getScheduledGoal", route: "/v1/scheduled-goals/{scheduled_goal_id}", role: "operator" },
  { name: "updateScheduledGoal", route: "/v1/scheduled-goals/{scheduled_goal_id}", role: "operator" },
  { name: "cancelScheduledGoal", route: "/v1/scheduled-goals/{scheduled_goal_id}/cancel", role: "operator" },
  { name: "retryScheduledGoal", route: "/v1/scheduled-goals/{scheduled_goal_id}/retry", role: "operator" },
  { name: "runDueScheduledGoals", route: "/v1/scheduled-goals/run-due", role: "operator" },
  { name: "listSkills", route: "/v1/skills", role: "operator" },
  { name: "listCapabilities", route: "/v1/capabilities", role: "operator" },
  { name: "getSkillEvaluationConfig", route: "/v1/skill-evaluations/config", role: "tenant admin" },
  { name: "updateSkillEvaluationConfig", route: "/v1/skill-evaluations/config", role: "tenant admin" },
  { name: "runSkillEvaluation", route: "/v1/skill-evaluations/runs", role: "tenant admin" },
  { name: "listSkillEvaluationRuns", route: "/v1/skill-evaluations/runs", role: "tenant admin" },
  { name: "getSkillEvaluationRun", route: "/v1/skill-evaluations/runs/{run_id}", role: "tenant admin" },
  { name: "searchMemory", route: "/v1/memory/search", role: "operator" },
  { name: "writeMemory", route: "/v1/memory", role: "operator" },
  { name: "getMemoryRetentionPolicy", route: "/v1/memory/retention", role: "tenant admin" },
  { name: "updateMemoryRetentionPolicy", route: "/v1/memory/retention", role: "tenant admin" },
  { name: "sweepMemoryRetention", route: "/v1/memory/retention/sweep", role: "tenant admin" },
  { name: "listMemoryConflicts", route: "/v1/memory/conflicts", role: "tenant admin" },
  { name: "getMemoryConflict", route: "/v1/memory/conflicts/{conflict_id}", role: "tenant admin" },
  { name: "decideMemoryConflict", route: "/v1/memory/conflicts/{conflict_id}/decision", role: "tenant admin" },
  { name: "deleteMemory", route: "/v1/memory/{memory_id}/delete", role: "tenant admin" },
  { name: "listTenants", route: "/v1/tenants", role: "tenant admin" },
  { name: "listTenantUsers", route: "/v1/tenants/{tenant_id}/users", role: "tenant admin" },
  { name: "listPermissions", route: "/v1/permissions", role: "operator" },
  { name: "listApprovals", route: "/v1/approvals", role: "operator" },
  { name: "decideApproval", route: "/v1/approvals/{approval_id}/decision", role: "operator" },
  { name: "checkBudget", route: "/v1/budget/check", role: "operator" },
  { name: "getBudgetPolicy", route: "/v1/budget/policy", role: "tenant admin" },
  { name: "updateBudgetPolicy", route: "/v1/budget/policy", role: "tenant admin" },
  { name: "listBudgetLedger", route: "/v1/budget/ledger", role: "tenant admin" },
  { name: "listChannels", route: "/v1/channels", role: "tenant admin" },
  { name: "createChannel", route: "/v1/channels", role: "tenant admin" },
  { name: "getChannel", route: "/v1/channels/{channel_config_id}", role: "tenant admin" },
  { name: "updateChannel", route: "/v1/channels/{channel_config_id}", role: "tenant admin" },
  { name: "setChannelStatus", route: "/v1/channels/{channel_config_id}/status", role: "tenant admin" },
  { name: "testChannel", route: "/v1/channels/{channel_config_id}/test", role: "tenant admin" },
  { name: "listPlugins", route: "/v1/admin/plugins", role: "platform admin" },
  { name: "importPlugin", route: "/v1/admin/plugins/import", role: "platform admin" },
  { name: "decidePluginAdmission", route: "/v1/admin/plugins/{plugin_id}/admission", role: "platform admin" },
] as const);

export const ERROR_CODES = Object.freeze([
  "PLATFORM_INVALID_REQUEST",
  "PLATFORM_UNAUTHENTICATED",
  "PLATFORM_FORBIDDEN",
  "PLATFORM_NOT_FOUND",
  "PLATFORM_CONFLICT",
  "PLATFORM_RATE_LIMITED",
  "PLATFORM_POLICY_DENIED",
  "PLATFORM_INTERNAL_ERROR",
] as const);

export const SDK_SNIPPET = `const client = new NexusAgentClient({
  baseUrl: process.env.NEXUS_API_BASE_URL ?? "http://localhost:8080",
  accessToken: process.env.NEXUS_API_TOKEN ?? "dev-operator-alpha",
});

const task = await client.submitTask({
  tenant_id: "tenant_alpha01",
  user_id: "user_alpha01",
  agent_id: "agent_alpha01",
  conversation_id: "conv_sdk01",
  input: "Summarize the platform task queue",
  trace_id: trace(),
});`;

export const SCHEDULED_GOALS_DOC = "P7-05 scheduled goals are default off, use five-field UTC cron-like recurrence, and run only through manual due scans in P7 Alpha.";
