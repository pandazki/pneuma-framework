import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CreationHostProject, CreationHostVersion } from "@pneuma-framework/core";
import {
  PANDAZKI_PUBLIC_PROFILE_FIXTURE,
  loadGitHubAttention,
  rankGitHubAttention,
  type RankedGitHubAttentionItem,
} from "./github-attention.js";
import {
  createPersonalFocusSiteDefinition,
  readSiteDefinition,
  summarizeSiteDefinition,
  writeSiteDefinition,
  type PersonalFocusSiteDefinition,
} from "./site-definition.js";

export interface M18RuntimeHandle {
  readonly app_id: string;
  readonly version_id: string;
  readonly url: string;
  readonly started_at_ms: number;
  readonly server: ReturnType<typeof Bun.serve>;
}

export interface M18SitePayload {
  readonly site_definition: PersonalFocusSiteDefinition;
  readonly ui_summary: ReturnType<typeof summarizeSiteDefinition>;
  readonly github_attention: {
    readonly profile: typeof PANDAZKI_PUBLIC_PROFILE_FIXTURE;
    readonly mode: "fixture" | "public";
    readonly raw_count: number;
    readonly ranked: readonly RankedGitHubAttentionItem[];
  };
}

export interface M18Inspection {
  readonly ui_definition: {
    readonly definition: PersonalFocusSiteDefinition;
    readonly summary: ReturnType<typeof summarizeSiteDefinition>;
  };
  readonly github_attention: M18SitePayload["github_attention"];
  readonly operations: readonly Record<string, unknown>[];
  readonly policies: readonly Record<string, unknown>[];
  readonly logs: readonly string[];
}

export function ensureM18SiteDefinition(version: CreationHostVersion): PersonalFocusSiteDefinition {
  const path = siteDefinitionPath(version);
  if (existsSync(path)) return readSiteDefinition(path);
  const definition = createPersonalFocusSiteDefinition();
  writeSiteDefinition(path, definition);
  return definition;
}

export function writeM18SiteDefinition(
  version: CreationHostVersion,
  definition: PersonalFocusSiteDefinition,
): void {
  writeSiteDefinition(siteDefinitionPath(version), definition);
}

export function readM18SiteDefinition(version: CreationHostVersion): PersonalFocusSiteDefinition {
  return readSiteDefinition(siteDefinitionPath(version));
}

export function siteDefinitionPath(version: CreationHostVersion): string {
  return join(version.app_workspace_dir, "site-definition.json");
}

export async function startM18PreviewRuntime(input: {
  readonly project: CreationHostProject;
  readonly version: CreationHostVersion;
  readonly port: number;
}): Promise<M18RuntimeHandle> {
  ensureM18SiteDefinition(input.version);
  return startM18SiteRuntime(input);
}

export async function stopM18Runtime(handle: M18RuntimeHandle): Promise<void> {
  handle.server.stop(true);
}

export async function inspectM18Runtime(handle: M18RuntimeHandle): Promise<M18Inspection> {
  const response = await fetch(`${handle.url}/api/site`);
  if (!response.ok) throw new Error(`GET /api/site failed with HTTP ${response.status}: ${await response.text()}`);
  const site = await response.json() as M18SitePayload;
  return {
    ui_definition: {
      definition: site.site_definition,
      summary: site.ui_summary,
    },
    github_attention: site.github_attention,
    operations: [
      {
        id: "refresh_github_attention",
        description: "Refresh and rerank the Personal Focus Site GitHub attention module.",
        action: "read",
      },
      {
        id: "update_site_definition",
        description: "Governed build-phase operation that changes sections, style tokens, and modules.",
        action: "write",
      },
    ],
    policies: [
      {
        id: "public-can-read-published-site",
        effect: "allow",
        subject: "anonymous",
        action: "read",
        target: "published_site",
      },
    ],
    logs: [`inspected ${handle.app_id}@${handle.version_id}`],
  };
}

async function startM18SiteRuntime(input: {
  readonly project: CreationHostProject;
  readonly version: CreationHostVersion;
  readonly port: number;
}): Promise<M18RuntimeHandle> {
  const server = Bun.serve({
    port: input.port,
    fetch: async (req) => {
      const url = new URL(req.url);
      try {
        if (req.method === "GET" && url.pathname === "/") return html(await renderSite(input.version));
        if (req.method === "GET" && url.pathname === "/health") return json({ ok: true });
        if (req.method === "GET" && url.pathname === "/api/site") return json(await readSitePayload(input.version));
        if (req.method === "POST" && url.pathname === "/api/github-attention/refresh") {
          return json(await readSitePayload(input.version));
        }
        return json({ error: "not_found" }, 404);
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },
  });
  return {
    app_id: input.project.app_id,
    version_id: input.version.version_id,
    url: `http://127.0.0.1:${server.port}`,
    started_at_ms: Date.now(),
    server,
  };
}

async function readSitePayload(version: CreationHostVersion): Promise<M18SitePayload> {
  const definition = ensureM18SiteDefinition(version);
  const sourceMode = process.env.GITHUB_TOKEN ? "public" : definition.modules.github_attention.source_mode;
  const attention = await loadGitHubAttention({
    mode: sourceMode,
    owner: definition.modules.github_attention.owner,
    repos: definition.modules.github_attention.repositories,
    token: process.env.GITHUB_TOKEN,
  });
  const ranked = rankGitHubAttention(attention.items, {
    viewer_login: definition.identity.login,
    top_n: definition.modules.github_attention.ranking.top_n,
  });
  return {
    site_definition: definition,
    ui_summary: summarizeSiteDefinition(definition),
    github_attention: {
      profile: PANDAZKI_PUBLIC_PROFILE_FIXTURE,
      mode: sourceMode,
      raw_count: attention.items.length,
      ranked,
    },
  };
}

async function renderSite(version: CreationHostVersion): Promise<string> {
  const payload = await readSitePayload(version);
  const tokens = payload.site_definition.style_tokens;
  const sections = payload.site_definition.sections.map((section) => {
    if (section.kind === "github_attention") {
      const items = payload.github_attention.ranked.map((item) =>
        `<li><a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a><span>${escapeHtml(item.repo)} #${item.number} · score ${item.score}</span></li>`
      ).join("");
      return `<section class="attention"><p class="eyebrow">GitHub attention</p><h2>${escapeHtml(section.title)}</h2><p>${escapeHtml(section.body)}</p><ol>${items}</ol></section>`;
    }
    return `<section class="${section.kind}"><p class="eyebrow">${escapeHtml(section.kind.replaceAll("_", " "))}</p><h2>${escapeHtml(section.title)}</h2><p>${escapeHtml(section.body)}</p></section>`;
  }).join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(payload.site_definition.identity.display_name)} Focus</title>
  <style>
    :root { color-scheme: light; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: ${tokens.background};
      color: ${tokens.text};
    }
    main { max-width: 1060px; margin: 0 auto; padding: 42px 24px 56px; }
    section { padding: 30px 0; border-bottom: 1px solid rgba(31, 41, 51, 0.12); }
    .hero h2 { max-width: 760px; font-size: ${tokens.type_scale === "editorial" ? "54px" : "42px"}; line-height: 1; margin: 0 0 18px; }
    h2 { font-size: 28px; margin: 0 0 12px; letter-spacing: 0; }
    p { max-width: 700px; color: ${tokens.muted}; font-size: 16px; line-height: 1.65; }
    .eyebrow { color: ${tokens.accent}; font-size: 12px; font-weight: 700; letter-spacing: 0; text-transform: uppercase; }
    .attention ol { display: grid; gap: 12px; padding: 0; list-style: none; }
    .attention li { background: ${tokens.surface}; border: 1px solid rgba(31, 41, 51, 0.1); border-radius: 8px; padding: 16px; }
    .attention a { display: block; color: ${tokens.text}; font-weight: 700; text-decoration: none; }
    .attention span { display: block; color: ${tokens.muted}; margin-top: 6px; font-size: 13px; }
  </style>
</head>
<body>
  <main>${sections}</main>
</body>
</html>`;
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}

function html(value: string): Response {
  return new Response(value, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
