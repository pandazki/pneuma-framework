import type { BookmarkWithInterpretations, GraphResponse } from "../../server/api-types.js";
import type { Lens } from "../../server/lenses.js";

export async function fetchBookmarks(): Promise<BookmarkWithInterpretations[]> {
  const r = await fetch("/api/bookmarks");
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function fetchGraph(): Promise<GraphResponse> {
  const r = await fetch("/api/graph");
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function fetchLenses(): Promise<{ lenses: Lens[] }> {
  const r = await fetch("/api/lenses");
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function addBookmark(url: string): Promise<void> {
  const r = await fetch("/api/bookmarks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!r.ok) throw new Error(await r.text());
}
