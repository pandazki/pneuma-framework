import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

describe("product creation host preview sandbox", () => {
  test("keeps preview data mutations out of the published version and destroys preview data on publish", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-product-host-preview-test-"));
    const port = 19000 + Math.floor(Math.random() * 1000);
    const baseUrl = `http://127.0.0.1:${port}`;
    const proc = Bun.spawn(["bun", "run", "examples/product-creation-host/src/server.ts"], {
      cwd: new URL("../..", import.meta.url).pathname,
      env: {
        ...process.env,
        PORT: String(port),
        PNEUMA_PRODUCT_HOST_WORKSPACE: workspace,
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    try {
      await waitForServer(baseUrl);

      const project = await postJson<{ readonly app_id: string }>(`${baseUrl}/api/projects`, {
        name: "Preview Sandbox Board",
        builder_subject: "user:bob",
      });
      const preview = await postJson<{ readonly preview_id: string; readonly url: string; readonly data_mode: string }>(
        `${baseUrl}/api/projects/${project.app_id}/preview/start`,
        {},
      );
      expect(preview.data_mode).toBe("preview_sandbox");
      expect(preview.url).toContain(`preview_id=${preview.preview_id}`);

      const before = await getJson<ProductHostState>(`${baseUrl}/api/state`);
      const p3Item = before.projects[0]?.current_version?.items.find((item) => item.priority === "P3");
      expect(p3Item).toBeDefined();

      await postJson(`${baseUrl}/api/previews/${preview.preview_id}/apps/${project.app_id}/items/${p3Item?.id}`, {
        priority: "P1",
      });
      const afterPreviewMutation = await getJson<ProductHostState>(`${baseUrl}/api/state`);
      const persistedItem = afterPreviewMutation.projects[0]?.current_version?.items.find((item) => item.id === p3Item?.id);
      expect(persistedItem?.priority).toBe("P3");

      const previewPage = await fetch(preview.url);
      expect(previewPage.status).toBe(200);
      const previewHtml = await previewPage.text();
      expect(previewHtml).toContain("Preview sandbox");
      expect(previewHtml).toContain("P1");

      await postJson(`${baseUrl}/api/projects/${project.app_id}/publish`, {});
      const expiredPreview = await fetch(preview.url);
      expect(expiredPreview.status).toBe(410);

      const publishedState = await getJson<ProductHostState>(`${baseUrl}/api/state`);
      const publishedItem = publishedState.projects[0]?.current_version?.items.find((item) => item.id === p3Item?.id);
      expect(publishedItem?.priority).toBe("P3");
    } finally {
      proc.kill();
      await proc.exited.catch(() => undefined);
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("renders complex generated-app modules as real end-user workflows", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-product-host-runtime-test-"));
    const port = 20000 + Math.floor(Math.random() * 1000);
    const baseUrl = `http://127.0.0.1:${port}`;
    const proc = Bun.spawn(["bun", "run", "examples/product-creation-host/src/server.ts"], {
      cwd: new URL("../..", import.meta.url).pathname,
      env: {
        ...process.env,
        PORT: String(port),
        PNEUMA_PRODUCT_HOST_WORKSPACE: workspace,
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    try {
      await waitForServer(baseUrl);
      const project = await postJson<{ readonly app_id: string }>(`${baseUrl}/api/projects`, {
        name: "Complex Board",
        goal: "Track dependencies, blockers, CI, and deadlines.",
        builder_subject: "user:bob",
      });
      await postJson(`${baseUrl}/api/projects/${project.app_id}/evolution/request`, {
        builder_subject: "user:bob",
        message: "Add dependency tracking, blocker triage, CI health, and a delivery timeline so the Dev Board can show what is blocked, what depends on what, which checks are failing, and what is due this week.",
      });
      await postJson(`${baseUrl}/api/projects/${project.app_id}/evolution/approve`, { subject: "user:bob" });
      await postJson(`${baseUrl}/api/projects/${project.app_id}/preview/start`, {});
      const published = await postJson<{ readonly url: string }>(`${baseUrl}/api/projects/${project.app_id}/publish`, {});

      const html = await fetch(`${published.url}?lang=zh`).then((response) => response.text());

      expect(html).toContain("依赖地图");
      expect(html).toContain("阻塞处理");
      expect(html).toContain("CI 健康度");
      expect(html).toContain("交付时间线");
      expect(html).toContain("2026-05-22");
      expect(html).toContain("切换 CI");
    } finally {
      proc.kill();
      await proc.exited.catch(() => undefined);
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("uses generated runtime actions to edit owners in preview and published app data", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-product-host-owner-action-test-"));
    const port = 21000 + Math.floor(Math.random() * 1000);
    const baseUrl = `http://127.0.0.1:${port}`;
    const proc = Bun.spawn(["bun", "run", "examples/product-creation-host/src/server.ts"], {
      cwd: new URL("../..", import.meta.url).pathname,
      env: {
        ...process.env,
        PORT: String(port),
        PNEUMA_PRODUCT_HOST_WORKSPACE: workspace,
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    try {
      await waitForServer(baseUrl);
      const project = await postJson<{ readonly app_id: string }>(`${baseUrl}/api/projects`, {
        name: "Owner Editing Board",
        goal: "Track owner handoffs.",
        builder_subject: "user:bob",
      });
      await postJson(`${baseUrl}/api/projects/${project.app_id}/evolution/request`, {
        builder_subject: "user:bob",
        message: "我觉得需要改负责人的功能。",
      });
      await postJson(`${baseUrl}/api/projects/${project.app_id}/evolution/approve`, { subject: "user:bob" });

      const preview = await postJson<{ readonly preview_id: string; readonly url: string }>(
        `${baseUrl}/api/projects/${project.app_id}/preview/start`,
        {},
      );
      const previewHtml = await fetch(`${preview.url}&lang=zh`).then((response) => response.text());
      expect(previewHtml).toContain("data-runtime-field=\"owner\"");
      expect(previewHtml).toContain("编辑负责人");

      const stateBeforePreview = await getJson<ProductHostState>(`${baseUrl}/api/state`);
      const firstItem = stateBeforePreview.projects[0]?.current_version?.items[0];
      expect(firstItem).toBeDefined();
      const previewPatch = await postJson<{ readonly item: { readonly owner: string } }>(
        `${baseUrl}/api/previews/${preview.preview_id}/apps/${project.app_id}/items/${firstItem?.id}`,
        { owner: "Alice" },
      );
      expect(previewPatch.item.owner).toBe("Alice");
      const stateAfterPreview = await getJson<ProductHostState>(`${baseUrl}/api/state`);
      expect(stateAfterPreview.projects[0]?.current_version?.items[0]?.owner).toBe(firstItem?.owner);

      const published = await postJson<{ readonly url: string }>(`${baseUrl}/api/projects/${project.app_id}/publish`, {});
      const publishedHtml = await fetch(`${published.url}?lang=zh`).then((response) => response.text());
      expect(publishedHtml).toContain("data-runtime-field=\"owner\"");
      const livePatch = await postJson<{ readonly item: { readonly owner: string } }>(
        `${baseUrl}/api/apps/${project.app_id}/items/${firstItem?.id}`,
        { owner: "Dave" },
      );
      expect(livePatch.item.owner).toBe("Dave");
      const stateAfterPublish = await getJson<ProductHostState>(`${baseUrl}/api/state`);
      expect(stateAfterPublish.projects[0]?.current_version?.items[0]?.owner).toBe("Dave");
    } finally {
      proc.kill();
      await proc.exited.catch(() => undefined);
      rmSync(workspace, { recursive: true, force: true });
    }
  });

});

interface ProductHostState {
  readonly projects: readonly {
    readonly current_version?: {
      readonly items: readonly {
        readonly id: string;
        readonly owner: string;
        readonly priority?: "P1" | "P2" | "P3";
      }[];
    };
  }[];
}

async function waitForServer(baseUrl: string): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < 5000) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (err) {
      lastError = err;
    }
    await Bun.sleep(50);
  }
  throw lastError instanceof Error ? lastError : new Error("Server did not start.");
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} failed with ${response.status}: ${await response.text()}`);
  return response.json() as Promise<T>;
}

async function postJson<T = unknown>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${url} failed with ${response.status}: ${await response.text()}`);
  return response.json() as Promise<T>;
}
