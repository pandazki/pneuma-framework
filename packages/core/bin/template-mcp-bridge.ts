#!/usr/bin/env bun
// template-mcp-bridge.ts
//
// Standalone stdio MCP bridge. Reads PNEUMA_APP_URL env var, fetches
// /api/config to discover operations, and advertises them as MCP tools
// (name: op.<id>). Tool calls are proxied to POST /api/operations/<id>.
//
// Spawnable as: bun run packages/core/bin/template-mcp-bridge.ts
// with PNEUMA_APP_URL=http://localhost:<port>
//
// IMPORTANT: This file must NOT import from @pneuma-framework/core or any
// other workspace package. It is a standalone binary — its only dependency
// is @modelcontextprotocol/sdk.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// ---- types ----

interface DiscoveredOperation {
  id: string;
  action: string;
  affects?: { reads_only?: boolean; destructive?: boolean };
  input_schema?: unknown;
  /** Raw OperationOutput (core-domain VO). Optional for pre-P0 templates. */
  output?: unknown;
  /** JSON-Schema for response.output. Optional for pre-P0 templates. */
  output_schema?: unknown;
  handler_kind?: "code" | "query";
}

interface ApiConfigResponse {
  app_id?: string;
  operations: DiscoveredOperation[];
}

// ---- exported helpers (unit-testable without spawning the bridge) ----

export function buildToolList(operations: DiscoveredOperation[]) {
  return operations.map((op) => {
    const affects = op.affects ?? {};
    const destructive = affects.destructive ?? false;
    const outputKind = describeOutputKind(op.output);
    const description =
      `Invoke Operation '${op.id}' (action=${op.action}, destructive=${destructive}). ` +
      `Input schema attached. Output: ${outputKind}.`;

    // Use input_schema if it is an object-typed JSON Schema, otherwise
    // fall back to a permissive empty schema so the LLM can still call it.
    let inputSchema: { type: "object"; properties?: Record<string, unknown>; required?: string[] };
    const raw = op.input_schema;
    if (
      raw !== null &&
      raw !== undefined &&
      typeof raw === "object" &&
      !Array.isArray(raw) &&
      (raw as Record<string, unknown>).type === "object"
    ) {
      inputSchema = raw as typeof inputSchema;
    } else {
      inputSchema = { type: "object" };
    }

    // Attach outputSchema as an optional tool descriptor field. MCP spec
    // (2025-06-18 and newer) supports this on Tool; older clients ignore it.
    const rawOutputSchema = op.output_schema;
    const hasOutputSchema =
      rawOutputSchema !== null &&
      rawOutputSchema !== undefined &&
      typeof rawOutputSchema === "object" &&
      !Array.isArray(rawOutputSchema) &&
      (rawOutputSchema as Record<string, unknown>).type === "object";

    const tool: {
      name: string;
      description: string;
      inputSchema: typeof inputSchema;
      outputSchema?: unknown;
    } = { name: `op.${op.id}`, description, inputSchema };
    if (hasOutputSchema) {
      tool.outputSchema = rawOutputSchema;
    }
    return tool;
  });
}

function describeOutputKind(output: unknown): string {
  if (output === undefined || output === null) return "unspecified";
  if (typeof output !== "object") return "unspecified";
  const kind = (output as { kind?: unknown }).kind;
  if (typeof kind !== "string") return "unspecified";
  return kind;
}

export async function callOperation(
  appUrl: string,
  opId: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const url = `${appUrl.replace(/\/$/, "")}/api/operations/${encodeURIComponent(opId)}`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: args }),
    });
  } catch (netErr) {
    const msg = netErr instanceof Error ? netErr.message : String(netErr);
    throw new McpError(
      ErrorCode.InternalError,
      `network error calling operation '${opId}': ${msg}`,
    );
  }
  if (!resp.ok) {
    let errBody = "";
    try { errBody = await resp.text(); } catch { /* ignore */ }
    throw new McpError(
      ErrorCode.InternalError,
      `operation '${opId}' returned HTTP ${resp.status}: ${errBody.slice(0, 200)}`,
    );
  }
  let body: unknown;
  try {
    body = await resp.json();
  } catch {
    throw new McpError(
      ErrorCode.InternalError,
      `operation '${opId}' returned non-JSON response`,
    );
  }
  return body;
}

export async function fetchOperations(appUrl: string): Promise<DiscoveredOperation[]> {
  const origin = new URL(appUrl).origin;
  const configUrl = `${origin}/api/config`;
  let resp: Response;
  try {
    resp = await fetch(configUrl);
  } catch (netErr) {
    const msg = netErr instanceof Error ? netErr.message : String(netErr);
    process.stderr.write(`[template-mcp-bridge] failed to reach ${configUrl}: ${msg}\n`);
    process.exit(1);
  }
  if (!resp.ok) {
    let body = "";
    try { body = await resp.text(); } catch { /* ignore */ }
    process.stderr.write(
      `[template-mcp-bridge] GET ${configUrl} returned HTTP ${resp.status}: ${body.slice(0, 200)}\n`,
    );
    process.exit(1);
  }
  let config: ApiConfigResponse;
  try {
    config = (await resp.json()) as ApiConfigResponse;
  } catch {
    process.stderr.write(`[template-mcp-bridge] GET ${configUrl} returned non-JSON\n`);
    process.exit(1);
  }
  return config.operations ?? [];
}

// ---- main ----

async function main() {
  const appUrl = process.env["PNEUMA_APP_URL"];
  if (!appUrl) {
    process.stderr.write(
      "[template-mcp-bridge] PNEUMA_APP_URL env var is required but not set\n",
    );
    process.exit(1);
  }

  process.stderr.write(`[template-mcp-bridge] fetching operations from ${new URL(appUrl).origin}/api/config\n`);
  const operations = await fetchOperations(appUrl);
  process.stderr.write(`[template-mcp-bridge] discovered ${operations.length} operations\n`);

  const tools = buildToolList(operations);

  const server = new Server(
    { name: "pneuma-template-bridge", version: "0.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    // Validate: name must be op.<something> and must exist in our list
    if (!name.startsWith("op.") || !tools.some((t) => t.name === name)) {
      throw new McpError(ErrorCode.MethodNotFound, `tool not found: ${name}`);
    }
    const opId = name.slice(3); // strip "op." prefix
    const result = await callOperation(appUrl, opId, (args ?? {}) as Record<string, unknown>);
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("[template-mcp-bridge] MCP server ready (stdio)\n");

  // Keep alive until stdin closes or SIGTERM
  process.on("SIGTERM", async () => {
    await server.close();
    process.exit(0);
  });
}

// Only run main when this file is the entry point
if (import.meta.main) {
  main().catch((err) => {
    process.stderr.write(`[template-mcp-bridge] fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
