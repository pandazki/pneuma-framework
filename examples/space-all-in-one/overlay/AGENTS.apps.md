# Apps managed by a pneuma Host

This directory holds apps that a pneuma Host keeps and publishes on PneumaSpace. Each directory here is one app with its own recorded history. The Host is at {{HOST_URL}}; the same address is in `.pneuma/host.json`. The owner's page, at {{HOST_URL}}/ in a browser, shows every app, its history and what waits for them; decisions made there are the owner's own, through the owner link the Host printed for them.

Run these from this directory; nothing needs installing:

- `node .pneuma/pneuma.mjs list`: every app with its current version, its address, the last change (when, by which agent, what was asked), changes waiting for the owner, and files changed but not submitted.
- `node .pneuma/pneuma.mjs status <name>` and `node .pneuma/pneuma.mjs history <name>`: one app in full.
- `node .pneuma/pneuma.mjs create <name>`: create and publish a new app. Its directory appears here as `<name>/`.

To change an app, work inside its directory and follow its own `AGENTS.md`. A change goes live only through that app's `submit`; never copy files into an app or publish one another way. When a change waits for the owner, only the owner decides, in a terminal.

If the CLI cannot reach the Host, it names the address it tried and where that address came from. Ask the user for the right address and pass `--host <url>`.
