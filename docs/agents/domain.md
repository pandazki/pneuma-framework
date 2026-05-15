# Domain Docs

This is a single-context repo. The engineering skills should use the root `CONTEXT.md` glossary plus the existing canonical docs.

## Read First

Before diagnosing, designing, triaging, or changing the codebase, read the smallest relevant set from this list:

1. `CLAUDE.md` — conceptual model and current session instructions.
2. `CONTEXT.md` — canonical glossary and relationships.
3. `docs/developer/start-here.md` — Developer-first entry point and current mental model.
4. `docs/architecture/spec/creation-host-model.md` — four-layer product/domain boundary.
5. `docs/architecture/spec/global-alignment-review-0.3.md` — current top-level alignment after M44.
6. `docs/architecture/README.md` — architecture navigation and historical map.

## ADRs

Architectural decisions live in:

```text
docs/architecture/adr/
```

Read ADRs that touch the area being changed. If an output contradicts an existing ADR, surface the conflict explicitly instead of silently overriding it.

## Vocabulary Rules

Preserve the four-layer model:

```text
Framework -> Creation Host -> Generated Application -> Published Application
```

Preserve the role boundary:

```text
Developer builds or configures the Creation Host.
Builder uses the Creation Host to create and evolve Generated Applications.
End User uses a Published Application version.
```

Do not collapse these into "the developer builds a pneuma app" unless the user explicitly clarifies which layer they mean.

## Historical Evidence

Milestone snapshots under `docs/architecture/milestone-*.md` are historical evidence. Treat them as durable context, not the current contract, unless a current entry document points to one directly.

Current contracts should usually be read from:

- `docs/developer/`
- `docs/architecture/spec/`
- `docs/architecture/adr/`
- release-candidate snapshots

## Project-Specific Drift Checks

When reviewing or proposing work, check for these common drift risks:

- Framework absorbing Host product UX or provider SDK implementation.
- Creation Host bypassing framework approval, evidence, or recovery invariants.
- Build Agent seeing provider-specific implementation branches instead of capability contracts or Host domain tools.
- Runtime/data governance expanding into a generic database governance platform.
- Marketplace, artifact signing, or hosted IAM concerns displacing Builder + Build Agent build safety.
