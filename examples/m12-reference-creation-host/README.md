# M12 Reference Creation Host

This example is the first host-level proof after M11.

It is not another generated app demo. It is a Builder-facing Creation Host that can create a Generated Application project, start a preview runtime, and inspect schema/data/logs through host APIs.

## Run

```bash
bun run examples/m12-reference-creation-host/run.ts
```

Open the printed URL, then:

1. click `Create v0`;
2. click `Start preview`;
3. inspect Schema, seeded Data, Operations, and Logs in the Builder Workbench.

## Smoke Test

```bash
bun run examples/m12-reference-creation-host/run.ts --smoke-exit
```

Expected output:

```text
M12 Reference Creation Host ready: http://127.0.0.1:<port>
created generated app: team-knowledge-inbox@v0
preview config: inbox_items table, capture_item operation
smoke verification: passed
```

## What M12 Proves

```text
pneuma-framework -> Creation Host -> Generated Application -> previewable v0
```

The Creation Host owns project identity, profile choice, version directories, preview lifecycle, and inspection surfaces. The Generated Application owns definition, seeded demo data, operations, and runtime behavior.

## What M12 Does Not Prove

Real backend-agent evolution is M13. Publish, monitor, and rollback are M14. A second app domain pressure test is M15. The release-candidate snapshot is M16.
