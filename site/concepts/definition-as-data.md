# Definition as data

The most unusual idea in the framework: a Generated Application's **structure** —
its tables, the operations you can run, the views you see, the policies that gate
them — is not code and not database migrations. It is **governed data**, stored in
system-owned tables, changed through the same pipeline as any other data mutation.

![System-owned tables pneuma_tables, pneuma_operations, pneuma_views, pneuma_policy_rules holding app structure as rows; definition.apply mutates them through the governed pipeline](/diagrams/definition-as-data.png)

## The app's structure is rows

Five system-owned tables hold the definition:

| Table | Holds | Key fields |
|---|---|---|
| `pneuma_tables` | The app's tables | `table_id`, `columns`, `system_owned`, `definition_version` |
| `pneuma_operations` | The actions you can invoke | `operation_id`, `handler`, `input`, `affects`, `ui_binding`, `agent_tool` |
| `pneuma_views` | What surfaces render | `view_id`, `kind`, `source`, `presentation` |
| `pneuma_policy_rules` | Who may do what | `rule_id`, `effect`, `actions`, `resource`, `when` |
| `pneuma_policy_settings` | Default posture | `public` \| `restricted` |

Because the definition *is* data, every structural change is a row with
provenance — `created_by`, `created_by_kind` (was it a human or an agent?), and a
monotonic `definition_version`. The app's structure has a history the same way its
content does.

## `definition.apply` — one governed pipeline

You do not edit these rows directly and you do not write a migration. You call a
semantic tool. `definition.apply` takes a single typed change and runs it through
the **same primitive pipeline** that governs ordinary data mutation —
policy-check, impact, execution, audit. The change kinds are a closed set:

```text
add_table · add_table_column · add_operation · add_view
add_policy_rule · update_policy_rule · delete_policy_rule · set_default_posture
```

That "same pipeline" claim (pinned by ADR-0029) is the elegant part: there is no
separate, privileged "schema migration" code path that bypasses governance.
Reshaping the app is a *governed mutation*, checkable and auditable like every
other.

## `definition.apply_change_set` — one intent, one approval

A single Builder intent ("add a priority queue") usually means several structural
changes: a column, an operation to set it, maybe a view and a policy. Bundling
them into separate approvals would be noise. `definition.apply_change_set` packs
them into **one intent → one approval → child mutations**:

```ts
definition.apply_change_set({
  intent:  "Add a priority queue",
  summary: "...",
  changes: [ /* add_table_column, add_operation, add_view, ... */ ],
  approvalMode: "wait" | "defer",
})
```

The Builder sees one approval prompt. On approval, the child changes execute as a
unit; on denial, **nothing** mutates. This is the definition-side mirror of the
[single-intent proposal](./proposal-and-evidence) on the code side — same
discipline (unit of approval = unit of intent), different artifact.

## Operations: one declaration, two consumers

The `pneuma_operations` rows deserve their own note, because an **Operation is a
first-class primitive** (ADR-0018), not a convenience wrapper. A single Operation
declaration carries everything about an action:

```ts
Operation = {
  id, name, description,
  input,                 // a closed input schema
  output,                // the return shape
  affects: { mutations, adapter_writes, reads_only, destructive },
  handler,               // code handler or query body
  ui_binding?,           // where/how it appears in a view
  agent_tool?,           // how the agent sees and calls it
}
```

From that *one* declaration the framework derives **both** the UI entry point
**and** the agent tool. The consequence, in ADR-0018's words, is that UI and agent
*"走进同一个 pipeline … 完全对等"* — they enter the same pipeline and are exactly
peers. There is no "the UI checks permissions but the agent bypasses them," or
"the agent gets audited but the UI does not." A click and a tool call are the same
governed invocation.

`affects.destructive` is part of why this matters: declare an operation
destructive once, and *both* surfaces honor it — the UI shows a confirm dialog,
and the agent must disclose the consequence in natural language. One declaration,
one truth, two surfaces.

## How this lane reverts

Because the definition is versioned data, it has a native undo:
`definition.rollback.prepare` / `definition.rollback.execute` move the definition
back to a target history version — itself an approved, governed action. Contrast
this with the [code lane's rollback](./rollback), which moves a version pointer
over materialized source. Both are governed; they operate on different substrates
because the two [change models](./change-models) do.

Next: the transcript that records every one of these intents and decisions —
[BuildThread](./build-thread).
