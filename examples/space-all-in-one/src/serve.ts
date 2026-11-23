import { hostFromEnv } from "./config";
import { createHostServer } from "./server";

// Entry point of the served (agent-driven) Host: `bun run src/serve.ts`.
const port = Number(process.env.PNEUMA_HOST_PORT ?? 8090);
const host = hostFromEnv(process.env, (line) => console.log(`[host] ${line}`));
createHostServer(host).listen(port, "0.0.0.0", () => {
  console.log(`[host] listening on :${port}; apps: ${host.list().join(", ") || "none yet"}`);
});
