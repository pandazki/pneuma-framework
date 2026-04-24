import type { ToolContext, ToolDescriptor, ToolHandler, ToolRegistry, ToolResult } from "./types.js";
import { registerObservationTools } from "./observation.js";
import { registerActionTools } from "./action.js";
import { registerCheckpointTools } from "./checkpoint.js";

interface Entry {
  desc: ToolDescriptor;
  handler: ToolHandler;
}

export function createToolRegistry(ctx: ToolContext): ToolRegistry {
  const entries = new Map<string, Entry>();
  const order: string[] = [];

  return {
    register(desc, handler) {
      if (!entries.has(desc.name)) order.push(desc.name);
      entries.set(desc.name, { desc, handler });
    },
    deregister(name) {
      if (!entries.has(name)) return;
      entries.delete(name);
      const idx = order.indexOf(name);
      if (idx !== -1) order.splice(idx, 1);
    },
    list() {
      return order
        .map((n) => entries.get(n)?.desc)
        .filter((d): d is ToolDescriptor => d !== undefined);
    },
    async call(name, params): Promise<ToolResult> {
      const e = entries.get(name);
      if (!e) return { ok: false, error: `tool not found: ${name}` };
      try {
        return await e.handler(ctx, params);
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },
    has(name) {
      return entries.has(name);
    },
  };
}

export function buildToolRegistry(ctx: ToolContext): ToolRegistry {
  const reg = createToolRegistry(ctx);
  registerObservationTools(reg);
  registerActionTools(reg);
  registerCheckpointTools(reg);
  return reg;
}
