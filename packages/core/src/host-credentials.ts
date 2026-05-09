import { randomUUID } from "node:crypto";
import type {
  CredentialBindingMode,
  CredentialRequirement,
  CredentialPlacement,
} from "./host-authoring.js";
import type {
  CredentialRebindingEvidence,
  SharingSubjectRef,
} from "./sharing-governance.js";

export type HostCredentialStatus = "bound" | "revoked";

export type HostCredentialSecret =
  | {
      readonly kind: "oauth2";
      readonly access_token: string;
      readonly refresh_token?: string;
      readonly token_type?: string;
      readonly expires_at_ms?: number;
    }
  | {
      readonly kind: "api-key";
      readonly value: string;
      readonly expires_at_ms?: number;
    }
  | {
      readonly kind: "opaque";
      readonly value: string;
      readonly expires_at_ms?: number;
    };

export interface HostCredentialBinding {
  readonly credential_ref: string;
  readonly requirement_id: string;
  readonly provider_id: string;
  readonly subject_ref: string;
  readonly account_ref: string;
  readonly scopes: readonly string[];
  readonly binding_mode: CredentialBindingMode;
  readonly placement: CredentialPlacement;
  readonly status: HostCredentialStatus;
  readonly bound_at_ms: number;
  readonly updated_at_ms: number;
  readonly revoked_at_ms?: number;
  readonly revoke_reason?: string;
  readonly expires_at_ms?: number;
}

export interface BindHostCredentialInput {
  readonly requirement: CredentialRequirement;
  readonly subject_ref: string;
  readonly account_ref: string;
  readonly scopes: readonly string[];
  readonly secret: HostCredentialSecret;
  readonly now_ms?: number;
  readonly credential_ref?: string;
}

export interface ResolveHostCredentialOptions {
  readonly now_ms?: number;
}

export interface RevokeHostCredentialOptions {
  readonly revoked_at_ms?: number;
  readonly reason?: string;
}

export interface HostResolvedCredential {
  readonly binding: HostCredentialBinding;
  readonly secret: HostCredentialSecret;
}

export interface CredentialEvidenceInput {
  readonly evidence_id: string;
  readonly artifact_id: string;
  readonly app_id: string;
  readonly version_id: string;
  readonly subject: SharingSubjectRef;
  readonly requirements: readonly CredentialRequirement[];
  readonly bindings: readonly HostCredentialBinding[];
}

export class InMemoryHostCredentialBroker {
  private readonly bindings = new Map<string, HostCredentialBinding>();
  private readonly secrets = new Map<string, HostCredentialSecret>();

  async bindCredential(input: BindHostCredentialInput): Promise<HostCredentialBinding> {
    validateHostCredentialInput(input);
    const now = input.now_ms ?? Date.now();
    const credentialRef = input.credential_ref ?? createCredentialRef(input.subject_ref, input.requirement.provider_id);
    const binding: HostCredentialBinding = {
      credential_ref: credentialRef,
      requirement_id: input.requirement.id,
      provider_id: input.requirement.provider_id,
      subject_ref: input.subject_ref,
      account_ref: input.account_ref,
      scopes: [...input.scopes],
      binding_mode: input.requirement.binding_mode,
      placement: input.requirement.placement,
      status: "bound",
      bound_at_ms: now,
      updated_at_ms: now,
      expires_at_ms: secretExpiresAt(input.secret),
    };
    this.bindings.set(credentialRef, binding);
    this.secrets.set(credentialRef, input.secret);
    return binding;
  }

  async getCredentialBinding(credentialRef: string): Promise<HostCredentialBinding | undefined> {
    return this.bindings.get(credentialRef);
  }

  async listCredentialBindings(filter: {
    readonly subject_ref?: string;
    readonly provider_id?: string;
    readonly status?: HostCredentialStatus;
  } = {}): Promise<readonly HostCredentialBinding[]> {
    return [...this.bindings.values()].filter((binding) =>
      (filter.subject_ref === undefined || binding.subject_ref === filter.subject_ref) &&
      (filter.provider_id === undefined || binding.provider_id === filter.provider_id) &&
      (filter.status === undefined || binding.status === filter.status)
    );
  }

  async resolveCredential(
    credentialRef: string,
    options: ResolveHostCredentialOptions = {},
  ): Promise<HostResolvedCredential | undefined> {
    const now = options.now_ms ?? Date.now();
    const binding = this.bindings.get(credentialRef);
    const secret = this.secrets.get(credentialRef);
    if (binding === undefined || secret === undefined) return undefined;
    if (binding.status !== "bound") return undefined;
    const expiresAt = secretExpiresAt(secret);
    if (expiresAt !== undefined && expiresAt <= now) return undefined;
    return { binding, secret };
  }

  async revokeCredential(
    credentialRef: string,
    options: RevokeHostCredentialOptions = {},
  ): Promise<HostCredentialBinding | undefined> {
    const binding = this.bindings.get(credentialRef);
    if (binding === undefined) return undefined;
    const now = options.revoked_at_ms ?? Date.now();
    const revoked: HostCredentialBinding = {
      ...binding,
      status: "revoked",
      updated_at_ms: now,
      revoked_at_ms: now,
      revoke_reason: options.reason,
    };
    this.bindings.set(credentialRef, revoked);
    return revoked;
  }
}

export function createCredentialRebindingEvidenceFromBindings(
  input: CredentialEvidenceInput,
): CredentialRebindingEvidence {
  const requirementById = new Map(input.requirements.map((requirement) => [
    requirement.id,
    requirement,
  ]));
  for (const binding of input.bindings) {
    const requirement = requirementById.get(binding.requirement_id);
    if (requirement === undefined) {
      throw new Error("credential binding requirement_id is not in evidence requirements");
    }
    if (binding.subject_ref !== input.subject) {
      throw new Error("credential binding subject_ref does not match evidence subject");
    }
    if (binding.provider_id !== requirement.provider_id) {
      throw new Error("credential binding provider_id does not match requirement");
    }
  }
  const bindingByRequirement = new Map(input.bindings.map((binding) => [
    binding.requirement_id,
    binding,
  ]));
  return {
    schema_version: 1,
    evidence_id: input.evidence_id,
    artifact_id: input.artifact_id,
    app_id: input.app_id,
    version_id: input.version_id,
    subject: input.subject,
    bindings: input.requirements.map((requirement) => {
      const binding = bindingByRequirement.get(requirement.id);
      if (binding === undefined) {
        return {
          requirement_id: requirement.id,
          provider_id: requirement.provider_id,
          status: "missing" as const,
        };
      }
      if (binding.status === "revoked") {
        return {
          requirement_id: requirement.id,
          provider_id: requirement.provider_id,
          status: "revoked" as const,
          credential_ref: binding.credential_ref,
        };
      }
      return {
        requirement_id: requirement.id,
        provider_id: requirement.provider_id,
        status: "bound" as const,
        bound_at: new Date(binding.bound_at_ms).toISOString(),
        credential_ref: binding.credential_ref,
      };
    }),
  };
}

function validateHostCredentialInput(input: BindHostCredentialInput): void {
  if (!input.subject_ref.trim()) throw new Error("subject_ref is required");
  if (!input.account_ref.trim()) throw new Error("account_ref is required");
  if (input.requirement.placement !== "host-broker") {
    throw new Error("Host credential broker can only bind host-broker requirements");
  }
  const provided = new Set(input.scopes);
  const missing = input.requirement.scopes.filter((scope) => !provided.has(scope));
  if (missing.length > 0) {
    throw new Error(`missing required credential scopes: ${missing.join(", ")}`);
  }
}

function secretExpiresAt(secret: HostCredentialSecret): number | undefined {
  return "expires_at_ms" in secret ? secret.expires_at_ms : undefined;
}

function createCredentialRef(subjectRef: string, providerId: string): string {
  const subject = subjectRef.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `credref:${subject || "subject"}-${providerId}-${randomUUID()}`;
}
