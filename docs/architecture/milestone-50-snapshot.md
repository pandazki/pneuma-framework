# Milestone 50 Snapshot

**Milestone:** M50, Workflow App Studio Lifecycle UX Hardening
**Status:** Closed
**Date:** 2026-05-27
**Chinese version:** [milestone-50-snapshot.zh-CN.md](./milestone-50-snapshot.zh-CN.md)

## Decision

M50 did not add a new framework primitive. It made the M48/M49 example legible as a real Creation Host surface.

The product boundary is:

```text
Builder surface
  -> asks the Build-phase Agent for a change
  -> sees interpretation, proposal, evidence, lifecycle controls

Generated Application surface
  -> runs separately as preview or published app
  -> is opened as its own route when used by End Users
```

This matters because the example must teach the four-layer model by use, not by surrounding explanatory copy.

## What Changed

Workflow App Studio now presents the build loop as a two-surface workbench:

- the left side is the Generated Application runtime surface;
- the right side is the Builder conversation and approval workflow;
- story/context material is secondary, not the main interaction;
- lifecycle buttons reflect state instead of being always-available demo buttons;
- preview and published use are separate actions;
- raw code-agent logs are inspectable without overwhelming the main flow;
- Chinese and English UI paths are both supported.

M50 also cleaned up fixed Host evidence, proposal copy, generated-app labels, workflow fields, stage labels, action labels, and runtime route text so Chinese-speaking teammates can read the same flow without mentally translating every panel.

## Why This Was Necessary

Before M50, the example could technically demonstrate the flow, but it still felt like a demo console. That made several project boundaries harder to understand:

- Builder is not the End User.
- Builder approval is not app usage.
- Preview is not publish.
- The Host owns lifecycle controls.
- The Generated Application should feel like a real app surface, not an inline artifact dump.

M50 tightened the example so those boundaries appear in the interaction itself.

## Verification

Workflow App Studio tests:

```bash
bun test examples/workflow-app-studio/workflow-studio.test.ts examples/workflow-app-studio/workflow-app.test.ts
```

Result:

```text
14 pass
0 fail
85 expect() calls
```

UI bundle:

```bash
bun build examples/workflow-app-studio/src/ui/App.tsx --target browser --outfile /tmp/workflow-app-studio-m50.js
```

Result:

```text
browser bundle built successfully
```

Browser checks covered:

```text
create project
ask code agent
inspect progress
approve proposal
start preview
publish
open published app route
create a published runtime record
switch Chinese UI copy
```

## Boundary Review

### Framework-Relevant Learning

- Creation Host examples need visible lifecycle state, not just working endpoints.
- Agent progress should be exposed as structured product evidence, not only raw logs.
- Approval should sit inside the Builder conversation/workflow, not as a disconnected admin panel.
- Preview/publish separation is essential for explaining the product model.

### Host-Owned

- Visual design system.
- Product copy and localization.
- Concrete generated-app rendering.
- How much raw backend log detail to expose.
- Whether the Host uses React, vanilla JS, shadcn, or another UI stack.

## What This Does Not Claim

M50 does not claim a final design system or production-grade UI kit. It claims that the reference example now demonstrates the Creation Host / Generated Application / Published Application boundaries clearly enough for team review and later product pressure.
