# Release Candidate Snapshot: pneuma-rc-0.1.0

**Status:** Accepted for the first developer-facing release-candidate tag.

**Date:** 2026-05-06

**Chinese version:** [release-candidate-snapshot.zh-CN.md](./release-candidate-snapshot.zh-CN.md)

**Patches:** [pneuma-rc-0.1.1 developer-contract snapshot](./release-candidate-0.1.1-snapshot.md), `pneuma-rc-0.1.2` BuildThread patch ([upgrade guide](../developer/upgrading-to-rc-0.1.2.md)), [pneuma-rc-0.1.3 Code Change Lane snapshot](./release-candidate-0.1.3-snapshot.md)

**Post-RC stabilization:** M26-M31 closed Code Change Lane hardening, Runtime Diagnostic Surface, HostExtension slots, AgentBackend `runTurn`, Host Credential Broker utilities, and downstream credential adoption pressure. These snapshots refine the developer contract after `pneuma-rc-0.1.3`; they are not a new release tag.

## Decision

```text
GO for pneuma-rc-0.1.0.
NO-GO for production-readiness claims.
```

This is a candidate release of the framework's current model, not a production SaaS, marketplace, hosted identity, production credential store, or hosted deployment product.

The accepted RC claim is narrow:

```text
Developer builds a Creation Host
  -> Builder creates Generated Applications through a Build-phase Agent
  -> Generated Applications can be previewed, inspected, evolved, packaged, published, restarted, rolled back, shared, installed, and forked through explicit Host/framework contracts
  -> End Users use Published Applications
```

## Why RC Exists Now

M19 said the project was technically close, but correctly blocked the release tag until open-ended app governance was explicit. M20 accepted ADR-0031 and pinned that boundary:

```text
Framework-governed app definition rows:
  Table / Column / Operation / View / PolicyRule / PolicySetting / Rollback

Host-governed open-ended artifacts in v0:
  routes / sections / style tokens / dynamic modules / profile-owned UI artifacts
```

M21-M23 then closed the Developer path and the sharing/forking contract path. M24 pressure-tested the realistic Alice/Bob/Charlie/Dave story. M25 made the story explainable from Alice's outside-in Developer cognition path.

That means the remaining pre-RC question is no longer "which primitive is missing?" It is "does the repo have enough verified evidence to let a Developer evaluate the framework honestly?"

The answer is yes.

![Four Product Layers](./assets/m25-story-product-model.png)

![M25 Alice Creation Host Prototype](./assets/m25-alice-creation-host-prototype.png)

## Acceptance Matrix

| Gate | Result | Evidence |
|---|---:|---|
| Four-layer product model is explicit | Accepted | [Creation Host model](./spec/creation-host-model.md), [M25 snapshot](./milestone-25-snapshot.md), M25 Story Kit |
| Operation + definition-as-data remains the core primitive | Accepted | [ADR-0018](./adr/0018-operations-as-primitive.md), [ADR-0029](./adr/0029-supersede-v0-design-spec.md), [M1 snapshot](./milestone-1-snapshot.md) |
| Security acceptance blockers are closed | Accepted | [M17 snapshot](./milestone-17-snapshot.md): reserved HTTP identity, internal token, fail-closed query/View invocation, rollback failure evidence |
| Open-ended app boundary is pinned | Accepted | [ADR-0031](./adr/0031-open-ended-definition-artifact-boundary.md), [M20 snapshot](./milestone-20-snapshot.md) |
| Developer onboarding exists | Accepted | [M21 snapshot](./milestone-21-snapshot.md), [Getting Started](../developer/getting-started.md), `scaffold-host`, `doctor-host` |
| Creation Host Authoring Kit is testable | Accepted | [M22 snapshot](./milestone-22-snapshot.md): Build Agent Package, Provider Capability Matrix, Share Artifact |
| Sharing Governance is testable | Accepted | [M23 snapshot](./milestone-23-snapshot.md): SharingGovernanceManifest, CredentialRebindingEvidence, rights, revocation |
| Alice/Bob/Charlie/Dave pressure is executable | Accepted | [M24 snapshot](./milestone-24-snapshot.md), `tests/pressure/creation-host-rc-pressure.test.ts` |
| Developer-first RC story is runnable | Accepted | [M25 snapshot](./milestone-25-snapshot.md), [M25 prototype](../../examples/m25-alice-creation-host-prototype/README.md), [Story Kit](../../examples/m25-alice-creation-host-prototype/STORY.md) |
| Remaining gaps are explicit productization lanes | Accepted | [OPEN-QUESTIONS](./OPEN-QUESTIONS.md), M24/M25 non-goals, this snapshot's post-RC lanes |

## Verification Evidence

Fresh verification on 2026-05-06:

```bash
PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" bun test
```

```text
1194 pass
0 fail
4448 expect() calls
Ran 1194 tests across 181 files. [71.94s]
```

```bash
PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" bun run typecheck
```

```text
exit 0
```

```bash
PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" bun test tests/pressure/creation-host-rc-pressure.test.ts examples/m24-creation-host-rc-pressure-walkthrough/run.test.ts examples/m25-alice-creation-host-prototype/prototype-model.test.ts examples/m25-alice-creation-host-prototype/run.test.ts
```

```text
16 pass
0 fail
69 expect() calls
```

```bash
PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" bun run examples/m24-creation-host-rc-pressure-walkthrough/run.ts --port 0 --smoke-exit
PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" bun run examples/m25-alice-creation-host-prototype/run.ts --port 0 --smoke-exit
```

```text
M24 smoke verification: passed
M25 smoke verification: passed
```

Architecture markdown link check:

```text
checked 99 architecture markdown files
exit 0
```

Browser acceptance:

```text
http://127.0.0.1:8886/
Reset -> Run full path -> RC path ready
Console warn/error logs -> []
Screenshot -> docs/architecture/assets/rc-acceptance-m25-browser.png
```

Whitespace check:

```bash
git diff --check
```

```text
exit 0
```

## Demo Route

For a zero-context team walkthrough, use this route:

1. Read [Creation Host Model](./spec/creation-host-model.md) for the four-layer boundary.
2. Open [M25 Story Kit](../../examples/m25-alice-creation-host-prototype/STORY.md).
3. Run the M25 prototype:

```bash
PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" bun run examples/m25-alice-creation-host-prototype/run.ts --port 8886
```

4. Open `http://127.0.0.1:8886/`.
5. Click `Run full path`.
6. Explain the story in this order:

```text
Alice asks whether she is building an app or an app builder
  -> Alice defines Host profiles and Build Agent Package
  -> Bob creates dev-board
  -> Charlie installs with credential rebinding
  -> Dave forks with provider-profile compatibility checks
  -> RC judgment keeps productization gaps explicit
```

## Known Non-Goals

The RC does not claim:

- real OAuth/account binding;
- production credential storage and account-linking UX;
- signed artifacts;
- marketplace/share transport;
- real Postgres adapter;
- production install/fork governance UI;
- production multi-tenant identity mapping;
- production Permission Center workflows;
- hot reload;
- Runtime Agent inside Published Applications;
- broad Pneuma 2.x dogfood across all modes.

These are not hidden blockers for this RC. They are post-RC productization and pressure lanes.

## Post-RC Productization Lanes

Recommended next lanes after the tag:

| Lane | Why it comes after RC |
|---|---|
| Production credential store + OAuth/account-linking UX | M30 adds local/reference Host utilities; M31 proves downstream DevBoard adoption of session/OAuth/credential-ref helpers. Durable secret storage, encryption, refresh, and account-linking product UX remain Host-owned. |
| Real provider adapter profile, likely Postgres first | M24 proves the contract shape; a concrete adapter can now pressure parity and migration assumptions. |
| Install/fork governance UI | M23 proves decisions; product UI can be built on top of those reason codes and evidence refs. |
| Signed artifact / provenance | Needed before cross-host marketplace claims, not local RC. |
| Runtime Agent | Orthogonal to Build-phase Agent; should be introduced only with an end-user job to do. |
| Hot reload + custom code lane | Useful UX/performance lane, but not a primitive blocker after restart-based evidence. |
| Pneuma 2.x dogfood | The strongest generality proof after RC: rebuild existing modes as Creation Host profiles/templates. |

## Tag

Recommended tag:

```bash
git tag pneuma-rc-0.1.0
```

The tag should point at the commit that includes this snapshot and the verification evidence above.
