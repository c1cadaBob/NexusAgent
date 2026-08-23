import { createHash } from "node:crypto";
import { assertPlatformId } from "../task-state/index.ts";
import { type PlatformClock, SystemClock } from "../clock/index.ts";
import { type EventBus, type PlatformEventEnvelope } from "../event-bus/index.ts";

export type ArtifactKind = "input_attachment" | "execution_output" | "log_excerpt" | "planner_snapshot" | "audit_evidence";
export type ArtifactClassification = "public" | "internal" | "confidential" | "secret";
export type ArtifactStatus = "active" | "expired";

export interface ArtifactReference {
  artifact_id: string;
  tenant_id: string;
  task_id: string;
  attempt_id?: string;
  execution_id?: string;
  trace_id: string;
  kind: ArtifactKind;
  storage_ref: string;
  content_type: string;
  sha256: string;
  size_bytes: number;
  classification: ArtifactClassification;
  created_at_utc: string;
  expires_at_utc?: string;
}

export interface UploadArtifactInput {
  tenant_id: string;
  task_id: string;
  trace_id: string;
  kind: ArtifactKind;
  content_type: string;
  data: string | Uint8Array;
  classification?: ArtifactClassification;
  attempt_id?: string;
  execution_id?: string;
  expires_at_utc?: string;
}

export interface ReadArtifactInput {
  tenant_id: string;
  artifact_id: string;
  trace_id: string;
}

export interface ArtifactRecord {
  reference: ArtifactReference;
  status: ArtifactStatus;
  data: Uint8Array;
}

export class ArtifactStoreError extends Error {
  readonly code: "PLATFORM_INVALID_REQUEST" | "PLATFORM_NOT_FOUND" | "PLATFORM_FORBIDDEN" | "PLATFORM_CONFLICT";
  readonly details: Record<string, unknown>;

  constructor(code: ArtifactStoreError["code"], message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "ArtifactStoreError";
    this.code = code;
    this.details = details;
  }
}

export class LocalArtifactStore {
  readonly #clock: PlatformClock;
  readonly #eventBus?: EventBus;
  readonly #records = new Map<string, ArtifactRecord>();
  #sequence = 0;

  constructor(options: { clock?: PlatformClock; eventBus?: EventBus } = {}) {
    this.#clock = options.clock ?? new SystemClock();
    this.#eventBus = options.eventBus;
  }

  upload(input: UploadArtifactInput): ArtifactReference {
    assertPlatformId("tenant_id", input.tenant_id);
    assertPlatformId("task_id", input.task_id);
    assertPlatformId("trace_id", input.trace_id);
    if (input.attempt_id !== undefined) assertPlatformId("attempt_id", input.attempt_id);
    if (input.execution_id !== undefined) assertPlatformId("execution_id", input.execution_id);
    if (!input.content_type.trim()) {
      throw new ArtifactStoreError("PLATFORM_INVALID_REQUEST", "content_type is required");
    }

    const bytes = toBytes(input.data);
    const reading = this.#clock.now();
    const artifact_id = this.#nextArtifactId(input.trace_id);
    const reference: ArtifactReference = {
      artifact_id,
      tenant_id: input.tenant_id,
      task_id: input.task_id,
      attempt_id: input.attempt_id,
      execution_id: input.execution_id,
      trace_id: input.trace_id,
      kind: input.kind,
      storage_ref: `artifact_store:${artifact_id}`,
      content_type: input.content_type,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      size_bytes: bytes.byteLength,
      classification: input.classification ?? "internal",
      created_at_utc: reading.utc_timestamp,
      expires_at_utc: input.expires_at_utc,
    };

    this.#records.set(artifact_id, {
      reference,
      status: "active",
      data: bytes,
    });
    this.#publishArtifactEvent(reference, reading.monotonic_ms);
    return cloneReference(reference);
  }

  read(input: ReadArtifactInput): { reference: ArtifactReference; data: Uint8Array } {
    assertPlatformId("tenant_id", input.tenant_id);
    assertPlatformId("artifact_id", input.artifact_id);
    assertPlatformId("trace_id", input.trace_id);
    const record = this.#records.get(input.artifact_id);
    if (!record) {
      throw new ArtifactStoreError("PLATFORM_NOT_FOUND", "Artifact not found", { artifact_id: input.artifact_id });
    }
    if (record.reference.tenant_id !== input.tenant_id) {
      throw new ArtifactStoreError("PLATFORM_FORBIDDEN", "Artifact tenant mismatch", { artifact_id: input.artifact_id });
    }
    if (record.status === "expired") {
      throw new ArtifactStoreError("PLATFORM_CONFLICT", "Artifact is expired", { artifact_id: input.artifact_id });
    }
    return {
      reference: cloneReference(record.reference),
      data: new Uint8Array(record.data),
    };
  }

  expire(input: ReadArtifactInput): ArtifactReference {
    const record = this.#records.get(input.artifact_id);
    if (!record) {
      throw new ArtifactStoreError("PLATFORM_NOT_FOUND", "Artifact not found", { artifact_id: input.artifact_id });
    }
    this.read(input);
    record.status = "expired";
    return cloneReference(record.reference);
  }

  reference(artifact_id: string): ArtifactReference | undefined {
    const record = this.#records.get(artifact_id);
    return record ? cloneReference(record.reference) : undefined;
  }

  #nextArtifactId(traceId: string): string {
    this.#sequence += 1;
    return `artifact_${traceId.replace(/^trace_/, "")}_${String(this.#sequence).padStart(4, "0")}`;
  }

  #publishArtifactEvent(reference: ArtifactReference, monotonic_ms: number): void {
    this.#eventBus?.publish({
      schema_version: "nexus.event_envelope.v1",
      event_id: `event_${reference.artifact_id.replace(/^artifact_/, "artifact_")}`,
      event_type: "artifact.created",
      tenant_id: reference.tenant_id,
      task_id: reference.task_id,
      attempt_id: reference.attempt_id,
      execution_id: reference.execution_id,
      artifact_id: reference.artifact_id,
      trace_id: reference.trace_id,
      occurred_at_utc: reference.created_at_utc,
      monotonic_ms,
      producer: { service: "artifact-store", component: "local-artifact-store" },
      subject: { kind: "artifact", id: reference.artifact_id },
      payload: {
        artifact_id: reference.artifact_id,
        content_type: reference.content_type,
        sha256: reference.sha256,
        size_bytes: reference.size_bytes,
        classification: reference.classification,
      },
    } satisfies PlatformEventEnvelope);
  }
}

function toBytes(data: string | Uint8Array): Uint8Array {
  return typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
}

function cloneReference(reference: ArtifactReference): ArtifactReference {
  return JSON.parse(JSON.stringify(reference)) as ArtifactReference;
}
