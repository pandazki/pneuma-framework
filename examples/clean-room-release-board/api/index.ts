import { createApi } from "../src/server/app";
import { buildRepository } from "../src/server/runtime";

// Vercel serverless entry. Runs on the Edge runtime so the Neon HTTP driver and
// the Hono fetch handler work without a Node server. vercel.json rewrites
// /api/* to this function, preserving the original path for Hono's router.
export const config = { runtime: "edge" };

let fetchImpl: ((req: Request) => Response | Promise<Response>) | null = null;

async function resolveFetch(): Promise<(req: Request) => Response | Promise<Response>> {
  if (!fetchImpl) {
    const repo = await buildRepository();
    fetchImpl = createApi(repo).fetch;
  }
  return fetchImpl;
}

export default async function handler(req: Request): Promise<Response> {
  const fetcher = await resolveFetch();
  return fetcher(req);
}
