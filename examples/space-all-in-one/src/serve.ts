import type { AddressInfo } from "node:net";
import { hostFromEnv, hostUrlFromEnv } from "./config";
import { createHostServer } from "./server";

// Entry point of the served (agent-driven) Host: `bun run src/serve.ts`.
const port = Number(process.env.PNEUMA_HOST_PORT ?? 8090);
// Loopback unless told otherwise: the Host has no authentication and takes the acting subject from the request body.
const bind = process.env.PNEUMA_HOST_BIND || "127.0.0.1";
// Where the person's machine reaches this Host. Recorded in every app directory so the CLI copies find it.
const hostUrl = hostUrlFromEnv(process.env, bind, port);
const host = hostFromEnv(process.env, (line) => console.log(`[host] ${line}`), { hostUrl });
const server = createHostServer(host);
server.listen(port, bind, () => {
  const { address, port: bound } = server.address() as AddressInfo;
  host.announce();
  console.log(`[host] listening on ${address.includes(":") ? `[${address}]` : address}:${bound}, reached at ${hostUrl}; apps: ${host.list().join(", ") || "none yet"}`);
});
