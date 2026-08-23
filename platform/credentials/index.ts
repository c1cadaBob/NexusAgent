import { createHash } from "node:crypto";
import { assertPlatformId } from "../task-state/index.ts";
import { type PlatformClock, SystemClock } from "../clock/index.ts";
import { type EventBus, type PlatformEventEnvelope } from "../event-bus/index.ts";

export type CredentialPurpose = "channel_delivery" | "planner_context" | "executor_tool" | "artifact_access" | "admin_operation";
export type CredentialLeaseMode = "reference_only" | "short_lived_token";

export interface CredentialReference {
  credential_ref: string;
  tenant_id: string;
  trace_id: string;
  purpose: CredentialPurpose;
  lease_mode: CredentialLeaseMode;
  issued_at_utc: string;
  expires_at_utc: string;
  user_id?: string;
  agent_id?: string;
  scope?: readonly string[];
  redaction: {
    logs: "redacted";
    events: "redacted";
    artifacts: "secret_scan_required";
  };
}

export interface RegisterCredentialInput {
  tenant_id: string;
  trace_id: string;
  purpose: CredentialPurpose;
  material: string;
  expires_at_utc: string;
  lease_mode?: CredentialLeaseMode;
  user_id?: string;
  agent_id?: string;
  scope?: readonly string[];
}

export interface CredentialAuditRecord {
  credential_ref: string;
  tenant_id: string;
  trace_id: string;
  purpose: CredentialPurpose;
  material_sha256: string;
  issued_at_utc: string;
  expires_at_utc: string;
  action: "registered" | "resolved";
}

interface StoredCredential {
  reference: CredentialReference;
  material: string;
  material_sha256: string;
}

export class CredentialCenterError extends Error {
  readonly code: "PLATFORM_INVALID_REQUEST" | "PLATFORM_NOT_FOUND" | "PLATFORM_FORBIDDEN";
  readonly details: Record<string, unknown>;

  constructor(code: CredentialCenterError["code"], message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "CredentialCenterError";
    this.code = code;
    this.details = details;
  }
}

export class LocalCredentialCenter {
  readonly #clock: PlatformClock;
  readonly #eventBus?: EventBus;
  readonly #records = new Map<string, StoredCredential>();
  readonly #audit: CredentialAuditRecord[] = [];
  #sequence = 0;

  constructor(options: { clock?: PlatformClock; eventBus?: EventBus } = {}) {
    this.#clock = options.clock ?? new SystemClock();
    this.#eventBus = options.eventBus;
  }

  register(input: RegisterCredentialInput): CredentialReference {
    assertPlatformId("tenant_id", input.tenant_id);
    assertPlatformId("trace_id", input.trace_id);
    if (input.user_id !== undefined) assertPlatformId("user_id", input.user_id);
    if (input.agent_id !== undefined) assertPlatformId("agent_id", input.agent_id);
    if (!input.material) {
      throw new CredentialCenterError("PLATFORM_INVALID_REQUEST", "Credential material is required");
    }
    const reading = this.#clock.now();
    const credential_ref = this.#nextCredentialRef(input.trace_id);
    const material_sha256 = createHash("sha256").update(input.material).digest("hex");
    const reference: CredentialReference = {
      credential_ref,
      tenant_id: input.tenant_id,
      user_id: input.user_id,
      agent_id: input.agent_id,
      trace_id: input.trace_id,
      purpose: input.purpose,
      lease_mode: input.lease_mode ?? "reference_only",
      scope: input.scope ? [...input.scope] : undefined,
      issued_at_utc: reading.utc_timestamp,
      expires_at_utc: input.expires_at_utc,
      redaction: {
        logs: "redacted",
        events: "redacted",
        artifacts: "secret_scan_required",
      },
    };
    this.#records.set(credential_ref, {
      reference,
      material: input.material,
      material_sha256,
    });
    this.#recordAudit("registered", reference, material_sha256);
    this.#publishCredentialEvent(reference, material_sha256, reading.monotonic_ms);
    return cloneReference(reference);
  }

  resolveReference(tenant_id: string, credential_ref: string, trace_id: string): CredentialReference {
    assertPlatformId("tenant_id", tenant_id);
    assertPlatformId("trace_id", trace_id);
    const record = this.#records.get(credential_ref);
    if (!record) {
      throw new CredentialCenterError("PLATFORM_NOT_FOUND", "Credential reference not found", { credential_ref });
    }
    if (record.reference.tenant_id !== tenant_id) {
      throw new CredentialCenterError("PLATFORM_FORBIDDEN", "Credential tenant mismatch", { credential_ref });
    }
    this.#recordAudit("resolved", { ...record.reference, trace_id }, record.material_sha256);
    return cloneReference({ ...record.reference, trace_id });
  }

  auditLog(): readonly CredentialAuditRecord[] {
    return this.#audit.map((record) => ({ ...record }));
  }

  #nextCredentialRef(traceId: string): string {
    this.#sequence += 1;
    return `cred_${traceId.replace(/^trace_/, "")}_${String(this.#sequence).padStart(4, "0")}`;
  }

  #recordAudit(action: CredentialAuditRecord["action"], reference: CredentialReference, material_sha256: string): void {
    this.#audit.push({
      credential_ref: reference.credential_ref,
      tenant_id: reference.tenant_id,
      trace_id: reference.trace_id,
      purpose: reference.purpose,
      material_sha256,
      issued_at_utc: reference.issued_at_utc,
      expires_at_utc: reference.expires_at_utc,
      action,
    });
  }

  #publishCredentialEvent(reference: CredentialReference, material_sha256: string, monotonic_ms: number): void {
    this.#eventBus?.publish({
      schema_version: "nexus.event_envelope.v1",
      event_id: `event_${reference.credential_ref.replace(/^cred_/, "cred_")}`,
      event_type: "credential.lease_issued",
      tenant_id: reference.tenant_id,
      user_id: reference.user_id,
      agent_id: reference.agent_id,
      trace_id: reference.trace_id,
      occurred_at_utc: reference.issued_at_utc,
      monotonic_ms,
      producer: { service: "credential-center", component: "local-credential-center" },
      subject: { kind: "credential", id: reference.credential_ref },
      payload: {
        credential_ref: reference.credential_ref,
        purpose: reference.purpose,
        lease_mode: reference.lease_mode,
        material_sha256,
        redaction: reference.redaction,
      },
    } satisfies PlatformEventEnvelope);
  }
}

function cloneReference(reference: CredentialReference): CredentialReference {
  return JSON.parse(JSON.stringify(reference)) as CredentialReference;
}
