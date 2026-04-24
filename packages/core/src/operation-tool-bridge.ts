// operation-tool-bridge.ts
//
// Bridges "discovered operations" (fetched from GET /api/config at dev-ready time)
// into the framework's ToolRegistry as `op.*` dynamic tools that the Build-phase
// Agent can invoke.
//
// Layer separation constraint: this file MUST NOT import @pneuma-framework/core-domain.
// `DiscoveredOperationLike` is a structural interface that mirrors the shape emitted
// by /api/config — it is NOT the domain aggregate.

import type { ToolRegistry } from "./tools/types.js";

// ---- minimal structural type (mirrors DiscoveredOperation from core/types.ts + input_schema from runtime) ----

export interface DiscoveredOperationLike {
  readonly id: string;
  readonly action: string;
  readonly resource: unknown;
  readonly input_schema?: unknown;
  /** Opaque in core/types.ts; bridge reads only reads_only + destructive at runtime. */
  readonly affects: unknown;
  readonly handler_kind: "code" | "query";
}

export interface OperationToolBridgeDeps {
  readonly toolRegistry: ToolRegistry;
  /** Returns the current app-service base URL, or undefined when not running. */
  readonly getServiceUrl: () => string | undefined;
}

/**
 * Registers/deregisters template operations as `op.<id>` tools in the ToolRegistry.
 * All registration is idempotent and reversible.
 *
 * Lifecycle:
 *   1. `register(ops)` — called by the orchestrator after `_fetchOperations` completes.
 *      Replaces any previously-registered `op.*` tools so re-starts get fresh schemas.
 *   2. `clear()` — called on dev stop / crash so stale tools are removed.
 */
export class OperationToolBridge {
  private readonly deps: OperationToolBridgeDeps;
  /** Track which op.* tool names we registered so clear() removes exactly them. */
  private registered: string[] = [];

  constructor(deps: OperationToolBridgeDeps) {
    this.deps = deps;
  }

  /**
   * Register tools for the given operations. Idempotent — replaces any
   * previously-registered op.* tools with the fresh set.
   */
  register(operations: readonly DiscoveredOperationLike[]): void {
    // Remove previously-registered tools first (idempotent replace semantics).
    this.clear();

    for (const op of operations) {
      const toolName = `op.${op.id}`;

      // Build description (safely unpack affects which is opaque at this layer)
      const affects = op.affects as { reads_only?: boolean; destructive?: boolean } | undefined;
      const readTag = affects?.reads_only ? "reads_only=true" : "reads_only=false";
      const destructiveTag = affects?.destructive ? "destructive=true" : "destructive=false";
      const description =
        `Invoke Operation '${op.id}' (action=${op.action}, ${readTag}, ${destructiveTag}). ` +
        `Input is passed to the template's HTTP handler.`;

      // Determine inputSchema: use input_schema from /api/config if present and object-shaped,
      // otherwise fall back to permissive empty schema.
      let inputSchema: { type: "object"; properties?: Record<string, unknown>; required?: string[] };
      const raw = op.input_schema;
      if (
        raw &&
        typeof raw === "object" &&
        !Array.isArray(raw) &&
        (raw as Record<string, unknown>).type === "object"
      ) {
        inputSchema = raw as typeof inputSchema;
      } else {
        inputSchema = { type: "object" };
      }

      // Capture op.id in a local for the closure — `op` is fine but keep it explicit.
      const opId = op.id;
      const deps = this.deps;

      this.deps.toolRegistry.register(
        { name: toolName, description, inputSchema },
        async (_ctx, params) => {
          const serviceUrl = deps.getServiceUrl();
          if (!serviceUrl) {
            return { ok: false, error: "template server not ready — service URL unavailable" };
          }
          const url = `${serviceUrl.replace(/\/$/, "")}/api/operations/${encodeURIComponent(opId)}`;
          let resp: Response;
          try {
            resp = await fetch(url, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ input: params }),
            });
          } catch (netErr) {
            const msg = netErr instanceof Error ? netErr.message : String(netErr);
            return { ok: false, error: `network error calling operation '${opId}': ${msg}` };
          }
          if (!resp.ok) {
            let errBody = "";
            try { errBody = await resp.text(); } catch { /* ignore */ }
            return {
              ok: false,
              error: `operation '${opId}' returned HTTP ${resp.status}: ${errBody}`,
            };
          }
          let body: unknown;
          try {
            body = await resp.json();
          } catch {
            return { ok: false, error: `operation '${opId}' returned non-JSON response` };
          }
          return { ok: true, state: body };
        },
      );

      this.registered.push(toolName);
    }
  }

  /** Remove all op.* tools that were registered by this bridge. */
  clear(): void {
    for (const name of this.registered) {
      this.deps.toolRegistry.deregister(name);
    }
    this.registered = [];
  }
}
