const baseUrl = process.env.M8_RELEASE_URL;
if (!baseUrl) throw new Error("M8_RELEASE_URL is required");

type RuntimeConfig = {
  readonly tables?: Array<{ readonly id?: string; readonly columns?: Array<{ readonly name?: string }> }>;
  readonly operations?: Array<{ readonly id?: string; readonly invocation_method?: string }>;
  readonly views?: Array<{ readonly id?: string; readonly source?: unknown }>;
  readonly policy_rules?: Array<{ readonly id?: string; readonly actions?: string[]; readonly resource?: unknown }>;
};

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const configResponse = await fetch(`${baseUrl}/api/config`);
assert(configResponse.ok, `GET /api/config failed with HTTP ${configResponse.status}`);
const config = await configResponse.json() as RuntimeConfig;

const inboxItems = config.tables?.find((table) => table.id === "inbox_items");
assert(inboxItems?.columns?.some((column) => column.name === "priority"), "release config is missing inbox_items.priority");
assert(
  config.operations?.some((operation) =>
    operation.id === "list_priority_queue" && operation.invocation_method === "GET"
  ),
  "release config is missing GET list_priority_queue operation",
);
assert(config.views?.some((view) => view.id === "priority_queue"), "release config is missing priority_queue view");
assert(
  config.policy_rules?.some((rule) =>
    rule.actions?.includes("read") && JSON.stringify(rule.resource ?? {}).includes("priority_queue")
  ),
  "release config is missing priority_queue read policy",
);

const queueResponse = await fetch(`${baseUrl}/api/operations/list_priority_queue`);
if (!queueResponse.ok) {
  throw new Error(`GET list_priority_queue failed with HTTP ${queueResponse.status}: ${await queueResponse.text()}`);
}
const body = await queueResponse.json() as { rows?: Array<Record<string, unknown>> };
const rows = body.rows ?? [];
const priorities = new Set(rows.map((row) => row.priority));
for (const priority of ["P1", "P2", "P3"]) {
  assert(priorities.has(priority), `release priority queue is missing ${priority}: ${JSON.stringify(rows)}`);
}
