import {
  assertMonotonicMs,
  assertPlatformId,
  assertUtcTimestamp,
} from "../task-state/index.ts";

export type PlatformEventType =
  | "task.received"
  | "task.state_changed"
  | "task.state_transition_rejected"
  | "policy.denied"
  | "approval.required"
  | "planning.started"
  | "planning.completed"
  | "execution.started"
  | "execution.blocked"
  | "execution.cancelled"
  | "execution.completed"
  | "execution.failed"
  | "sandbox.denied"
  | "artifact.created"
  | "credential.lease_issued"
  | "audit.recorded";

export interface PlatformEventEnvelope {
  schema_version: "nexus.event_envelope.v1";
  event_id: string;
  event_type: PlatformEventType;
  tenant_id: string;
  trace_id: string;
  occurred_at_utc: string;
  monotonic_ms: number;
  producer: {
    service: string;
    component: string;
    provider_binding_id?: string;
  };
  subject: {
    kind: "task" | "attempt" | "execution" | "artifact" | "credential" | "approval" | "audit";
    id: string;
  };
  payload: Record<string, unknown>;
  user_id?: string;
  agent_id?: string;
  task_id?: string;
  attempt_id?: string;
  execution_id?: string;
  conversation_id?: string;
  artifact_id?: string;
}

export interface EventBusFilter {
  event_type?: PlatformEventType;
  tenant_id?: string;
  subject_kind?: PlatformEventEnvelope["subject"]["kind"];
}

export interface EventBusSubscription {
  subscription_id: string;
  subscriber: string;
  filter?: EventBusFilter;
}

export interface EventBusDelivery {
  sequence: number;
  subscription_id: string;
  subscriber: string;
  event_id: string;
  event: PlatformEventEnvelope;
  status: "pending" | "acked" | "dead_lettered";
  attempts: number;
  dead_letter_reason?: string;
}

export interface PublishResult {
  sequence: number;
  duplicate: boolean;
  event: PlatformEventEnvelope;
}

export interface EventBus {
  publish(event: PlatformEventEnvelope): PublishResult;
  subscribe(subscription: Omit<EventBusSubscription, "subscription_id"> & { subscription_id?: string }): EventBusSubscription;
  pull(subscription_id: string): readonly EventBusDelivery[];
  ack(subscription_id: string, event_id: string): boolean;
  deadLetter(subscription_id: string, event_id: string, reason: string): boolean;
}

export class EventBusError extends Error {
  readonly code: "PLATFORM_INVALID_REQUEST" | "PLATFORM_CONFLICT" | "PLATFORM_NOT_FOUND";
  readonly details: Record<string, unknown>;

  constructor(
    code: EventBusError["code"],
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "EventBusError";
    this.code = code;
    this.details = details;
  }
}

const EVENT_ID_PATTERN = /^event_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/;

export class InMemoryEventBus implements EventBus {
  #sequence = 0;
  readonly #eventsById = new Map<string, PublishResult>();
  readonly #subscriptions = new Map<string, EventBusSubscription>();
  readonly #deliveries = new Map<string, EventBusDelivery[]>();

  publish(event: PlatformEventEnvelope): PublishResult {
    assertPlatformEventEnvelope(event);

    const existing = this.#eventsById.get(event.event_id);
    if (existing) {
      return { ...existing, duplicate: true };
    }

    this.#sequence += 1;
    const storedEvent = cloneEvent(event);
    const result: PublishResult = {
      sequence: this.#sequence,
      duplicate: false,
      event: storedEvent,
    };
    this.#eventsById.set(event.event_id, result);

    for (const subscription of this.#subscriptions.values()) {
      if (matchesFilter(storedEvent, subscription.filter)) {
        const delivery: EventBusDelivery = {
          sequence: this.#sequence,
          subscription_id: subscription.subscription_id,
          subscriber: subscription.subscriber,
          event_id: storedEvent.event_id,
          event: cloneEvent(storedEvent),
          status: "pending",
          attempts: 1,
        };
        this.#deliveries.get(subscription.subscription_id)?.push(delivery);
      }
    }

    return result;
  }

  subscribe(subscription: Omit<EventBusSubscription, "subscription_id"> & { subscription_id?: string }): EventBusSubscription {
    if (!subscription.subscriber.trim()) {
      throw new EventBusError("PLATFORM_INVALID_REQUEST", "Event Bus subscriber is required");
    }
    const subscription_id = subscription.subscription_id ?? `sub_${subscription.subscriber}_${this.#subscriptions.size + 1}`;
    if (!/^sub_[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/.test(subscription_id)) {
      throw new EventBusError("PLATFORM_INVALID_REQUEST", "Invalid Event Bus subscription_id", { subscription_id });
    }
    if (this.#subscriptions.has(subscription_id)) {
      throw new EventBusError("PLATFORM_CONFLICT", "Event Bus subscription already exists", { subscription_id });
    }

    const saved: EventBusSubscription = {
      subscription_id,
      subscriber: subscription.subscriber,
      filter: subscription.filter ? { ...subscription.filter } : undefined,
    };
    this.#subscriptions.set(subscription_id, saved);
    this.#deliveries.set(subscription_id, []);
    return { ...saved, filter: saved.filter ? { ...saved.filter } : undefined };
  }

  pull(subscription_id: string): readonly EventBusDelivery[] {
    const deliveries = this.#deliveries.get(subscription_id);
    if (!deliveries) {
      throw new EventBusError("PLATFORM_NOT_FOUND", "Event Bus subscription not found", { subscription_id });
    }
    return deliveries
      .filter((delivery) => delivery.status === "pending")
      .sort((left, right) => left.sequence - right.sequence)
      .map(cloneDelivery);
  }

  ack(subscription_id: string, event_id: string): boolean {
    const delivery = this.#findDelivery(subscription_id, event_id);
    if (!delivery || delivery.status !== "pending") return false;
    delivery.status = "acked";
    return true;
  }

  deadLetter(subscription_id: string, event_id: string, reason: string): boolean {
    if (!reason.trim()) {
      throw new EventBusError("PLATFORM_INVALID_REQUEST", "Dead-letter reason is required");
    }
    const delivery = this.#findDelivery(subscription_id, event_id);
    if (!delivery || delivery.status !== "pending") return false;
    delivery.status = "dead_lettered";
    delivery.dead_letter_reason = reason;
    return true;
  }

  history(): readonly PublishResult[] {
    return [...this.#eventsById.values()].sort((left, right) => left.sequence - right.sequence).map((result) => ({
      sequence: result.sequence,
      duplicate: result.duplicate,
      event: cloneEvent(result.event),
    }));
  }

  deliveries(subscription_id: string): readonly EventBusDelivery[] {
    const deliveries = this.#deliveries.get(subscription_id);
    if (!deliveries) {
      throw new EventBusError("PLATFORM_NOT_FOUND", "Event Bus subscription not found", { subscription_id });
    }
    return deliveries.sort((left, right) => left.sequence - right.sequence).map(cloneDelivery);
  }

  #findDelivery(subscription_id: string, event_id: string): EventBusDelivery | undefined {
    return this.#deliveries.get(subscription_id)?.find((delivery) => delivery.event_id === event_id);
  }
}

export function assertPlatformEventEnvelope(event: PlatformEventEnvelope): PlatformEventEnvelope {
  if (event.schema_version !== "nexus.event_envelope.v1") {
    throw new EventBusError("PLATFORM_INVALID_REQUEST", "Unsupported event envelope schema version", {
      schema_version: event.schema_version,
    });
  }
  if (!EVENT_ID_PATTERN.test(event.event_id)) {
    throw new EventBusError("PLATFORM_INVALID_REQUEST", "Invalid platform event_id", { event_id: event.event_id });
  }
  assertPlatformId("tenant_id", event.tenant_id);
  assertPlatformId("trace_id", event.trace_id);
  assertOptionalPlatformId("user_id", event.user_id);
  assertOptionalPlatformId("agent_id", event.agent_id);
  assertOptionalPlatformId("task_id", event.task_id);
  assertOptionalPlatformId("attempt_id", event.attempt_id);
  assertOptionalPlatformId("execution_id", event.execution_id);
  assertOptionalPlatformId("conversation_id", event.conversation_id);
  assertOptionalPlatformId("artifact_id", event.artifact_id);
  assertUtcTimestamp(event.occurred_at_utc, "event.occurred_at_utc");
  assertMonotonicMs(event.monotonic_ms, "event.monotonic_ms");

  if (!event.producer?.service?.trim() || !event.producer?.component?.trim()) {
    throw new EventBusError("PLATFORM_INVALID_REQUEST", "Event producer service and component are required");
  }
  if (!event.subject?.kind || !event.subject?.id?.trim()) {
    throw new EventBusError("PLATFORM_INVALID_REQUEST", "Event subject kind and id are required");
  }
  if (!event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) {
    throw new EventBusError("PLATFORM_INVALID_REQUEST", "Event payload must be an object");
  }
  return event;
}

function assertOptionalPlatformId(key: Parameters<typeof assertPlatformId>[0], value: unknown): void {
  if (value !== undefined) {
    assertPlatformId(key, value);
  }
}

function matchesFilter(event: PlatformEventEnvelope, filter: EventBusFilter | undefined): boolean {
  if (!filter) return true;
  if (filter.event_type && event.event_type !== filter.event_type) return false;
  if (filter.tenant_id && event.tenant_id !== filter.tenant_id) return false;
  if (filter.subject_kind && event.subject.kind !== filter.subject_kind) return false;
  return true;
}

function cloneEvent(event: PlatformEventEnvelope): PlatformEventEnvelope {
  return JSON.parse(JSON.stringify(event)) as PlatformEventEnvelope;
}

function cloneDelivery(delivery: EventBusDelivery): EventBusDelivery {
  return JSON.parse(JSON.stringify(delivery)) as EventBusDelivery;
}
