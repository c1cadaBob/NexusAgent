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
  type MemoryConflictRecord,
  type MemoryRecord,
  type MemoryRetentionPolicy,
  type MemoryRetentionSweepResult,
  type PlatformEvent,
  type PlatformTask,
  type PluginInventoryEntry,
  type PrincipalProfile,
  type ScheduledGoalRecord,
  type ScheduledGoalRunDueResult,
  type ScheduledGoalsConfig,
  type SkillEvaluationConfig,
  type SkillEvaluationRunReport,
  type SkillRecord,
  type TenantRecord,
  type TenantUserRecord,
  type TokenBudgetLedgerEntry,
  type TokenBudgetPolicy,
} from "./apiClient";
import { actionEnabled, buildConsoleDashboardModel, buildConversationWorkbenchModel, visibleNavigation, type ConsoleDataset } from "./viewModel";
import type { ConsoleViewId } from "./viewModel";
import "./styles.css";

type ConversationWorkbenchModel = ReturnType<typeof buildConversationWorkbenchModel>;
type ConversationSummary = ConversationWorkbenchModel["conversations"][number];
type ConversationTurn = ConversationWorkbenchModel["transcript"][number];
type ConversationEvent = ConversationWorkbenchModel["selectedTaskEvents"][number];

const initialDataset: ConsoleDataset = {
  tasks: [],
  taskEvents: [],
  tenants: [],
  tenantUsers: [],
  channels: [],
  scheduledGoals: [],
  approvals: [],
  skills: [],
  capabilities: [],
  skillEvaluationRuns: [],
  memory: [],
  memoryConflicts: [],
  budgetLedger: [],
  plugins: [],
};

function App() {
  const [profileKey, setProfileKey] = useState<PrincipalProfile["key"]>("operator");
  const profile = DEV_PRINCIPALS.find((item) => item.key === profileKey) ?? DEV_PRINCIPALS[2];
  const client = useMemo(() => new PlatformApiClient(profile), [profile]);
  const traceRef = useRef(createTraceFactory());
  const [activeView, setActiveView] = useState<ConsoleViewId>("tasks");
  const [data, setData] = useState<ConsoleDataset>(initialDataset);
  const [selectedConversationId, setSelectedConversationId] = useState<string>("");
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [taskInput, setTaskInput] = useState("Review current platform task queue");
  const [conversationId, setConversationId] = useState("");
  const [agentId, setAgentId] = useState("agent_alpha01");
  const [scheduledGoalInput, setScheduledGoalInput] = useState("Review current platform task queue");
  const [scheduledGoalCron, setScheduledGoalCron] = useState("*/5 * * * *");
  const [scheduledGoalBudgetUnits, setScheduledGoalBudgetUnits] = useState("10");
  const [memoryText, setMemoryText] = useState("Platform console memory note");
  const [memoryQuery, setMemoryQuery] = useState("platform console");
  const [budgetUnits, setBudgetUnits] = useState("10");
  const [taskBudgetUnits, setTaskBudgetUnits] = useState("");
  const [tenantBudgetLimit, setTenantBudgetLimit] = useState("100000");
  const [userBudgetLimit, setUserBudgetLimit] = useState("50000");
  const [agentBudgetLimit, setAgentBudgetLimit] = useState("50000");
  const [taskBudgetLimit, setTaskBudgetLimit] = useState("10000");
  const [attemptBudgetLimit, setAttemptBudgetLimit] = useState("5000");
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
      const previewWorkbench = buildConversationWorkbenchModel({
        ...initialDataset,
        tasks: tasks.items,
        taskEvents: [],
        taskEventsByTaskId: {},
      }, selectedConversationId || undefined, selectedTaskId || undefined);
      const selectedConversation = previewWorkbench.selectedConversation;
      const conversationTasks = selectedConversation === undefined
        ? []
        : tasks.items.filter((task) => task.conversation_id === selectedConversation.conversation_id);
      const taskEventsByTaskIdEntries = await Promise.all(conversationTasks.map(async (task) => [task.task_id, (await client.listTaskEvents(task.task_id)).items] as const));
      const taskEventsByTaskId = Object.fromEntries(taskEventsByTaskIdEntries) as Readonly<Record<string, readonly PlatformEvent[]>>;
      const workbench = buildConversationWorkbenchModel({
        ...initialDataset,
        tasks: tasks.items,
        taskEvents: [],
        taskEventsByTaskId,
      }, selectedConversationId || undefined, selectedTaskId || undefined);
      const nextSelectedTaskId = workbench.selectedTask?.task_id ?? "";
      const nextSelectedConversationId = workbench.selectedConversation?.conversation_id ?? "";
      const selectedTaskEvents = nextSelectedTaskId ? taskEventsByTaskId[nextSelectedTaskId] ?? [] : [];
      const channels = profile.canReadChannels ? await client.listChannels({ tenant_id: profile.tenant_id }) : { items: [] as ChannelConfigRecord[] };
      const scheduledGoalsConfig = profile.canReadScheduledGoals ? await client.getScheduledGoalsConfig({ tenant_id: profile.tenant_id, trace_id: traceRef.current() }) : undefined;
      const scheduledGoals = profile.canReadScheduledGoals ? await client.listScheduledGoals({ tenant_id: profile.tenant_id }) : { items: [] as ScheduledGoalRecord[] };
      const plugins = profile.canManagePlugins ? await client.listPlugins() : { items: [] as PluginInventoryEntry[] };
      const skillEvaluationConfig = profile.canManageSkillEvaluation ? await client.getSkillEvaluationConfig({ tenant_id: profile.tenant_id, trace_id: traceRef.current() }) : undefined;
      const skillEvaluationRuns = profile.canManageSkillEvaluation ? await client.listSkillEvaluationRuns({ tenant_id: profile.tenant_id }) : { items: [] as SkillEvaluationRunReport[] };
      const memoryRetentionPolicy = profile.canManageMemoryRetention ? await client.getMemoryRetentionPolicy({ tenant_id: profile.tenant_id, trace_id: traceRef.current() }) : undefined;
      const memoryConflicts = profile.canManageMemoryConflicts ? await client.listMemoryConflicts({ tenant_id: profile.tenant_id }) : { items: [] as MemoryConflictRecord[] };
      const budgetPolicy = profile.canManageTokenBudget ? await client.getBudgetPolicy({ tenant_id: profile.tenant_id, trace_id: traceRef.current() }) : undefined;
      const budgetLedger = profile.canManageTokenBudget ? await client.listBudgetLedger({ tenant_id: profile.tenant_id }) : { items: [] as TokenBudgetLedgerEntry[] };

      setData((previous) => ({
        ...previous,
        health,
        tasks: tasks.items,
        tenants: tenants.items,
        tenantUsers: tenantUsers.items,
        channels: channels.items,
        scheduledGoals: scheduledGoals.items,
        scheduledGoalsConfig,
        approvals: approvals.items,
        skills: skills.items,
        capabilities: capabilities.items,
        taskEvents: selectedTaskEvents,
        taskEventsByTaskId,
        plugins: plugins.items,
        skillEvaluationConfig,
        skillEvaluationRuns: skillEvaluationRuns.items,
        selectedSkillEvaluationRun: skillEvaluationRuns.items.at(-1),
        memoryRetentionPolicy,
        memoryConflicts: memoryConflicts.items,
        budgetPolicy,
        budgetLedger: budgetLedger.items,
      }));
      setSelectedConversationId(nextSelectedConversationId);
      setConversationId((current) => current ? current : nextSelectedConversationId);
      setSelectedTaskId(nextSelectedTaskId);
      setMessage("Refresh complete");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [client, profile, selectedConversationId, selectedTaskId]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const dashboard = buildConsoleDashboardModel(profile, data);
  const workbench = useMemo(() => buildConversationWorkbenchModel(data, selectedConversationId || undefined, selectedTaskId || undefined), [data, selectedConversationId, selectedTaskId]);
  const selectedTask = workbench.selectedTask;
  const selectedConversation = workbench.selectedConversation;
  const selectedTaskEvents = workbench.selectedTaskEvents;
  const conversationTasks = workbench.transcript;
  const workspaceButtons = visibleNavigation(profile);

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
      <aside className="rail rail-left">
        <section className="rail-section principal-gate">
          <div className="brand-block">
            <span className="folio">P5-02</span>
            <h1>NexusAgent Console</h1>
            <p>Conversation workbench and inspector</p>
          </div>
          <label className="field-label" htmlFor="principal">Principal</label>
          <select id="principal" value={profileKey} onChange={(event) => setProfileKey(event.target.value as PrincipalProfile["key"])}>
            {DEV_PRINCIPALS.map((principal) => <option key={principal.key} value={principal.key}>{principal.label}</option>)}
          </select>
          <div className="status-stack">
            <span className="status-line">{profile.tenant_id}</span>
            <span className="status-line">{data.health?.status ?? "not checked"}</span>
          </div>
        </section>
        <section className="rail-section">
          <div className="section-heading">
            <h2>Conversations</h2>
            <span>{workbench.conversations.length}</span>
          </div>
          <Table
            title="Conversation index"
            rows={workbench.conversations}
            columns={["conversation_id", "task_count", "latest_task_state", "latest_updated_at", "latest_trace_id"]}
            onRowClick={(row) => {
              const conversation_id = String(row.conversation_id ?? "");
              const latest_task_id = String(row.latest_task_id ?? "");
              setSelectedConversationId(conversation_id);
              setConversationId(conversation_id);
              setSelectedTaskId(latest_task_id);
            }}
            selectedId={selectedConversation?.conversation_id}
            idKey="conversation_id"
          />
        </section>
      </aside>

      <section className="workbench">
        <header className="workbench-header">
          <div className="workbench-heading">
            <p className="eyebrow">{profile.label}</p>
            <h2>{selectedConversation?.conversation_id ?? "No conversation selected"}</h2>
            <p>{selectedConversation ? `${selectedConversation.task_count} tasks, ${selectedConversation.agent_ids.length} agents, ${selectedConversation.user_ids.length} users` : "The transcript projection is task-backed and platform-neutral."}</p>
          </div>
          <div className="topbar-actions">
            <span className="status-line">{data.health?.status ?? "not checked"}</span>
            <button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? "Refreshing" : "Refresh"}</button>
          </div>
        </header>

        {message && <div className="message" role="status">{message}</div>}

        <section className="workbench-grid">
          <ConversationTranscript
            conversation={selectedConversation}
            turns={conversationTasks}
            onSelectTask={(task_id) => setSelectedTaskId(task_id)}
          />
          <ConversationComposer
            profile={profile}
            conversationId={conversationId}
            setConversationId={setConversationId}
            agentId={agentId}
            setAgentId={setAgentId}
            taskInput={taskInput}
            setTaskInput={setTaskInput}
            budgetUnits={taskBudgetUnits}
            setBudgetUnits={setTaskBudgetUnits}
            selectedConversation={selectedConversation}
            onSubmit={() => runAction(async () => {
              const task = await client.submitTask({
                input: taskInput,
                conversation_id: conversationId || selectedConversation?.conversation_id || "",
                agent_id: agentId,
                trace_id: traceRef.current(),
                ...(taskBudgetUnits ? { budget_units: Number(taskBudgetUnits) } : {}),
              });
              setSelectedConversationId(task.conversation_id);
              setConversationId(task.conversation_id);
              setSelectedTaskId(task.task_id);
            }, "Task submitted")}
          />
        </section>
      </section>

      <aside className="rail rail-right">
        <section className="rail-section">
          <div className="section-heading">
            <h2>Inspector</h2>
            <span>{inspectorLabel(activeView)}</span>
          </div>
          <nav className="workspace-tabs" aria-label="Inspector workspaces">
            {workspaceButtons.map((item) => (
              <button key={item.id} type="button" className={activeView === item.id ? "active" : ""} onClick={() => setActiveView(item.id)}>
                {item.label}
              </button>
            ))}
          </nav>
          <div className="inspector-summary">
            <p className="eyebrow">{selectedTask?.task_id ?? "No task selected"}</p>
            <h3>{selectedTask?.state ?? "No task selected"}</h3>
            <p>{selectedTask ? selectedTask.input : "Select a conversation turn to inspect its task and event history."}</p>
          </div>
        </section>
        <section className="rail-section inspector-body">
          {activeView === "tasks" && (
            <TaskInspector
              tasks={conversationTasks}
              selectedTask={selectedTask}
              selectedTaskEvents={selectedTaskEvents}
              selectedTaskId={selectedTaskId}
              setSelectedTaskId={setSelectedTaskId}
              onCancel={(task_id) => runAction(() => client.cancelTask(task_id, { reason: "Cancelled from console", trace_id: traceRef.current() }), "Cancel accepted")}
              onRetry={(task_id) => runAction(() => client.retryTask(task_id, { reason: "Retry from console", trace_id: traceRef.current() }), "Retry accepted")}
            />
          )}
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
          {activeView === "scheduled-goals" && profile.canReadScheduledGoals && (
            <ScheduledGoals
              profile={profile}
              config={data.scheduledGoalsConfig}
              goals={data.scheduledGoals}
              goalRows={dashboard.scheduledGoalRows}
              configRows={dashboard.scheduledGoalConfigRows}
              runDueRows={dashboard.scheduledGoalRunDueRows}
              goalInput={scheduledGoalInput}
              setGoalInput={setScheduledGoalInput}
              cron={scheduledGoalCron}
              setCron={setScheduledGoalCron}
              conversationId={conversationId || selectedConversation?.conversation_id || ""}
              setConversationId={setConversationId}
              agentId={agentId}
              setAgentId={setAgentId}
              budgetUnits={scheduledGoalBudgetUnits}
              setBudgetUnits={setScheduledGoalBudgetUnits}
              onEnable={(enabled) => runAction(() => client.updateScheduledGoalsConfig({ enabled, trace_id: traceRef.current() }), "Scheduled goals config updated")}
              onCreate={() => runAction(() => client.createScheduledGoal({ input: scheduledGoalInput, cron: scheduledGoalCron, conversation_id: conversationId || selectedConversation?.conversation_id || "", agent_id: agentId, trace_id: traceRef.current(), ...(scheduledGoalBudgetUnits ? { budget_units: Number(scheduledGoalBudgetUnits) } : {}) }), "Scheduled goal created")}
              onPause={(scheduled_goal_id) => runAction(() => client.updateScheduledGoal(scheduled_goal_id, { status: "paused", trace_id: traceRef.current() }), "Scheduled goal paused")}
              onResume={(scheduled_goal_id) => runAction(() => client.updateScheduledGoal(scheduled_goal_id, { status: "scheduled", trace_id: traceRef.current() }), "Scheduled goal resumed")}
              onCancel={(scheduled_goal_id) => runAction(() => client.cancelScheduledGoal(scheduled_goal_id, { reason: "Console scheduled goal cancellation", trace_id: traceRef.current() }), "Scheduled goal cancelled")}
              onRetry={(scheduled_goal_id) => runAction(() => client.retryScheduledGoal(scheduled_goal_id, { reason: "Console scheduled goal retry", trace_id: traceRef.current() }), "Scheduled goal retried")}
              onRunDue={() => runAction(async () => {
                const result = await client.runDueScheduledGoals({ trace_id: traceRef.current() });
                setData((previous) => ({ ...previous, scheduledGoalsRunDue: result }));
              }, "Scheduled goals due scan complete")}
            />
          )}
          {activeView === "approvals" && <Approvals approvals={data.approvals} onDecision={(approval_id, decision) => runAction(() => client.decideApproval(approval_id, { decision, reason: "Console decision", trace_id: traceRef.current() }), "Approval updated")} />}
          {activeView === "skills" && <Skills skills={data.skills} capabilities={data.capabilities} />}
          {activeView === "evaluations" && profile.canManageSkillEvaluation && (
            <Evaluations
              profile={profile}
              config={data.skillEvaluationConfig}
              latestRun={data.selectedSkillEvaluationRun}
              runs={dashboard.skillEvaluationRows}
              cases={dashboard.skillEvaluationCaseRows}
              onEnable={(enabled) => runAction(() => client.updateSkillEvaluationConfig({ enabled, trace_id: traceRef.current() }), "Skill evaluation config updated")}
              onRun={() => runAction(() => client.runSkillEvaluation({ trace_id: traceRef.current() }), "Skill evaluation run complete")}
            />
          )}
          {activeView === "memory" && (
            <MemoryPanel
              profile={profile}
              records={data.memory}
              retentionRows={dashboard.memoryRetentionRows}
              conflictRows={dashboard.memoryConflictRows}
              conflicts={data.memoryConflicts ?? []}
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
              onConflictDecision={(conflict_id, decision) => runAction(() => client.decideMemoryConflict(conflict_id, { decision, reason: "Console memory conflict decision", trace_id: traceRef.current() }), "Memory conflict updated")}
            />
          )}
          {activeView === "budget" && (
            <BudgetPanel
              budget={data.budget}
              policyRows={dashboard.budgetPolicyRows}
              ledgerRows={dashboard.budgetLedgerRows}
              budgetUnits={budgetUnits}
              setBudgetUnits={setBudgetUnits}
              tenantLimit={tenantBudgetLimit}
              setTenantLimit={setTenantBudgetLimit}
              userLimit={userBudgetLimit}
              setUserLimit={setUserBudgetLimit}
              agentLimit={agentBudgetLimit}
              setAgentLimit={setAgentBudgetLimit}
              taskLimit={taskBudgetLimit}
              setTaskLimit={setTaskBudgetLimit}
              attemptLimit={attemptBudgetLimit}
              setAttemptLimit={setAttemptBudgetLimit}
              canManage={profile.canManageTokenBudget}
              onCheck={() => runAction(async () => {
                const result = await client.checkBudget({ requested_units: Number(budgetUnits), user_id: profile.user_id, trace_id: traceRef.current() });
                setData((previous) => ({ ...previous, budget: result }));
              }, "Budget checked")}
              onPolicyUpdate={() => runAction(() => client.updateBudgetPolicy({
                trace_id: traceRef.current(),
                limits: {
                  tenant_units: Number(tenantBudgetLimit),
                  user_units: Number(userBudgetLimit),
                  agent_units: Number(agentBudgetLimit),
                  task_units: Number(taskBudgetLimit),
                  max_units_per_attempt: Number(attemptBudgetLimit),
                },
              }), "Budget policy updated")}
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
      </aside>
    </main>
  );
}

function ConversationTranscript(props: { conversation?: ConversationSummary; turns: readonly ConversationTurn[]; onSelectTask: (task_id: string) => void }) {
  return (
    <section className="conversation-stack">
      <div className="section-heading">
        <h3>Transcript</h3>
        <span>{props.conversation ? `${props.turns.length} turns` : "No conversation selected"}</span>
      </div>
      {props.conversation === undefined ? (
        <EmptyState text="Select a conversation from the left rail" />
      ) : props.turns.length === 0 ? (
        <EmptyState text="No tasks in this conversation" />
      ) : (
        <div className="transcript-list">
          {props.turns.map((turn) => (
            <button key={turn.task_id} type="button" className="turn-card" onClick={() => props.onSelectTask(turn.task_id)}>
              <div className="turn-card-head">
                <strong>{turn.task_id}</strong>
                <span>{turn.state}</span>
              </div>
              <p className="turn-input">{turn.input}</p>
              {turn.summary && <p className="turn-summary">{turn.summary}</p>}
              <div className="turn-meta">
                <span>{turn.agent_id}</span>
                <span>{turn.event_count} events</span>
                <span>{turn.last_event_type ?? "no events"}</span>
                <span>{turn.updated_at}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function ConversationComposer(props: {
  profile: PrincipalProfile;
  conversationId: string;
  setConversationId: (value: string) => void;
  agentId: string;
  setAgentId: (value: string) => void;
  taskInput: string;
  setTaskInput: (value: string) => void;
  budgetUnits: string;
  setBudgetUnits: (value: string) => void;
  selectedConversation?: ConversationSummary;
  onSubmit: () => void;
}) {
  const canSubmit = actionEnabled(props.profile, "submit_task") && props.taskInput.trim().length > 0 && props.conversationId.trim().length > 0 && props.agentId.trim().length > 0;
  return (
    <section className="composer-stack">
      <div className="section-heading">
        <h3>Composer</h3>
        <span>{props.conversationId || props.selectedConversation?.conversation_id || "Draft"}</span>
      </div>
      <form className="composer-form" onSubmit={(event) => { event.preventDefault(); props.onSubmit(); }}>
        <label>Conversation ID<input value={props.conversationId} onChange={(event) => props.setConversationId(event.target.value)} disabled={!actionEnabled(props.profile, "submit_task")} placeholder="conv_console01" /></label>
        <label>Agent ID<input value={props.agentId} onChange={(event) => props.setAgentId(event.target.value)} disabled={!actionEnabled(props.profile, "submit_task")} placeholder="agent_alpha01" /></label>
        <label>Budget units<input type="number" min="1" value={props.budgetUnits} onChange={(event) => props.setBudgetUnits(event.target.value)} disabled={!actionEnabled(props.profile, "submit_task")} /></label>
        <label className="span-2">Task input<textarea value={props.taskInput} onChange={(event) => props.setTaskInput(event.target.value)} disabled={!actionEnabled(props.profile, "submit_task")} rows={4} /></label>
        <button type="submit" disabled={!canSubmit}>Send task</button>
      </form>
    </section>
  );
}

function TaskInspector(props: {
  tasks: readonly ConversationTurn[];
  selectedTask?: ConversationTurn;
  selectedTaskEvents: readonly ConversationEvent[];
  selectedTaskId: string;
  setSelectedTaskId: (value: string) => void;
  onCancel: (task_id: string) => void;
  onRetry: (task_id: string) => void;
}) {
  return (
    <section className="stack">
      <Table
        title="Conversation tasks"
        rows={props.tasks}
        columns={["task_id", "state", "agent_id", "event_count", "last_event_type", "updated_at", "trace_id"]}
        onRowClick={(row) => props.setSelectedTaskId(String(row.task_id ?? ""))}
        selectedId={props.selectedTaskId}
        idKey="task_id"
      />
      {props.selectedTask ? (
        <>
          <Table
            title="Selected task"
            rows={[props.selectedTask]}
            columns={["task_id", "conversation_id", "state", "user_id", "agent_id", "attempt_id", "execution_id", "input", "summary", "trace_id"]}
          />
          <div className="button-row">
            <button type="button" onClick={() => props.onCancel(props.selectedTask!.task_id)}>Cancel selected task</button>
            <button type="button" onClick={() => props.onRetry(props.selectedTask!.task_id)}>Retry selected task</button>
          </div>
        </>
      ) : <EmptyState text="No task selected" />}
      <Table title="Task events" rows={props.selectedTaskEvents} columns={["event_id", "event_type", "task_id", "attempt_id", "execution_id", "trace_id", "occurred_at"]} />
    </section>
  );
}

function inspectorLabel(view: ConsoleViewId): string {
  if (view === "overview") return "Overview";
  if (view === "tenants") return "Tenants";
  if (view === "channels") return "Channels";
  if (view === "scheduled-goals") return "Scheduled goals";
  if (view === "tasks") return "Tasks";
  if (view === "approvals") return "Approvals";
  if (view === "skills") return "Skills";
  if (view === "evaluations") return "Evaluations";
  if (view === "memory") return "Memory";
  if (view === "budget") return "Budget";
  return "Plugins";
}

function Overview({ health, dashboard }: { health?: HealthStatus; dashboard: ReturnType<typeof buildConsoleDashboardModel> }) {
  return <section className="grid-panel">
    <Metric label="Health" value={health?.status ?? "not checked"} />
    <Metric label="Tasks" value={dashboard.counters.tasks} />
    <Metric label="Active tasks" value={dashboard.counters.active_tasks} />
    <Metric label="Pending approvals" value={dashboard.counters.pending_approvals} />
    <Metric label="Approved capabilities" value={dashboard.counters.approved_capabilities} />
    <Metric label="Channels" value={dashboard.counters.channel_configs} />
    <Metric label="Scheduled goals" value={dashboard.counters.scheduled_goals} />
    <Metric label="Plugin entries" value={dashboard.counters.plugin_entries} />
    <Metric label="Evaluation runs" value={dashboard.counters.skill_evaluation_runs} />
    <Metric label="Memory conflicts" value={dashboard.counters.memory_conflicts} />
    <Metric label="Budget ledger" value={dashboard.counters.budget_ledger_entries} />
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

function ScheduledGoals(props: {
  profile: PrincipalProfile;
  config?: ScheduledGoalsConfig;
  goals: readonly ScheduledGoalRecord[];
  goalRows: readonly Record<string, unknown>[];
  configRows: readonly Record<string, unknown>[];
  runDueRows: readonly Record<string, unknown>[];
  goalInput: string;
  setGoalInput: (value: string) => void;
  cron: string;
  setCron: (value: string) => void;
  conversationId: string;
  setConversationId: (value: string) => void;
  agentId: string;
  setAgentId: (value: string) => void;
  budgetUnits: string;
  setBudgetUnits: (value: string) => void;
  onEnable: (enabled: boolean) => void;
  onCreate: () => void;
  onPause: (scheduled_goal_id: string) => void;
  onResume: (scheduled_goal_id: string) => void;
  onCancel: (scheduled_goal_id: string) => void;
  onRetry: (scheduled_goal_id: string) => void;
  onRunDue: () => void;
}) {
  const canManage = actionEnabled(props.profile, "manage_scheduled_goals");
  return <section className="stack">
    <Table title="Scheduled goal config" rows={props.configRows} columns={["tenant_id", "enabled", "schedule_mode", "execution_mode", "budget_mode", "max_active_goals", "max_due_per_tick", "min_interval_minutes", "updated_at_utc", "trace_id"]} />
    <div className="button-row"><button type="button" disabled={!canManage || props.config?.enabled === true} onClick={() => props.onEnable(true)}>Enable scheduled goals</button><button type="button" disabled={!canManage || props.config?.enabled === false} onClick={() => props.onEnable(false)}>Disable scheduled goals</button><button type="button" disabled={!canManage || props.config?.enabled !== true} onClick={props.onRunDue}>Run due scan</button></div>
    <form className="form-grid" onSubmit={(event) => { event.preventDefault(); props.onCreate(); }}>
      <label>Goal input<input value={props.goalInput} onChange={(event) => props.setGoalInput(event.target.value)} disabled={!canManage} /></label>
      <label>Cron UTC<input value={props.cron} onChange={(event) => props.setCron(event.target.value)} disabled={!canManage} /></label>
      <label>Conversation ID<input value={props.conversationId} onChange={(event) => props.setConversationId(event.target.value)} disabled={!canManage} /></label>
      <label>Agent ID<input value={props.agentId} onChange={(event) => props.setAgentId(event.target.value)} disabled={!canManage} /></label>
      <label>Budget units<input type="number" min="1" value={props.budgetUnits} onChange={(event) => props.setBudgetUnits(event.target.value)} disabled={!canManage} /></label>
      <button type="submit" disabled={!canManage}>Create scheduled goal</button>
    </form>
    <Table title="Scheduled goals" rows={props.goalRows} columns={["scheduled_goal_id", "tenant_id", "user_id", "agent_id", "conversation_id", "status", "cron", "next_run_at_utc", "last_run_status", "last_task_id", "run_count", "failure_count", "budget_units", "reason_codes", "trace_id"]} />
    <div className="button-row">{props.goals.map((goal) => <React.Fragment key={goal.scheduled_goal_id}><button type="button" disabled={!canManage || goal.status !== "scheduled"} onClick={() => props.onPause(goal.scheduled_goal_id)}>Pause {goal.scheduled_goal_id}</button><button type="button" disabled={!canManage || goal.status !== "paused"} onClick={() => props.onResume(goal.scheduled_goal_id)}>Resume {goal.scheduled_goal_id}</button><button type="button" disabled={!canManage || goal.status === "cancelled"} onClick={() => props.onCancel(goal.scheduled_goal_id)}>Cancel {goal.scheduled_goal_id}</button><button type="button" disabled={!canManage} onClick={() => props.onRetry(goal.scheduled_goal_id)}>Retry {goal.scheduled_goal_id}</button></React.Fragment>)}</div>
    {props.runDueRows.length > 0 ? <Table title="Scheduled due scan" rows={props.runDueRows} columns={["scheduled_goal_id", "tenant_id", "user_id", "agent_id", "task_id", "status", "next_run_at_utc", "reason_codes", "trace_id", "scanned_count", "due_count", "submitted_count", "blocked_count", "failed_count", "checked_at_utc"]} /> : <EmptyState text="No scheduled due scan result" />}
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
  budgetUnits: string;
  setBudgetUnits: (value: string) => void;
  onSubmit: () => void;
  onCancel: (task_id: string) => void;
  onRetry: (task_id: string) => void;
}) {
  return <section className="stack">
    <form className="form-grid" onSubmit={(event) => { event.preventDefault(); props.onSubmit(); }}>
      <label>Task input<input value={props.taskInput} onChange={(event) => props.setTaskInput(event.target.value)} disabled={!actionEnabled(props.profile, "submit_task")} /></label>
      <label>Conversation ID<input value={props.conversationId} onChange={(event) => props.setConversationId(event.target.value)} disabled={!actionEnabled(props.profile, "submit_task")} /></label>
      <label>Agent ID<input value={props.agentId} onChange={(event) => props.setAgentId(event.target.value)} disabled={!actionEnabled(props.profile, "submit_task")} /></label>
      <label>Budget units<input type="number" min="1" value={props.budgetUnits} onChange={(event) => props.setBudgetUnits(event.target.value)} disabled={!actionEnabled(props.profile, "submit_task")} /></label>
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

function Evaluations(props: { profile: PrincipalProfile; config?: SkillEvaluationConfig; latestRun?: SkillEvaluationRunReport; runs: readonly Record<string, unknown>[]; cases: readonly Record<string, unknown>[]; onEnable: (enabled: boolean) => void; onRun: () => void }) {
  const canManage = actionEnabled(props.profile, "manage_skill_evaluation");
  const configRows = props.config ? [{
    tenant_id: props.config.tenant_id,
    suite_id: props.config.suite_id,
    enabled: props.config.enabled,
    mode: props.config.mode,
    corpus: props.config.corpus,
    max_cases: props.config.resource_budget.max_cases,
    updated_at_utc: props.config.updated_at_utc,
    trace_id: props.config.trace_id,
  }] : [];
  const latestRows = props.latestRun ? [{
    run_id: props.latestRun.run_id,
    tenant_id: props.latestRun.tenant_id,
    suite_id: props.latestRun.suite_id,
    status: props.latestRun.status,
    total_cases: props.latestRun.totals.total_cases,
    passed_cases: props.latestRun.totals.passed_cases,
    failed_cases: props.latestRun.totals.failed_cases,
    rejected_disabled_cases: props.latestRun.totals.rejected_disabled_cases,
    completed_at_utc: props.latestRun.completed_at_utc,
    trace_id: props.latestRun.trace_id,
  }] : [];
  return <section className="stack"><Table title="Skill evaluation config" rows={configRows} columns={["tenant_id", "suite_id", "enabled", "mode", "corpus", "max_cases", "updated_at_utc", "trace_id"]} /><div className="button-row"><button type="button" disabled={!canManage || props.config?.enabled === true} onClick={() => props.onEnable(true)}>Enable evaluations</button><button type="button" disabled={!canManage || props.config?.enabled === false} onClick={() => props.onEnable(false)}>Disable evaluations</button><button type="button" disabled={!canManage || props.config?.enabled !== true} onClick={props.onRun}>Run evaluation</button></div><Table title="Skill evaluation runs" rows={props.runs} columns={["run_id", "tenant_id", "suite_id", "status", "total_cases", "passed_cases", "failed_cases", "rejected_disabled_cases", "completed_at_utc", "trace_id"]} />{props.latestRun ? <Table title="Latest skill evaluation" rows={latestRows} columns={["run_id", "tenant_id", "suite_id", "status", "total_cases", "passed_cases", "failed_cases", "rejected_disabled_cases", "completed_at_utc", "trace_id"]} /> : <EmptyState text="No skill evaluation run" />}<Table title="Skill evaluation cases" rows={props.cases} columns={["case_id", "candidate_id", "candidate_kind", "capability_type", "expected_outcome", "actual_outcome", "status", "reason_codes"]} /></section>;
}

function MemoryPanel(props: { profile: PrincipalProfile; records: readonly MemoryRecord[]; retentionRows: readonly Record<string, unknown>[]; conflictRows: readonly Record<string, unknown>[]; conflicts: readonly MemoryConflictRecord[]; retentionPolicy?: MemoryRetentionPolicy; retentionSweep?: MemoryRetentionSweepResult; memoryText: string; setMemoryText: (value: string) => void; memoryQuery: string; setMemoryQuery: (value: string) => void; onWrite: () => void; onSearch: () => void; onSweep: () => void; onDelete: (memory_id: string) => void; onConflictDecision: (conflict_id: string, decision: "resolve" | "ignore") => void }) {
  const canManageRetention = actionEnabled(props.profile, "manage_memory_retention");
  const canManageConflicts = actionEnabled(props.profile, "manage_memory_conflicts");
  return <section className="stack"><form className="form-grid" onSubmit={(event) => { event.preventDefault(); props.onWrite(); }}><label>Memory text<input value={props.memoryText} onChange={(event) => props.setMemoryText(event.target.value)} disabled={!actionEnabled(props.profile, "write_memory")} /></label><button type="submit" disabled={!actionEnabled(props.profile, "write_memory")}>Write memory</button></form><form className="form-grid" onSubmit={(event) => { event.preventDefault(); props.onSearch(); }}><label>Memory query<input value={props.memoryQuery} onChange={(event) => props.setMemoryQuery(event.target.value)} /></label><button type="submit">Search memory</button></form><Table title="Memory results" rows={props.records} columns={["memory_id", "tenant_id", "layer", "text", "version", "score", "trace_id"]} />{canManageRetention && <><Table title="Memory retention policy" rows={props.retentionRows} columns={["policy_id", "tenant_id", "layer", "enabled", "ttl_days", "action", "immutable", "mode", "updated_at_utc", "trace_id"]} /><div className="button-row"><button type="button" onClick={props.onSweep}>Run retention sweep</button>{props.records.map((record) => <button type="button" key={record.memory_id} onClick={() => props.onDelete(record.memory_id)}>Delete {record.memory_id}</button>)}</div>{props.retentionSweep ? <Table title="Memory retention sweep" rows={[props.retentionSweep]} columns={["tenant_id", "policy_id", "scanned_count", "deleted_count", "skipped_count", "swept_at_utc", "trace_id"]} /> : <EmptyState text="No retention sweep result" />}</>}{canManageConflicts && <><Table title="Memory conflicts" rows={props.conflictRows} columns={["conflict_id", "tenant_id", "layer", "status", "expected_version", "current_version", "reason_codes", "scope_user_id", "scope_agent_id", "scope_conversation_id", "updated_at_utc", "trace_id"]} /><div className="button-row">{props.conflicts.filter((conflict) => conflict.status === "open").map((conflict) => <React.Fragment key={conflict.conflict_id}><button type="button" onClick={() => props.onConflictDecision(conflict.conflict_id, "resolve")}>Resolve {conflict.conflict_id}</button><button type="button" onClick={() => props.onConflictDecision(conflict.conflict_id, "ignore")}>Ignore {conflict.conflict_id}</button></React.Fragment>)}</div></>}</section>;
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

function BudgetPanel(props: { budget?: BudgetCheckResult; policyRows: readonly Record<string, unknown>[]; ledgerRows: readonly Record<string, unknown>[]; budgetUnits: string; setBudgetUnits: (value: string) => void; tenantLimit: string; setTenantLimit: (value: string) => void; userLimit: string; setUserLimit: (value: string) => void; agentLimit: string; setAgentLimit: (value: string) => void; taskLimit: string; setTaskLimit: (value: string) => void; attemptLimit: string; setAttemptLimit: (value: string) => void; canManage: boolean; onCheck: () => void; onPolicyUpdate: () => void }) {
  return <section className="stack"><form className="form-grid" onSubmit={(event) => { event.preventDefault(); props.onCheck(); }}><label>Requested units<input type="number" min="1" value={props.budgetUnits} onChange={(event) => props.setBudgetUnits(event.target.value)} /></label><button type="submit">Check budget</button></form>{props.budget ? <Table title="Budget decision" rows={[props.budget]} columns={["policy_id", "tenant_id", "user_id", "status", "requested_units", "remaining_units", "max_units_per_attempt", "reason_codes", "trace_id"]} /> : <EmptyState text="No budget decision yet" />}<Table title="Budget policy" rows={props.policyRows} columns={["policy_id", "tenant_id", "enabled", "dimension_mode", "enforcement_scope", "tenant_units", "user_units", "agent_units", "task_units", "max_units_per_attempt", "updated_at_utc", "trace_id"]} />{props.canManage && <form className="form-grid" onSubmit={(event) => { event.preventDefault(); props.onPolicyUpdate(); }}><label>Tenant units<input type="number" min="1" value={props.tenantLimit} onChange={(event) => props.setTenantLimit(event.target.value)} /></label><label>User units<input type="number" min="1" value={props.userLimit} onChange={(event) => props.setUserLimit(event.target.value)} /></label><label>Agent units<input type="number" min="1" value={props.agentLimit} onChange={(event) => props.setAgentLimit(event.target.value)} /></label><label>Task units<input type="number" min="1" value={props.taskLimit} onChange={(event) => props.setTaskLimit(event.target.value)} /></label><label>Attempt units<input type="number" min="1" value={props.attemptLimit} onChange={(event) => props.setAttemptLimit(event.target.value)} /></label><button type="submit">Update policy</button></form>}<Table title="Budget ledger" rows={props.ledgerRows} columns={["ledger_id", "policy_id", "tenant_id", "user_id", "agent_id", "task_id", "status", "requested_units", "consumed_units", "remaining_units", "reason_codes", "recorded_at_utc", "trace_id"]} /></section>;
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
