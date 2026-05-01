# Examples — Status Index

**Last updated:** 2026-05-02
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

- **canonical** examples are the current milestone demo targets. M1 remains the live browser governance story; M4 is the deployable reference app story; M5 is the Builder-evolved app story; M6 is the backend-agent tool-surface story.
- **reference** examples are runnable, sometimes hit real APIs (read each README before running).
- **archived** examples are kept in-tree to preserve git context and teaching value but are not actively maintained. New contributors should not extend them; if you find one drifting, retire it rather than patching it.
- See [`docs/architecture/roadmap.md`](../docs/architecture/roadmap.md) for milestone sequencing. M6 is closed; the semantic index track remains deferred while live-agent continuity, human approval cards, and raw transcript replay are the next likely pressure line.
