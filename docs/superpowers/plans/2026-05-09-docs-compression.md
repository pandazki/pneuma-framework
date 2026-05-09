# Documentation Compression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compress the post-M31 documentation surface into clear audience-based entry paths while preserving ADR and milestone evidence.

**Architecture:** Keep historical evidence in place, but rewrite canonical entry docs around four reading paths: Developer, zero-context teammate, downstream implementer, and architecture reviewer. Refresh bilingual Imagen diagrams only for the current entry paths, and demote milestone catalogs to evidence archive links.

**Tech Stack:** Markdown, local link validation, Imagen-generated PNG assets, existing bilingual docs structure.

---

### Task 1: Compress Developer Entry

**Files:**
- Modify: `docs/developer/start-here.md`
- Modify: `docs/developer/start-here.zh-CN.md`
- Create/replace assets under: `docs/developer/assets/`

- [x] Rewrite `start-here.md` around five questions and five visual anchors.
- [x] Rewrite `start-here.zh-CN.md` with matching structure and Chinese terminology.
- [x] Replace the long read-next list with four lanes: build a Host, governed creation, runtime/release, post-RC utilities.
- [x] Keep milestone snapshots as evidence archive links only.

### Task 2: Compress Team Share Entry

**Files:**
- Modify: `docs/architecture/team-share-demo.md`
- Modify: `docs/architecture/team-share-demo.zh-CN.md`
- Create/replace assets under: `docs/architecture/assets/team-share/`

- [x] Reframe the share package around project goal, four-layer model, AI build as engineering control, governed loop, contract stack, proof ladder, and Build Change Assurance.
- [x] Remove milestone-ledger narration from the first-pass story.
- [x] Keep demos and proof ladder, but make milestones support the story rather than define it.

### Task 3: Compress Architecture Index

**Files:**
- Modify: `docs/architecture/README.md`

- [x] Replace the large canonical table with audience routes and topic clusters.
- [x] Keep links to ADRs, specs, RC snapshots, and milestone archive.
- [x] Make process plans non-canonical unless promoted into ADR/spec/snapshot.

### Task 4: Refresh Visual Anchors

**Files:**
- Replace/create PNGs in `docs/developer/assets/`
- Replace/create PNGs in `docs/architecture/assets/team-share/`

- [x] Generate English and Chinese Imagen variants for the five canonical concepts.
- [x] Save project-bound images into the repo, not only Codex generated-image cache.
- [x] Update references in English and Chinese docs.

### Task 5: Validate And Commit

**Files:**
- Changed docs and image assets

- [x] Run local markdown link validation for changed docs.
- [x] Run `git diff --check`.
- [x] Review changed first-read paths manually.
- [x] Commit the documentation compression.
