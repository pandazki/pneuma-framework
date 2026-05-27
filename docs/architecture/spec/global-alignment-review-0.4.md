# Global Alignment Review 0.4

**Status:** Current top-level model snapshot after M45-M52.
**Date:** 2026-05-28
**Chinese version:** [global-alignment-review-0.4.zh-CN.md](./global-alignment-review-0.4.zh-CN.md)

## Purpose

This review answers one question:

> After Host Kit, product-shaped Creation Host pressure, Workflow App Studio, real Codex code-agent source changes, Agent Debug Loop, and a production Generated App scaffold profile, is Pneuma still aligned with the original goal?

The answer is yes, with a sharper implementation boundary:

```text
pneuma-framework is not the Creation Host product.
pneuma-framework is the implementation framework that lets Developers build Creation Hosts
where Builders can safely create and evolve Generated Applications with Build-phase Agents.
```

## Current North Star

`pneuma-framework` exists to help Developers build Creation Hosts where Builders can create and evolve Generated Applications by talking to Build-phase Agents, while the framework reduces AI coding uncertainty through source boundaries, draft workspaces, checks, proposal evidence, approval, deterministic apply, preview, publish, runtime/data receipts, and recovery.

The goal has become more concrete. Earlier milestones proved the vocabulary and governance contracts. M45-M52 prove those contracts can be assembled into executable Host loops, product-shaped examples, and Developer-authored production stack profiles.

## Four-Layer Model

The top-level model remains unchanged:

```text
pneuma-framework
  -> Creation Host
  -> Generated Application
  -> Published Application
```

| Layer | Current responsibility after M52 | Must not absorb |
|---|---|---|
| **Framework** | Shared primitives, contracts, validators, evidence vocabularies, AgentBackend contracts, BuildThread, Code Change Lane, Agent Debug Loop, Host Kit helpers. | Host product UX, real provider implementations, hosted identity, cloud deployment control plane. |
| **Creation Host** | Builder-facing product, stack/profile choices, prompt/domain tools, generated-source layout, preview/publish UX, provider wiring, real credentials, policy decisions. | Hidden bypasses around approval, checks, evidence, or rollback. |
| **Generated Application** | App definition/source boundary, data, versions, BuildThread-linked change history, published candidates. | Host-wide marketplace, identity, or global preferences. |
| **Published Application** | End User runtime for one selected version. | Build-time authority or framework-internal mutation powers. |

M45-M52 make this boundary more practical: the framework can now offer implementation parts, but the Creation Host remains the product and stack/profile choices remain Developer-owned.

## What M45-M52 Added To The Model

| Milestone band | What it proved |
|---|---|
| **M45** | Host Kit can package common implementation pieces without turning one reference Host into the framework. |
| **M46-M47** | A product-shaped Creation Host can create, evolve, approve, preview, publish, share, fork, roll back, and expose Published Application use. |
| **M48** | Workflow App Studio gives a cleaner real-product line where Codex app-server is the default real code-agent lane for controlled `src/app.ts` changes. |
| **M49** | Agent Debug Loop belongs before proposal creation: failed checks feed the next attempt, and failed drafts do not become Builder approval prompts. |
| **M50** | Creation Host examples must teach the product model through UX: Builder/App separation, lifecycle state, progress/log visibility, and preview/publish separation. |
| **M51** | The line is verified and documentable: typecheck, combined tests, real Codex browser E2E, and synchronized architecture/developer docs. |
| **M52** | Alice's Developer role gets sharper: a production Generated App profile can be scaffolded and verified before the Creation Host asks a code agent to evolve it. |

## Updated Governed Build Loop

M44 already described the governed creation path through runtime/data outcomes. M49-M51 sharpen the front half of the loop:

```text
Builder intent
  -> BuildThread user turn
  -> code agent edits draft workspace
  -> Developer-declared checks run
  -> failed checks become agent feedback
  -> passing draft becomes proposal evidence
  -> Builder approves one coherent proposal
  -> Code Change Lane applies deterministic change
  -> post-apply checks and rollback evidence
  -> preview data rehearsal
  -> publish or block
  -> runtime/data receipt
  -> corrective proposal if repair is needed
```

Two rules are now explicit:

1. **Proposal is a checked candidate, not a raw agent draft.**
2. **Post-apply repair is a new proposal, not silent agent continuation.**

That is the current center of AI Build Assurance.

## Domain Map After M52

| Domain | Current question | Framework owns | Host owns |
|---|---|---|---|
| **Creation Host implementation** | How does a Developer assemble the loop without rewriting common glue? | Host Kit helpers for approval, code change, runtime/data, publish, code-agent attempts. | Product UX, profiles, provider wiring, storage layout, policy choices. |
| **Agent coding** | How does the Build-phase Agent edit safely? | AgentBackend contracts, BuildThread, Agent Debug Loop, Code Change Lane evidence. | Prompting, domain tool surface, scaffold source shape, concrete code checks. |
| **Proposal and approval** | What exactly is the Builder approving? | Review packets, proposal evidence, approval records, execution receipts. | Human-facing copy, business policy, route selection, product-specific impact summary. |
| **Runtime/data** | What happens to data and running versions after approval? | Runtime/Data Governance vocabulary, receipts, publish gates. | Data evolution handlers, migrations, provider APIs, real backups and restore. |
| **Published use** | Does the generated app behave like a real app after publish? | Contracts that make published version and evidence inspectable. | Runtime UI, interaction design, app-specific data model and behavior. |
| **Developer explanation** | Can a new Developer understand what belongs where? | Start Here, architecture index, domain docs, snapshots, contracts. | Host-specific documentation and onboarding. |

## Health Assessment

| Area | Health | Reason |
|---|---|---|
| Four-layer model | Healthy | M45-M52 strengthened the implementation layer without collapsing Host product into framework. |
| Build-phase Agent control | Healthy | Debug loop now precedes proposal; failed drafts stay out of approval. |
| Example quality | Improving | Workflow App Studio is clearer than previous demo-shaped hosts, but still narrow in generated-runtime breadth. |
| Developer implementation path | Improving | Host Kit gives reusable parts; docs now need to keep steering Developers toward Host-owned product choices. |
| Production stack profile | Improving | M52 proves one concrete Bun/Hono/React/Drizzle/Zod/Neon scaffold with Docker/Vercel targets, while keeping those choices Host-owned. |
| Enterprise-governance alignment | Healthy but early | Role-route and assurance concepts remain valid; production IAM/workflow backends are still explicitly Host-owned. |
| Production claim | Intentionally limited | The project proves a local/reference implementation framework, not a hosted enterprise platform. |

## What Has Become Clearer

- The project is no longer mostly abstract contracts. It now has an implementation-framework lane.
- Host Kit is useful only if it remains a kit, not a hidden product template.
- Real code-agent support must include a debug loop before human approval.
- A good Creation Host example must make Builder/App/Published App separation visible in the UI.
- Backend-specific event shapes should not leak into the product model forever.
- Generated-runtime source editing is valuable, but the scaffold boundary must stay explicit.
- Production stack profiles should be prepared and tested by the Developer before they become Builder-selectable Host options.

## What Would Be Drift

Avoid these directions unless a later explicit decision promotes them:

- treating Workflow App Studio as the only valid Creation Host shape;
- turning Host Kit into a full hosted platform;
- letting the Build-phase Agent edit outside declared scaffold boundaries;
- asking Builders to approve raw, unchecked agent drafts;
- doing silent agent repair after approval;
- moving provider SDKs, real credentials, or cloud deployment orchestration into framework core;
- treating product demo polish as proof of production readiness.

## Next Runway

The next 0.4.x work should be chosen from explicit productization lanes:

1. **Post-apply deterministic recovery hardening**: stronger failure receipts, rollback evidence, and corrective-proposal handoff.
2. **Backend-neutral progress events**: one product-facing progress contract over Codex app-server, opencode, and future backends.
3. **Broader generated-runtime code support**: more expressive scaffold boundaries and checks, without arbitrary unbounded app editing.
4. **Deployment/profile adapters**: local/Docker/cloud adapters as Host-owned profiles, not framework deployment semantics.
5. **Fresh downstream validation**: a new Developer starts from docs and packages, builds a Host, and files gaps.
6. **M52 profile integration**: connect the production scaffold into a full Creation Host path with code-agent edits, proposal, preview, publish, and rollback.

## Decision

The project remains aligned with the original goal. M45-M52 changed the evidence level, not the north star:

```text
Make AI-assisted app creation governable enough that a Developer can build a real Creation Host
and an organization can trust the Builder + Build-phase Agent change process.
```

The next move should not add another abstract governance layer by default. It should make the implementation framework harder to misuse and easier to validate through real Creation Hosts.
