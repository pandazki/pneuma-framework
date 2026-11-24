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
  change <name> "<intent>" [--agent ${AGENT_KINDS.join("|")}] [--model <m>] [--one-way "<what is lost>" (record mode)]
  status <name> | history <name>
  undo <name> "<why>" [--to <version>] [--accept-one-way (owner, in a terminal: confirm going back past a one-way change)] | discard <name>
  approve <name> <change-id> | deny <name> <change-id> [why]
  preview <name> <change-id>    publish a waiting change's preview again once it has ended itself

needs PNEUMA_SPACE_CLI (pneuma-space/cli/appctl.ts) and a running PneumaSpace (docker compose up -d)`;

const NOTHING_CHECKED = "Nothing checked or approved this change: the Host recorded it and published it as it was.";

/** A change's result in a few lines, and the exit code. */
export function print(result: ChangeResult): number {
  if (result.status === "published") {
    console.log(`published ${result.version} at ${result.address}`);
    console.log(`changed: ${result.changed_paths.join(", ") || "(initial release)"}`);
    if (result.guarantees.length === 0) console.log(NOTHING_CHECKED);
    else console.log(`risks: ${result.risks.join(", ")}; approved by: ${result.approved_by.join(", ")}`);
    if (result.one_way) console.log(`ONE-WAY: ${result.one_way}`);
    if (result.note) console.log(result.note);
    if (result.test_warning) console.log(result.test_warning);
    return 0;
  }
  if (result.status === "release_failed") {
    console.log(`recorded ${result.version}, but it did not go live (${result.reason}).\n${result.detail}\n${result.address_note}`);
    return 1;
  }
  if (result.status === "needs_approval") {
    console.log(`needs_approval ${result.change_id}: nothing was released.`);
    for (const line of result.disclosure) console.log(`  - ${line}`);
    if (result.test_warning) console.log(result.test_warning);
    if (result.preview) console.log(`preview: ${result.preview.address}${result.preview.expires_at ? ` (it ends itself at ${result.preview.expires_at})` : ""}`);
    return 2;
  }
  console.log(`rejected (${result.reason}): nothing was released.\n${result.detail}`);
  return 1;
}

const exitCodeFor = (signal: NodeJS.Signals): number => (signal === "SIGINT" ? 130 : 143);

/** The question the owner answers before going back past a one-way change. The refusal printed above it says why. */
function confirmPrompt(dataRestore: string | undefined): string {
  return dataRestore === "snapshot"
    ? 'Type "accept" to go back and put the stored data back to that snapshot; what was stored since then will not be in the app: '
    : 'Type "accept" to go back with the code only, leaving the stored data as it is: ';
}

async function main(argv: string[]): Promise<number> {
  const flags: Record<string, string> = {};
  const args: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--agent" || argv[i] === "--model" || argv[i] === "--to" || argv[i] === "--one-way") flags[argv[i]!.slice(2)] = argv[++i] ?? "";
    else if (argv[i] === "--accept-one-way") flags["accept-one-way"] = "yes";
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
      // The agent CLIs run in their own process groups, so Ctrl-C in this terminal reaches only this process.
      const stop = new AbortController();
      let interruptedBy: NodeJS.Signals | undefined;
      let turnRunning = false;
      const onSignal = (signal: NodeJS.Signals): void => {
        if (interruptedBy) return;
        interruptedBy = signal;
        stop.abort();
        // With no turn running there is nothing to wait for, and the Host must not go on to release.
        if (!turnRunning) {
          console.error(`drive: interrupted by ${signal} while no agent turn was running; run "status ${name}" to see where the change stopped`);
          process.exit(exitCodeFor(signal));
        }
      };
      process.on("SIGINT", onSignal);
      process.on("SIGTERM", onSignal);
      const lane = await agentLane(kind, intent, { model: flags.model, log, signal: stop.signal });
      const result = await host.submit({
        name,
        intent,
        agent: kind,
        ...(flags["one-way"] !== undefined ? { oneWay: flags["one-way"] } : {}),
        isAgentTimeout: lane.isAgentTimeout,
        runAgent: (draftRoot, context) => {
          turnRunning = true;
          return lane.runAgent(draftRoot, context).finally(() => {
            turnRunning = false;
          });
        },
      });
      // An aborted turn is not a timeout, so the Host rejected the draft instead of verifying it.
      if (interruptedBy && result.status === "rejected") {
        console.error(`drive: interrupted by ${interruptedBy}; the agent turn was stopped and nothing was released`);
        return exitCodeFor(interruptedBy);
      }
      return print(result);
    }
    case "status":
      console.log(JSON.stringify(await host.status(name), null, 2));
      return 0;
    case "history":
      for (const h of host.history(name)) console.log(JSON.stringify(h));
      return 0;
    case "undo": {
      const reason = rest.join(" ") || "undo";
      const to = flags.to || undefined;
      let result;
      try {
        result = await host.undo(name, reason, { to });
      } catch (err) {
        // Going back past a one-way change is the owner's decision, so it takes a terminal and a typed confirmation, like approve.
        if (!(err instanceof HostError) || err.reason !== "crosses_one_way_change" || !flags["accept-one-way"]) throw err;
        if (!process.stdin.isTTY) throw new HostError(403, "--accept-one-way is the owner's decision and must be run by a person in a terminal");
        console.log(err.message);
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const answer = await rl.question(confirmPrompt(err.fields?.data_restore)).catch(() => "");
        rl.close();
        if (answer.trim() !== "accept") throw new HostError(400, "not confirmed; nothing changed");
        result = await host.undo(name, reason, { to, acceptOneWay: true, subject: process.env.PNEUMA_OWNER ?? "user:me" });
      }
      console.log(`now on ${result.active_version} (was ${result.undone_version}) at ${result.address}.`);
      if (result.data_restored) {
        console.log(`Stored data was put back from the snapshot saved before the one-way change${result.confirmed_by ? `, as ${result.confirmed_by} confirmed` : ""}. What was stored after that is not in the app.`);
        if (result.set_aside) console.log(result.set_aside);
      } else if (result.confirmed_by) console.log(`Code only; stored data was not put back, as ${result.confirmed_by} confirmed. This version may fail on it.`);
      else console.log("Code only; stored data was not rolled back.");
      if (result.note) console.log(result.note);
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
      if (pending.preview) console.log(pending.preview.state === "standing" ? `preview: ${pending.preview.address}` : `preview: none standing; ${pending.preview.note}`);
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      // Ctrl+D or Ctrl+C at the prompt rejects the question; that is a "no", not a crash.
      const answer = await rl.question(`Type "${command}" to confirm: `).catch(() => "");
      rl.close();
      if (answer.trim() !== command) throw new HostError(400, "not confirmed; nothing changed");
      const result = await host.resolve(name, changeId, command === "approve" ? "approved" : "denied", process.env.PNEUMA_OWNER ?? "user:me", rest.slice(1).join(" ") || undefined);
      return command === "deny" ? 0 : print(result);
    }
    case "preview": {
      if (!rest[0]) throw new HostError(400, "preview takes <name> <change-id>");
      const { preview, republished } = await host.preview(name, rest[0]);
      console.log(`${republished ? "published again" : "still standing"}: ${preview.address}${preview.expires_at ? ` until ${preview.expires_at}` : ""}`);
      return 0;
    }
    default:
      console.log(USAGE);
      return 1;
  }
}

// Run as `bun run src/drive.ts`; a test imports `print` without running a command.
if (import.meta.main) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err: unknown) => {
      console.error(`drive: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(err instanceof HostError ? 1 : 70);
    },
  );
}
