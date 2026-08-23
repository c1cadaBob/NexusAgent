import type {
  CoordinatorAdapterInvocation,
  CoordinatorAdapterPort,
  CoordinatorAdapterResult,
} from "../coordinator/index.ts";
import { PolicyGate, PolicyGateError } from "../policy-gate/index.ts";

const TRUSTED_ADAPTER_INVOCATION = Symbol("nexus.trusted-adapter-invocation");

export type AdapterLifecycleStatus = "created" | "started" | "stopped" | "unhealthy";

export interface AdapterHealth {
  name: string;
  kind: CoordinatorAdapterPort["kind"];
  status: AdapterLifecycleStatus;
  checks: readonly string[];
}

export interface LifecycleAdapterPort extends CoordinatorAdapterPort {
  start(): void | Promise<void>;
  stop(): void | Promise<void>;
  health(): AdapterHealth;
}

export class AdapterError extends Error {
  readonly code: "PLATFORM_INVALID_REQUEST" | "PLATFORM_CONFLICT" | "PLATFORM_NOT_FOUND" | "PLATFORM_POLICY_DENIED";
  readonly details: Record<string, unknown>;

  constructor(code: AdapterError["code"], message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "AdapterError";
    this.code = code;
    this.details = details;
  }
}

export function markTrustedAdapterInvocation<T extends CoordinatorAdapterInvocation>(invocation: T): T {
  Object.defineProperty(invocation, TRUSTED_ADAPTER_INVOCATION, {
    enumerable: false,
    value: true,
  });
  return invocation;
}

export function assertTrustedAdapterInvocation(invocation: CoordinatorAdapterInvocation): void {
  const candidate = invocation as CoordinatorAdapterInvocation & { [TRUSTED_ADAPTER_INVOCATION]?: boolean };
  if (candidate[TRUSTED_ADAPTER_INVOCATION] !== true) {
    throw new AdapterError("PLATFORM_POLICY_DENIED", "Adapter invocation did not pass through Coordinator and Policy-Gate");
  }
  if (!invocation.execution_id || !invocation.trace_id) {
    throw new AdapterError("PLATFORM_POLICY_DENIED", "Adapter invocation must include execution_id and trace_id");
  }
}

export class AdapterRegistry {
  readonly #adapters = new Map<string, LifecycleAdapterPort>();

  register(adapter: LifecycleAdapterPort): void {
    if (!adapter.name.trim()) {
      throw new AdapterError("PLATFORM_INVALID_REQUEST", "Adapter name is required");
    }
    if (this.#adapters.has(adapter.name)) {
      throw new AdapterError("PLATFORM_CONFLICT", "Adapter is already registered", { adapter_name: adapter.name });
    }
    this.#adapters.set(adapter.name, adapter);
  }

  get(adapter_name: string): LifecycleAdapterPort {
    const adapter = this.#adapters.get(adapter_name);
    if (!adapter) {
      throw new AdapterError("PLATFORM_NOT_FOUND", "Adapter not registered", { adapter_name });
    }
    return adapter;
  }

  async start(adapter_name: string): Promise<void> {
    await this.get(adapter_name).start();
  }

  async stop(adapter_name: string): Promise<void> {
    await this.get(adapter_name).stop();
  }

  health(adapter_name: string): AdapterHealth {
    return this.get(adapter_name).health();
  }

  list(): readonly AdapterHealth[] {
    return [...this.#adapters.values()].map((adapter) => adapter.health());
  }

  async invoke(
    adapter_name: string,
    policyGate: PolicyGate,
    invocation: CoordinatorAdapterInvocation,
  ): Promise<CoordinatorAdapterResult> {
    const adapter = this.get(adapter_name);
    policyGate.assertAllowedDecision(invocation.policy_decision, {
      action: "adapter.invoke",
      tenant_id: invocation.tenant_id,
      execution_id: invocation.execution_id,
      trace_id: invocation.trace_id,
    });
    return adapter.invoke(markTrustedAdapterInvocation({ ...invocation }));
  }
}

export abstract class MockAdapter implements LifecycleAdapterPort {
  readonly name: string;
  readonly kind: CoordinatorAdapterPort["kind"];
  #status: AdapterLifecycleStatus = "created";

  protected constructor(name: string, kind: CoordinatorAdapterPort["kind"]) {
    this.name = name;
    this.kind = kind;
  }

  start(): void {
    this.#status = "started";
  }

  stop(): void {
    this.#status = "stopped";
  }

  health(): AdapterHealth {
    return {
      name: this.name,
      kind: this.kind,
      status: this.#status,
      checks: this.#status === "started" ? ["lifecycle.started"] : ["lifecycle.not_started"],
    };
  }

  async invoke(invocation: CoordinatorAdapterInvocation): Promise<CoordinatorAdapterResult> {
    assertTrustedAdapterInvocation(invocation);
    if (this.#status !== "started") {
      throw new AdapterError("PLATFORM_POLICY_DENIED", "Adapter must be started before invocation", {
        adapter_name: this.name,
        status: this.#status,
      });
    }
    return {
      tenant_id: invocation.tenant_id,
      task_id: invocation.task_id,
      attempt_id: invocation.attempt_id,
      execution_id: invocation.execution_id,
      trace_id: invocation.trace_id,
      status: "completed",
      payload: {
        adapter_name: this.name,
        adapter_kind: this.kind,
        accepted_payload_keys: Object.keys(invocation.payload).sort(),
      },
    };
  }
}

export class MockChannelAdapter extends MockAdapter {
  constructor(name = "channel-mock") {
    super(name, "channel");
  }
}

export class MockPlannerAdapter extends MockAdapter {
  constructor(name = "planner-mock") {
    super(name, "planner");
  }
}

export class MockExecutorAdapter extends MockAdapter {
  constructor(name = "executor-mock") {
    super(name, "executor");
  }
}

export async function invokeLifecycleAdapter(
  policyGate: PolicyGate,
  adapter: LifecycleAdapterPort,
  invocation: CoordinatorAdapterInvocation,
): Promise<CoordinatorAdapterResult> {
  policyGate.assertAllowedDecision(invocation.policy_decision, {
    action: "adapter.invoke",
    tenant_id: invocation.tenant_id,
    execution_id: invocation.execution_id,
    trace_id: invocation.trace_id,
  });
  try {
    return await adapter.invoke(markTrustedAdapterInvocation({ ...invocation }));
  } catch (error) {
    if (error instanceof AdapterError) throw error;
    if (error instanceof PolicyGateError) throw error;
    throw error;
  }
}
