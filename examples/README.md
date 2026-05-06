# Examples — Status Index

**Last updated:** 2026-05-06
**Purpose:** label each example's lifecycle state so new contributors do not mistake a dormant E2E walkthrough for a canonical demo.

Status convention:

- **canonical** — currently a milestone demo target, actively maintained.
- **reference** — validates a specific primitive / integration but not the milestone demo; kept as regression / teaching.
- **archived** — historical, preserved but not actively maintained; superseded by a newer example.
- **scratch** — experimental / spike, not for general use.

| Example | Status | Role | Last touched |
|---|---|---|---|
| [`p5-viewer-approval-e2e`](./p5-viewer-approval-e2e/) | **canonical** | M1 live browser demo (`?scenario=capability-lifecycle&variant=studio`). Drives the team-share runbook. | 2 hours ago |
| [`m4-knowledge-inbox`](./m4-knowledge-inbox/) | **canonical** | M4 deployable reference app demo: capture/list/status Operations on SQLite, with local persistence and Docker restart smoke. | just now |
| [`m5-knowledge-inbox-builder-evolution`](./m5-knowledge-inbox-builder-evolution/) | **canonical** | M5 Builder evolution demo: governed `definition.apply` adds Priority Queue to Knowledge Inbox. | just now |
| [`m6-real-agent-evolution`](./m6-real-agent-evolution/) | **canonical** | M6 backend-agent evolution demo: AgentBackend/opencode discovers framework tools, evolves Knowledge Inbox through `definition.apply`, and exposes the execution trace. | just now |
| [`m7-live-agent-approval-protocol`](./m7-live-agent-approval-protocol/) | **canonical** | M7 live approval demo: backend agent pauses on framework governance, Knowledge Inbox renders the Builder approval card, and allow/deny continues or blocks app evolution. | just now |
| [`m8-release-packaging-hardening`](./m8-release-packaging-hardening/) | **canonical** | M8 release packaging smoke: evolved Knowledge Inbox state becomes a Docker release artifact and survives container restart with mounted SQLite volume. | just now |
| [`m9-creation-to-release-integrity`](./m9-creation-to-release-integrity/) | **canonical** | M9 integrity demo: one approved capability request produces success evidence with a verified release candidate and failure evidence with explicit recovery state. | just now |
| [`m10-derived-semantic-index`](./m10-derived-semantic-index/) | **canonical** | M10 semantic capability demo: Knowledge Inbox rebuilds a derived semantic index from SQLite source rows and searches without embedding business columns. | just now |
| [`m11-local-rollout-adapter`](./m11-local-rollout-adapter/) | **canonical** | M11 rollout state demo: local release candidates enter stage / promote / rollback state. | just now |
| [`m12-reference-creation-host`](./m12-reference-creation-host/) | **canonical** | M12 Reference Creation Host: Builder creates, previews, and inspects a generated Knowledge Inbox app. | just now |
| [`m13-host-agent-evolution`](./m13-host-agent-evolution/) | **canonical** | M13 Host-level governed evolution: one Builder intent enters one approval and changes the generated app. | just now |
| [`m14-host-publish-rollout`](./m14-host-publish-rollout/) | **canonical** | M14 Host publish demo: Host publishes v0/v1, restarts active runtime, and rolls back from the workbench. | just now |
| [`m15-generality-pressure-app`](./m15-generality-pressure-app/) | **canonical** | M15 generality pressure demo: one Host creates, previews, and inspects Knowledge Inbox plus Team Decision Log. | just now |
| [`m16-reference-creation-host`](./m16-reference-creation-host/) | **canonical** | M16 integrated Reference Creation Host: create, preview, inspect, evolve, approve, publish, restart, rollback, and profile-switch in one workbench. | just now |
| [`m18-open-ended-personal-focus-site`](./m18-open-ended-personal-focus-site/) | **canonical** | M18 open-ended app pressure demo: Personal Focus Site with UI definition, GitHub attention module, Host-governed evolution, publish, restart, and rollback. | just now |
| [`m24-creation-host-rc-pressure-walkthrough`](./m24-creation-host-rc-pressure-walkthrough/) | **canonical** | M24 RC pressure walkthrough: Alice/Bob/Charlie/Dave sharing and fork scenario rendered from executable contract evidence. | just now |
| [`m25-alice-creation-host-prototype`](./m25-alice-creation-host-prototype/) | **canonical** | M25 Developer-first RC prototype: Alice's cognitive path for authoring a Creation Host before Bob/Charlie/Dave sharing evidence. | just now |
| [`bookmarks-dogfood`](./bookmarks-dogfood/) | **reference** | End-to-end smoke for `templates/bookmarks-core-domain` — core-domain → runtime → template → lifecycle → HTTP. | 5 days ago |
| [`weekly-linear-digest-real`](./weekly-linear-digest-real/) | **reference** | Real Linear API + Claude Sonnet 4.6; validates `weekly-linear-digest` template against a live external system. **Costs ~$0.01 per run.** | 5 days ago |
| [`opencode-tools-demo`](./opencode-tools-demo/) | **reference** | Step 4b MCP bridge demo: agent (opencode) calls template Operations as tools. Live agent + resume scenario. | 4 days ago |
| [`doc-mode`](./doc-mode/) | **archived** | M3 era full-stack walkthrough using `templates/doc`. Pre-definition-mutation. | 6 days ago |
| [`opencode-chat`](./opencode-chat/) | **archived** | Sibling of `doc-mode`. M3 era. | 6 days ago |
| [`ai-bookmarks`](./ai-bookmarks/) | **archived** | Pre-core-domain ai-bookmarks E2E. Targets the archived `templates/ai-bookmarks`. | 4 days ago |
| [`ai-bookmarks-real`](./ai-bookmarks-real/) | **archived** | M4 era refactor walkthrough; superseded by `bookmarks-dogfood` + `weekly-linear-digest-real`. | 5 days ago |
| [`p1-definition-change-demo`](./p1-definition-change-demo/) | **archived** | Phase 3 P1 demo (`add_table_column` only). Superseded by `p5-viewer-approval-e2e`. | 4 days ago |
| [`p2-definition-apply-demo`](./p2-definition-apply-demo/) | **archived** | P2 demo (`definition.apply` orchestration). Superseded by `p5-viewer-approval-e2e`. | 2 days ago |

## Notes

- **canonical** examples are the current milestone demo targets. M1 remains the live browser governance story; M4 is the deployable reference app story; M5 is the Builder-evolved app story; M6 is the backend-agent tool-surface story; M7 is the live Builder approval protocol story; M8 is the release artifact boundary story; M9 is the creation-to-release integrity story; M10 is the derived semantic capability story; M11 is rollout state; M12-M14 are the Creation Host create/evolve/publish path; M15 is the second-app generality pressure; M16 is the integrated Reference Creation Host workbench; M17 is the security + architecture acceptance gate; M18 is the open-ended app pressure path; M19 is a review gate, not a new example; M20 pins the M18 open-ended artifact boundary rather than adding a new example; M24 is the executable RC pressure walkthrough; M25 is the Developer-first RC prototype.
- **reference** examples are runnable, sometimes hit real APIs (read each README before running).
- `weekly-linear-digest-real` is the concrete Linear/OpenRouter pressure line. Treat it as reference integration evidence, not as proof that those vendors belong to framework core.
- **archived** examples are kept in-tree to preserve git context and teaching value but are not actively maintained. New contributors should not extend them; if you find one drifting, retire it rather than patching it.
- See [`docs/architecture/roadmap.md`](../docs/architecture/roadmap.md) for milestone sequencing. M25 is closed as the Developer-cognition RC prototype; the next step is the final RC decision.
