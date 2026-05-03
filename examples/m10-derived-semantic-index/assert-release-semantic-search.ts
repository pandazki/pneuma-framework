const baseUrl = process.env.M10_RELEASE_URL;
if (!baseUrl) throw new Error("M10_RELEASE_URL is required");

type RuntimeConfig = {
  readonly tables?: Array<{
    readonly id?: string;
    readonly columns?: Array<{ readonly name?: string }>;
  }>;
  readonly operations?: Array<{
    readonly id?: string;
    readonly invocation_method?: string;
  }>;
};

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const configResponse = await fetch(`${baseUrl}/api/config`);
assert(configResponse.ok, `GET /api/config failed with HTTP ${configResponse.status}`);
const config = await configResponse.json() as RuntimeConfig;

const inbox = config.tables?.find((table) => table.id === "inbox_items");
assert(inbox, "release config missing inbox_items");
assert(
  !inbox?.columns?.some((column) => column.name === "embedding"),
  "inbox_items must not contain embedding column",
);
assert(
  config.operations?.some((operation) =>
    operation.id === "semantic_search_items" && operation.invocation_method === "POST"
  ),
  "missing POST semantic_search_items Operation",
);
assert(
  config.operations?.some((operation) =>
    operation.id === "rebuild_semantic_index" && operation.invocation_method === "POST"
  ),
  "missing POST rebuild_semantic_index Operation",
);

const response = await fetch(`${baseUrl}/api/operations/semantic_search_items`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    input: {
      query: "release risk from customer escalation",
      limit: 1,
    },
  }),
});
if (!response.ok) {
  throw new Error(`semantic_search_items failed with HTTP ${response.status}: ${await response.text()}`);
}
const body = await response.json() as {
  readonly output?: {
    readonly index_status?: string;
    readonly rows?: Array<{ readonly item_id?: string; readonly title?: string }>;
  };
};
const output = body.output ?? {};
assert(output.index_status === "ready", `expected ready index, got ${JSON.stringify(body)}`);
assert(output.rows?.[0]?.title === "Critical customer signal", `expected risk top hit, got ${JSON.stringify(body)}`);
