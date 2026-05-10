import { describe, expect, test } from "bun:test";
import {
  evaluateSharingGovernance,
  evaluateSharingGovernanceBundle,
  validateCredentialRebindingEvidence,
  validateSharingGovernanceManifest,
  type CredentialRebindingEvidence,
  type ShareArtifactManifest,
  type SharingGovernanceBundle,
  type SharingGovernanceManifest,
} from "../src/index.js";

describe("Sharing governance contracts", () => {
  const governance: SharingGovernanceManifest = {
    schema_version: 1,
    governance_id: "dev-board-sharing",
    artifact_id: "dev-board-share",
    app_id: "dev-board",
    version_id: "v3",
    owner: "user:bob",
    maintainers: ["user:bob"],
    operators: ["user:bob"],
    lineage: {
      source_artifact_id: "dev-board-share",
      source_app_id: "dev-board",
      source_version_id: "v3",
    },
    rights: [
      {
        id: "charlie-install",
        subject: "user:charlie",
        actions: ["install"],
        scope: "artifact",
      },
      {
        id: "dave-fork",
        subject: "user:dave",
        actions: ["install", "fork"],
        scope: "forks",
      },
      {
        id: "maintainer-operate",
        subject: "role:maintainer",
        actions: ["share", "approve", "publish", "rollback", "revoke"],
        scope: "published-app",
      },
    ],
    credential_rebinding_policy: {
      required: true,
      requirements: [
        {
          id: "github-user-token",
          provider_id: "github",
          scopes: ["repo"],
          binding_mode: "per-user",
          placement: "host-broker",
          required: true,
        },
        {
          id: "linear-user-token",
          provider_id: "linear",
          scopes: ["read"],
          binding_mode: "per-user",
          placement: "host-broker",
          required: true,
        },
      ],
    },
    revocation: {
      revoked: false,
    },
  };

  const charlieEvidence: CredentialRebindingEvidence = {
    schema_version: 1,
    evidence_id: "charlie-dev-board-bindings",
    artifact_id: "dev-board-share",
    app_id: "dev-board",
    version_id: "v3",
    subject: "user:charlie",
    bindings: [
      {
        requirement_id: "github-user-token",
        provider_id: "github",
        status: "bound",
        bound_at: "2026-05-06T00:00:00.000Z",
        credential_ref: "credref:charlie-github",
      },
      {
        requirement_id: "linear-user-token",
        provider_id: "linear",
        status: "bound",
        bound_at: "2026-05-06T00:00:00.000Z",
        credential_ref: "credref:charlie-linear",
      },
    ],
  };

  const shareArtifact: ShareArtifactManifest = {
    schema_version: 1,
    artifact_id: "dev-board-share",
    app_id: "dev-board",
    version_id: "v3",
    source_profile_id: "sqlite-local-docker",
    created_from_package_id: "dev-board-agent",
    created_from_package_version: "0.1.0",
    includes: {
      app_definition: true,
      init_recipe: true,
      provider_requirements: true,
    },
    excludes: {
      secrets: true,
      private_derived_cache: true,
      source_database: true,
    },
    credential_requirements: governance.credential_rebinding_policy.requirements,
    target_profile_policy: {
      compatible_profile_ids: ["sqlite-local-docker"],
      required_capabilities: ["storage", "deployment"],
      credential_rebinding_required: true,
    },
    init_recipe: {
      recipe_id: "dev-board-init",
      version: "0.1.0",
      steps: [
        {
          id: "seed-watchlist",
          kind: "semantic-operation",
          operation_id: "seed_watchlist",
          idempotency_key: "dev-board-v3-seed-watchlist",
          description: "Seed the portable watchlist rows.",
        },
      ],
    },
  };

  const governanceBundle: SharingGovernanceBundle = {
    share_artifact: shareArtifact,
    sharing_governance: governance,
    credential_rebinding_evidence: charlieEvidence,
  };

  test("accepts a valid sharing governance manifest", () => {
    expect(validateSharingGovernanceManifest(governance)).toMatchObject({
      ok: true,
      issues: [],
    });
  });

  test("rejects missing owner and invalid subject references", () => {
    const result = validateSharingGovernanceManifest({
      ...governance,
      owner: "",
      maintainers: ["bob"],
      rights: [
        {
          id: "bad-action",
          subject: "user:charlie",
          actions: ["download"],
          scope: "artifact",
        },
      ],
    } as unknown as SharingGovernanceManifest);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "sharing_governance.owner.invalid",
      "sharing_governance.maintainer.subject.invalid",
      "sharing_governance.right.action.invalid",
    ]);
  });

  test("owner can revoke without credential rebinding evidence", () => {
    expect(evaluateSharingGovernance(governance, {
      action: "revoke",
      scope: "published-app",
      subject: "user:bob",
    })).toMatchObject({
      allowed: true,
      reason_code: "owner",
      missing_credential_requirement_ids: [],
    });
  });

  test("explicit grant with complete credential evidence allows install", () => {
    expect(evaluateSharingGovernance(governance, {
      action: "install",
      scope: "artifact",
      subject: "user:charlie",
      credential_rebinding_evidence: charlieEvidence,
    })).toMatchObject({
      allowed: true,
      reason_code: "explicit-grant",
      matched_grants: ["charlie-install"],
      missing_credential_requirement_ids: [],
    });
  });

  test("bundle decision allows install only when artifact, governance, evidence, and grant align", () => {
    expect(evaluateSharingGovernanceBundle(governanceBundle, {
      action: "install",
      scope: "artifact",
      subject: "user:charlie",
    })).toMatchObject({
      allowed: true,
      reason_code: "explicit-grant",
      matched_grants: ["charlie-install"],
      bundle_ok: true,
      bundle_issues: [],
      missing_credential_requirement_ids: [],
    });
  });

  test("bundle decision fails closed when share artifact and governance describe different app versions", () => {
    const decision = evaluateSharingGovernanceBundle({
      ...governanceBundle,
      share_artifact: {
        ...shareArtifact,
        version_id: "v2",
      },
    }, {
      action: "install",
      scope: "artifact",
      subject: "user:charlie",
    });

    expect(decision).toMatchObject({
      allowed: false,
      reason_code: "invalid-bundle",
      matched_grants: [],
      bundle_ok: false,
    });
    expect(decision.bundle_issues.map((issue) => issue.code)).toContain(
      "sharing_governance_bundle.version_id_mismatch",
    );
  });

  test("bundle decision validates request-provided evidence before authorizing execution", () => {
    const decision = evaluateSharingGovernanceBundle({
      share_artifact: shareArtifact,
      sharing_governance: governance,
    }, {
      action: "install",
      scope: "artifact",
      subject: "user:charlie",
      credential_rebinding_evidence: {
        ...charlieEvidence,
        version_id: "v2",
      },
    });

    expect(decision).toMatchObject({
      allowed: false,
      reason_code: "invalid-bundle",
      bundle_ok: false,
    });
    expect(decision.bundle_issues.map((issue) => issue.code)).toContain(
      "credential_rebinding.version_id.mismatch",
    );
  });

  test("missing credential rebinding denies install even with an explicit grant", () => {
    expect(evaluateSharingGovernance(governance, {
      action: "install",
      scope: "artifact",
      subject: "user:charlie",
    })).toMatchObject({
      allowed: false,
      reason_code: "missing-credential-rebinding",
      matched_grants: ["charlie-install"],
      missing_credential_requirement_ids: ["github-user-token", "linear-user-token"],
    });
  });

  test("missing grant denies publish", () => {
    expect(evaluateSharingGovernance(governance, {
      action: "publish",
      scope: "published-app",
      subject: "user:charlie",
      credential_rebinding_evidence: charlieEvidence,
    })).toMatchObject({
      allowed: false,
      reason_code: "missing-grant",
      matched_grants: [],
    });
  });

  test("revoked manifest denies all actions", () => {
    expect(evaluateSharingGovernance({
      ...governance,
      revocation: {
        revoked: true,
        reason: "Security review failed.",
        revoked_by: "user:bob",
        revoked_at: "2026-05-06T00:00:00.000Z",
      },
    }, {
      action: "install",
      scope: "artifact",
      subject: "user:charlie",
      credential_rebinding_evidence: charlieEvidence,
    })).toMatchObject({
      allowed: false,
      reason_code: "revoked",
    });
  });

  test("validates credential rebinding evidence without exposing secrets", () => {
    expect(validateCredentialRebindingEvidence(charlieEvidence, governance)).toMatchObject({
      ok: true,
      issues: [],
    });
  });

  test("denies explicit grants when request scope does not match", () => {
    expect(evaluateSharingGovernance(governance, {
      action: "install",
      scope: "published-app",
      subject: "user:charlie",
      credential_rebinding_evidence: charlieEvidence,
    })).toMatchObject({
      allowed: false,
      reason_code: "missing-grant",
      matched_grants: [],
    });
  });

  test("rejects credential rebinding evidence for a different app version", () => {
    const result = validateCredentialRebindingEvidence({
      ...charlieEvidence,
      version_id: "v2",
    }, governance);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "credential_rebinding.version_id.mismatch",
    ]);
  });

  test("rejects malformed credential requirements in governance manifests", () => {
    const result = validateSharingGovernanceManifest({
      ...governance,
      credential_rebinding_policy: {
        required: true,
        requirements: [
          {
            id: "Bad Token",
            provider_id: "GitHub",
            scopes: [],
            binding_mode: "provider-specific",
            placement: "app-db",
            required: "yes",
          },
        ],
      },
    } as unknown as SharingGovernanceManifest);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "credential_requirement.id.invalid",
      "credential_requirement.provider_id.invalid",
      "credential_requirement.scopes.required",
      "credential_requirement.binding_mode.invalid",
      "credential_requirement.placement.invalid",
      "credential_requirement.required.invalid",
    ]);
  });

  test("rejects credential evidence with secret-like material or unknown requirements", () => {
    const result = validateCredentialRebindingEvidence({
      ...charlieEvidence,
      bindings: [
        {
          requirement_id: "missing-token",
          provider_id: "github",
          status: "bound",
          credential_ref: "credref:unknown",
          access_token: "ghp_should-not-live-here",
          oauth_secret: "oauth-should-not-live-here",
        },
      ],
    } as unknown as CredentialRebindingEvidence, governance);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "credential_rebinding.binding.requirement_unknown",
      "credential_rebinding.secret_material.forbidden",
    ]);
  });
});
