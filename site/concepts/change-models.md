# Two change models

Here is the distinction that the rest of the domain model hangs on, and the one
most worth getting straight: a Generated Application can be changed in **two
fundamentally different ways**, and they are not interchangeable.

![Two lanes: definition-as-data changes governed rows in system tables via definition.apply; the code change lane edits source files via draft, verify, proposal, apply](/diagrams/change-models.png)

| | **Definition as data** | **Code change lane** |
|---|---|---|
| Changes | Governed *rows* in system tables | *Source files* in the scaffold |
| Mechanism | `definition.apply` / `definition.apply_change_set` | draft → verify → proposal → apply |
| Unit | A table, column, operation, view, or policy | A unified diff over `writable_roots` |
| Lives in | Runtime governed data | Source control |
| Owned by | The framework's definition model | The Host (open-ended artifacts) |
| Reversible via | `definition.rollback` (version history) | Re-publish / corrective proposal |
| ADRs | ADR-0018, ADR-0029 | ADR-0031, ADR-0033, ADR-0034 |

## Lane A — change the *definition*

Some changes are structural in a way the framework understands natively: *add a
table*, *add a column*, *add an operation*, *add a view*, *change a policy*. These
are not files — they are **rows** in system-owned tables (`pneuma_tables`,
`pneuma_operations`, `pneuma_views`, `pneuma_policy_rules`). You change them by
calling a semantic tool, `definition.apply`, which mutates those rows through the
*same governed pipeline as ordinary data mutation*.

The app's structure is **data, not migrations**. This is the
[definition-as-data](./definition-as-data) model, and it is what lets the
Build-phase Agent reshape an app's schema and behavior through tool calls that the
framework can check, gate, version, and roll back — without ever writing a
migration file.

## Lane B — change the *source*

Other changes are open-ended in a way no fixed schema captures: *rewrite this
React view*, *change the styling*, *add a route*, *adjust this server handler*.
These are genuinely **source-file** edits. They flow through the
[Code Change Lane](./verify-gate): the agent edits a draft, the scaffold's
`verify` gates it, a [proposal](./proposal-and-evidence) discloses the diff, and
[apply](./apply-and-versions) materializes a new version.

ADR-0031 draws the line explicitly: open-ended source artifacts are **Host-owned**
and approved at the Host level. They are *not* framework definition rows, and they
do *not* go through `definition.apply_change_set`. They are diffs in source
control, governed by the loop.

## How to tell which lane a change is in

The test is the same [boundary litmus](/architecture/boundaries) applied to the
*change* rather than the feature:

> Is the thing being changed a **structural primitive the framework models**
> (table / column / operation / view / policy)? → **Lane A**, definition-as-data.
>
> Is it **open-ended source** (UI, routes, styling, handler logic) the framework
> deliberately does not model? → **Lane B**, the code change lane.

- "Add a `priority` column and an operation to set it" → **Lane A**. The framework
  knows what a column and an operation are; it can add the rows, derive the agent
  tool and UI binding, and version the change.
- "Redesign the board view and add a drag-to-reorder interaction" → **Lane B**.
  There is no `pneuma_*` row that captures a drag interaction; it is React source,
  changed through draft + verify + proposal.

## Why two lanes instead of one

You could imagine forcing everything through source files (lose native,
checkable, rollback-able structure for schema) or everything through definition
data (lose the open-ended expressiveness of real code). The framework refuses both
collapses. **Structure that the framework can reason about is data; everything
else is governed source.** Keeping the two lanes distinct is what lets the
framework be strict where it can model the change, and get out of the way where it
cannot — without ever leaving a change ungoverned.

The two lanes share one thing: governance. Both record intent and decision on the
[BuildThread](./build-thread); both gate mutation behind explicit approval. They
differ only in *what* gets mutated and *how* it is checked.

Next: the structural lane in detail — [definition as data](./definition-as-data).
