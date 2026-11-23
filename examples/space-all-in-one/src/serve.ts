import type { AddressInfo } from "node:net";
import { hostFromEnv } from "./config";
import { createHostServer } from "./server";

// Entry point of the served (agent-driven) Host: `bun run src/serve.ts`.
const port = Number(process.env.PNEUMA_HOST_PORT ?? 8090);
// Loopback unless told otherwise: the Host has no authentication and takes the acting subject from the request body.
const bind = process.env.PNEUMA_HOST_BIND || "127.0.0.1";
const host = hostFromEnv(process.env, (line) => console.log(`[host] ${line}`));
const server = createHostServer(host);
server.listen(port, bind, () => {
  const { address, port: bound } = server.address() as AddressInfo;
  console.log(`[host] listening on ${address.includes(":") ? `[${address}]` : address}:${bound}; apps: ${host.list().join(", ") || "none yet"}`);
});
