import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createTraceFactory,
  DEV_PRINCIPALS,
  PlatformApiClient,
  PlatformApiError,
  type ApprovalRecord,
  type BudgetCheckResult,
  type CapabilityDescriptor,
  type ChannelConfigRecord,
  type ChannelConnectionTestResult,
  type ChannelName,
  type HealthStatus,
  type MemoryDeleteResult,
  type MemoryRecord,
  type MemoryRetentionPolicy,
  type MemoryRetentionSweepResult,
  type PlatformEvent,
  type PlatformTask,
  type PluginInventoryEntry,
  type PrincipalProfile,
  type SkillRecord,
  type TenantRecord,
  type TenantUserRecord,
} from "./apiClient";
import { actionEnabled, buildConsoleDashboardModel, visibleNavigation, type ConsoleDataset } from "./viewModel";
import type { ConsoleViewId } from "./viewModel";
import "./styles.css";

const initialDataset: ConsoleDataset = {
  tasks: [],
  taskEvents: [],
  tenants: [],
  tenantUsers: [],
  channels: [],
  approvals: [],
  skills: [],
  capabilities: [],
  memory: [],
  plugins: [],
};

function App() {
  const [profileKey, setProfileKey] = useState<PrincipalProfile["key"]>("operator");
  const profile = DEV_PRINCIPALS.find((item) => item.key === profileKey) ?? DEV_PRINCIPALS[2];
  const client = useMemo(() => new PlatformApiClient(profile), [profile]);
  const traceRef = useRef(createTraceFactory());
  const [activeView, setActiveView] = useState<ConsoleViewId>("overview");
  const [data, setData] = useState<ConsoleDataset>(initialDataset);
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [taskInput, setTaskInput] = useState("Review current platform task queue");
  const [conversationId, setConversationId] = useState("conv_console01");
  const [agentId, setAgentId] = useState("agent_alpha01");
  const [memoryText, setMemoryText] = useState("Platform console memory note");
  const [memoryQuery, setMemoryQuery] = useState("platform console");
  const [budgetUnits, setBudgetUnits] = useState("10");
  const [remainingUnits, setRemainingUnits] = useState("25");
  const [channelName, setChannelName] = useState<ChannelName>("dingtalk");
  const [channelDisplayName, setChannelDisplayName] = useState("");
  const [channelAccountRef, setChannelAccountRef] = useState("");
  const [channelConversationRef, setChannelConversationRef] = useState("");
  const [channelCredentialRef, setChannelCredentialRef] = useState("");
  const [pluginName, setPluginName] = useState("Approved Console Plugin");
  const [pluginHash, setPluginHash] = useState("c".repeat(64));

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const canReadTenants = profile.roles.includes("admin") || profile.roles.includes("tenant-admin") || profile.roles.includes("platform-admin") || profile.roles.includes("viewer");
      const [health, tasks, tenants, approvals, skills, capabilities] = await Promise.all([
        client.health(),
        client.listTasks({ tenant_id: profile.tenant_id }),
        canReadTenants ? client.listTenants() : Promise.resolve({ items: [] as TenantRecord[] }),
        client.listApprovals({ tenant_id: profile.tenant_id }),
        client.listSkills({ tenant_id: profile.tenant_id }),
        client.listCapabilities({ tenant_id: profile.tenant_id }),
      ]);

      const canReadTenantUsers = profile.roles.includes("admin") || profile.roles.includes("tenant-admin") || profile.roles.includes("platform-admin");
      const tenantUsers = canReadTenantUsers && tenants.items[0] ? await client.listTenantUsers(tenants.items[0].tenant_id) : { items: [] as TenantUserRecord[] };
      const task_id = selectedTaskId || tasks.items[0]?.task_id || "";
      const taskEvents = task_id ? await client.listTaskEvents(task_id) : { items: [] as PlatformEvent[] };
      const channels = profile.canReadChannels ? await client.listChannels({ tenant_id: profile.tenant_id }) : { items: [] as ChannelConfigRecord[] };
      const plugins = profile.canManagePlugins ? await client.listPlugins() : { items: [] as PluginInventoryEntry[] };
      const memoryRetentionPolicy = profile.canManageMemoryRetention ? await client.getMemoryRetentionPolicy({ tenant_id: profile.tenant_id, trace_id: traceRef.current() }) : undefined;

      setData((previous) => ({
        ...previous,
        health,
        tasks: tasks.items,
        tenants: tenants.items,
        tenantUsers: tenantUsers.items,
        channels: channels.items,
        approvals: approvals.items,
        skills: skills.items,
        capabilities: capabilities.items,
        taskEvents: taskEvents.items,
        plugins: plugins.items,
        memoryRetentionPolicy,
      }));
      setSelectedTaskId(task_id);
      setMessage("Refresh complete");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [client, profile, selectedTaskId]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const dashboard = buildConsoleDashboardModel(profile, data);
  const selectedTask = data.tasks.find((task) => task.task_id === selectedTaskId);

  async function runAction(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      setMessage(success);
      await refresh();
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  return (
    <main className="console-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <span className="folio">P5-02</span>
          <h1>NexusAgent Console</h1>
          <p>Platform API control surface</p>
        </div>
        <label className="field-label" htmlFor="principal">Principal</label>
        <select id="principal" value={profileKey} onChange={(event) => setProfileKey(event.target.value as PrincipalProfile["key"])}>
          {DEV_PRINCIPALS.map((principal) => <option key={principal.key} value={principal.key}>{principal.label}</option>)}
        </select>
        <nav className="nav-list" aria-label="Console sections">
          {visibleNavigation(profile).map((item, index) => (
            <button key={item.id} type="button" className={activeView === item.id ? "active" : ""} onClick={() => setActiveView(item.id)}>
              <span>{String(index + 1).padStart(2, "0")}</span>{item.label}
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{profile.tenant_id}</p>
            <h2>{profile.label}</h2>
          </div>
          <div className="topbar-actions">
            <span className="status-line">{data.health?.status ?? "not checked"}</span>
            <button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? "Refreshing" : "Refresh"}</button>
          </div>
        </header>

        {message && <div className="message" role="status">{message}</div>}

        {activeView === "overview" && <Overview health={data.health} dashboard={dashboard} />}
        {activeView === "tenants" && <Tenants tenants={data.tenants} users={data.tenantUsers} agents={dashboard.agents} />}
        {activeView === "channels" && profile.canReadChannels && (
          <Channels
            profile={profile}
            channels={data.channels}
            channelRows={dashboard.channelRows}
            lastTest={data.channelTest}
            channelName={channelName}
            setChannelName={setChannelName}
            displayName={channelDisplayName}
            setDisplayName={setChannelDisplayName}
            accountRef={channelAccountRef}
            setAccountRef={setChannelAccountRef}
            conversationRef={channelConversationRef}
            setConversationRef={setChannelConversationRef}
            credentialRef={channelCredentialRef}
            setCredentialRef={setChannelCredentialRef}
            onCreate={() => runAction(() => client.createChannel({ channel_name: channelName, display_name: channelDisplayName, account_ref: channelAccountRef, conversation_ref: channelConversationRef, credential_ref: channelCredentialRef || undefined, trace_id: traceRef.current() }), "Channel created")}
            onStatus={(channel_config_id, status) => runAction(() => client.setChannelStatus(channel_config_id, { status, reason: "Console status change", trace_id: traceRef.current() }), "Channel status updated")}
            onTest={(channel_config_id) => runAction(async () => {
              const result = await client.testChannel(channel_config_id, { trace_id: traceRef.current() });
              setData((previous) => ({ ...previous, channelTest: result }));
            }, "Channel test complete")}
          />
        )}
        {activeView === "tasks" && (
          <Tasks
            profile={profile}
            tasks={data.tasks}
            events={data.taskEvents}
            selectedTask={selectedTask}
            selectedTaskId={selectedTaskId}
            setSelectedTaskId={setSelectedTaskId}
            taskInput={taskInput}
            setTaskInput={setTaskInput}
            conversationId={conversationId}
            setConversationId={setConversationId}
            agentId={agentId}
            setAgentId={setAgentId}
            onSubmit={() => runAction(() => client.submitTask({ input: taskInput, conversation_id: conversationId, agent_id: agentId, trace_id: traceRef.current() }), "Task submitted")}
            onCancel={(task_id) => runAction(() => client.cancelTask(task_id, { reason: "Cancelled from console", trace_id: traceRef.current() }), "Cancel accepted")}
            onRetry={(task_id) => runAction(() => client.retryTask(task_id, { reason: "Retry from console", trace_id: traceRef.current() }), "Retry accepted")}
          />
        )}
        {activeView === "approvals" && <Approvals approvals={data.approvals} onDecision={(approval_id, decision) => runAction(() => client.decideApproval(approval_id, { decision, reason: "Console decision", trace_id: traceRef.current() }), "Approval updated")} />}
        {activeView === "skills" && <Skills skills={data.skills} capabilities={data.capabilities} />}
        {activeView === "memory" && (
          <MemoryPanel
            profile={profile}
            records={data.memory}
            retentionRows={dashboard.memoryRetentionRows}
            retentionPolicy={data.memoryRetentionPolicy}
            retentionSweep={data.memoryRetentionSweep}
            memoryText={memoryText}
            setMemoryText={setMemoryText}
            memoryQuery={memoryQuery}
            setMemoryQuery={setMemoryQuery}
            onWrite={() => runAction(() => client.writeMemory({ text: memoryText, layer: "user", trace_id: traceRef.current() }), "Memory written")}
            onSearch={() => runAction(async () => {
              const result = await client.searchMemory({ query: memoryQuery, layer: "user", trace_id: traceRef.current(), user_id: profile.user_id });
              setData((previous) => ({ ...previous, memory: result.items }));
            }, "Memory search complete")}
            onSweep={() => runAction(async () => {
              const result = await client.sweepMemoryRetention({ trace_id: traceRef.current() });
              setData((previous) => ({ ...previous, memoryRetentionSweep: result }));
            }, "Memory retention sweep complete")}
            onDelete={(memory_id) => runAction(async () => {
              const result = await client.deleteMemory(memory_id, { reason: "Console memory retention delete", trace_id: traceRef.current() });
              setData((previous) => ({ ...previous, memoryRetentionSweep: resultToSweep(result) }));
            }, "Memory deleted")}
          />
        )}
        {activeView === "budget" && (
          <BudgetPanel
            budget={data.budget}
            budgetUnits={budgetUnits}
            setBudgetUnits={setBudgetUnits}
            remainingUnits={remainingUnits}
            setRemainingUnits={setRemainingUnits}
            onCheck={() => runAction(async () => {
              const result = await client.checkBudget({ requested_units: Number(budgetUnits), remaining_units: Number(remainingUnits), max_units_per_attempt: Number(remainingUnits), trace_id: traceRef.current() });
              setData((previous) => ({ ...previous, budget: result }));
            }, "Budget checked")}
          />
        )}
        {activeView === "plugins" && profile.canManagePlugins && (
          <Plugins
            plugins={dashboard.pluginRows}
            pluginName={pluginName}
            setPluginName={setPluginName}
            pluginHash={pluginHash}
            setPluginHash={setPluginHash}
            onImport={() => runAction(() => client.importPlugin({ source_kind: "package_registry", source_ref: "registry:console.approved", display_name: pluginName, version: "1.0.0", expected_sha256: pluginHash, license: "MIT", notice_status: "recorded", risk_level: "medium", trace_id: traceRef.current() }), "Plugin imported")}
            onAdmission={(plugin_id, decision) => runAction(() => client.decidePluginAdmission(plugin_id, { decision, reason: "Console admission decision", trace_id: traceRef.current() }), "Plugin admission updated")}
          />
        )}
      </section>
    </main>
  );
}

function Overview({ health, dashboard }: { health?: HealthStatus; dashboard: ReturnType<typeof buildConsoleDashboardModel> }) {
  return <section className="grid-panel">
    <Metric label="Health" value={health?.status ?? "not checked"} />
    <Metric label="Tasks" value={dashboard.counters.tasks} />
    <Metric label="Active tasks" value={dashboard.counters.active_tasks} />
    <Metric label="Pending approvals" value={dashboard.counters.pending_approvals} />
    <Metric label="Approved capabilities" value={dashboard.counters.approved_capabilities} />
    <Metric label="Channels" value={dashboard.counters.channel_configs} />
    <Metric label="Plugin entries" value={dashboard.counters.plugin_entries} />
  </section>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <article className="metric"><span>{label}</span><strong>{value}</strong></article>;
}

function Tenants({ tenants, users, agents }: { tenants: readonly TenantRecord[]; users: readonly TenantUserRecord[]; agents: ReturnType<typeof buildConsoleDashboardModel>["agents"] }) {
  return <section className="two-column">
    <Table title="Tenants" rows={tenants} columns={["tenant_id", "name", "status", "created_at"]} />
    <Table title="Users" rows={users} columns={["tenant_id", "user_id", "roles", "status"]} />
    <Table title="Agents" rows={agents} columns={["agent_id", "task_count", "states", "latest_task_id"]} />
  </section>;
}

function Channels(props: {
  profile: PrincipalProfile;
  channels: readonly ChannelConfigRecord[];
  channelRows: readonly Record<string, unknown>[];
  lastTest?: ChannelConnectionTestResult;
  channelName: ChannelName;
  setChannelName: (value: ChannelName) => void;
  displayName: string;
  setDisplayName: (value: string) => void;
  accountRef: string;
  setAccountRef: (value: string) => void;
  conversationRef: string;
  setConversationRef: (value: string) => void;
  credentialRef: string;
  setCredentialRef: (value: string) => void;
  onCreate: () => void;
  onStatus: (channel_config_id: string, status: "enabled" | "disabled") => void;
  onTest: (channel_config_id: string) => void;
}) {
  const canManage = actionEnabled(props.profile, "manage_channels");
  return <section className="stack">
    <form className="form-grid channel-form" onSubmit={(event) => { event.preventDefault(); props.onCreate(); }}>
      <label>Channel<select value={props.channelName} onChange={(event) => props.setChannelName(event.target.value as ChannelName)} disabled={!canManage}><option value="dingtalk">dingtalk</option><option value="feishu">feishu</option><option value="telegram">telegram</option></select></label>
      <label>Display name<input value={props.displayName} onChange={(event) => props.setDisplayName(event.target.value)} disabled={!canManage} placeholder="Channel display name" /></label>
      <label>Account ref<input value={props.accountRef} onChange={(event) => props.setAccountRef(event.target.value)} disabled={!canManage} placeholder="channel_account_*" /></label>
      <label>Conversation ref<input value={props.conversationRef} onChange={(event) => props.setConversationRef(event.target.value)} disabled={!canManage} placeholder="channel_conversation_*" /></label>
      <label>Credential ref<input value={props.credentialRef} onChange={(event) => props.setCredentialRef(event.target.value)} disabled={!canManage} placeholder="cred_*" /></label>
      <button type="submit" disabled={!canManage}>Create channel</button>
    </form>
    <Table title="Channels" rows={props.channelRows} columns={["channel_config_id", "tenant_id", "channel_name", "display_name", "status", "capability_id", "account_ref", "conversation_ref", "credential_status", "updated_at", "trace_id"]} />
    <div className="button-row">{props.channels.map((channel) => <React.Fragment key={channel.channel_config_id}><button type="button" disabled={!canManage || channel.status === "enabled"} onClick={() => props.onStatus(channel.channel_config_id, "enabled")}>Enable {channel.channel_config_id}</button><button type="button" disabled={!canManage || channel.status === "disabled"} onClick={() => props.onStatus(channel.channel_config_id, "disabled")}>Disable {channel.channel_config_id}</button><button type="button" disabled={!canManage || channel.status !== "enabled"} onClick={() => props.onTest(channel.channel_config_id)}>Test {channel.channel_config_id}</button></React.Fragment>)}</div>
    {props.lastTest ? <Table title="Channel test" rows={[props.lastTest]} columns={["channel_config_id", "tenant_id", "channel_name", "test_status", "policy_gate_status", "delivery_outcome", "checked_at", "trace_id"]} /> : <EmptyState text="No channel test result" />}
  </section>;
}

function Tasks(props: {
  profile: PrincipalProfile;
  tasks: readonly PlatformTask[];
  events: readonly PlatformEvent[];
  selectedTask?: PlatformTask;
  selectedTaskId: string;
  setSelectedTaskId: (value: string) => void;
  taskInput: string;
  setTaskInput: (value: string) => void;
  conversationId: string;
  setConversationId: (value: string) => void;
  agentId: string;
  setAgentId: (value: string) => void;
  onSubmit: () => void;
  onCancel: (task_id: string) => void;
  onRetry: (task_id: string) => void;
}) {
  return <section className="stack">
    <form className="form-grid" onSubmit={(event) => { event.preventDefault(); props.onSubmit(); }}>
      <label>Task input<input value={props.taskInput} onChange={(event) => props.setTaskInput(event.target.value)} disabled={!actionEnabled(props.profile, "submit_task")} /></label>
      <label>Conversation ID<input value={props.conversationId} onChange={(event) => props.setConversationId(event.target.value)} disabled={!actionEnabled(props.profile, "submit_task")} /></label>
      <label>Agent ID<input value={props.agentId} onChange={(event) => props.setAgentId(event.target.value)} disabled={!actionEnabled(props.profile, "submit_task")} /></label>
      <button type="submit" disabled={!actionEnabled(props.profile, "submit_task")}>Submit task</button>
    </form>
    <Table title="Tasks" rows={props.tasks} columns={["task_id", "state", "agent_id", "attempt_id", "execution_id", "conversation_id", "trace_id"]} onRowClick={(row) => props.setSelectedTaskId(String(row.task_id ?? ""))} selectedId={props.selectedTaskId} idKey="task_id" />
    {props.selectedTask && <div className="button-row"><button type="button" onClick={() => props.onCancel(props.selectedTask!.task_id)}>Cancel</button><button type="button" onClick={() => props.onRetry(props.selectedTask!.task_id)}>Retry</button></div>}
    <Table title="Task events" rows={props.events} columns={["event_id", "event_type", "task_id", "attempt_id", "execution_id", "trace_id", "occurred_at"]} />
  </section>;
}

function Approvals({ approvals, onDecision }: { approvals: readonly ApprovalRecord[]; onDecision: (approval_id: string, decision: "approve" | "reject") => void }) {
  return <section className="stack">
    <Table title="Approvals" rows={approvals} columns={["approval_id", "tenant_id", "task_id", "status", "reason", "trace_id"]} />
    <div className="button-row">{approvals.filter((approval) => approval.status === "pending").map((approval) => <React.Fragment key={approval.approval_id}><button type="button" onClick={() => onDecision(approval.approval_id, "approve")}>Approve {approval.approval_id}</button><button type="button" onClick={() => onDecision(approval.approval_id, "reject")}>Reject {approval.approval_id}</button></React.Fragment>)}</div>
  </section>;
}

function Skills({ skills, capabilities }: { skills: readonly SkillRecord[]; capabilities: readonly CapabilityDescriptor[] }) {
  return <section className="two-column"><Table title="Skills" rows={skills} columns={["skill_id", "tenant_id", "display_name", "status", "version", "capability_ids"]} /><Table title="Capabilities" rows={capabilities} columns={["capability_id", "capability_type", "display_name", "plugin_id", "status", "risk_level", "required_permissions"]} /></section>;
}

function MemoryPanel(props: { profile: PrincipalProfile; records: readonly MemoryRecord[]; retentionRows: readonly Record<string, unknown>[]; retentionPolicy?: MemoryRetentionPolicy; retentionSweep?: MemoryRetentionSweepResult; memoryText: string; setMemoryText: (value: string) => void; memoryQuery: string; setMemoryQuery: (value: string) => void; onWrite: () => void; onSearch: () => void; onSweep: () => void; onDelete: (memory_id: string) => void }) {
  const canManageRetention = actionEnabled(props.profile, "manage_memory_retention");
  return <section className="stack"><form className="form-grid" onSubmit={(event) => { event.preventDefault(); props.onWrite(); }}><label>Memory text<input value={props.memoryText} onChange={(event) => props.setMemoryText(event.target.value)} disabled={!actionEnabled(props.profile, "write_memory")} /></label><button type="submit" disabled={!actionEnabled(props.profile, "write_memory")}>Write memory</button></form><form className="form-grid" onSubmit={(event) => { event.preventDefault(); props.onSearch(); }}><label>Memory query<input value={props.memoryQuery} onChange={(event) => props.setMemoryQuery(event.target.value)} /></label><button type="submit">Search memory</button></form><Table title="Memory results" rows={props.records} columns={["memory_id", "tenant_id", "layer", "text", "score", "trace_id"]} />{canManageRetention && <><Table title="Memory retention policy" rows={props.retentionRows} columns={["policy_id", "tenant_id", "layer", "enabled", "ttl_days", "action", "immutable", "mode", "updated_at_utc", "trace_id"]} /><div className="button-row"><button type="button" onClick={props.onSweep}>Run retention sweep</button>{props.records.map((record) => <button type="button" key={record.memory_id} onClick={() => props.onDelete(record.memory_id)}>Delete {record.memory_id}</button>)}</div>{props.retentionSweep ? <Table title="Memory retention sweep" rows={[props.retentionSweep]} columns={["tenant_id", "policy_id", "scanned_count", "deleted_count", "skipped_count", "swept_at_utc", "trace_id"]} /> : <EmptyState text="No retention sweep result" />}</>}</section>;
}

function resultToSweep(result: MemoryDeleteResult): MemoryRetentionSweepResult {
  return {
    schema_version: result.schema_version,
    tenant_id: result.tenant_id,
    policy_id: `memory_retention_${result.tenant_id.replace(/^tenant_/, "")}`,
    scanned_count: 1,
    deleted_count: 1,
    skipped_count: 0,
    items: [result],
    resource_budget: { evaluation_mode: "manual_sweep", max_sweep_records: 1, evaluated_records: 1 },
    swept_at_utc: result.deleted_at_utc,
    monotonic_ms: result.monotonic_ms,
    trace_id: result.trace_id,
  };
}

function BudgetPanel(props: { budget?: BudgetCheckResult; budgetUnits: string; setBudgetUnits: (value: string) => void; remainingUnits: string; setRemainingUnits: (value: string) => void; onCheck: () => void }) {
  return <section className="stack"><form className="form-grid" onSubmit={(event) => { event.preventDefault(); props.onCheck(); }}><label>Requested units<input type="number" min="1" value={props.budgetUnits} onChange={(event) => props.setBudgetUnits(event.target.value)} /></label><label>Remaining units<input type="number" min="0" value={props.remainingUnits} onChange={(event) => props.setRemainingUnits(event.target.value)} /></label><button type="submit">Check budget</button></form>{props.budget ? <Table title="Budget decision" rows={[props.budget]} columns={["tenant_id", "status", "requested_units", "remaining_units", "code", "reasons", "trace_id"]} /> : <EmptyState text="No budget decision yet" />}</section>;
}

function Plugins(props: { plugins: readonly Record<string, unknown>[]; pluginName: string; setPluginName: (value: string) => void; pluginHash: string; setPluginHash: (value: string) => void; onImport: () => void; onAdmission: (plugin_id: string, decision: "approve" | "disable" | "reject") => void }) {
  return <section className="stack"><form className="form-grid" onSubmit={(event) => { event.preventDefault(); props.onImport(); }}><label>Display name<input value={props.pluginName} onChange={(event) => props.setPluginName(event.target.value)} /></label><label>Expected SHA-256<input value={props.pluginHash} onChange={(event) => props.setPluginHash(event.target.value)} /></label><button type="submit">Import plugin metadata</button></form><Table title="Plugin inventory" rows={props.plugins} columns={["plugin_id", "display_name", "source_kind", "version", "sha256", "license", "notice_status", "risk_level", "allowlist_status", "capability_ids"]} /><div className="button-row">{props.plugins.map((plugin) => <React.Fragment key={String(plugin.plugin_id)}><button type="button" onClick={() => props.onAdmission(String(plugin.plugin_id), "approve")}>Approve {String(plugin.plugin_id)}</button><button type="button" onClick={() => props.onAdmission(String(plugin.plugin_id), "disable")}>Disable {String(plugin.plugin_id)}</button><button type="button" onClick={() => props.onAdmission(String(plugin.plugin_id), "reject")}>Reject {String(plugin.plugin_id)}</button></React.Fragment>)}</div></section>;
}

function Table({ title, rows, columns, onRowClick, selectedId, idKey }: { title: string; rows: readonly object[]; columns: readonly string[]; onRowClick?: (row: Record<string, unknown>) => void; selectedId?: string; idKey?: string }) {
  return <section className="table-block"><h3>{title}</h3>{rows.length === 0 ? <EmptyState text={`No ${title.toLowerCase()} records`} /> : <div className="table-scroll"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => {
    const record = row as Record<string, unknown>;
    return <tr key={String(record[idKey ?? columns[0]] ?? index)} className={selectedId && idKey && record[idKey] === selectedId ? "selected" : ""} onClick={() => onRowClick?.(record)}>{columns.map((column) => <td key={column}>{cellValue(record[column])}</td>)}</tr>;
  })}</tbody></table></div>}</section>;
}

function EmptyState({ text }: { text: string }) {
  return <p className="empty-state">{text}</p>;
}

function cellValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function errorMessage(error: unknown): string {
  if (error instanceof PlatformApiError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "Console action failed";
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
