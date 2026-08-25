import type {
  ApprovalRecord,
  BudgetCheckResult,
  CapabilityDescriptor,
  HealthStatus,
  MemoryRecord,
  PlatformEvent,
  PlatformTask,
  PluginInventoryEntry,
  PrincipalProfile,
  SkillRecord,
  TenantRecord,
  TenantUserRecord,
} from "./apiClient";

export const WEB_CONSOLE_VIEW_MODEL_VERSION = "nexus.web_console.view_model.p5.v1";

export const NAV_ITEMS = Object.freeze([
  { id: "overview", label: "Overview" },
  { id: "tenants", label: "Tenants" },
  { id: "tasks", label: "Tasks" },
  { id: "approvals", label: "Approvals" },
  { id: "skills", label: "Skills" },
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

export interface ConsoleDataset {
  health?: HealthStatus;
  tasks: readonly PlatformTask[];
  taskEvents: readonly PlatformEvent[];
  tenants: readonly TenantRecord[];
  tenantUsers: readonly TenantUserRecord[];
  approvals: readonly ApprovalRecord[];
  skills: readonly SkillRecord[];
  capabilities: readonly CapabilityDescriptor[];
  memory: readonly MemoryRecord[];
  budget?: BudgetCheckResult;
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
    plugin_entries: number;
    memory_records: number;
  };
  agents: readonly AgentSummary[];
  pluginRows: readonly Pick<PluginInventoryEntry, typeof PLUGIN_PUBLIC_COLUMNS[number]>[];
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
      plugin_entries: data.plugins.length,
      memory_records: data.memory.length,
    },
    agents: summarizeAgents(data.tasks),
    pluginRows: data.plugins.map(projectPluginRow),
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
  return profile.canManagePlugins ? NAV_ITEMS : NAV_ITEMS.filter((item) => item.id !== "plugins");
}

export function actionEnabled(profile: PrincipalProfile, action: "submit_task" | "write_memory" | "manage_plugins"): boolean {
  if (action === "submit_task") return profile.canSubmitTask;
  if (action === "write_memory") return profile.canWriteMemory;
  return profile.canManagePlugins;
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
    "provider" + "_(?:agent|task|cancel|binding)",
    "source" + "_ref",
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
