#!/usr/bin/env bun
// framework-mcp-bridge.ts
//
// Standalone stdio MCP bridge for framework semantic tools. It connects to a
// small HTTP proxy around the in-process framework ToolRegistry, lists tools,
// and proxies tool calls back to that proxy.
//
// Spawnable as:
//   PNEUMA_FRAMEWORK_TOOL_URL=http://127.0.0.1:<port> bun run packages/core/bin/framework-mcp-bridge.ts
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

interface FrameworkTool {
  name: string;
  description: string;
  inputSchema?: unknown;
}

interface FrameworkToolListResponse {
  tools?: FrameworkTool[];
}

export function buildFrameworkToolList(tools: FrameworkTool[]) {
  return tools.map((tool) => {
    let inputSchema: { type: "object"; properties?: Record<string, unknown>; required?: string[] };
    const raw = tool.inputSchema;
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
    return {
      name: tool.name,
      description: tool.description,
      inputSchema,
    };
  });
}

function toolsUrl(baseUrl: string): string {
  return new URL("/api/framework/tools", baseUrl.replace(/\/$/, "") + "/").toString();
}

function toolCallUrl(baseUrl: string, toolName: string): string {
  return new URL(
    `/api/framework/tools/${encodeURIComponent(toolName)}`,
    baseUrl.replace(/\/$/, "") + "/",
  ).toString();
}

export async function fetchFrameworkTools(baseUrl: string): Promise<FrameworkTool[]> {
  const url = toolsUrl(baseUrl);
  let resp: Response;
  try {
    resp = await fetch(url);
  } catch (netErr) {
    const msg = netErr instanceof Error ? netErr.message : String(netErr);
    process.stderr.write(`[framework-mcp-bridge] failed to reach ${url}: ${msg}\n`);
    process.exit(1);
  }
  if (!resp.ok) {
    let body = "";
    try { body = await resp.text(); } catch { /* ignore */ }
    process.stderr.write(
      `[framework-mcp-bridge] GET ${url} returned HTTP ${resp.status}: ${body.slice(0, 200)}\n`,
    );
    process.exit(1);
  }
  let list: FrameworkToolListResponse;
  try {
    list = (await resp.json()) as FrameworkToolListResponse;
  } catch {
    process.stderr.write(`[framework-mcp-bridge] GET ${url} returned non-JSON\n`);
    process.exit(1);
  }
  return list.tools ?? [];
}

export async function callFrameworkTool(
  baseUrl: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const url = toolCallUrl(baseUrl, toolName);
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
      `network error calling framework tool '${toolName}': ${msg}`,
    );
  }
  if (!resp.ok) {
    let errBody = "";
    try { errBody = await resp.text(); } catch { /* ignore */ }
    throw new McpError(
      ErrorCode.InternalError,
      `framework tool '${toolName}' returned HTTP ${resp.status}: ${errBody.slice(0, 200)}`,
    );
  }
  try {
    return await resp.json();
  } catch {
    throw new McpError(
      ErrorCode.InternalError,
      `framework tool '${toolName}' returned non-JSON response`,
    );
  }
}

async function main() {
  const baseUrl = process.env["PNEUMA_FRAMEWORK_TOOL_URL"];
  if (!baseUrl) {
    process.stderr.write(
      "[framework-mcp-bridge] PNEUMA_FRAMEWORK_TOOL_URL env var is required but not set\n",
    );
    process.exit(1);
  }

  process.stderr.write(`[framework-mcp-bridge] fetching framework tools from ${toolsUrl(baseUrl)}\n`);
  const tools = buildFrameworkToolList(await fetchFrameworkTools(baseUrl));
  process.stderr.write(`[framework-mcp-bridge] discovered ${tools.length} framework tools\n`);
  const toolNames = new Set(tools.map((tool) => tool.name));

  const server = new Server(
    { name: "pneuma-framework-bridge", version: "0.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    if (!toolNames.has(name)) {
      throw new McpError(ErrorCode.MethodNotFound, `tool not found: ${name}`);
    }
    const result = await callFrameworkTool(baseUrl, name, (args ?? {}) as Record<string, unknown>);
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("[framework-mcp-bridge] MCP server ready (stdio)\n");

  process.on("SIGTERM", async () => {
    await server.close();
    process.exit(0);
  });
}

if (import.meta.main) {
  await main();
}

