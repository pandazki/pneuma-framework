# M8 Release Packaging Hardening

M8 proves that a Builder/Agent-evolved Knowledge Inbox app can become a release artifact.

The smoke path is deliberately narrow:

```text
prepare evolved Knowledge Inbox workspace
  -> run migrate.sh
  -> run build.sh and inspect build.manifest.json
  -> docker build Knowledge Inbox
  -> docker run with workspace data mounted at /data
  -> verify /healthz, /api/config, and list_priority_queue
  -> docker restart
  -> verify the same capability again
```

Run:

```bash
bun test examples/m8-release-packaging-hardening/release-packaging-smoke.test.ts
```

This example does not prove rolling traffic shift, cloud deployment, registry push, production IAM, automatic rollback, or multi-runtime concurrency. It proves the release artifact boundary: the app state created during build-time evolution survives Docker packaging and restart with a mounted SQLite volume.

