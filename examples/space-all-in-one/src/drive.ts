import { createInterface } from "node:readline/promises";
import { AGENT_KINDS, agentLane, type AgentKind } from "./agents";
import { hostFromEnv } from "./config";
import { HostError, type ChangeResult } from "./host";

// ---------------------------------------------------------------------------
// Host-driven control plane, as a command line.
//
// This is the shape a desktop agent product embeds: the product owns the
// conversation, starts a code agent on a draft, and takes the result through
// the same governed loop the served Host runs. It runs on the user's machine,
// because that is where `claude` and `codex` are logged in.
// ---------------------------------------------------------------------------

const USAGE = `usage: bun run src/drive.ts <command>

  create <name>
  change <name> "<intent>" [--agent ${AGENT_KINDS.join("|")}] [--model <m>]
  status <name> | history <name>
  undo <name> "<why>" | discard <name>
  approve <name> <change-id> | deny <name> <change-id> [why]

needs PNEUMA_SPACE_CLI (pneuma-space/cli/appctl.ts) and a running PneumaSpace (docker compose up -d)`;

function print(result: ChangeResult): number {
  if (result.status === "published") {
    console.log(`published ${result.version} at ${result.address}`);
    console.log(`changed: ${result.changed_paths.join(", ") || "(initial release)"}`);
    console.log(`risks: ${result.risks.join(", ")}; approved by: ${result.approved_by.join(", ")}`);
    return 0;
  }
  if (result.status === "needs_approval") {
    console.log(`needs_approval ${result.change_id}: nothing was released.`);
    for (const line of result.disclosure) console.log(`  - ${line}`);
    return 2;
  }
  console.log(`rejected (${result.reason}): nothing was released.\n${result.detail}`);
  return 1;
}

async function main(argv: string[]): Promise<number> {
  const flags: Record<string, string> = {};
  const args: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--agent" || argv[i] === "--model") flags[argv[i]!.slice(2)] = argv[++i] ?? "";
    else args.push(argv[i]!);
  }
  const [command, name, ...rest] = args;
  if (!command || !name) {
    console.log(USAGE);
    return 1;
  }
  const log = (line: string) => console.error(line);
  const host = hostFromEnv(process.env, log);

  switch (command) {
    case "create":
      return print(await host.create(name));
    case "change": {
      const intent = rest.join(" ");
      if (!intent) throw new HostError(400, 'change takes <name> "<intent>"');
      const kind = (flags.agent ?? "claude-code") as AgentKind;
      if (!AGENT_KINDS.includes(kind)) throw new HostError(400, `--agent must be one of ${AGENT_KINDS.join(", ")}`);
      const lane = await agentLane(kind, intent, { model: flags.model, log });
      return print(await host.submit({ name, intent, agent: kind, ...lane }));
    }
    case "status":
      console.log(JSON.stringify(await host.status(name), null, 2));
      return 0;
    case "history":
      for (const h of host.history(name)) console.log(JSON.stringify(h));
      return 0;
    case "undo": {
      const result = await host.undo(name, rest.join(" ") || "undo");
      console.log(`now on ${result.active_version} (was ${result.undone_version}) at ${result.address}. Code only; stored data was not rolled back.`);
      return 0;
    }
    case "discard":
      console.log(JSON.stringify(await host.discard(name), null, 2));
      return 0;
    case "approve":
    case "deny": {
      const changeId = rest[0];
      if (!changeId) throw new HostError(400, `${command} takes <name> <change-id>`);
      if (!process.stdin.isTTY) throw new HostError(403, `${command} is the owner's decision and must be run by a person in a terminal`);
      const pending = (await host.status(name)).pending.find((p) => p.change_id === changeId);
      if (!pending) throw new HostError(404, `no change ${changeId} is waiting`);
      console.log(`"${pending.intent}" by ${pending.agent}\nfiles: ${pending.changed_paths.join(", ")}`);
      for (const line of pending.disclosure) console.log(`  - ${line}`);
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      // Ctrl+D or Ctrl+C at the prompt rejects the question; that is a "no", not a crash.
      const answer = await rl.question(`Type "${command}" to confirm: `).catch(() => "");
      rl.close();
      if (answer.trim() !== command) throw new HostError(400, "not confirmed; nothing changed");
      const result = await host.resolve(name, changeId, command === "approve" ? "approved" : "denied", process.env.PNEUMA_OWNER ?? "user:me", rest.slice(1).join(" ") || undefined);
      return command === "deny" ? 0 : print(result);
    }
    default:
      console.log(USAGE);
      return 1;
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(`drive: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(err instanceof HostError ? 1 : 70);
  },
);
