import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildGovernedProposal,
  GovernedProposalRejected,
  type BuildGovernedProposalInput,
  type ObservationEvidence,
} from "../src/governed-change.js";
import { copyTree, treeSignature, type TreeWalkOptions } from "../src/workspace.js";

const temps: string[] = [];
function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), "governed-"));
  temps.push(dir);
  return dir;
}
afterEach(() => {
  while (temps.length) rmSync(temps.pop()!, { recursive: true, force: true });
});

function writeTree(root: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const to = join(root, rel);
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, content);
  }
}

// A host-supplied evidence probe: signature = the contract's field line; bundle
// size = byte length of the contract file.
async function observe(root: string): Promise<ObservationEvidence> {
  const src = readFileSync(join(root, "src/contracts.ts"), "utf8");
  const line = src.split("\n").find((l) => l.startsWith("fields:")) ?? "fields:";
  return { appSchemaSignature: line.trim(), bundleSignature: `len${src.length}`, bundleBytes: src.length };
}

/** Build an active version + a draft copy, returning the standard input. */
function setup(): { activeRoot: string; draftRoot: string } {
  const activeRoot = tmp();
  writeTree(activeRoot, {
    "src/contracts.ts": "fields: id,title\nexport const x = 1;\n",
    "api/index.ts": "export default 1;\n",
  });
  const draftRoot = join(tmp(), "draft");
  copyTree(activeRoot, draftRoot);
  return { activeRoot, draftRoot };
}

function baseInput(over: Partial<BuildGovernedProposalInput> = {}): BuildGovernedProposalInput {
  const { activeRoot, draftRoot } = setup();
  return {
    draftId: "draft-1",
    activeRoot,
    draftRoot,
    protectedRoots: ["api", "package.json"],
    runAgent: async () => ({ note: "agent edited 1 file" }),
    isAgentTimeout: (err) => err instanceof Error && err.message.toLowerCase().includes("timed out"),
    verify: async () => ({ ok: true, output: "verify ok" }),
    observe,
    ...over,
  };
}

describe("buildGovernedProposal (closure-driven backbone)", () => {
  test("happy path: editable change passes the gate and yields before/after evidence", async () => {
    const input = baseInput({
      runAgent: async (draftRoot) => {
        writeFileSync(join(draftRoot, "src/contracts.ts"), "fields: id,title,owner\nexport const x = 1;\n");
        return { note: "added owner" };
      },
    });
    const proposal = await buildGovernedProposal(input);
    expect(proposal.changedPaths).toEqual(["src/contracts.ts"]);
    expect(proposal.agentNote).toBe("added owner");
    expect(proposal.iterated).toBe(false);
    expect(proposal.before.appSchemaSignature).toBe("fields: id,title");
    expect(proposal.after.appSchemaSignature).toBe("fields: id,title,owner");
    expect(proposal.after.bundleSignature).not.toBe(proposal.before.bundleSignature);
  });

  test("fail-closed: a recoverable agent timeout still verifies the written draft", async () => {
    const input = baseInput({
      runAgent: async (draftRoot) => {
        // agent wrote files, then "timed out" before signalling completion
        writeFileSync(join(draftRoot, "src/contracts.ts"), "fields: id,title,owner\nexport const x = 1;\n");
        throw new Error("Timed out waiting for turn completion");
      },
    });
    const proposal = await buildGovernedProposal(input);
    expect(proposal.changedPaths).toEqual(["src/contracts.ts"]);
    expect(proposal.agentNote).toContain("fail-closed");
  });

  test("a non-timeout agent error aborts (re-thrown, not masked)", async () => {
    const input = baseInput({
      runAgent: async () => {
        throw new Error("backend crashed");
      },
    });
    await expect(buildGovernedProposal(input)).rejects.toThrow("backend crashed");
  });

  test("rejects an empty change", async () => {
    const input = baseInput({ runAgent: async () => ({ note: "did nothing" }) });
    await expect(buildGovernedProposal(input)).rejects.toMatchObject({ reason: "no_change" });
  });

  test("rejects a change that touches a protected root (checked on the diff)", async () => {
    const input = baseInput({
      runAgent: async (draftRoot) => {
        writeFileSync(join(draftRoot, "api/index.ts"), "export default 2;\n");
        return { note: "touched protected" };
      },
    });
    await expect(buildGovernedProposal(input)).rejects.toMatchObject({
      reason: "protected_file_changed",
    });
  });

  test("rejects a draft that fails verify (fail-closed gate)", async () => {
    const input = baseInput({
      runAgent: async (draftRoot) => {
        writeFileSync(join(draftRoot, "src/contracts.ts"), "fields: id,title,owner\nbroken(\n");
        return { note: "broke it" };
      },
      verify: async () => ({ ok: false, output: "type error on line 2" }),
    });
    const err = (await buildGovernedProposal(input).catch((e) => e)) as GovernedProposalRejected;
    expect(err).toBeInstanceOf(GovernedProposalRejected);
    expect(err.reason).toBe("verify_failed");
    expect(err.detail).toContain("type error");
  });
});

const editContracts = (draftRoot: string) =>
  writeFileSync(join(draftRoot, "src/contracts.ts"), "fields: id,title,owner\nexport const x = 1;\n");

function agentWrites(files: Record<string, string>): BuildGovernedProposalInput["runAgent"] {
  return async (draftRoot) => {
    writeTree(draftRoot, files);
    return { note: "wrote files" };
  };
}

describe("buildGovernedProposal without the opt-in options (today's behaviour)", () => {
  test("a verify that writes into the draft passes; draftSignature is the draft as diffed", async () => {
    let signedWhenVerifyStarted = "";
    const input = baseInput({
      runAgent: async (draftRoot) => {
        editContracts(draftRoot);
        return { note: "added owner" };
      },
      verify: async (draftRoot) => {
        signedWhenVerifyStarted = treeSignature(draftRoot);
        writeFileSync(join(draftRoot, "src/written-by-a-test.ts"), "export const t = 1;\n");
        return { ok: true, output: "verify ok" };
      },
    });
    const proposal = await buildGovernedProposal(input);
    expect(proposal.changedPaths).toEqual(["src/contracts.ts"]);
    expect(proposal.draftSignature).toBe(signedWhenVerifyStarted);
    expect(treeSignature(input.draftRoot)).not.toBe(proposal.draftSignature);
  });

  test("the diff uses host-kit's default ignore list and any path may change", async () => {
    const input = baseInput({
      runAgent: agentWrites({ ".claude/settings.local.json": "{}\n", "docs/notes.md": "x\n", "dist/app.js": "built\n" }),
    });
    const proposal = await buildGovernedProposal(input);
    expect(proposal.changedPaths).toEqual([".claude/settings.local.json", "docs/notes.md"]);
    expect(proposal.draftSignature).toBe(treeSignature(input.draftRoot));
  });
});

describe("buildGovernedProposal: walkOptions", () => {
  const walk: TreeWalkOptions = {
    ignoredDirs: new Set(["node_modules", ".claude"]),
    ignoredFiles: new Set([".env"]),
    ignoredPaths: new Set(["data"]),
  };

  test("decide which files the diff and the signature cover", async () => {
    const input = baseInput({
      walkOptions: walk,
      runAgent: agentWrites({ ".claude/settings.local.json": "{}\n", "data/app.sqlite": "rows", "src/data/seed.json": "[]\n" }),
    });
    const proposal = await buildGovernedProposal(input);
    expect(proposal.changedPaths).toEqual(["src/data/seed.json"]);
    expect(proposal.draftSignature).toBe(treeSignature(input.draftRoot, walk));
    expect(proposal.draftSignature).not.toBe(treeSignature(input.draftRoot));
  });

  test("a draft that differs only where they do not look is no change", async () => {
    const input = baseInput({ walkOptions: walk, runAgent: agentWrites({ ".claude/settings.local.json": "{}\n", "data/app.sqlite": "rows" }) });
    await expect(buildGovernedProposal(input)).rejects.toMatchObject({ reason: "no_change" });
  });
});

describe("buildGovernedProposal: writableRoots", () => {
  test("a path outside every writable root is rejected before verify, with those paths as detail", async () => {
    let verified = false;
    const input = baseInput({
      writableRoots: ["src", "README.md"],
      runAgent: agentWrites({ "src/new/file.ts": "1\n", "README.md": "hi\n", "docs/notes.md": "x\n", "srcx/a.ts": "1\n" }),
      verify: async () => {
        verified = true;
        return { ok: true, output: "verify ok" };
      },
    });
    const err = (await buildGovernedProposal(input).catch((e) => e)) as GovernedProposalRejected;
    expect(err).toBeInstanceOf(GovernedProposalRejected);
    expect(err.reason).toBe("outside_writable_roots");
    expect(err.detail).toBe("docs/notes.md, srcx/a.ts");
    expect(verified).toBe(false);
  });

  test("paths inside the writable roots pass", async () => {
    const input = baseInput({ writableRoots: ["src", "README.md"], runAgent: agentWrites({ "src/new/file.ts": "1\n", "README.md": "hi\n" }) });
    expect((await buildGovernedProposal(input)).changedPaths).toEqual(["README.md", "src/new/file.ts"]);
  });

  test("a protected path keeps its own reason", async () => {
    const input = baseInput({ writableRoots: ["src"], runAgent: agentWrites({ "api/index.ts": "export default 2;\n", "docs/notes.md": "x\n" }) });
    await expect(buildGovernedProposal(input)).rejects.toMatchObject({ reason: "protected_file_changed", detail: "api/index.ts" });
  });
});

describe("buildGovernedProposal: sealDraft", () => {
  test("a draft that changes while verify runs is rejected", async () => {
    const input = baseInput({
      sealDraft: true,
      runAgent: async (draftRoot) => {
        editContracts(draftRoot);
        return { note: "added owner" };
      },
      verify: async (draftRoot) => {
        writeFileSync(join(draftRoot, "api/index.ts"), "export default 'written by a leftover process';\n");
        return { ok: true, output: "verify ok" };
      },
    });
    await expect(buildGovernedProposal(input)).rejects.toMatchObject({ reason: "draft_changed_during_verify" });
  });

  test("a verify that leaves the files it signs alone passes", async () => {
    const input = baseInput({
      sealDraft: true,
      runAgent: async (draftRoot) => {
        editContracts(draftRoot);
        return { note: "added owner" };
      },
      // dist/ is outside the default walk, so a build output there does not unseal the draft.
      verify: async (draftRoot) => {
        writeTree(draftRoot, { "dist/app.js": "built\n" });
        return { ok: true, output: "verify ok" };
      },
    });
    const proposal = await buildGovernedProposal(input);
    expect(proposal.changedPaths).toEqual(["src/contracts.ts"]);
    expect(proposal.draftSignature).toBe(treeSignature(input.draftRoot));
  });

  test("a verify that fails is reported as verify_failed even when it also wrote", async () => {
    const input = baseInput({
      sealDraft: true,
      runAgent: async (draftRoot) => {
        editContracts(draftRoot);
        return { note: "added owner" };
      },
      verify: async (draftRoot) => {
        writeFileSync(join(draftRoot, "src/contracts.ts"), "fields: broken\n");
        return { ok: false, output: "1 test failed" };
      },
    });
    await expect(buildGovernedProposal(input)).rejects.toMatchObject({ reason: "verify_failed" });
  });
});
