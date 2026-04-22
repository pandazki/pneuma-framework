import type { DbHandle } from "./db.js";
import type { LensRegistry } from "./lenses.js";
import { chat, embed } from "./openrouter.js";

export interface IngestResult {
  bookmarkId: number;
  url: string;
  title: string | null;
  lensesApplied: string[];
}

/** Fetch URL content via Jina Reader (which already extracts main text). */
export async function fetchReadable(url: string): Promise<{ title: string | null; body: string }> {
  const jinaUrl = `https://r.jina.ai/${url}`;
  const res = await fetch(jinaUrl, { headers: { "Accept": "text/plain" } });
  if (!res.ok) throw new Error(`jina-reader: ${res.status} ${await res.text()}`);
  const body = await res.text();
  const firstLine = body.split("\n", 1)[0]?.trim() ?? "";
  const title = firstLine.startsWith("Title:") ? firstLine.replace(/^Title:\s*/, "") : null;
  return { title, body };
}

export async function ingest(
  db: DbHandle,
  lenses: LensRegistry,
  url: string,
): Promise<IngestResult> {
  const { title, body } = await fetchReadable(url);
  const row = db.insertBookmark({ url, title, rawText: body.slice(0, 50_000) });
  const applied: string[] = [];
  for (const lens of lenses.list()) {
    try {
      const interpretation = await chat({
        model: lens.model,
        systemPrompt: lens.prompt,
        userInput: `URL: ${url}\n\nTitle: ${title ?? "(none)"}\n\nContent:\n${body.slice(0, 20_000)}`,
      });
      const vec = await embed(interpretation);
      db.insertInterpretation({ bookmarkId: row.id, lensName: lens.name, body: interpretation, embedding: vec });
      applied.push(lens.name);
    } catch (err) {
      console.error(`[interpret] lens ${lens.name} failed:`, err);
    }
  }
  return { bookmarkId: row.id, url: row.url, title: row.title, lensesApplied: applied };
}
