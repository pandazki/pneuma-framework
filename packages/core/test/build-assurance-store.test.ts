import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  buildAssuranceCasesFilePath,
  createFileBuildChangeAssuranceCaseStore,
  type BuildChangeAssuranceCase,
} from "../src/index.js";

test("file-backed build assurance store saves, reloads, upserts, and lists newest first", async () => {
  const workspace = makeWorkspace();
  try {
    const store = createFileBuildChangeAssuranceCaseStore({ workspace });

    await store.saveCase(caseFor({ build_change_id: "change-1", readiness: "awaiting_approval" }));
    await store.saveCase(caseFor({ build_change_id: "change-2", readiness: "verified" }));
    await store.saveCase(caseFor({ build_change_id: "change-1", readiness: "ready_to_publish" }));

    const reloaded = createFileBuildChangeAssuranceCaseStore({ workspace });
    const cases = await reloaded.listCases();

    expect(cases.map((candidate) => candidate.build_change_id)).toEqual(["change-1", "change-2"]);
    expect(cases.map((candidate) => candidate.readiness)).toEqual(["ready_to_publish", "verified"]);
    expect(await reloaded.getCase("change-1")).toMatchObject({
      build_change_id: "change-1",
      readiness: "ready_to_publish",
    });
    expect(existsSync(buildAssuranceCasesFilePath(workspace))).toBe(true);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("file-backed build assurance store filters by app, thread, and readiness", async () => {
  const workspace = makeWorkspace();
  try {
    const store = createFileBuildChangeAssuranceCaseStore({ workspace });
    await store.saveCase(caseFor({ build_change_id: "change-1", app_id: "app-a", thread_id: "thread-a", readiness: "verified" }));
    await store.saveCase(caseFor({ build_change_id: "change-2", app_id: "app-a", thread_id: "thread-b", readiness: "awaiting_approval" }));
    await store.saveCase(caseFor({ build_change_id: "change-3", app_id: "app-b", thread_id: "thread-a", readiness: "verified" }));

    expect((await store.listCases({ app_id: "app-a" })).map((candidate) => candidate.build_change_id)).toEqual([
      "change-2",
      "change-1",
    ]);
    expect((await store.listCases({ thread_id: "thread-a" })).map((candidate) => candidate.build_change_id)).toEqual([
      "change-3",
      "change-1",
    ]);
    expect((await store.listCases({ app_id: "app-a", readiness: "verified" })).map((candidate) => candidate.build_change_id)).toEqual([
      "change-1",
    ]);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("file-backed build assurance store rejects invalid cases before writing", async () => {
  const workspace = makeWorkspace();
  try {
    const store = createFileBuildChangeAssuranceCaseStore({ workspace });
    const invalid = {
      ...caseFor({ build_change_id: "change-1" }),
      builder_subject: "",
    };

    await expect(store.saveCase(invalid)).rejects.toThrow("invalid build assurance case");
    expect(await store.listCases()).toEqual([]);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("file-backed build assurance store treats missing or corrupted files as empty", async () => {
  const workspace = makeWorkspace();
  try {
    const filePath = buildAssuranceCasesFilePath(workspace);
    const store = createFileBuildChangeAssuranceCaseStore({ workspace });
    expect(await store.listCases()).toEqual([]);

    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, "{not json", "utf-8");
    expect(await store.listCases()).toEqual([]);

    await store.saveCase(caseFor({ build_change_id: "change-1" }));
    const parsed = JSON.parse(readFileSync(filePath, "utf-8"));
    expect(parsed.schema_version).toBe(1);
    expect(parsed.cases).toHaveLength(1);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

function makeWorkspace(): string {
  return mkdtempSync(join(tmpdir(), "pneuma-assurance-store-"));
}

function caseFor(
  overrides: Partial<BuildChangeAssuranceCase>,
): BuildChangeAssuranceCase {
  return {
    build_change_id: "change-1",
    app_id: "app-a",
    thread_id: "thread-a",
    builder_subject: "user:bob",
    intent_summary: "Add priority to the generated app.",
    scope_summary: "One governed change with host check evidence.",
    risk_classification: ["definition_additive"],
    readiness: "verified",
    evidence_refs: [{ kind: "host_check", check_id: "smoke", status: "passed" }],
    blocking_reasons: [],
    migration_mode: "none",
    ...overrides,
  };
}
