# Developer Start Here Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Create the RC-era Developer documentation entry with bilingual text, five curated visual anchors, and cleaner routing from existing docs.

**Architecture:** Add a new Developer-facing `start-here` guide as the canonical first read, keep `getting-started` as the hands-on second step, keep architecture snapshots as evidence, and demote older milestone/team-share materials to historical context. The five figures are imagen-generated PNG assets, with separate English and Chinese versions for documentation parity.

**Tech Stack:** Markdown docs, imagen-generated PNG assets, shell link checks.

---

### Task 1: Add Bilingual Developer Entry Docs

**Files:**
- Create: `docs/developer/start-here.md`
- Create: `docs/developer/start-here.zh-CN.md`

- [x] Write the English guide around five figures: product layers, Developer responsibility, Builder creation loop, contract/governance stack, share/fork/publish path.
- [x] Write the Chinese guide with the same structure and links.
- [x] Keep `docs/developer/getting-started.md` as the practical command path.

### Task 2: Add Imagen Figure PNG Assets

**Files:**
- Create: `docs/developer/assets/start-here-01-product-model.png`
- Create: `docs/developer/assets/start-here-02-developer-responsibility.png`
- Create: `docs/developer/assets/start-here-03-builder-loop.png`
- Create: `docs/developer/assets/start-here-04-contract-stack.png`
- Create: `docs/developer/assets/start-here-05-share-fork-publish.png`
- Create: matching `.zh-CN.png` files for all five figures.

- [x] Generate five English figures using imagen.
- [x] Generate five Chinese figures using imagen.
- [x] Reference only PNGs from Markdown.

### Task 3: Re-route Existing Entry Points

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture/README.md`
- Modify: `docs/architecture/team-share-demo.md`
- Modify: `docs/architecture/team-share-demo.zh-CN.md`

- [x] Update root status to RC accepted.
- [x] Make `docs/developer/start-here.md` the first Developer entry.
- [x] Keep architecture README as index/archive, not first-read tutorial.
- [x] Mark M20 team-share docs as historical.

### Task 4: Verify

**Files:**
- No new source files unless verification exposes a docs issue.

- [x] Run markdown link checks over docs and README.
- [x] Confirm all ten PNG assets exist and are referenced.
- [x] Run `git diff --check`.
