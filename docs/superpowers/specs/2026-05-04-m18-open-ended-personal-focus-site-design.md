# M18 Open-Ended Personal Focus Site Design

**Status:** Draft for user review before implementation planning
**Date:** 2026-05-04
**Audience:** Pneuma contributors deciding whether the framework is ready for release-candidate review after M18

## Purpose

M12-M17 proved a strong Creation Host path, but the generated applications are still mostly schema-driven business apps:

- Knowledge Inbox: capture, review queue, priority queue, semantic search.
- Team Decision Log: decisions table, list views, owner policy.

Those are useful, but they do not prove Pneuma is a general AI-native creation framework. M18 should pressure the model with a generated app whose primary shape is an open-ended user experience rather than a table/list workflow.

M18's target example is a **Personal Focus Site**:

```text
a Builder-facing Creation Host
  -> creates a personal published site
  -> renders freeform sections, theme, routes, and dynamic modules
  -> pulls GitHub issues/PRs that need the Builder's attention
  -> lets the Builder evolve the site through one governed proposal
  -> publishes, restarts, and rolls back the result
```

The goal is not to build Webflow. The goal is to discover whether Pneuma needs a missing primitive before release-candidate review.

## Core Hypothesis

If the current model is healthy, then a less structured app should still fit this story:

```text
Builder intent
  -> Agent proposes governed Operation changes
  -> framework records approval and execution evidence
  -> Generated Application definition changes
  -> Preview / inspect / publish / restart / rollback still work
```

If the model is overfit to schema-driven queue/list apps, M18 should expose where it breaks:

- View may be too query/list-shaped and need a `Surface`, `Route`, or `ComponentTree` concept.
- `definition.apply` may be too schema-oriented and need UI definition mutations.
- inspection may need UI tree / route graph / style-token surfaces, not only schema/data/operations.
- rollback impact may need to explain UI/route/style changes, not only table/operation/policy changes.

## Example Product Shape

The generated app is a **Personal Focus Site / Maintainer Home**, not a GitHub issue tracker.

The End User sees a polished personal site:

- hero section with Builder identity and current focus;
- project or work highlights;
- editorial notes / "what I am working on";
- GitHub attention module: top items needing the Builder's attention;
- optional contact / CTA section.

The Builder sees the same Creation Host shell as M16:

- preview iframe;
- conversation / agent transcript;
- one approval card for a full proposal;
- inspect tabs;
- publish / restart / rollback controls.

## GitHub Attention Module

The GitHub module uses a **hybrid attention definition**:

1. personal relevance:
   - assigned to the Builder;
   - mentions the Builder;
   - review requested from the Builder;
   - authored by the Builder with recent activity;
2. repository maintenance pressure:
   - recently updated open issues/PRs in selected personal repos;
   - labels such as `bug`, `help wanted`, `priority`, `blocked`, `security`;
   - stale unanswered issues;
3. ranking:
   - combines personal relevance, recency, label weight, and unresolved status;
   - produces a top-3 attention list for the public/private site module.

For deterministic tests, the module must support fixtures. For live local experience, it can use `GITHUB_TOKEN` and a configured owner/repo list. A missing token should not fail the whole demo; it should show a clear "fixture mode" or "GitHub not connected" state.

## Framework Boundary

GitHub support is a **reference integration/profile concern**, not framework core semantics.

M18 should not add `packages/provider-github` or make GitHub a primitive unless a later ADR promotes an integration protocol. The likely location is inside the M18 example/profile:

```text
examples/m18-open-ended-personal-focus-site/
  github/
    fixtures
    client
    attention-ranking
```

The framework-level claim is only:

```text
An app profile can use external data sources while still flowing through governed creation, preview, inspection, publish, restart, and rollback.
```

## Definition Shape

M18 should start with app-level definition rows, not a new framework primitive.

The Personal Focus Site may model its UI as generated-app data/definition such as:

| Concept | Example |
|---|---|
| route | `/`, `/focus` |
| section | hero, project_gallery, github_attention, contact |
| style token | accent color, typography scale, density, tone |
| dynamic module | `github_attention` with source config and ranking options |
| action | refresh GitHub attention, update section copy, reorder sections |

This is deliberately open-ended, but still inspectable. The Host should show a UI Definition inspector alongside existing schema/data/operations/policies tabs.

M18 should resist adding a permanent framework primitive until the example proves current primitives cannot carry the load.

## E2E Story

The canonical smoke path:

```text
POST /api/host/projects { profile_id: personal-focus-site-bun-sqlite }
POST /preview/start
GET  /inspect
GET  /api/site
POST /github-attention/refresh
POST /evolution/start
POST /evolution/approve
POST /publish v0
POST /publish v1
POST /restart-active
POST /rollback
```

Narrative version:

```text
Builder selects "Personal Focus Site"
  -> Host creates v0 with hero, projects, focus note, GitHub attention section
  -> Preview shows a real personal site, not a wireframe
  -> Inspect shows routes / sections / style tokens / dynamic modules / GitHub source / policies / data
  -> Builder asks: "Make GitHub attention more useful and highlight the top 3 things I should handle"
  -> Agent proposes one governed change-set
  -> Builder approves once
  -> v1 adds ranked attention, improved section copy, and clearer visual hierarchy
  -> Host publishes v1
  -> Host restarts active runtime and verifies `/api/site` plus attention data
  -> Host rolls back to v0
```

## What Must Be Visible In The Demo

The demo must let a zero-context teammate see the difference from M16:

- left pane: the actual Personal Focus Site preview;
- right pane: Creation Host controls and transcript;
- inspector tabs:
  - UI definition: routes, sections, style tokens, modules;
  - GitHub attention: raw fixture/live items and ranked top 3;
  - operations;
  - policies;
  - transcript;
  - release state.

The app must look like a real small site, not a schema viewer. Visual polish matters because the point is to pressure open-ended UI generation, not just backend behavior.

## Success Criteria

M18 closes only if all of these are true:

1. The same Creation Host model creates a `personal-focus-site` Generated Application profile.
2. The app preview renders an open-ended site surface, not a table/list app.
3. GitHub attention works in deterministic fixture mode and has an optional live `GITHUB_TOKEN` path.
4. The Host inspect surface includes UI definition and GitHub attention evidence.
5. One Builder intent produces one governed proposal-level approval.
6. Approval evolves more than data rows: it changes section/module/style/ranking definition.
7. Publish, restart, and rollback work for the open-ended app.
8. Tests verify that the app did not regress the existing M16 Creation Host path.
9. The M18 snapshot states whether a new primitive is needed before RC.

## Non-Goals

M18 does not claim:

- a full website builder;
- arbitrary code generation;
- drag-and-drop editing;
- GitHub OAuth;
- production notification ingestion;
- multi-user assignment workflows;
- hosted secret management;
- production traffic switching;
- stable open-ended app generation for any domain.

## Testing Plan

The implementation plan should be test-first:

- unit test GitHub attention ranking with fixtures;
- unit test profile creation and inspection data shape;
- integration test preview `/api/site`;
- integration test fixture GitHub refresh;
- E2E smoke for create / preview / inspect / evolve / approve / publish / restart / rollback;
- regression test that M16 Knowledge Inbox path still passes after any shared Host changes.

Live GitHub mode should be manually testable but not required for CI unless a token is explicitly provided.

## Design Risks

| Risk | Mitigation |
|---|---|
| The example becomes another issue tracker | Keep GitHub as one dynamic module inside a personal site; do not make issue management the main app surface. |
| The example overreaches into Webflow | Limit to routes, sections, style tokens, and modules; no drag/drop editor. |
| GitHub live API makes tests flaky | Fixture mode is canonical for tests; live token path is optional evidence. |
| Framework core absorbs GitHub-specific logic | Keep GitHub under the example/profile unless a future ADR promotes a generic external-source protocol. |
| Current View primitive is insufficient | Treat that as a successful pressure finding; document whether M19 needs a primitive before RC. |

## Expected Outcome

M18 should end with a clear answer:

```text
Can Pneuma's Creation Host model create and govern an open-ended, visually meaningful app that includes real external-world attention data?
```

If yes, M19 can be a serious release-candidate review. If no, M18 should name the missing primitive and block RC until it is addressed.
