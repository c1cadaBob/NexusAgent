import type {
  DshExecutionRequest,
  DshExecutionResult,
  DshExecutionResultStatus,
  DshProviderMetadata,
} from "../../index.ts";

export interface DshProviderGuardRequest {
  execution_id: string;
  trace_id: string;
  policy: {
    mode: "executor-only";
    allowNativeAgentLoop: false;
    requirePolicyGate: true;
    requireArtifactStore: true;
    allowedTools: readonly string[];
  };
  provider: {
    provider_id: string;
    enabled: true;
    rollback_provider_id?: string;
  };
  tool: {
    name: string;
    input: Record<string, unknown>;
  };
  cancel?: {
    requested: true;
    reason?: string;
  };
}

export function mapPlatformExecutionRequestToDshGuardRequest(
  request: DshExecutionRequest,
  provider: DshProviderMetadata,
): DshProviderGuardRequest {
  return {
    execution_id: request.execution_id,
    trace_id: request.trace_id,
    policy: {
      mode: "executor-only",
      allowNativeAgentLoop: false,
      requirePolicyGate: true,
      requireArtifactStore: true,
      allowedTools: [...request.policy.allowed_tools],
    },
    provider: {
      provider_id: provider.provider_id,
      enabled: true,
    },
    tool: {
      name: request.tool.name,
      input: cloneRecord(request.tool.input),
    },
    ...request.cancel?.requested === true ? {
      cancel: {
        requested: true,
        ...request.cancel.reason === undefined ? {} : { reason: request.cancel.reason },
      },
    } : {},
  };
}

export function runDsh011Rc2ProviderFixture(
  request: DshExecutionRequest,
  provider: DshProviderMetadata,
): DshExecutionResult {
  const guardRequest = mapPlatformExecutionRequestToDshGuardRequest(request, provider);
  if (guardRequest.cancel?.requested === true) {
    return resultFor(request, provider, "cancelled", [
      providerEvent(request, provider, "execution.cancelled", "cancelled", {
        reason: guardRequest.cancel.reason ?? "cancelled by platform request",
      }),
    ], {
      code: "PLATFORM_CONFLICT",
      message: "Execution was cancelled before provider dispatch",
      trace_id: request.trace_id,
      details: { provider_id: provider.provider_id },
    });
  }

  if (!guardRequest.policy.allowedTools.includes(guardRequest.tool.name)) {
    return resultFor(request, provider, "blocked", [
      providerEvent(request, provider, "tool.blocked", "blocked", {
        tool_name: guardRequest.tool.name,
      }),
    ], {
      code: "PLATFORM_POLICY_DENIED",
      message: "Executor tool is not allowed by platform policy",
      trace_id: request.trace_id,
      details: { tool_name: guardRequest.tool.name, provider_id: provider.provider_id },
    });
  }

  return resultFor(request, provider, "completed", [
    providerEvent(request, provider, "execution.accepted", "accepted", {
      provider_contract_version: provider.contract_version,
    }),
    providerEvent(request, provider, "tool.result", "completed", {
      tool_name: guardRequest.tool.name,
      accepted_input_keys: Object.keys(guardRequest.tool.input).sort(),
    }),
  ], undefined, {
    tool_name: guardRequest.tool.name,
    accepted_input_keys: Object.keys(guardRequest.tool.input).sort(),
    provider_contract_version: provider.contract_version,
  });
}

function resultFor(
  request: DshExecutionRequest,
  provider: DshProviderMetadata,
  executionOutcome: DshExecutionResultStatus,
  events: DshExecutionResult["events"],
  error?: DshExecutionResult["error"],
  output: Record<string, unknown> = {},
): DshExecutionResult {
  return {
    schema_version: "nexus.execution_result.p2.v1",
    tenant_id: request.tenant_id,
    task_id: request.task_id,
    attempt_id: request.attempt_id,
    execution_id: request.execution_id,
    trace_id: request.trace_id,
    provider_id: provider.provider_id,
    execution_outcome: executionOutcome,
    monotonic_ms: request.monotonic_ms + 1,
    completed_monotonic_ms: request.monotonic_ms + 1,
    events,
    artifacts: [],
    output,
    ...error === undefined ? {} : { error },
  };
}

function providerEvent(
  request: DshExecutionRequest,
  provider: DshProviderMetadata,
  eventType: DshExecutionResult["events"][number]["event_type"],
  status: DshExecutionResult["events"][number]["status"],
  payload: Record<string, unknown>,
): DshExecutionResult["events"][number] {
  return {
    schema_version: "nexus.execution_event.p2.v1",
    execution_id: request.execution_id,
    trace_id: request.trace_id,
    provider_id: provider.provider_id,
    event_type: eventType,
    status,
    payload,
  };
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
