# Milestone 23 Snapshot: Sharing Governance Contract

**Status:** Closed after sharing governance manifests, credential rebinding evidence, scaffold integration, Host doctor diagnostics, and full core/CLI/typecheck verification.

**Date:** 2026-05-06

## Why M23 Exists

M22 made a portable share/fork artifact explicit:

```text
share artifact = app definition + idempotent semantic init recipe + provider requirements
not share artifact = source database + secrets + private derived cache
```

The next gap came from the same Bob / Charlie / Dave story:

```text
Bob shares dev-board.
Charlie installs Bob's default local version.
Dave forks it, changes provider profile, removes a capability, and deploys elsewhere.
```

After M22, the artifact was portable, but the governance around it was still implicit:

- who owns the shared artifact;
- who may fork, install, publish, rollback, or revoke;
- how source lineage survives a fork;
- how a Host proves credentials were re-bound without copying secrets;
- what happens when a shared artifact is revoked.

M23 closes the first framework-level answer. It does not build a marketplace, enterprise identity provider, OAuth flow, credential broker, admin UI, or cross-host signing system. It makes the Host-level sharing contract testable.

## What Changed

### 1. SharingGovernanceManifest

`@pneuma-framework/core` now exports:

```ts
validateSharingGovernanceManifest(manifest)
```

The manifest declares:

- governance id;
- artifact id, app id, version id;
- optional source artifact/app/version lineage;
- owner subject;
- maintainer subjects;
- operator subjects;
- explicit right grants;
- required credential rebinding policy;
- revocation status.

Subject refs use a stable shape:

```text
user:<id>
role:<id>
team:<id>
org:<id>
```

This is intentionally a framework contract shape, not an enterprise identity implementation.

### 2. Sharing Decision Helper

`@pneuma-framework/core` now exports:

```ts
evaluateSharingGovernance(manifest, request)
```

The helper answers Host-level lifecycle questions:

```text
Can this subject share / fork / install / approve / publish / rollback / revoke this artifact?
```

Decision behavior:

- revoked manifests deny all actions;
- the owner may perform all sharing actions;
- maintainers may share, approve, publish, rollback, and revoke;
- operators may publish and rollback;
- explicit grants can allow specific actions only inside the matching artifact/forks/published-app scope;
- install/fork/publish require complete credential rebinding evidence when the manifest marks credentials as required.

The output includes a stable reason code and evidence references so Host UIs, CI, and future audit sinks can explain denials.

### 3. CredentialRebindingEvidence

`@pneuma-framework/core` now exports:

```ts
validateCredentialRebindingEvidence(evidence, manifest)
```

Evidence records:

- evidence id;
- artifact/app/version refs;
- subject ref;
- requirement refs;
- provider id;
- account ref;
- binding status;
- timestamp;
- non-secret labels.

The validator rejects secret-like material such as API keys, OAuth tokens, refresh tokens, passwords, and private keys. Credential values do not belong in share artifacts, governance manifests, or rebinding evidence.

### 4. Authoring Diagnostics

`diagnoseCreationHostAuthoring` now accepts:

```ts
sharing_governance
credential_rebinding_evidence
```

The diagnostics report whether sharing governance and credential rebinding files were checked, and emits actionable issue codes when:

- a subject ref is malformed;
- an action is unknown;
- an explicit grant scope does not match the requested artifact/forks/published-app surface;
- a share artifact, governance manifest, and rebinding evidence point at different artifact/app/version refs;
- share artifact credential requirements drift from the governance rebinding policy;
- credential evidence references an unknown requirement;
- evidence contains secret-like material;
- evidence is provided without the governance manifest it depends on.

### 5. Scaffold + Doctor Integration

`pneuma-framework scaffold-host` now emits:

```text
sharing-governance.example.json
credential-rebinding.example.json
```

The scaffolded package `doctor` script includes the new files.

`pneuma-framework doctor-host` now accepts:

```bash
--sharing-governance ./sharing-governance.example.json
--credential-rebinding ./credential-rebinding.example.json
```

Doctor reports:

```text
sharing governance checked: yes
credential rebinding checked: yes
authoring sharing_governance: ok
authoring credential_rebinding: ok
```

## Bob / Charlie / Dave After M23

```text
Bob shares dev-board
  -> share-artifact.example.json excludes source database and secrets
  -> sharing-governance.example.json names Bob as owner
  -> grants Charlie install and Dave fork/install
  -> declares GitHub/Linear rebinding requirements

Charlie installs default
  -> Host checks Charlie's install grant
  -> Host checks Charlie's rebinding evidence
  -> no Bob token or source database crosses the boundary

Dave forks
  -> Host checks Dave's fork grant
  -> forked governance manifest records source artifact/app/version lineage
  -> Dave may change provider profile through Host-owned compatibility rules
  -> credentials are re-bound by Dave, not copied from Bob

Bob revokes later
  -> revoked manifest denies future share/fork/install/publish/rollback requests
  -> M23 defines the decision surface, not the product notification UI
```

## What M23 Proves

M23 proves the framework can pin the first team/org sharing governance contract without swallowing the whole sharing product:

```text
Developer scaffolds a Creation Host
  -> receives Authoring Kit files from M22
  -> receives Sharing Governance files from M23
  -> doctor validates all files
  -> core validators make governance testable
  -> Host can evaluate share/fork/install decisions
```

This is the first contract-backed bridge from portable artifacts to multi-person sharing.

It also keeps the layers clean:

```text
Runtime app policy:
  pneuma_policy_rules + Authorization Kernel

Host-level sharing governance:
  SharingGovernanceManifest + CredentialRebindingEvidence
```

These are related but not the same domain.

## What M23 Does Not Prove

M23 does not claim:

- real OAuth implementation;
- enterprise identity provider mapping;
- signed share artifacts;
- credential broker storage, rotation, or revocation;
- org admin UI;
- marketplace install/fork transport;
- cross-host trust;
- runtime app data policy changes;
- audit export and retention productization.

Those are still future team/org product or integration work. M23 only closes the pre-RC contract boundary.

## Verification Evidence

```bash
bun test packages/core/test/sharing-governance.test.ts
```

```text
9 pass
0 fail
11 expect() calls
Ran 9 tests across 1 file. [71.00ms]
```

```bash
bun test packages/core/test/developer-experience.test.ts packages/cli/test/developer-experience.test.ts
```

```text
15 pass
0 fail
73 expect() calls
Ran 15 tests across 2 files. [680.00ms]
```

```bash
bun test packages/core-domain packages/core packages/cli
```

```text
824 pass
0 fail
2521 expect() calls
Ran 824 tests across 101 files. [11.50s]
```

```bash
bun run typecheck
```

```text
pass
```

```bash
git diff --check
```

```text
pass
```

```bash
node <markdown-link-check-script>
```

```text
checked 151 markdown files
```

## Files To Read

- [Creation Host Contract](../developer/creation-host-contract.md)
- [Getting Started](../developer/getting-started.md)
- [Open Questions](./OPEN-QUESTIONS.md)
- [Roadmap](./roadmap.md)
- [M23 design spec](../superpowers/specs/2026-05-06-m23-team-org-sharing-governance-design.md)
- [M23 implementation plan](../superpowers/plans/2026-05-06-m23-team-org-sharing-governance.md)

## Recommended Next Step

Return to candidate release decision.

M20 closed the open-ended artifact boundary. M21 closed developer onboarding. M22 closed Authoring Kit contracts. M23 closed the first sharing-governance contract. The remaining team/org concerns are real, but they are no longer pre-RC blockers unless the team chooses to pull one forward deliberately.
