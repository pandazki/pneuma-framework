# pneuma-framework

Infrastructure for building **AI-native Creation Hosts**: applications where a Builder creates and evolves Generated Applications by talking to a Build-phase Agent.

```text
pneuma-framework
  -> Creation Host
  -> Generated Application
  -> Published Application
```

## Current Status

The project has reached its first developer-facing release candidate line:

```text
pneuma-rc-0.1.0 -> pneuma-rc-0.1.1 -> pneuma-rc-0.1.2 -> pneuma-rc-0.1.3
```

`pneuma-rc-0.1.0` was the first accepted RC. `pneuma-rc-0.1.1` surfaced hidden runtime, authoring, and rollout conventions discovered while building an external DevBoard Studio Creation Host. `pneuma-rc-0.1.2` added BuildThread as the framework-owned semantic transcript for Builder conversation. `pneuma-rc-0.1.3` added the executable Code Change Lane for governed draft source changes.

The RC was accepted after closing:

- M16: integrated Reference Creation Host workflow;
- M17: security and architecture acceptance;
- M18: open-ended Personal Focus Site pressure.
- M19: release-candidate review;
- M20: open-ended definition artifact boundary.
- M21: developer onboarding path.
- M22: Creation Host Authoring Kit.
- M23: Team / Org Sharing Governance contract.
- M24: Creation Host RC pressure.
- M25: Alice Creation Host prototype.
- M26: Code Change Lane hardening.
- M27: Runtime Diagnostic Surface.
- M28: HostExtension Slot Contract.
- M29: AgentBackend `runTurn` on top of BuildThread.
- M30: Host Credential Broker Utilities.
- M31: Downstream Credential Adoption Pressure.

The RC claim is narrow: the core model is coherent enough for Developers to start building Creation Hosts and pressure-testing real product shapes. It is not a production SaaS platform.

## Quick Start

Read the Developer entry first:

- [Start Here: Build A Creation Host](./docs/developer/start-here.md)
- [从这里开始：构建 Creation Host](./docs/developer/start-here.zh-CN.md)

Install dependencies:

```bash
bun install
```

Run type checks:

```bash
bun run typecheck
```

Scaffold a starter Creation Host:

```bash
bun packages/cli/src/index.ts scaffold-host /tmp/my-pneuma-host --name "My Pneuma Host"
```

Run diagnostics on the scaffold:

```bash
bun packages/cli/src/index.ts doctor-host \
  --workspace /tmp/my-pneuma-host/.pneuma-workspace \
  --profiles /tmp/my-pneuma-host/profiles.json \
  --agent-package /tmp/my-pneuma-host/agent-package.json \
  --provider-capabilities /tmp/my-pneuma-host/provider-capabilities.json \
  --share-artifact /tmp/my-pneuma-host/share-artifact.example.json \
  --sharing-governance /tmp/my-pneuma-host/sharing-governance.example.json \
  --credential-rebinding /tmp/my-pneuma-host/credential-rebinding.example.json
```

Run the current Developer-first prototype:

```bash
bun run examples/m25-alice-creation-host-prototype/run.ts --port 8886
```

Then open:

```text
http://127.0.0.1:8886/
```

For an automated smoke:

```bash
bun run examples/m25-alice-creation-host-prototype/run.ts --port 0 --smoke-exit
```

## Where To Read

Start here if you are a Developer:

- [`docs/developer/start-here.md`](./docs/developer/start-here.md) — RC-era first read with the five visual anchors.
- [`docs/developer/getting-started.md`](./docs/developer/getting-started.md) — developer golden path from scaffold to reference Host loops.
- [`docs/developer/creation-host-contract.md`](./docs/developer/creation-host-contract.md) — minimum Creation Host contract, schema-driven/open-ended boundary, Authoring Kit, and diagnostics.
- [`docs/architecture/release-candidate-snapshot.md`](./docs/architecture/release-candidate-snapshot.md) — why `pneuma-rc-0.1.0` was accepted.
- [`docs/architecture/release-candidate-0.1.1-snapshot.md`](./docs/architecture/release-candidate-0.1.1-snapshot.md) — what changed in the developer-contract patch.
- [`docs/developer/upgrading-to-rc-0.1.1.md`](./docs/developer/upgrading-to-rc-0.1.1.md) — downstream upgrade checklist from RC 0.1.0 to RC 0.1.1.
- [`docs/developer/upgrading-to-rc-0.1.2.md`](./docs/developer/upgrading-to-rc-0.1.2.md) — downstream upgrade checklist for adopting BuildThread.
- [`docs/developer/upgrading-to-rc-0.1.3.md`](./docs/developer/upgrading-to-rc-0.1.3.md) — downstream upgrade checklist for adopting Code Change Lane.
- [`docs/developer/build-thread.md`](./docs/developer/build-thread.md) — semantic Builder conversation transcript primitive for chat-driven Hosts.
- [`docs/developer/code-change-lane.md`](./docs/developer/code-change-lane.md) — governed draft source-change proposal/apply/receipt lane.
- [`docs/developer/host-extension-slots.md`](./docs/developer/host-extension-slots.md) — portable Host-owned extension contribution bundles and slot compatibility.
- [`docs/developer/credential-broker.md`](./docs/developer/credential-broker.md) — session cookies, OAuth callback binding, credential refs, and no-secret rebinding evidence.
- [`docs/architecture/milestone-31-snapshot.md`](./docs/architecture/milestone-31-snapshot.md) — downstream DevBoard Studio adoption evidence for those credential helpers.
- [`docs/developer/app-config-authoring.md`](./docs/developer/app-config-authoring.md) — AppConfig invariants and runtime SQLite path discipline.
- [`docs/developer/runtime-composition.md`](./docs/developer/runtime-composition.md) — `asBunFetch`, internal calls, markers, and published data modes.
- [`docs/developer/release-rollout-authoring.md`](./docs/developer/release-rollout-authoring.md) — rollout helper shapes for Host publish/restart/rollback flows.
- [`examples/m25-alice-creation-host-prototype/STORY.md`](./examples/m25-alice-creation-host-prototype/STORY.md) — Alice/Bob/Charlie/Dave story kit for team explanation.
- [`docs/architecture/README.md`](./docs/architecture/README.md) — architecture docs index and milestone archive.

Then go deeper as needed:

- [`AGENTS.md`](./AGENTS.md) — session orientation and non-negotiable model boundary.
- [`docs/architecture/spec/creation-host-model.md`](./docs/architecture/spec/creation-host-model.md) — top-level product/domain model.
- [`docs/architecture/adr/0031-open-ended-definition-artifact-boundary.md`](./docs/architecture/adr/0031-open-ended-definition-artifact-boundary.md) — accepted M20 open-ended artifact boundary.
- [`docs/architecture/adr/0032-build-thread-primitive.md`](./docs/architecture/adr/0032-build-thread-primitive.md) — BuildThread semantic transcript primitive.
- [`docs/architecture/adr/0033-scaffold-project-contract.md`](./docs/architecture/adr/0033-scaffold-project-contract.md) — Developer-authored scaffold boundary and guardrails.
- [`docs/architecture/adr/0034-code-change-lane-executor.md`](./docs/architecture/adr/0034-code-change-lane-executor.md) — executable governed source-change lane.
- [`docs/architecture/adr/0035-host-extension-slot-contract.md`](./docs/architecture/adr/0035-host-extension-slot-contract.md) — HostExtension distribution boundary.
- [`docs/architecture/adr/0036-agent-backend-run-turn.md`](./docs/architecture/adr/0036-agent-backend-run-turn.md) — BuildThread-backed backend turn contract.
- [`docs/architecture/adr/0037-host-credential-broker-utilities.md`](./docs/architecture/adr/0037-host-credential-broker-utilities.md) — local Host credential utility boundary.
- [`docs/architecture/roadmap.md`](./docs/architecture/roadmap.md) — current roadmap.

Chinese readers can use matching `.zh-CN.md` documents under `docs/developer/` and `docs/architecture/`.

## Package Map

| Package | Role |
|---|---|
| `@pneuma-framework/core-domain` | Generated Application primitives: Table, Operation, View, Policy, WhereClause, storage, semantic index, authorization. |
| `@pneuma-framework/runtime` | HTTP runtime, `/api/config`, framework-injected definition operations. |
| `@pneuma-framework/core` | lifecycle, BuildThread, AgentBackend `runTurn`, Code Change Lane, HostExtension slots, Host credential utilities, tool bridge, permission ledger, release candidate and rollout state, Creation Host contract, authoring-kit contracts, sharing governance contracts, profile validation, runtime diagnostics, and workspace diagnostics. |
| `@pneuma-framework/viewer-react` | React viewer/wire protocol helpers and governance UI components. |
| `@pneuma-framework/backend-opencode` | Reference backend-agent adapter for opencode. |
| `@pneuma-framework/cli` | CLI wrapper for lifecycle/backend startup plus developer onboarding / authoring / sharing governance diagnostics commands (`scaffold-host`, `doctor-host`). |
| `@pneuma-framework/adapter-linear` | Private reference integration, not core semantics. |
| `@pneuma-framework/provider-openrouter` | Private reference integration, not core semantics. |

## Important Boundaries

- Operation + definition-as-data is the core creation primitive.
- Lifecycle scripts are a runtime subsystem behind semantic tools.
- Host-owned open-ended UI/module artifacts are allowed in v0. HostExtension slots make portable contribution boundaries explicit, but these artifacts are still not framework definition rows.
- Build Agent Package, Provider Capability Matrix, Share Artifact, Sharing Governance, and Credential Rebinding manifests are Host-owned authoring contracts validated by the framework; they do not make provider implementations, production credential stores, or sharing products framework-owned.
- Host Credential Broker utilities provide local/reference session, OAuth, credential-ref, and no-secret evidence helpers. M31 proves those helpers can replace duplicated downstream Host code; hosted identity, durable secret persistence, encryption, and provider refresh remain Host-owned.
- Credential rebinding evidence records status and references only. Credential values, OAuth tokens, and API keys never belong in portable manifests.
- SQLite, Bun, Drizzle, Docker, Linear, OpenRouter, and GitHub are implementation/reference choices, not framework semantics.
- Creation Host contracts may live in core when multiple hosts need them; concrete host UX remains host/meta-app concern.

## Current Caveat

This is not a production SaaS release. Production IAM, hosted deployment, durable credential storage, zero-downtime traffic switching, Runtime Agent productization, hot reload, and broad Pneuma 2.x dogfood remain post-RC work unless a concrete milestone deliberately pulls one forward. M31 is adoption evidence, not a hosted credential service.
