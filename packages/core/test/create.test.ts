import { test, expect } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createPneumaFramework,
  FilePermissionLedgerStore,
  InMemoryPermissionLedgerStore,
  permissionLedgerEventId,
  permissionLedgerFilePath,
} from "../src/index.js";

const FIXTURE_TEMPLATE = join(import.meta.dir, "fixtures/templates/fixture-min");
const API_CONFIG_TEMPLATE = join(import.meta.dir, "fixtures/templates/fixture-api-config-happy");

function definitionConfigFixture() {
  return {
    operations: [
      {
        id: "add_table_column",
        action: "write",
        resource: { kind: "app_definition", component: "table_column" },
        input: {},
        output: {},
        affects: { reads_only: false, destructive: false, mutations: ["pneuma_table_columns"] },
        handler_kind: "code",
      },
    ],
    tables: [
      {
        id: "bookmarks",
        source: { kind: "stored" },
        system_owned: false,
        columns: [
          {
            name: "url",
            type: { kind: "primitive", of: "URL" },
            nullable: false,
            schema: { type: "string" },
          },
        ],
      },
    ],
    views: [],
    policy_rules: [],
  };
}

async function waitForLiveFrameworkPromptId(
  fw: ReturnType<typeof createPneumaFramework>,
): Promise<string> {
  for (let i = 0; i < 50; i += 1) {
    const ids = [...fw.orchestrator.liveFrameworkPermissionPromptIds()];
    if (ids.length > 0) return ids[0]!;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("timed out waiting for framework permission prompt");
}

test("createPneumaFramework returns an orchestrator and close()", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-pub-"));
  const fw = createPneumaFramework({ templateDir: FIXTURE_TEMPLATE, workspace: ws });
  expect(fw.orchestrator).toBeDefined();
  expect(fw.state).toBe(fw.orchestrator.state);
  await fw.close();
});

test("createPneumaFramework installs authorization kernel and approval token store by default", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-auth-default-"));
  const fw = createPneumaFramework({ templateDir: FIXTURE_TEMPLATE, workspace: ws });

  expect(fw.authorizationKernel).toBeDefined();
  expect(fw.approvalTokens).toBeDefined();

  const result = await fw.toolRegistry.call("definition.apply", {
    kind: "add_table_column",
    table_id: "bookmarks",
    column_name: "tags",
    cell_type: { kind: "primitive", of: "Text" },
  });

  expect(result.ok).toBe(false);
  expect((result.state as { authorization: { reason_code: string } }).authorization.reason_code).toBe("approval_required");
  await fw.close();
});

test("createPneumaFramework installs a file permission ledger by default when authorization is enabled", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-create-permission-ledger-"));
  const fw = createPneumaFramework({ templateDir: FIXTURE_TEMPLATE, workspace: ws });
  expect(fw.permissionLedger).toBeInstanceOf(FilePermissionLedgerStore);
  expect(permissionLedgerFilePath(ws)).toContain(".pneuma/permission-ledger.jsonl");
  expect(existsSync(permissionLedgerFilePath(ws))).toBe(false);
  await fw.close();
});

test("createPneumaFramework default permission ledger follows resolved workspace", async () => {
  const root = mkdtempSync(join(tmpdir(), "pneuma-create-permission-ledger-relative-root-"));
  const otherCwd = mkdtempSync(join(tmpdir(), "pneuma-create-permission-ledger-other-cwd-"));
  const originalCwd = process.cwd();
  let fw: ReturnType<typeof createPneumaFramework> | undefined;
  try {
    process.chdir(root);
    fw = createPneumaFramework({ templateDir: FIXTURE_TEMPLATE, workspace: "relative-workspace" });
    process.chdir(otherCwd);

    await fw.permissionLedger?.append({
      schema_version: 1,
      event_id: permissionLedgerEventId(),
      event_type: "permission_requested",
      at_ms: Date.now(),
      prompt_id: "prompt-relative-workspace",
      app_id: fw.orchestrator.manifest.name,
      workspace_id: fw.orchestrator.workspace,
      tool: "definition.apply",
      detail: {},
    });

    expect(existsSync(permissionLedgerFilePath(join(root, "relative-workspace")))).toBe(true);
    expect(existsSync(permissionLedgerFilePath(join(otherCwd, "relative-workspace")))).toBe(false);
  } finally {
    process.chdir(originalCwd);
    await fw?.close();
  }
});

test("createPneumaFramework accepts an injected permission ledger", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-create-permission-ledger-injected-"));
  const permissionLedger = new InMemoryPermissionLedgerStore();
  const fw = createPneumaFramework({
    templateDir: FIXTURE_TEMPLATE,
    workspace: ws,
    authorization: { permissionLedger },
  });
  expect(fw.permissionLedger).toBe(permissionLedger);
  await fw.close();
});

test("createPneumaFramework can disable permission ledger", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-create-permission-ledger-disabled-"));
  const fw = createPneumaFramework({
    templateDir: FIXTURE_TEMPLATE,
    workspace: ws,
    authorization: { permissionLedger: false },
  });
  expect(fw.permissionLedger).toBeUndefined();
  await fw.close();
});

test("createPneumaFramework can disable authorization stores", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-create-authorization-disabled-"));
  const fw = createPneumaFramework({
    templateDir: FIXTURE_TEMPLATE,
    workspace: ws,
    authorization: { enabled: false },
  });
  expect(fw.permissionLedger).toBeUndefined();
  expect(fw.authorizationKernel).toBeUndefined();
  expect(fw.approvalTokens).toBeUndefined();
  await fw.close();
});

test("close() expires unresolved framework permission ledger prompts", async () => {
  const server = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url);
      if (req.method === "GET" && url.pathname === "/api/config") {
        return Response.json(definitionConfigFixture());
      }
      return Response.json({ error: "not_found" }, { status: 404 });
    },
  });
  const ws = mkdtempSync(join(tmpdir(), "pneuma-close-expire-permission-"));
  const permissionLedger = new InMemoryPermissionLedgerStore();
  const fw = createPneumaFramework({
    templateDir: API_CONFIG_TEMPLATE,
    workspace: ws,
    portHint: server.port,
    wire: { enabled: true },
    authorization: { permissionLedger },
  });

  try {
    expect((await fw.toolRegistry.call("lifecycle.dev.start", {})).ok).toBe(true);
    const pendingApply = fw.toolRegistry.call("definition.apply", {
      kind: "add_table_column",
      table_id: "bookmarks",
      column_name: "tags",
      cell_type: { kind: "primitive", of: "Text" },
      nullable: true,
      require_approval: true,
    });
    const promptId = await waitForLiveFrameworkPromptId(fw);

    expect(permissionLedger.getRequest(promptId, {
      livePromptIds: fw.orchestrator.liveFrameworkPermissionPromptIds(),
    })).toMatchObject({ status: "pending", live: true });

    await fw.close();

    const result = await Promise.race([
      pendingApply,
      new Promise((resolve) => setTimeout(() => resolve("timed-out"), 100)),
    ]);
    expect(result).not.toBe("timed-out");
    expect(permissionLedger.getRequest(promptId)).toMatchObject({
      status: "expired",
      live: false,
      message: "Framework closed before the permission request was answered",
    });
    expect([...fw.orchestrator.liveFrameworkPermissionPromptIds()]).toEqual([]);
  } finally {
    await fw.close();
    server.stop(true);
  }
});

test("close() terminates the dev process even when stop.sh refuses to exit", async () => {
  // Regression for P1: a stop.sh that never exits must not hide dev-process liveness.
  const BROKEN_STOP = join(import.meta.dir, "fixtures/templates/fixture-broken-stop");
  const ws = mkdtempSync(join(tmpdir(), "pneuma-close-broken-"));
  const fw = createPneumaFramework({
    templateDir: BROKEN_STOP,
    workspace: ws,
    stopScriptTimeoutMs: 300, // short so the test is fast
    stopSigtermTimeoutMs: 1000,
  });
  const running = fw.orchestrator.runDev();
  await fw.orchestrator.awaitDevReady();
  expect(fw.orchestrator.state.dev?.state).toBe("running");
  const start = Date.now();
  await fw.close();
  const elapsed = Date.now() - start;
  await running;
  expect(fw.orchestrator.state.dev?.state).toBe("stopped");
  // Must finish within bounded time — not hang on stop.sh forever.
  expect(elapsed).toBeLessThan(4000);
});

test("close() does not run stop.sh when no dev session was started", async () => {
  // Regression for P2: build-only lifecycle must not invoke stop.sh on close.
  const TRACE_STOP = join(import.meta.dir, "fixtures/templates/fixture-trace-stop");
  const ws = mkdtempSync(join(tmpdir(), "pneuma-close-nostop-"));
  const fw = createPneumaFramework({ templateDir: TRACE_STOP, workspace: ws });
  await fw.orchestrator.runBuild();
  await fw.close();
  const marker = join(ws, ".pneuma", "stop-marker");
  expect(existsSync(marker)).toBe(false);
});

test("close() runs stop.sh even if dev.sh has already exited (daemonizer pattern)", async () => {
  const LAUNCHER_EXITS = join(import.meta.dir, "fixtures/templates/fixture-launcher-exits");
  const ws = mkdtempSync(join(tmpdir(), "pneuma-close-daemon-"));
  const fw = createPneumaFramework({ templateDir: LAUNCHER_EXITS, workspace: ws });

  const running = fw.orchestrator.runDev();
  await fw.orchestrator.awaitDevReady();

  // Wait for dev.sh to finish its exit.
  await running;
  // dev.sh exited cleanly → state.dev.state should be "exited", not "running".
  expect(fw.orchestrator.state.dev?.state).toBe("exited");

  // stop.sh must still run on close, because runDev was invoked.
  await fw.close();
  const marker = join(ws, ".pneuma", "stop-marker");
  expect(existsSync(marker)).toBe(true);
});

test("close() is idempotent with prior runStop() (stop.sh runs once)", async () => {
  const LAUNCHER_EXITS = join(import.meta.dir, "fixtures/templates/fixture-launcher-exits");
  const ws = mkdtempSync(join(tmpdir(), "pneuma-close-idempotent-"));
  const fw = createPneumaFramework({ templateDir: LAUNCHER_EXITS, workspace: ws });

  const running = fw.orchestrator.runDev();
  await fw.orchestrator.awaitDevReady();
  await running; // dev.sh exited

  // Explicit runStop — stop.sh should run once here.
  await fw.orchestrator.runStop();
  const marker = join(ws, ".pneuma", "stop-marker");
  expect(existsSync(marker)).toBe(true);

  // Capture timestamp to detect re-writes.
  const { mtimeMs: firstMtime } = (await import("node:fs")).statSync(marker);

  // Give the fs a tick to distinguish mtimes.
  await new Promise((r) => setTimeout(r, 50));

  // close() in finally — must NOT re-run stop.sh.
  await fw.close();

  const { mtimeMs: secondMtime } = (await import("node:fs")).statSync(marker);
  expect(secondMtime).toBe(firstMtime);
});

test("close() runs stop.sh when dev emitted ##pneuma:stopping without an actual runStop call", async () => {
  // Regression: previously close() used state.dev.state === "stopped" as the
  // idempotency signal, but that state is also set by the ##pneuma:stopping
  // marker. In that case close() must NOT skip teardown.
  const EMITS_STOPPING = join(import.meta.dir, "fixtures/templates/fixture-emits-stopping");
  const ws = mkdtempSync(join(tmpdir(), "pneuma-close-emits-stopping-"));
  const fw = createPneumaFramework({ templateDir: EMITS_STOPPING, workspace: ws });

  const running = fw.orchestrator.runDev();
  await fw.orchestrator.awaitDevReady();
  await running;

  // dev.sh's ##pneuma:stopping set state.dev.state to "stopped" (without runStop
  // having been called).
  expect(fw.orchestrator.state.dev?.state).toBe("stopped");
  expect(fw.orchestrator.stopInvoked).toBe(false);

  // close() must still run stop.sh because runStop was never called.
  await fw.close();
  const marker = join(ws, ".pneuma", "stop-marker");
  expect(existsSync(marker)).toBe(true);
  expect(fw.orchestrator.stopInvoked).toBe(true);
});
