# ADR-0024: View Visibility Policy

**Status**: Accepted
**Date**: 2026-04-27
**Deciders**: Pandazki, Codex
**Tags**: view, policy, operation, governance, runtime

---

## Context

ADR-0022 made View a Builder-owned app-definition primitive. ADR-0023 clarified which Operations may become end-user app surface.

The remaining governance gap was visibility. A View definition row existing in `pneuma_views` is not enough to expose it to every user. Enterprise deployments need the app surface to be request-scoped: different users may see different Views, and a View should never appear if its backing capability cannot be invoked.

## Decision

`/api/config.views` is now an effective, request-scoped app surface, not a raw definition dump.

A View is visible only when both checks allow for the current `PermissionContext`:

```text
read   view:<view_id>
invoke operation:<source.operation_id>
```

The source Operation check uses the app's policy default posture. Public/default-personal apps can expose newly added query Operations without a separate policy definition step; enterprise apps can set `default_posture=restricted` to require explicit `invoke operation:<id>` rules.

Visible View entries include their policy evidence:

```json
{
  "id": "review_queue",
  "source": { "kind": "operation", "operation_id": "list_review_sources" },
  "visibility": {
    "visible": true,
    "view_read": {
      "decision": "allow",
      "reason": "explicit-allow",
      "matched_rule_ids": ["read-review-queue"]
    },
    "source_operation_invoke": {
      "decision": "allow",
      "reason": "explicit-allow",
      "matched_rule_ids": ["invoke-list-review-sources"]
    }
  }
}
```

Hidden Views are omitted from `views`; the endpoint does not leak their ids through a denial report. Admin/debug surfaces can add a separate endpoint later if they need full introspection.

Query-backed HTTP invocation now also evaluates `invoke operation:<id>` before running `QueryExecutor`, using the app policy posture until `pneuma_policies` gives Builder/Agent-created Operations first-class policy rows. Denials emit an audited `access` event.

## Consequences

### Positive

- View visibility now reuses the existing PolicySet primitive instead of adding a second authorization model.
- A Builder/Agent-created View can be governed independently from the source Operation while still depending on that Operation's policy.
- End-user app discovery is safer: a hidden View is not listed, and a View cannot appear when the source capability is unavailable.
- GET query Operations now participate in Operation policy evaluation instead of bypassing policy entirely.

### Negative / Risks

- `/api/config` now has two audiences: app discovery is request-scoped, while the Operations and Tables sections remain broad introspection. A future admin/debug config endpoint may need to split these concerns.
- Code-handler invocation still uses `OperationExecutor`'s restricted Operation default, while query-backed HTTP invocation follows app posture for compatibility with current `add_operation` flows. `pneuma_policies` should remove this asymmetry.
- `view:<id>` policy is available, but policy definitions themselves are not yet Builder-editable through `pneuma_policies`.
- Visible View entries expose matched rule ids. That helps debugging, but product viewers may eventually want a slimmer contract.

## Follow-ups

- Add `pneuma_policies` as a system-owned definition table so Builder/Agent changes can create View policy rows through the same app-definition path.
- Decide whether `/api/config.operations` should become request-scoped, split into an admin endpoint, or expose per-operation availability metadata.
- Add a product-facing surface inspector that explains hidden/visible state without leaking unauthorized View ids to end users.
