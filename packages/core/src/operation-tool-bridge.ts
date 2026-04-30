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

function describeOutputKind(output: unknown): string {
  if (output === undefined || output === null) return "unspecified";
  if (typeof output !== "object") return "unspecified";
  const kind = (output as { kind?: unknown }).kind;
  if (typeof kind !== "string") return "unspecified";
  return kind;
}

function queryStringValue(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return String(value);
  }
  return JSON.stringify(value);
}

function operationUrl(serviceUrl: string, opId: string, params: unknown, method: "GET" | "POST"): string {
  const url = new URL(
    `/api/operations/${encodeURIComponent(opId)}`,
    serviceUrl.replace(/\/$/, "") + "/",
  );
  if (method === "GET" && params && typeof params === "object" && !Array.isArray(params)) {
    for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
      const encoded = queryStringValue(value);
      if (encoded !== undefined) url.searchParams.set(key, encoded);
    }
  }
  return url.toString();
}

// ---- minimal structural type (mirrors DiscoveredOperation from core/types.ts + input_schema from runtime) ----

export interface DiscoveredOperationLike {
  readonly id: string;
  readonly action: string;
  readonly resource: unknown;
  readonly input_schema?: unknown;
  /** Raw OperationOutput (core-domain VO). Optional for pre-P0 templates. */
  readonly output?: unknown;
  /** JSON-Schema for response.output. Optional for pre-P0 templates. */
  readonly output_schema?: unknown;
  /** Opaque in core/types.ts; bridge reads only reads_only + destructive at runtime. */
  readonly affects: unknown;
  readonly handler_kind: "code" | "query";
  /** Optional for pre-P23 runtimes. */
  readonly invocation_method?: "GET" | "POST";
  readonly surface?: {
    readonly agent_callable?: boolean;
    readonly public_surface?: boolean;
    readonly view_mountable?: boolean;
    readonly framework_internal?: boolean;
  };
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
      if (op.surface?.agent_callable === false) continue;

      const toolName = `op.${op.id}`;

      // Build description (safely unpack affects which is opaque at this layer)
      const affects = op.affects as { reads_only?: boolean; destructive?: boolean } | undefined;
      const readTag = affects?.reads_only ? "reads_only=true" : "reads_only=false";
      const destructiveTag = affects?.destructive ? "destructive=true" : "destructive=false";
      const surfaceTag = op.surface?.framework_internal ? "surface=framework_internal" : "surface=app";
      const outputKind = describeOutputKind(op.output);
      const description =
        `Invoke Operation '${op.id}' (action=${op.action}, ${readTag}, ${destructiveTag}, ${surfaceTag}). ` +
        `Input is passed to the template's HTTP handler. ` +
        `Output: ${outputKind}.`;

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
      const invocationMethod = op.invocation_method ?? (op.handler_kind === "query" ? "GET" : "POST");
      const deps = this.deps;

      this.deps.toolRegistry.register(
        { name: toolName, description, inputSchema },
        async (_ctx, params) => {
          const serviceUrl = deps.getServiceUrl();
          if (!serviceUrl) {
            return { ok: false, error: "template server not ready — service URL unavailable" };
          }
          const url = operationUrl(serviceUrl, opId, params, invocationMethod);
          let resp: Response;
          try {
            resp = invocationMethod === "GET"
              ? await fetch(url, { method: "GET" })
              : await fetch(url, {
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
