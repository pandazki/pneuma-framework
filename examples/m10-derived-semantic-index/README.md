# M10 Derived Semantic Index

M10 proves that Knowledge Inbox can gain semantic search through a derived index.

Run:

```bash
bun test examples/m10-derived-semantic-index/run.test.ts
```

The example rebuilds a local semantic index from SQLite source rows, runs three semantic queries, and verifies that `inbox_items` did not gain an `embedding` business column.
