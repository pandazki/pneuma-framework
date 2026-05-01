#!/usr/bin/env bun

export type KnowledgeInboxDemoItem = {
  url: string;
  title: string;
  source: string;
  summary: string;
  status: "pending" | "kept" | "archived";
};

export type SeedKnowledgeInboxDemoOptions = {
  baseUrl: string;
  fetchImpl?: typeof fetch;
};

export type SeedKnowledgeInboxDemoResult = {
  captured: number;
  updated: number;
  existing: number;
};

type OperationRowsBody = {
  rows?: Array<Record<string, unknown>>;
};

type CaptureBody = {
  output?: {
    id?: string;
  };
};

export const DEMO_ITEMS: KnowledgeInboxDemoItem[] = [
  {
    url: "https://pneuma.local/m4/why-knowledge-inbox",
    title: "Why Knowledge Inbox is the M4 reference app",
    source: "team memo",
    summary:
      "Frames the app as a product-shaped pressure test for capture, persistence, and primitive introspection.",
    status: "pending",
  },
  {
    url: "https://pneuma.local/m4/sqlite-volume",
    title: "SQLite volume survives restart",
    source: "release smoke",
    summary:
      "Shows the same inbox row moving through a real app database, Docker volume, restart, and read path.",
    status: "kept",
  },
  {
    url: "https://pneuma.local/m4/vector-future",
    title: "Semantic search stays a derived index",
    source: "architecture challenge",
    summary:
      "Records the storage boundary: relational rows stay source of truth; Qdrant-like search can be added later.",
    status: "archived",
  },
];

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

async function readJsonResponse<T>(response: Response, label: string): Promise<T> {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${label} failed with HTTP ${response.status}: ${body}`);
  }
  return (await response.json()) as T;
}

async function listInboxRows(
  baseUrl: string,
  fetchImpl: typeof fetch
): Promise<Array<Record<string, unknown>>> {
  const response = await fetchImpl(`${baseUrl}/api/operations/list_inbox_items`);
  const body = await readJsonResponse<OperationRowsBody>(response, "list_inbox_items");
  return body.rows ?? [];
}

async function captureItem(
  baseUrl: string,
  fetchImpl: typeof fetch,
  item: KnowledgeInboxDemoItem
): Promise<string> {
  const response = await fetchImpl(`${baseUrl}/api/operations/capture_item`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      input: {
        url: item.url,
        title: item.title,
        source: item.source,
        summary: item.summary,
      },
    }),
  });
  const body = await readJsonResponse<CaptureBody>(response, "capture_item");
  const id = body.output?.id;
  if (!id) throw new Error("capture_item response did not include output.id");
  return id;
}

async function updateStatus(
  baseUrl: string,
  fetchImpl: typeof fetch,
  itemId: string,
  status: KnowledgeInboxDemoItem["status"]
): Promise<void> {
  const response = await fetchImpl(`${baseUrl}/api/operations/update_item_status`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input: { item_id: itemId, status } }),
  });
  await readJsonResponse(response, "update_item_status");
}

export async function seedKnowledgeInboxDemo(
  options: SeedKnowledgeInboxDemoOptions
): Promise<SeedKnowledgeInboxDemoResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const rows = await listInboxRows(baseUrl, fetchImpl);
  const existingByUrl = new Map(
    rows
      .filter((row) => typeof row.url === "string" && typeof row.id === "string")
      .map((row) => [row.url as string, row])
  );

  const result: SeedKnowledgeInboxDemoResult = {
    captured: 0,
    updated: 0,
    existing: 0,
  };

  for (const item of DEMO_ITEMS) {
    const existing = existingByUrl.get(item.url);
    if (existing) {
      result.existing += 1;
      if (existing.status !== item.status) {
        await updateStatus(baseUrl, fetchImpl, existing.id as string, item.status);
        result.updated += 1;
      }
      continue;
    }

    const id = await captureItem(baseUrl, fetchImpl, item);
    result.captured += 1;
    if (item.status !== "pending") {
      await updateStatus(baseUrl, fetchImpl, id, item.status);
      result.updated += 1;
    }
  }

  return result;
}

if (import.meta.main) {
  const baseUrl = process.argv[2];
  if (!baseUrl) {
    process.stderr.write("usage: bun run examples/m4-knowledge-inbox/seed-demo.ts <base-url>\n");
    process.exit(1);
  }
  seedKnowledgeInboxDemo({ baseUrl }).then(
    (result) => {
      process.stdout.write(
        `seeded: captured=${result.captured} updated=${result.updated} existing=${result.existing}\n`
      );
    },
    (err) => {
      process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
  );
}
