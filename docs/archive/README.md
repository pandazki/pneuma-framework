# Archive — frozen historical evidence

This directory holds documentation that records **how things were proven at a
point in time**, not how the framework works **now**. It was moved here so the
active docs (`docs/architecture/`, `docs/developer/`) stay focused on the current
contract.

Nothing here is a first-read document. Reach for it only to verify how a specific
past claim was demonstrated. For the current state, start at:

- [CHANGELOG.md](../../CHANGELOG.md) — per-version scope, 0.1.0 → 0.4.0.
- [release-0.4.0-notes](../architecture/release-0.4.0-notes.md) — the current release.
- [Developer · Start Here](../developer/start-here.md) — how to build a Creation Host today.
- [Architecture Index](../architecture/README.md) — current decisions, ADRs, specs.

## What is here

### Milestone snapshots (M1–M53)

Per-milestone evidence, each `milestone-N-snapshot.md` (+ `.zh-CN.md`). These
record what each milestone proved and how. Rough ranges:

| Range | Theme |
|---|---|
| M1–M2 | Governed app-definition primitive; enterprise governance hardening. |
| M3–M11 | Deployable substrate, Knowledge Inbox, Builder/Agent evolution, packaging, integrity, semantic index, rollout. |
| M12–M20 | Reference Creation Host, publish/rollback, generality pressure, security gate, open-ended boundary. |
| M21–M25 | Developer onboarding, Authoring Kit, Sharing Governance, RC pressure, Alice prototype. |
| M26–M38 | Post-RC stabilization: Code Change Lane, runtime diagnostics, HostExtension slots, `runTurn`, credential utilities, Build Change Assurance, package-consumption gating. |
| M40–M44 | Minimum enterprise governance and post-approval runtime/data outcomes. |
| M45–M53 | The 0.4.0 implementation-framework/product line: Host Kit, Workflow App Studio, Agent Debug Loop, lifecycle UX, the production scaffold profile, and its Creation Host integration. |

### Release-candidate snapshots (superseded by 0.4.0)

- `release-candidate-snapshot.*` — why `pneuma-rc-0.1.0` was accepted.
- `release-candidate-0.1.1-snapshot.*` — developer-contract polish from external DevBoard pressure.
- `release-candidate-0.1.3-snapshot.*` — minimal executable Code Change Lane patch.
- `release-candidate-0.2.0-snapshot.*` — post-assurance developer contract + package-consumption gate.
- `release-candidate-0.3.0-snapshot.*` — minimum enterprise-governance release train.

Their scope is consolidated in [CHANGELOG.md](../../CHANGELOG.md).

### Early design notes

- `m2-authorization-kernel-design.*`, `milestone-3-deployable-substrate-design.*`
  — superseded design explorations kept for provenance.
