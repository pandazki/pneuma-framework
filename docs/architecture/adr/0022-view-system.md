# ADR-0022: View System as Builder-Owned App Surface

**Status**: Accepted
**Date**: 2026-04-27
**Deciders**: Pandazki, Codex
**Tags**: view, app-definition, operation, ai-native

---

## Context

The app-definition milestone proves that a Builder can change schema, domain service, and API surface through governed system-owned definition rows. The next gap is visibility: a non-technical teammate can understand "the app changed" much faster when a new application view appears in the end-user surface.

Pneuma already has [ADR-0018 Operation](./0018-operations-as-primitive.md) and [ADR-0020 Query DSL](./0020-query-dsl.md). A View should not reinvent query semantics. It should describe where a readable capability appears in the app and how the viewer can present it. The key branch is whether View is a new file/template concern, an arbitrary generated React component, or another app-definition primitive.

## Options considered

### Option A: Let the agent edit viewer code directly

The Build-phase Agent could modify the template viewer source, add a route, and rely on the template's frontend build system. This is maximally flexible and eventually still useful for custom UI work.

- **Pro**: Any UI stack and any visual result are possible.
- **Con**: The framework cannot uniformly govern, audit, rollback, or disclose this as an app-definition change. It also makes the first demo depend on generated frontend code quality instead of proving a primitive.

### Option B: Store a JSON view overlay file

The framework could write a `.pneuma/views.json` file that the viewer reads at runtime. This is simple and avoids adding another system table.

- **Pro**: Fast to implement and easy for demos.
- **Con**: It creates a second definition pipeline outside StorageService, app_history, policy, rollback, and the Operation executor. This repeats the JSON-overlay problem rejected by the app-definition milestone.

### Option C: Represent View as a system-owned definition Table

The framework stores Builder/agent-created Views as rows in `pneuma_views`, applies them during runtime boot, exposes them through `/api/config`, and lets viewers render them from a stable declaration.

- **Pro**: Reuses the same definition governance path as Tables, columns, and Operations: attribution, approval, app_history snapshot, restart discovery, rollback validation, and rollback execution.
- **Con**: It only covers declarative view creation. Fully custom generated UI still needs a later code-edit path.

## Decision

Choose Option C.

`View` becomes a first-class app-definition primitive for application surface. MVP View is intentionally narrow:

```ts
type ViewKind = "table" | "list" | "detail" | "custom";

interface View {
  id: string;
  app_id: string;
  name: string;
  description: string;
  kind: ViewKind;
  source: {
    kind: "operation";
    operation_id: string;
    params?: Record<string, unknown>;
  };
  presentation?: {
    title?: string;
    columns?: Array<{
      field: string;
      label?: string;
      role?: "title" | "subtitle" | "body" | "metadata" | "url";
    }>;
    empty_state?: string;
  };
}
```

Rules:

- `View.source` mounts an existing read Operation.
- `View` does not define its own query in MVP.
- The source Operation remains the semantic capability; View is the application surface that presents it.
- `pneuma_views` is a system-owned stored Table with one row per Builder/agent-created View.
- `add_view` is a framework Operation that writes `pneuma_views`.
- `definition.apply(add_view)` follows the same apply/restart/diff path as `add_table`, `add_table_column`, and `add_operation`.
- Rollback of removed Views is supported and non-data-destructive, but it still changes app surface and requires approval.

Example:

```json
{
  "kind": "add_view",
  "view_id": "review_queue",
  "name": "Review Queue",
  "description": "Sources ready for human review before AI handoff.",
  "view_kind": "table",
  "source": {
    "kind": "operation",
    "operation_id": "list_review_sources"
  },
  "presentation": {
    "title": "Review Queue",
    "columns": [
      { "field": "title", "label": "Title", "role": "title" },
      { "field": "url", "label": "URL", "role": "url" },
      { "field": "priority", "label": "Priority", "role": "metadata" },
      { "field": "notes", "label": "Notes", "role": "body" }
    ],
    "empty_state": "No sources are waiting for review."
  }
}
```

For compatibility and authoring ergonomics, `presentation.columns` may be provided as string field names. The core domain normalizes them to `{ field }` before persistence and reload.

## Consequences

### Positive

- The app-definition path now reaches visible end-user app surface, not only schema/API.
- Team demos can show the same Builder intent changing schema, service, API, and View layers.
- Rollback stays uniform because View definitions are rows, not generated files.
- Viewer implementations can choose how much declarative rendering they support while still reading the same `/api/config.views` contract.

### Negative / Risks

- MVP View is not a full visual builder.
- Custom React/Vue/Svelte component generation is still outside this primitive.
- View authorization is deliberately separate from rendering: `/api/config.views` now exposes only Views that pass both `read view:<id>` and `invoke operation:<source>` for the current request context.
- Declarative presentation needs careful restraint, or it can become an untyped second UI framework.
  The accepted MVP contract is deliberately small: title, columns, optional roles, and empty state.

### Follow-ups

- ADR-0024: View visibility policy.
- ADR-TBD: View navigation model.
- ADR-TBD: Custom component packaging for Views that exceed the declarative renderer.
- ADR-TBD: Hot-loading Views without a full dev-service restart.
- Extract the reference table/list/detail renderer into a reusable viewer package once the demo contract is stable.
