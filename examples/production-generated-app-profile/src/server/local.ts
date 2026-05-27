import { createReleaseOperationsApp } from "./app";
import { serveStatic } from "hono/bun";

const port = Number(process.env.PORT ?? 8911);
const app = createReleaseOperationsApp();

app.use("/*", serveStatic({ root: "./dist/client" }));
app.get("*", serveStatic({ path: "./dist/client/index.html" }));

Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(`Release Operations Board listening on http://127.0.0.1:${port}`);
