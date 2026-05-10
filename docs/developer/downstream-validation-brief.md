# Downstream Validation Brief

**Audience:** an external Developer building a fresh Creation Host against the current pneuma-framework repo
**Chinese version:** [downstream-validation-brief.zh-CN.md](./downstream-validation-brief.zh-CN.md)

This brief is for a new downstream project, not for continuing the old DevBoard Studio validation. The goal is to test whether a Developer can read the current docs, build a real Creation Host shape, and report framework gaps without relying on private context from the upstream team.

Keep the product model explicit throughout the project:

```text
pneuma-framework
  -> Creation Host
  -> Generated Application
  -> Published Application
```

## 1. Mission

Build a small but end-to-end Creation Host that proves the framework can support:

- a Developer-authored Host with profiles and authoring files;
- a Builder-facing workflow for creating or evolving a Generated Application;
- preview and inspection of the Generated Application;
- one governed change path initiated by Builder + Build-phase Agent;
- approval-time review packet and execution-time assurance case;
- publish, restart, and rollback or a clearly documented local equivalent;
- a final gap report that distinguishes framework gaps from Host product choices.

The app domain is intentionally open. Choose a domain that is simple enough to finish but real enough to expose framework friction.

If the downstream team wants a concrete product brief instead of choosing a domain from scratch, use [LaunchRoom Studio PRD](../product/launch-room-studio-prd.md).

## 2. Non-Goals

Do not spend the validation budget on:

- production SaaS hosting;
- marketplace transport;
- signed artifact provenance;
- production IAM;
- durable secret-management infrastructure;
- zero-downtime rollout;
- a polished commercial UI;
- rebuilding every Pneuma 2.x mode.

Mocks are acceptable when they preserve the framework contract. For example, a mock OAuth provider is better than hand-waving credential rebinding away.

## 3. Required Reading Order

Read by product layer, not by milestone chronology:

1. [Start Here](./start-here.md)
2. [Getting Started](./getting-started.md)
3. [Creation Host Contract](./creation-host-contract.md)
4. [BuildThread](./build-thread.md)
5. [Scaffold Project Contract](./scaffold-project-contract.md)
6. [Code Change Lane](./code-change-lane.md)
7. [Build Assurance](./build-assurance.md)
8. [Build Assurance Adoption](./build-assurance-adoption.md)
9. [Runtime Composition](./runtime-composition.md)
10. [Release Rollout Authoring](./release-rollout-authoring.md)
11. [HostExtension Slots](./host-extension-slots.md)
12. [Host Credential Broker Utilities](./credential-broker.md)
13. [Architecture Index](../architecture/README.md) only when you need ADR or milestone evidence.

If two docs disagree, record the disagreement in the gap log instead of silently choosing one.

## 4. Local Dependency Rule

Use the upstream repo as a local dependency or workspace dependency. Do not wait for an npm release.

Recommended shape:

```json
{
  "dependencies": {
    "@pneuma-framework/core": "file:/absolute/path/to/pneuma-framework/packages/core",
    "@pneuma-framework/runtime": "file:/absolute/path/to/pneuma-framework/packages/runtime",
    "@pneuma-framework/core-domain": "file:/absolute/path/to/pneuma-framework/packages/core-domain"
  }
}
```

Pin the upstream commit hash in your project README so the validation can be reproduced.

## 5. Minimum Deliverables

Your downstream project should include:

| Deliverable | Required content |
|---|---|
| Product README | What Host you built, who the Developer / Builder / End User are, and what Generated Application is created. |
| Host authoring files | `profiles.json`, `agent-package.json`, `pneuma.scaffold.json`, `provider-capabilities.json`, share/governance/rebinding examples if sharing or fork/install is in scope. |
| Runnable Host | One command that starts the Builder-facing Creation Host locally. |
| Builder path | A visible path to create or evolve a Generated Application. |
| Inspection path | At least one schema/data/source/runtime/evidence inspection surface. |
| Governed change | One Builder intent that becomes proposal, review packet, approval/rejection, execution receipt, and assurance case. |
| Negative path | At least one denied, blocked, failed, recovered, or fail-closed path. |
| Tests | Contract tests plus at least one end-to-end smoke test. |
| Gap log | Concrete friction found while using the framework and docs. |

## 6. Contract Checklist

Use framework validators where available:

- `validateCreationHostProfileContract`
- `validateBuildAgentPackageManifest`
- `validateScaffoldProjectManifest`
- `validateProviderCapabilityMatrix`
- `validateShareArtifactManifest`
- `validateSharingGovernanceManifest`
- `validateCredentialRebindingEvidence`
- `validateSharingGovernanceBundle`
- `validateHostExtensionSlotRegistry`
- `validateHostExtensionManifest`
- `validateHostExtensionBundle`
- `validateBuildChangeReviewPacket`
- `validateBuildChangeAssuranceCase`
- `evaluateBuildChangeRecoveryDrillMatrix`

Also run `doctor-host` in CI or an equivalent local script.

## 7. Suggested Validation Commands

Adapt these to your downstream repo:

```bash
bun install
bun test
bun run typecheck
```

If you use the upstream scaffold:

```bash
bun /absolute/path/to/pneuma-framework/packages/cli/src/index.ts doctor-host \
  --workspace ./.pneuma-workspace \
  --profiles ./profiles.json \
  --scaffold-project ./pneuma.scaffold.json \
  --agent-package ./agent-package.json \
  --provider-capabilities ./provider-capabilities.json
```

If you include sharing/fork/install:

```bash
bun /absolute/path/to/pneuma-framework/packages/cli/src/index.ts doctor-host \
  --workspace ./.pneuma-workspace \
  --profiles ./profiles.json \
  --scaffold-project ./pneuma.scaffold.json \
  --agent-package ./agent-package.json \
  --provider-capabilities ./provider-capabilities.json \
  --share-artifact ./share-artifact.example.json \
  --sharing-governance ./sharing-governance.example.json \
  --credential-rebinding ./credential-rebinding.example.json
```

## 8. Gap Log Template

Use this exact shape for each gap:

```markdown
### #N — Short title

**Area:** docs | core contract | runtime | agent backend | credential | assurance | release | UI integration | other
**Severity:** blocker | high | medium | low

**What I tried:**

**What failed or felt unclear:**

**What I used as a workaround:**

**What I think upstream should change:**

**Evidence:** file paths, failing command, screenshot, trace, or test name
```

Good gaps are specific. "Docs are confusing" is not useful. "The contract guide says `requirements` can be ids, but the validator requires full `CredentialRequirement` objects" is useful.

## 9. Shortcuts That Invalidate The Validation

Do not:

- let the Build-phase Agent mutate framework internals directly;
- store tokens, API keys, private keys, refresh tokens, or passwords in portable manifests;
- bypass approval because the demo is local;
- show only a happy path;
- copy the old DevBoard Studio structure without re-reading the current docs;
- call something a framework bug when it is really a Host product decision.

## 10. What Upstream Wants To Learn

The most valuable report answers:

- Can a new Developer understand the four-layer model without live explanation?
- Which docs were essential, redundant, stale, or missing?
- Which validators caught real mistakes?
- Which framework helpers removed duplicated Host code?
- Which helper was still too low-level or too coupled to a reference Host?
- Did Build Assurance make approval/publish decisions clearer?
- Did the framework accidentally push a product choice into the Host?
- What would block a second downstream team from repeating your work?
