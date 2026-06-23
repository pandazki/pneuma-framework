# Scaffold To Host Walkthrough

**Audience:** A Developer who has run `scaffold-host` and is now asking "I have a folder of JSON files — how do I get from here to a Creation Host I actually understand and can run?"

**Prerequisites:** Read [Start Here](./start-here.md) for the four-layer model, then [Getting Started](./getting-started.md) for install/scaffold/doctor. This guide assumes you have done both and want the *bridge* between the tiny scaffold and the ~1,400-LOC [Reference Host](../../examples/reference-creation-host/README.md).

This guide is deliberately honest about one thing: **`scaffold-host` does not emit a runnable Creation Host.** It emits a *valid contract skeleton* plus a diagnostics harness. The runnable loop lives in the reference examples. The whole point of this walkthrough is to make that gap explicit and to map every piece you must add back to the smallest reference file that shows you how.

---

## 0. The Honest Summary First

```text
scaffold-host  ->  a valid, doctor-passing CONTRACT SKELETON
                   (profiles + authoring/sharing JSON + a diagnostics print script)

YOU + reference examples  ->  a runnable Creation Host
                              (Host class wiring Host Kit + an HTTP/UI surface + a domain)
```

What the scaffold gives you for free: the JSON contracts validate, `doctor-host` is green, and a `dev` script prints diagnostics. That confirms your *boundaries* are well-formed.

What you must still add to reach "runnable Creation Host with a Builder loop": a Host object that wires Host Kit (approval, code-change, preview, publish, rollback), an HTTP/UI surface, and the generated-app domain logic. The Reference Host is the smallest worked example of all three.

---

## 1. Run The Scaffold (Exact Command + Real Output)

From the framework repo:

```bash
bun packages/cli/src/index.ts scaffold-host /tmp/my-pneuma-host --name "My Pneuma Host"
```

Observed output (verbatim):

```text
scaffolded Creation Host: /tmp/my-pneuma-host
next: cd into the directory, install dependencies, and run the doctor script.
```

It emits exactly these 11 files (no `src/server.ts`, no UI, no `profiles/` template directory):

```text
/tmp/my-pneuma-host
  package.json                         # name, dev + doctor scripts, file: deps on core + cli
  profiles.json                        # one profile: starter-bun-sqlite
  pneuma.scaffold.json                 # Scaffold Project: writable/protected roots, guardrails, lifecycle
  agent-package.json                   # Build Agent Package: tool allowlist, provider policy
  provider-capabilities.json           # two profiles + parity contracts (relational-store, github-issues)
  share-artifact.example.json          # no-secret portable share recipe
  sharing-governance.example.json      # ownership/rights/lineage/revocation
  credential-rebinding.example.json    # no-secret rebinding evidence
  agent-policy.md                      # human-readable Build Agent rules
  README.md                            # "what to build next" checklist
  src/run.ts                           # prints store + diagnostics; this is the dev script
```

Then:

```bash
cd /tmp/my-pneuma-host
bun install
bun run dev
```

Observed `bun run dev` output (verbatim):

```text
Creation Host starter is ready.
workspace: /tmp/my-pneuma-host/.pneuma-workspace
profiles: starter-bun-sqlite

Creation Host diagnostics: passed
profiles: 1
projects: 0
versions: 0
profile starter-bun-sqlite: ok
next steps:
  - Run the Host smoke flow: create, preview, inspect, evolve, publish, restart, rollback.
```

And `bun run doctor` validates every authoring/sharing contract (`scaffold_project: ok`, `agent_package: ok`, `provider_capabilities: ok`, `share_artifact: ok`, `sharing_governance: ok`, `credential_rebinding: ok`, `kit_cross_contract: ok`).

**Read `src/run.ts` once.** It is ~20 lines: it calls `createCreationHostStore(...)` and `diagnoseCreationHostWorkspace(...)` and prints. That is the *entire* runtime the scaffold ships. There is no Builder loop, no agent, no preview, no publish — `src/run.ts` never calls Host Kit.

---

## 2. What "dev" Actually Is vs. What A Creation Host Is

The scaffold's `dev` is a **diagnostics print**, not a Creation Host. Hold the contract from [Creation Host Contract](./creation-host-contract.md#minimum-host-responsibilities) next to it:

| Minimum Host responsibility | Scaffold gives you | You must add |
|---|---|---|
| Profile selection | `profiles.json` (one profile) + `createCreationHostStore` | the rest is already wired |
| Project/version workspace | `createCreationHostStore({ workspace, profiles })` | call `createProject`, manage versions |
| **Lifecycle** | `pneuma.scaffold.json` *declares* `preview`/`build`/`test`/`publish` commands | a `HostRuntimeAdapter` that actually runs them |
| **Viewer / Builder surface** | nothing | an HTTP server + UI (or the React/Vanilla SDK) |
| Agent loop | `agent-package.json` + `agent-policy.md` *declare* the policy | a draft agent (deterministic or `AgentBackend`) + `runHostKitCodeAgentDraft` |
| **Approval** | nothing executable | `evaluateHostKitApproval` with a governance policy |
| Publish / restart / rollback | nothing executable | `publishVerifiedVersion` / `rollbackPublishedVersion` + a runtime adapter |
| Diagnostics | `doctor-host` + `diagnoseCreationHostWorkspace` | already wired |

So three of the contract's columns (lifecycle execution, viewer, approval/publish) are *declared but not executed* by the scaffold. The next sections map each one to the smallest reference file.

---

## 3. The Four Pieces You Must Fill In

The canonical worked example for all four is the **Reference Host** (`examples/reference-creation-host/`). It is the smallest example that runs the full governed loop — roughly 1,400 LOC of TypeScript across a handful of small files, versus 2,000-4,000 LOC for the product-shaped examples. Use it as your template.

> Heads-up before you read the example: the reference Host imports from `@pneuma-framework/host-kit`, but the scaffold's `package.json` only declares `file:` deps on `@pneuma-framework/core` and `@pneuma-framework/cli`. You will need to add Host Kit yourself (see the flagged follow-up in [section 6](#6-honest-gaps--06x-follow-ups)).

### 3a. Lifecycle (declared in `pneuma.scaffold.json`, executed by a runtime adapter)

Your `pneuma.scaffold.json` already declares lifecycle commands:

```json
"lifecycle": {
  "preview": { "command": "bun run dev" },
  "build":   { "command": "bun run build" },
  "test":    [{ "command": "bun test" }],
  "publish": { "command": "bun run publish" }
}
```

But *declaring* a command is not *running* it. The framework runs lifecycle through a `HostRuntimeAdapter` — an object implementing `startPreview / stopPreview / startPublished / stopPublished / waitUntilReady`. The scaffold ships none.

- **Smallest reference:** `examples/reference-creation-host/src/host/reference-host.ts` → `createDeterministicRuntimeAdapter()`. It is an in-memory adapter (no real process) used so the loop is testable without Docker. Start here, then swap in real process management.
- **Optional real adapter:** Host Kit ships `createDockerRuntimeAdapter()` for local smoke tests (see [Host Kit → Optional Docker Adapter](./host-kit.md#optional-docker-adapter)).
- **Contract reference:** [Runtime Composition](./runtime-composition.md) and the lifecycle subsystem ([ADR-0030](../architecture/adr/0030-lifecycle-subsystem-contract.md)).

### 3b. Viewer / Builder Surface (the scaffold ships nothing here)

This is the largest gap. The scaffold has no HTTP server and no UI — `src/run.ts` only prints to stdout.

- **Smallest reference:** `examples/reference-creation-host/src/server.ts` (~77 lines). It is a plain `Bun.serve` exposing `/api/state`, `/api/project/create`, `/api/evolution/request`, `/api/evolution/approve`, `/api/preview/start`, `/api/publish`, `/api/rollback`, and serving three static files. Copy this shape; it is the minimum "runnable Creation Host" surface.
- **UI:** `examples/reference-creation-host/static/{index.html,app.js,styles.css}` — a three-pane workbench (BuildThread conversation · Generated App Preview · Governance & Evidence). No framework SDK required; it is vanilla fetch against the routes above.
- **Contract reference:** [Creation Host Contract → Minimum Host Responsibilities](./creation-host-contract.md#minimum-host-responsibilities). For the bidirectional focus/action wire protocol and the React/Vanilla SDKs, see the Viewer axis in `CLAUDE.md` principle 4 (the scaffold does not wire these; the reference Host uses plain REST).

### 3c. Profile (declared, partially wired — and one dangling reference)

`profiles.json` is the one contract that is genuinely *wired*: `createCreationHostStore({ workspace, profiles })` consumes it, and `doctor-host` validates it. You can extend it directly.

- **Caveat:** the scaffolded profile points `template_dir` at `./profiles/starter`, and `pneuma.scaffold.json` lists `source_roots: ["./profiles/starter"]` — but **the scaffold does not create a `profiles/starter` directory**. `doctor-host` passes anyway because there are 0 projects, so the missing template only bites when you call `createProject`. You must author the generated-app template yourself.
- **Smallest reference for a real generated-app domain:** `examples/reference-creation-host/src/domain/team-notes.ts` (~43 lines) shows a v0→v1 domain (notes list → review-queue field) that the Host evolves. For a production-shaped, scaffold-first profile, read [Production Generated App Profile](./production-generated-app-profile.md) and `examples/production-generated-app-profile/`.
- **Contract reference:** [Creation Host Contract → Profile Contract Test](./creation-host-contract.md#profile-contract-test) (`assertCreationHostProfileContract`).

### 3d. Approval (declared in `agent-package.json`, executed by Host Kit)

`agent-package.json` and `agent-policy.md` describe *what the agent may do*. They do not enforce approval. Enforcement is `evaluateHostKitApproval()` plus a governance policy.

- **Key invariant to preserve:** Builder self-approval does not satisfy a required Reviewer route ([Host Kit → Approval Route](./host-kit.md#approval-route)). The reference Host models "Bob requests, a separate Reviewer reviews."
- **Smallest reference:** `examples/reference-creation-host/src/host/reference-host.ts` → `approveEvolution(...)`, which calls `evaluateHostKitApproval` against a `BuildChangeGovernancePolicy`. Reference Host flow steps 3-4 ("Builder approval is blocked → Reviewer approval succeeds") are exactly this.
- **Contract references:** [Build Change Assurance](./build-assurance.md), [Enterprise Governance](./enterprise-governance.md), and for the conversation/proposal turns [BuildThread](./build-thread.md).

---

## 4. The End-To-End Loop You Are Targeting

Once you have wired the four pieces above, your Host should be able to run the same governed loop the Reference Host proves (verbatim from `examples/reference-creation-host/README.md`):

```text
1. Create v0.
2. Ask Agent for the change (e.g. a review queue).
3. Builder approval is blocked.
4. Reviewer approval succeeds.
5. Code Change Lane applies the guarded source change.
6. Preview Data Rehearsal migrates existing data.
7. Preview starts.
8. Publish records runtime/data evidence.
9. Rollback returns active version to the previous version.
```

The Host Kit call order that produces this loop is fixed; you supply the adapters. See [Host Kit → Minimal Host Wiring](./host-kit.md#minimal-host-wiring) and the [Adoption Checklist](./host-kit.md#adoption-checklist).

Prove it the way the reference does:

```bash
bun test examples/reference-creation-host/reference-host.test.ts
PORT=8893 bun run --cwd examples/reference-creation-host serve   # then open http://127.0.0.1:8893/
```

---

## 5. Recommended Build Order

A pragmatic path from the scaffold to a runnable Host:

1. **Scaffold + green doctor** (sections 1). Confirms contracts validate.
2. **Add `@pneuma-framework/host-kit`** to your `package.json` dependencies (the scaffold omits it — see section 6).
3. **Copy the Reference Host's `server.ts` + `static/` shape** for a viewer surface (section 3b).
4. **Author a generated-app domain + `profiles/<name>` template directory** so `createProject` has something to materialize (section 3c).
5. **Wire one governed evolution** through `runHostKitCodeAgentDraft` → `prepareHostKitCodeChangeReview` → `evaluateHostKitApproval` → `applyApprovedHostKitCodeChange` (sections 3a, 3d).
6. **Wire publish/rollback** through a `HostRuntimeAdapter` + `publishVerifiedVersion` / `rollbackPublishedVersion` (section 3a).
7. **Add contract tests** (the suite in [Getting Started → section 6](./getting-started.md)) and keep `doctor-host` in CI.

---

## 6. Honest Gaps / 0.6.x Follow-Ups

These are real gaps observed by running the current scaffold. They are *feedback for a future scaffold iteration*, not things this guide can fix, and are flagged here so a newcomer is not surprised:

- **`scaffold-host` should emit a `host-kit` dependency.** The scaffold's `package.json` declares only `@pneuma-framework/core` and `@pneuma-framework/cli`, but the first real thing a Developer reaches for (the Reference Host) imports `@pneuma-framework/host-kit`. The newcomer must add it by hand.
- **`scaffold-host` should emit the `profiles/starter` template directory it references.** Both `profiles.json` (`template_dir`) and `pneuma.scaffold.json` (`source_roots`) point at `./profiles/starter`, but no such directory is created. `doctor-host` passes only because there are 0 projects; the dangling reference surfaces at first `createProject`.
- **`scaffold-host` should emit a minimal runnable server stub, not only a diagnostics print.** `src/run.ts` calls neither Host Kit nor `Bun.serve`. The jump from "prints diagnostics" to "runs a Builder loop" is exactly the cliff this walkthrough bridges; a ~77-line `server.ts` stub (modeled on the Reference Host) would shrink the gap dramatically.
- **`scaffold-host` should ship (or reference) one deterministic domain + runtime adapter.** Without a `createDeterministicRuntimeAdapter`-style stub and a tiny domain module, the scaffold cannot reach any of steps 1-9 in section 4.

Until a future scaffold closes these, the path is: scaffold for valid contracts, then lift the four pieces above from `examples/reference-creation-host/`.

---

## 7. What To Read Next

| If you want to... | Read |
|---|---|
| Understand the Host Kit call order | [Creation Host Implementation Kit](./host-kit.md) |
| See the full minimum responsibilities | [Creation Host Contract](./creation-host-contract.md) |
| Study the smallest runnable Host | [`examples/reference-creation-host/README.md`](../../examples/reference-creation-host/README.md) |
| Wire governed code changes | [Scaffold Project Contract](./scaffold-project-contract.md), [Code Change Lane](./code-change-lane.md), [Agent Debug Loop](./agent-debug-loop.md) |
| Wire approval + assurance | [Build Change Assurance](./build-assurance.md), [Enterprise Governance](./enterprise-governance.md) |
| Build a production-shaped profile | [Production Generated App Profile](./production-generated-app-profile.md), [Production Profile Host](./production-profile-host.md) |
| Run a from-scratch validation | [Downstream Validation Brief](./downstream-validation-brief.md) |

When you can run the section 4 loop in your own Host, you have crossed the gap this guide is about: from "I ran scaffold-host" to "I have a running Creation Host I understand."
