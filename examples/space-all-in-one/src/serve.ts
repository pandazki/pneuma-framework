import type { AddressInfo } from "node:net";
import { hostFromEnv, hostUrlFromEnv, picturesFromEnv } from "./config";
import { makeOwnerToken, ownerLink } from "./owner";
import { createHostServer } from "./server";

// Entry point of the served (agent-driven) Host: `bun run src/serve.ts`.
const port = Number(process.env.PNEUMA_HOST_PORT ?? 8090);
// Loopback unless told otherwise: the Host has no authentication and takes the acting subject from the request body.
const bind = process.env.PNEUMA_HOST_BIND || "127.0.0.1";
// Where the person's machine reaches this Host. Recorded in every app directory so the CLI copies find it.
const hostUrl = hostUrlFromEnv(process.env, bind, port);
const log = (line: string) => console.log(`[host] ${line}`);
const host = hostFromEnv(process.env, log, { hostUrl });
// The owner page's writes need this token. It lives in this process only, never in a file and never in an app
// directory, and a new one is made at every start: the owner link printed below stops working at the next start.
const ownerToken = makeOwnerToken();
const pictures = picturesFromEnv(process.env, host, log);
const server = createHostServer(host, { ownerToken, pictures });
server.listen(port, bind, () => {
  const { address, port: bound } = server.address() as AddressInfo;
  host.announce();
  pictures.start();
  console.log(`[host] listening on ${address.includes(":") ? `[${address}]` : address}:${bound}, reached at ${hostUrl}; apps: ${host.list().join(", ") || "none yet"}`);
  console.log(`[host] pictures of apps: ${pictures.enabled ? `taken through ${process.env.PNEUMA_SCREENSHOT_CDP}` : "off (no PNEUMA_SCREENSHOT_CDP); the page shows placeholders"}`);
  console.log(`[host] your apps: ${hostUrl}/`);
  console.log(`[host] owner link (open it yourself; it lets that browser tab approve, deny and undo, until the Host restarts): ${ownerLink(hostUrl, ownerToken)}`);
});
