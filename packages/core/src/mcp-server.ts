import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { ToolRegistry } from "./tools/types.js";

export interface McpServerHandle {
  connect(transport: Transport): Promise<void>;
  close(): Promise<void>;
  readonly server: Server;
}

export function createMcpServer(registry: ToolRegistry): McpServerHandle {
  const server = new Server(
    { name: "pneuma-framework", version: "0.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: registry.list().map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const result = await registry.call(name, (args ?? {}) as Record<string, unknown>);
    return {
      isError: result.ok === false,
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  });

  return {
    server,
    connect: (transport) => server.connect(transport),
    close: () => server.close(),
  };
}
