# M23 Team / Org Sharing Governance Design

**Status:** Approved for implementation

## Goal

M23 defines the first test-backed governance contract for sharing, installing, and forking Generated Applications across people and organizations.

It starts from the M22 Authoring Kit boundary:

```text
share artifact = app definition + idempotent semantic init recipe + provider requirements
not share artifact = source database + secrets + private derived cache
```

M23 answers the next question:

> Given a portable share artifact, who owns it, who may install or fork it, who may approve and operate the resulting app, and how is credential rebinding recorded without exposing secrets?

This milestone is not a full enterprise security product. It pins the domain contract that a Creation Host can use before building a polished team/org UI or real identity integration.

## User Story

Alice builds a Creation Host product on pneuma-framework.

Bob uses Alice's Host to build `dev-board`, then shares it with his team.

Charlie installs Bob's shared app with the default profile and re-binds her own GitHub/Linear credentials.

Dave forks Bob's app into a remote profile, removes incompatible Apple Notes capability, re-binds his credentials, and later publishes/rolls back his own fork.

The Host must be able to answer:

1. Who owns Bob's shared artifact?
2. What lineage connects Dave's fork back to Bob's app?
3. Can Charlie install but not publish?
4. Can Dave fork and operate his fork after install?
5. Was credential rebinding completed, by whom, and for which requirements?
6. Can an organization revoke future installs or operations without editing the artifact itself?

## Design Principles

### 1. Manifest first, identity later

M23 should not invent production IAM. The first slice uses stable subject references:

```text
user:bob
user:charlie
user:dave
role:maintainer
org:acme-devtools
team:acme-devtools/platform
```

The framework validates and evaluates these references. A real Creation Host later maps them to its own identity provider.

### 2. Sharing governance is not app policy

App policy answers runtime questions inside a Generated Application:

```text
Can this End User read this row?
Can this Operation be invoked?
```

Sharing governance answers Host-level lifecycle questions:

```text
Can this Builder install this artifact?
Can this Builder fork it?
Can this operator publish, rollback, or revoke this Published Application?
```

Do not model M23 as `pneuma_policy_rules`. It is Host / Creation lifecycle governance, not generated-app data access.

### 3. Secrets never become evidence

Credential rebinding evidence records only:

- credential requirement id;
- provider id;
- subject that performed binding;
- binding status;
- timestamp;
- opaque credential reference id if the Host has one.

It never records access tokens, refresh tokens, passwords, private keys, raw OAuth responses, or local credential file paths.

### 4. Forks must keep lineage

A fork is not a copy with forgotten history. It must name:

- source artifact id;
- source app id;
- source version id;
- forked app id;
- target profile id;
- actor;
- capability removals or substitutions;
- credential rebinding requirements.

This is the minimum needed for audit, support, revocation, and later organization policy.

## Proposed Contract

Add a focused contract module in `@pneuma-framework/core`:

```ts
packages/core/src/sharing-governance.ts
```

The module should export:

```ts
validateSharingGovernanceManifest(manifest)
evaluateSharingGovernance(manifest, request)
validateCredentialRebindingEvidence(evidence, manifest)
```

### SharingGovernanceManifest

The manifest is Host-owned but framework-validated:

```ts
interface SharingGovernanceManifest {
  schema_version: 1;
  governance_id: string;
  artifact_id: string;
  app_id: string;
  version_id: string;
  owner: SharingSubjectRef;
  maintainers: readonly SharingSubjectRef[];
  operators: readonly SharingSubjectRef[];
  lineage: {
    source_artifact_id?: string;
    source_app_id?: string;
    source_version_id?: string;
    forked_from_governance_id?: string;
  };
  rights: readonly SharingRightGrant[];
  credential_rebinding_policy: {
    required: true;
    requirements: readonly CredentialRequirement[];
  };
  revocation: {
    revoked: boolean;
    reason?: string;
    revoked_by?: SharingSubjectRef;
    revoked_at?: string;
  };
}
```

### SharingRightGrant

Rights are small and explicit:

```ts
type SharingAction =
  | "share"
  | "fork"
  | "install"
  | "approve"
  | "publish"
  | "rollback"
  | "revoke";

interface SharingRightGrant {
  subject: SharingSubjectRef;
  actions: readonly SharingAction[];
  scope: "artifact" | "forks" | "published-app";
}
```

M23 v0 does not need nested policy expressions. The goal is a deterministic first contract:

```text
explicit grant + not revoked + required credential rebinding evidence for install/fork/publish
```

### SharingDecision

`evaluateSharingGovernance` returns stable evidence:

```ts
interface SharingGovernanceDecision {
  allowed: boolean;
  action: SharingAction;
  subject: SharingSubjectRef;
  reason_code:
    | "explicit-grant"
    | "owner"
    | "maintainer"
    | "operator"
    | "revoked"
    | "missing-grant"
    | "missing-credential-rebinding";
  matched_grants: readonly string[];
  missing_credential_requirement_ids: readonly string[];
}
```

The decision helper is intentionally pure. It does not read files, call OAuth, or mutate Host state.

### CredentialRebindingEvidence

Credential rebinding evidence is separate from the share artifact:

```ts
interface CredentialRebindingEvidence {
  schema_version: 1;
  evidence_id: string;
  artifact_id: string;
  app_id: string;
  subject: SharingSubjectRef;
  bindings: readonly {
    requirement_id: string;
    provider_id: string;
    status: "bound" | "missing" | "revoked";
    bound_at?: string;
    credential_ref?: string;
  }[];
}
```

The validator rejects secret-like keys anywhere in the evidence object.

## Example: Bob / Charlie / Dave

Bob's shared artifact can say:

```text
owner: user:bob
maintainers: [user:bob]
operators: [user:bob]
rights:
  user:charlie -> install
  user:dave -> install, fork
  role:maintainer -> share, approve, publish, rollback, revoke
credential_rebinding_policy:
  required: true
  requirements:
    github-user-token
    linear-user-token
```

Decision examples:

```text
Charlie install + credential evidence complete -> allowed / explicit-grant
Charlie publish -> denied / missing-grant
Dave fork + credential evidence missing -> denied / missing-credential-rebinding
Bob revoke -> allowed / owner
Any action after revoked=true -> denied / revoked
```

## Non-Goals

- No real OAuth implementation.
- No enterprise identity provider.
- No hosted organization admin UI.
- No signing or cryptographic provenance in this slice.
- No marketplace distribution.
- No database migration or provider switching implementation.
- No runtime app-data policy changes.
- No secrets storage or credential broker implementation.

## Implementation Shape

### Core

Create `packages/core/src/sharing-governance.ts` and export it from `packages/core/src/index.ts`.

Tests live in:

```text
packages/core/test/sharing-governance.test.ts
```

The tests should cover:

- valid manifest accepted;
- missing owner rejected;
- invalid subject references rejected;
- unknown action rejected;
- revoked manifest denies all actions;
- owner can revoke/share;
- explicit grant allows install/fork;
- missing grant denies;
- missing credential rebinding denies install/fork/publish;
- completed credential rebinding allows install;
- evidence with secret-like fields rejected;
- evidence referring to unknown credential requirement rejected.

### Developer Experience

Extend Host authoring diagnostics after the core validator is green:

```text
diagnoseCreationHostAuthoring({
  sharing_governance?: SharingGovernanceManifest,
  credential_rebinding_evidence?: CredentialRebindingEvidence
})
```

The new inputs remain optional. M22 hosts without sharing files must still pass doctor, while Hosts that provide sharing files receive explicit sharing-governance diagnostics.

### CLI

Extend `doctor-host` with optional inputs:

```bash
--sharing-governance ./sharing-governance.example.json
--credential-rebinding ./credential-rebinding.example.json
```

Scaffold should emit example files after the core validator and diagnostics are green:

```text
sharing-governance.example.json
credential-rebinding.example.json
```

### Docs

Update:

- `docs/developer/creation-host-contract.md`
- `docs/developer/creation-host-contract.zh-CN.md`
- `docs/architecture/OPEN-QUESTIONS.md`
- `docs/architecture/roadmap.md`

M23 snapshot is only written after implementation and verification.

## Verification

Use TDD:

1. Write failing core tests for sharing governance contracts.
2. Implement minimal pure validators and decision helper.
3. Add developer diagnostics tests.
4. Add CLI parse/scaffold/doctor tests if diagnostics are extended.
5. Run:

```bash
bun test packages/core/test/sharing-governance.test.ts
bun test packages/core/test/developer-experience.test.ts packages/cli/test/developer-experience.test.ts
bun test packages/core-domain packages/core packages/cli
bun run typecheck
git diff --check
```

## Success Criteria

M23 v0 is complete when:

- A Creation Host can declare ownership, lineage, rights, revocation, and credential rebinding policy for a shared artifact.
- A pure helper can explain why a subject may or may not install/fork/publish/rollback/revoke.
- Credential rebinding evidence proves completion without storing secrets.
- Scaffold emits example sharing governance files and doctor can validate them when provided.
- Open questions move from "what is the sharing unit?" to later product concerns: signing, org UI, identity provider mapping, credential broker implementation, and marketplace distribution.
