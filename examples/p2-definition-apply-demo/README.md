# P2 Definition Apply Demo

Demonstrates the next milestone after P1:

1. Boot an app whose `bookmarks` Table has only `url`.
2. Try to save a row with `tags` and watch normal schema validation reject it.
3. Call `applyDefinitionChange({ kind: "add_table_column", ... })`.
4. The runtime invokes the framework `add_table_column` Operation, closes, boots again, and returns a before/after schema diff.
5. Save the same kind of row with `tags`; it now passes normal schema validation.
6. Print the latest `app_history` row showing agent attribution.

Run from the repo root:

```bash
bun --cwd=examples/p2-definition-apply-demo run start
```

Or from inside the directory:

```bash
bun run run.ts
```

The script uses a temporary SQLite-backed workspace and prints its path.
