import type {
  ApprovalRecord,
  BudgetCheckResult,
  CapabilityDescriptor,
  ChannelConfigRecord,
  ChannelConnectionTestResult,
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
  { id: "channels", label: "Channels" },
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
    channel_configs: number;
    plugin_entries: number;
    memory_records: number;
  };
  agents: readonly AgentSummary[];
  channelRows: readonly Pick<ChannelConfigRecord, typeof CHANNEL_PUBLIC_COLUMNS[number]>[];
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
      channel_configs: data.channels.length,
      plugin_entries: data.plugins.length,
      memory_records: data.memory.length,
    },
    agents: summarizeAgents(data.tasks),
    channelRows: data.channels.map(projectChannelRow),
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
    return true;
  });
}

export function actionEnabled(profile: PrincipalProfile, action: "submit_task" | "write_memory" | "manage_plugins" | "manage_channels"): boolean {
  if (action === "submit_task") return profile.canSubmitTask;
  if (action === "write_memory") return profile.canWriteMemory;
  if (action === "manage_channels") return profile.canManageChannels;
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
    "credential" + "_ref",
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
