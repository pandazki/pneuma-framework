# Change Record

**Audience:** Developers who want local version management for an app directory, with or without a Creation Host, and Developers who build governed layers on top of it.
**Chinese version:** [change-record.zh-CN.md](./change-record.zh-CN.md)

The change record is the floor of the framework. It records versions of an app directory and restores them. It does nothing else. It does not govern: it audits. Whoever uses it owns governance. That can be a personal coding agent, the person, or a Creation Host.

The heavier governed loop (verify gate, approval, preview) is a set of layers above this floor. Those layers write to the same record. Each entry says what was guaranteed about it.

```text
@pneuma-framework/host-kit/change-record   the floor: versions, history, restore
pneuma-framework record ...                 the same floor for a coding agent with no Host
buildGovernedProposal + the Host            layers that write entries with guarantees
```

## On Disk

Everything lives inside the app directory:

```text
.pneuma/versions/v<N>/   a clean copy of the files that make up version N
.pneuma/history.jsonl    append-only, one JSON entry per line
.pneuma/record.json      { schema_version: 1, version_counter, current_version }
```

Version ids are `v1`, `v2`, and so on. The counter never reuses a number, also after a restore.

Which files make up a version is a `TreeWalkOptions` value. With no `walkOptions`, a version leaves out:

| Left out | Why |
|---|---|
| `node_modules`, `dist`, `.work`, `.git`, `.vercel`, `.env`, `.env.local` | host-kit's workspace default |
| `.pneuma` | the record itself |
| a top-level `data/` | where scaffolds keep runtime data |
| `.claude`, `.codex`, `.vscode`, `.idea` (directories, at any depth) | what coding agents and editors keep for themselves |
| `.DS_Store` (at any depth) | what macOS Finder leaves behind |

The last two rows matter because the record is meant for coding agents. Claude Code writes `.claude/settings.local.json` when the person picks "don't ask again". If that file were versioned, restoring an older version would delete it. A `.DS_Store` that Finder writes would count as an unsaved edit and block a restore. These two rows are the change record's own default. `defaultTreeWalkOptions()`, which the governed-change backbone uses, does not include them.

A top-level `.pneuma` is never part of a version, whatever options are passed. Passing `walkOptions` replaces the whole default, so a Host that passes its own should leave these out itself. A file the walk includes is versioned and restored like source code, so keep stored data out of it.

## What The Floor Promises

- **A faithful copy per version.** `record` copies the tree into a staging directory first, computes `changed_paths` on that copy, then renames it to `v<N>`. What the entry describes is what was stored.
- **An append-only history.** The floor only appends to `history.jsonl`. It never rewrites a line.
- **An exact restore of files.** `restore` makes the working tree hold exactly the files of the target version. Files not in the version are deleted. Ignored paths are never touched.

## What The Floor Does Not Do

- **No check ran.** The floor does not run tests, builds, linters, or any command.
- **Nobody approved.** The floor asks no one.
- **Stored data is not touched or restored.** The floor never touches what the walk leaves out (by default a top-level `data/`) or anything outside the directory, such as a database server. Restoring files does not put data back.
- **No locking.** One writer at a time is the caller's job. Two processes writing the same record at once can lose a version or interleave history.

A Host or an agent that needs any of these adds them above the floor and says so in the entries it writes.

## Writing Order

`record` writes the version directory first, then `record.json` through a temp file and a rename, then appends the history line. If copying fails, nothing else is written. When `from` is given, the working tree is not touched.

`restore` puts the files back first, then moves `current_version`, then appends the history line. A restore does not create a version.

## API

```ts
import {
  openChangeRecord,
  restoreWithData,
  ChangeRecordRefused,
  GUARANTEES,
  type DataSnapshotCapability,
} from "@pneuma-framework/host-kit/change-record";

const record = openChangeRecord(appRoot, { walkOptions });

record.record({ intent: "add a dark mode", agent: "codex" });
record.note({ kind: "rejected", intent: "make it pink", agent: "host", extra: { reason: "verify_failed" } });
record.status();            // { current, dirty, changedPaths }
record.planRestore("v2");   // { target, from, undone, oneWay, dataRef? }
record.restore("v2", { agent: "person" });
```

The module imports only `./workspace.js` and Node built-ins. It does not depend on `@pneuma-framework/core` or the MCP SDK. A test fails if that changes.

`record` refuses with `ChangeRecordRefused` and reason `no_change` when the tree equals the current version. `restore` refuses with:

| Reason | When |
|---|---|
| `unknown_version` | The version does not exist, or the name is not a version name. |
| `already_current` | The target is the current version and nothing was edited. |
| `dirty_working_tree` | The working tree differs from the current version. Pass `discardEdits: true` to throw the edits away; the restore entry then lists them in `discarded_edits`. Or pass `keepEdits: true` to leave every file as it is; the current version still moves and the entry lists the edits in `kept_edits`. |
| `crosses_one_way_change` | The restore would go back past a one-way change. See below. |

Every refusal message is written for a person to read. `detail` lists the paths or versions involved.

`note` appends an entry that creates no version: a rejection, a decision, a snapshot. A note may name an existing `version`. A note can therefore declare a version one-way, or attach a data snapshot to it, after the version was recorded.

Hosts add their own fields through `extra`. A field name the record itself uses cannot be passed that way.

## Entries And Guarantees

```ts
interface ChangeRecordEntry {
  change_id: string;
  at: string;                 // ISO time
  kind: string;               // the floor writes "create" | "change" | "restore"
  intent: string;             // what the person asked for
  agent: string;              // who made the change
  version?: string;           // the version this entry created or made current
  base_version?: string;      // the version that was current before
  changed_paths?: string[];
  guarantees: string[];       // empty means recorded only
  one_way?: { reason: string };
  data_ref?: { capability: string; ref: string };
  one_way_crossed?: { versions: string[]; by: "data_restored" | "accepted"; data_ref? };
  discarded_edits?: string[];
  kept_edits?: string[];
}
```

Every entry says what was guaranteed about it. Absence means not guaranteed. A reader must never mistake a recorded-only version for a checked one.

The floor never sets a guarantee. It writes `guarantees: []` unless the caller passes names. host-kit exports four names:

| Name | Meaning |
|---|---|
| `verified` | A check command passed on this content. |
| `previewed` | This content answered as a running app before release. |
| `approved` | An approval record exists. |
| `sealed` | The recorded content is byte-identical to the content that was checked. |

Hosts may add their own strings. Write a name only when the thing it names held for this exact content.

## One-Way Changes

Some changes cannot be undone by putting files back. A migration that drops a column is one. Restoring the code of an older version does not bring the column or its data back, so the older version may not run.

Say so when recording: `record({ ..., oneWay: { reason: "dropped notes.body and its data" } })`. The CLI flag is `--one-way "<reason>"`. A note can also declare it later.

`planRestore(target)` follows each version's `base_version`, from the entry that created it, back to its ancestors. `undone` lists the versions on the current version's chain that are not on the target's, newest first. `oneWay` lists the entries among those that declare `one_way`.

`dataRef` is present only when the restore crosses a one-way change. It is the newest `data_ref` attached to the base version of the oldest one-way version being undone, which is where a snapshot taken just before that change is attached (see below). Everything between the target and that base is undone by code alone, so data as of that base fits the target's code. In the simple case the base is the target.

A restore can cross a one-way change in exactly three ways:

1. **Refused.** The default. `restore` throws `crosses_one_way_change`. The message names each version and its reason, in plain words.
2. **Data restored through a declared capability.** The Host put stored data back first and passes `dataRestored: true`. The restore entry records `one_way_crossed: { versions, by: "data_restored", data_ref }`.
3. **Explicitly accepted.** Someone said to go back anyway and the caller passes `acceptOneWay: true`. The restore entry records `one_way_crossed: { versions, by: "accepted" }`.

The record tells the truth afterwards either way. Destructive updates are legitimate when someone authorised them. The record keeps who and how.

## Data Snapshot Capability

Putting stored data back is a capability a Developer may implement and declare. The framework never promises it and never supplies one.

```ts
interface DataSnapshotCapability {
  readonly id: string;   // e.g. "neon-branch"
  snapshot(input: { appRoot: string; version: string }): Promise<{ ref: string }>;
  restore(input: { appRoot: string; ref: string }): Promise<void>;
}
```

This is a sketch of a database-branch implementation. It is not part of the framework and is not tested. `branches` and `projectOf` stand for your own client code.

```ts
// Sketch only.
const neonBranches: DataSnapshotCapability = {
  id: "neon-branch",
  async snapshot({ appRoot, version }) {
    const project = projectOf(appRoot);
    const branch = await branches.create(project, { name: `pneuma-${version}-${Date.now()}` });
    return { ref: branch.id };
  },
  async restore({ appRoot, ref }) {
    const project = projectOf(appRoot);
    // Point the app's primary branch back at the snapshot branch's data.
    await branches.resetPrimaryFrom(project, ref);
  },
};
```

Take the snapshot before the one-way change runs, and attach it to the version that is current at that moment:

```ts
const before = record.current()!;
const { ref } = await neonBranches.snapshot({ appRoot, version: before });
record.note({ kind: "snapshot", intent: "data before dropping notes.body", agent: "host",
  version: before, dataRef: { capability: neonBranches.id, ref } });
// run the migration, then:
record.record({ intent, agent, oneWay: { reason: "dropped notes.body and its data" } });
```

`restoreWithData(record, version, capability, input, options?)` plans the restore. If it crosses a one-way change, and the plan's `dataRef` comes from a capability with the same id, it calls `capability.restore` and then `record.restore(..., { dataRestored: true })`. Otherwise the restore goes ahead as `record.restore` would, so the refusal or an explicit `acceptOneWay` applies. Every refusal (unknown version, unsaved edits, a one-way change that is neither restored nor accepted) comes before any data is touched. If `capability.restore` throws, no file is restored and the error propagates.

`options.beforeRestore` runs after the data is put back (or right away when no data is needed) and before the files and the current version move. A Host publishes there. If it throws, the files and the current version stay as they were, the error propagates, and data that was put back stays put back. Because the working tree can be edited while it runs, `beforeRestore` needs `keepEdits` (or `discardEdits`) in the input; without either, `restoreWithData` throws a `TypeError` before anything is touched. That way no refusal can come after data was put back or the step ran.

## The CLI

A coding agent that works in an app directory with no Host can use the same floor:

```text
pneuma-framework record init    [--dir <app>] [--agent <name>] [--no-agents-md]
pneuma-framework record save    "<what the person asked for>" [--dir] [--agent] [--one-way "<reason>"] [--json]
pneuma-framework record history [--dir] [--json]
pneuma-framework record status  [--dir] [--json]
pneuma-framework record restore <version> [--dir] [--agent] [--discard-edits] [--accept-one-way] [--json]
```

`--dir` defaults to the current directory. `--agent` defaults to `unknown`.

`record init` records the current tree as `v1`. Unless told `--no-agents-md`, it first puts a short section at the top of the app's `AGENTS.md`, creating the file when absent. The section is marked with begin and end HTML comments and is never added twice. It tells any coding agent to read `record history` before changing anything, to run `record save` when a request is finished, that `record restore` goes back, that nothing here checks or approves its work, and to use `--one-way` when a change leaves older versions unable to run on the stored data. The section is part of `v1`, so the tree is clean right after `init`.

`record history` prints one line per entry: time, kind, version, guarantees (`recorded only` when empty), intent, and who made it. One-way entries carry `[ONE-WAY: <reason>]`. A restore that crossed one says how.

`record restore` prints the plain-language refusal and exits 1 when it is refused. The CLI never restores data, so it can only cross a one-way change with `--accept-one-way`.

Exit codes: 0 done, 1 refused or failed, 2 bad arguments. With `--json`, a refusal prints `{ refused, message, detail }` on stdout.

## The Governed Loop On Top

`buildGovernedProposal` runs the agent, diffs the draft, refuses protected paths, runs the Host's `verify`, and returns a proposal. It does not write a version. The Host records what it releases, with the guarantees that actually held:

```ts
const record = openChangeRecord(appRoot, { walkOptions });   // the same walkOptions as the backbone
try {
  const proposal = await buildGovernedProposal({ ..., walkOptions, sealDraft: true });
  // approval, now or later; then copy the draft to where it will be released from
  const sealed = treeSignature(releaseCopy, walkOptions) === proposal.draftSignature;
  record.record({
    from: releaseCopy, intent, agent,
    guarantees: [GUARANTEES.verified, GUARANTEES.approved, ...(sealed ? [GUARANTEES.sealed] : [])],
    extra: { draft_id: proposal.draftId },
  });
} catch (err) {
  if (err instanceof GovernedProposalRejected) {
    record.note({ kind: "rejected", intent, agent, extra: { reason: err.reason } });
  } else throw err;
}
```

A version a person saved through the CLI and a version that passed the Host's gate sit in the same history. The first says `recorded only`. The second names what was checked. A reader can tell them apart without knowing which tool wrote them.

## Reading Older Records

Reading is tolerant and adoption is best-effort:

- A history line without `guarantees` reads as `[]`.
- A line that is not valid JSON, such as one cut short by a crash, is skipped. The next append starts on a fresh line.
- A directory that has `.pneuma/versions/v<N>/` but no `record.json` reads as counter = highest N found and current = highest N found. The next `record` writes `record.json`.
- A `record.json` with a `schema_version` other than 1 is not guessed at. Reading it throws.

Ancestor chains use the first entry that names each version, other than a restore. A version adopted without such an entry ends its chain.

## Related

- [Creation Host Implementation Kit](./host-kit.md): `buildGovernedProposal`, `walkOptions`, `sealDraft`.
- [Code Change Lane](./code-change-lane.md): the core proposal and apply contract.
