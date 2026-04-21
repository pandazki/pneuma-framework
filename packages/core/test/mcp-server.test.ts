import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LifecycleOrchestrator } from "../src/lifecycle.js";
import { buildToolRegistry } from "../src/tools/registry.js";
import { createMcpServer } from "../src/mcp-server.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

test("MCP server exposes the tool registry via tools/list and tools/call", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-mcp-"));
  const orch = new LifecycleOrchestrator({
    templateDir: join(import.meta.dir, "fixtures/templates/fixture-min"),
    workspace: ws,
  });
  const registry = buildToolRegistry({ orchestrator: orch });
  const mcp = createMcpServer(registry);

  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" }, { capabilities: {} });
  await Promise.all([client.connect(clientT), mcp.connect(serverT)]);

  const { tools } = await client.listTools();
  expect(tools.map((t) => t.name)).toContain("lifecycle.state");

  const res = await client.callTool({ name: "lifecycle.state", arguments: {} });
  expect(res.isError).toBe(false);
  const payload = JSON.parse((res.content[0] as { text: string }).text) as { ok: boolean };
  expect(payload.ok).toBe(true);

  await mcp.close();
  await client.close();
});

test("MCP server rejects unknown tool names as a protocol error, not a tool result", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-mcp-unknown-"));
  const orch = new LifecycleOrchestrator({
    templateDir: join(import.meta.dir, "fixtures/templates/fixture-min"),
    workspace: ws,
  });
  const registry = buildToolRegistry({ orchestrator: orch });
  const mcp = createMcpServer(registry);

  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" }, { capabilities: {} });
  await Promise.all([client.connect(clientT), mcp.connect(serverT)]);

  await expect(
    client.callTool({ name: "does.not.exist", arguments: {} }),
  ).rejects.toThrow(/tool not found/i);

  await mcp.close();
  await client.close();
});
