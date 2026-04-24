# P1 App Definition Change — Demo

Demonstrates Phase 3 P1 in a single script:

1. Boots an empty pneuma-app with one base Table (`bookmarks`).
2. Invokes the framework-injected `add_table_column` Operation to declare
   a new column `tags` on `bookmarks`.
3. Closes the app.
4. Re-boots with the same SQLite file → the column is now effective.
5. Writes a Row using the new column.

Run:

```bash
bun run run.ts
```

Cleanup: the script uses a temp directory under `/tmp`, reported on
stdout. Remove it manually if you want a clean slate.
