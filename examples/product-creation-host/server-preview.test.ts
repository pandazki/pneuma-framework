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
});

interface ProductHostState {
  readonly projects: readonly {
    readonly current_version?: {
      readonly items: readonly {
        readonly id: string;
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
