import { describe, expect, test } from "bun:test";
import {
  InMemoryHostCredentialBroker,
  createCredentialRebindingEvidenceFromBindings,
  type CredentialRequirement,
} from "../src/index.js";

describe("Host credential broker utilities", () => {
  const requirement: CredentialRequirement = {
    id: "github-user-token",
    provider_id: "github",
    scopes: ["repo", "workflow"],
    binding_mode: "per-user",
    placement: "host-broker",
    required: true,
  };

  test("binds credentials as refs while resolving raw secrets only through the broker", async () => {
    const broker = new InMemoryHostCredentialBroker();

    const binding = await broker.bindCredential({
      requirement,
      subject_ref: "user:charlie",
      account_ref: "github:pandazki",
      scopes: ["repo", "workflow", "read:user"],
      secret: {
        kind: "oauth2",
        access_token: "gho_should_not_be_in_metadata",
        refresh_token: "refresh_should_not_be_in_metadata",
        token_type: "bearer",
        expires_at_ms: 100_000,
      },
      now_ms: 1000,
    });

    expect(binding).toMatchObject({
      requirement_id: "github-user-token",
      provider_id: "github",
      subject_ref: "user:charlie",
      account_ref: "github:pandazki",
      status: "bound",
    });
    expect(binding.credential_ref).toStartWith("credref:");
    expect(JSON.stringify(binding)).not.toContain("gho_should_not_be_in_metadata");

    const resolved = await broker.resolveCredential(binding.credential_ref, { now_ms: 2000 });
    expect(resolved).toMatchObject({
      binding,
      secret: {
        kind: "oauth2",
        access_token: "gho_should_not_be_in_metadata",
      },
    });

    const evidence = createCredentialRebindingEvidenceFromBindings({
      evidence_id: "charlie-dev-board-bindings",
      artifact_id: "dev-board-share",
      app_id: "dev-board",
      version_id: "v3",
      subject: "user:charlie",
      requirements: [requirement],
      bindings: [binding],
    });

    expect(evidence.bindings).toEqual([
      {
        requirement_id: "github-user-token",
        provider_id: "github",
        status: "bound",
        bound_at: "1970-01-01T00:00:01.000Z",
        credential_ref: binding.credential_ref,
      },
    ]);
    expect(JSON.stringify(evidence)).not.toContain("gho_should_not_be_in_metadata");
  });

  test("rejects missing scopes before storing any secret", async () => {
    const broker = new InMemoryHostCredentialBroker();

    await expect(broker.bindCredential({
      requirement,
      subject_ref: "user:charlie",
      account_ref: "github:pandazki",
      scopes: ["repo"],
      secret: {
        kind: "oauth2",
        access_token: "gho_should_not_store",
      },
    })).rejects.toThrow("missing required credential scopes: workflow");

    expect(await broker.listCredentialBindings()).toEqual([]);
  });

  test("revoked or expired credentials fail closed", async () => {
    const broker = new InMemoryHostCredentialBroker();
    const binding = await broker.bindCredential({
      requirement,
      subject_ref: "user:charlie",
      account_ref: "github:pandazki",
      scopes: ["repo", "workflow"],
      secret: {
        kind: "oauth2",
        access_token: "gho_secret",
        expires_at_ms: 1500,
      },
      now_ms: 1000,
    });

    expect(await broker.resolveCredential(binding.credential_ref, { now_ms: 1400 })).toBeDefined();
    expect(await broker.resolveCredential(binding.credential_ref, { now_ms: 1600 })).toBeUndefined();

    await broker.revokeCredential(binding.credential_ref, {
      revoked_at_ms: 1700,
      reason: "Builder disconnected GitHub.",
    });
    expect(await broker.resolveCredential(binding.credential_ref, { now_ms: 1701 })).toBeUndefined();
    expect((await broker.getCredentialBinding(binding.credential_ref))?.status).toBe("revoked");
  });

  test("evidence rejects bindings for a different subject or provider", async () => {
    const broker = new InMemoryHostCredentialBroker();
    const binding = await broker.bindCredential({
      requirement,
      subject_ref: "user:dave",
      account_ref: "github:dave",
      scopes: ["repo", "workflow"],
      secret: {
        kind: "oauth2",
        access_token: "gho_wrong_subject",
      },
      now_ms: 1000,
    });

    expect(() => createCredentialRebindingEvidenceFromBindings({
      evidence_id: "charlie-dev-board-bindings",
      artifact_id: "dev-board-share",
      app_id: "dev-board",
      version_id: "v3",
      subject: "user:charlie",
      requirements: [requirement],
      bindings: [binding],
    })).toThrow("credential binding subject_ref does not match evidence subject");

    const wrongProvider = {
      ...binding,
      subject_ref: "user:charlie",
      provider_id: "linear",
    };
    expect(() => createCredentialRebindingEvidenceFromBindings({
      evidence_id: "charlie-dev-board-bindings",
      artifact_id: "dev-board-share",
      app_id: "dev-board",
      version_id: "v3",
      subject: "user:charlie",
      requirements: [requirement],
      bindings: [wrongProvider],
    })).toThrow("credential binding provider_id does not match requirement");
  });
});
