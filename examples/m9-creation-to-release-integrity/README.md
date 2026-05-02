# M9 Creation-to-Release Integrity

M9 connects the Builder approval path from M7 with the release artifact path from M8.

The example evidence shape is deliberately small:

```text
Builder request
  -> definition.apply_change_set proposal
  -> one Builder approval decision
  -> child change-set execution progress
  -> recovery result or release candidate result
  -> final status
```

Run the focused evidence tests:

```bash
bun test examples/m9-creation-to-release-integrity/evidence.test.ts
```

Run the deterministic milestone path:

```bash
WORKSPACE="$(mktemp -d)"
bun run examples/m9-creation-to-release-integrity/run.ts --workspace "$WORKSPACE"
```

The runner writes:

```text
$WORKSPACE/.pneuma/m9/success-evidence.json
$WORKSPACE/.pneuma/m9/failure-evidence.json
```

This example does not claim production rollout, registry push, cloud deployment, release traffic switching, or full database transactionality. It proves the creation-to-release evidence contract that M9 will use for both success and failure paths.
