import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { PANDAZKI_PUBLIC_PROFILE_FIXTURE } from "./github-attention.js";

export interface PersonalFocusRoute {
  readonly id: string;
  readonly path: string;
  readonly title: string;
  readonly section_ids: readonly string[];
}

export type PersonalFocusSectionKind =
  | "hero"
  | "project_gallery"
  | "focus_note"
  | "github_attention"
  | "contact";

export interface PersonalFocusSection {
  readonly id: string;
  readonly kind: PersonalFocusSectionKind;
  readonly title: string;
  readonly body: string;
  readonly module_id?: string;
}

export interface PersonalFocusStyleTokens {
  readonly accent: string;
  readonly background: string;
  readonly surface: string;
  readonly text: string;
  readonly muted: string;
  readonly type_scale: "compact" | "editorial";
  readonly density: "calm" | "focused";
  readonly tone: "quiet" | "editorial";
}

export interface GitHubAttentionModuleDefinition {
  readonly owner: string;
  readonly source_mode: "fixture" | "public";
  readonly repositories: readonly string[];
  readonly ranking: {
    readonly top_n: number;
    readonly signals: readonly string[];
  };
}

export interface PersonalFocusSiteDefinition {
  readonly schema_version: 1;
  readonly version: "v0" | "v1";
  readonly site_id: "personal-focus-site";
  readonly identity: {
    readonly login: string;
    readonly display_name: string;
    readonly profile_url: string;
  };
  readonly routes: readonly PersonalFocusRoute[];
  readonly sections: readonly PersonalFocusSection[];
  readonly style_tokens: PersonalFocusStyleTokens;
  readonly modules: {
    readonly github_attention: GitHubAttentionModuleDefinition;
  };
}

export interface PersonalFocusSiteSummary {
  readonly version: string;
  readonly primary_shape: "open-ended-site";
  readonly routes: number;
  readonly sections: readonly string[];
  readonly modules: readonly string[];
  readonly table_like_surfaces: readonly string[];
  readonly changed_surface: "baseline" | "sections+style+github_attention";
}

export interface OpenEndedDefinitionGovernanceBoundary {
  readonly artifact_kind: "host_owned_open_ended_definition";
  readonly artifact_path: "site-definition.json";
  readonly governance_scope: "host_approval";
  readonly host_operation: "host.apply_open_ended_evolution";
  readonly framework_definition_rows: false;
  readonly framework_definition_apply_change_set: false;
}

export const M18_OPEN_ENDED_DEFINITION_BOUNDARY: OpenEndedDefinitionGovernanceBoundary = {
  artifact_kind: "host_owned_open_ended_definition",
  artifact_path: "site-definition.json",
  governance_scope: "host_approval",
  host_operation: "host.apply_open_ended_evolution",
  framework_definition_rows: false,
  framework_definition_apply_change_set: false,
};

export function createPersonalFocusSiteDefinition(): PersonalFocusSiteDefinition {
  return {
    schema_version: 1,
    version: "v0",
    site_id: "personal-focus-site",
    identity: {
      login: PANDAZKI_PUBLIC_PROFILE_FIXTURE.login,
      display_name: PANDAZKI_PUBLIC_PROFILE_FIXTURE.display_name,
      profile_url: PANDAZKI_PUBLIC_PROFILE_FIXTURE.profile_url,
    },
    routes: [
      {
        id: "home",
        path: "/",
        title: "Pandazki Focus",
        section_ids: ["hero", "project_gallery", "focus_note", "github_attention", "contact"],
      },
    ],
    sections: [
      {
        id: "hero",
        kind: "hero",
        title: "Pandazki builds AI-native creation systems",
        body: "A compact home for current work, experiments, and the few GitHub threads that deserve attention today.",
      },
      {
        id: "project_gallery",
        kind: "project_gallery",
        title: "Public workbench",
        body: "pneuma-skills, nemori, leaf-playground, and deepict are the current public anchors.",
      },
      {
        id: "focus_note",
        kind: "focus_note",
        title: "Current focus",
        body: "Turning Pneuma from an app collection into a framework for AI-native creation hosts.",
      },
      {
        id: "github_attention",
        kind: "github_attention",
        title: "GitHub signals",
        body: "A ranked view of issues and pull requests that may need attention.",
        module_id: "github_attention",
      },
      {
        id: "contact",
        kind: "contact",
        title: "Follow the work",
        body: "Start from the public GitHub profile and the Pneuma repositories.",
      },
    ],
    style_tokens: {
      accent: "#0f766e",
      background: "#f7f4ee",
      surface: "#ffffff",
      text: "#1f2933",
      muted: "#64748b",
      type_scale: "compact",
      density: "calm",
      tone: "quiet",
    },
    modules: {
      github_attention: {
        owner: PANDAZKI_PUBLIC_PROFILE_FIXTURE.login,
        source_mode: "fixture",
        repositories: PANDAZKI_PUBLIC_PROFILE_FIXTURE.pinned_repositories,
        ranking: {
          top_n: 3,
          signals: ["assigned", "mentioned", "label_weight", "recent_activity"],
        },
      },
    },
  };
}

export function evolvePersonalFocusSiteDefinition(
  definition: PersonalFocusSiteDefinition,
): PersonalFocusSiteDefinition {
  return {
    ...definition,
    version: "v1",
    sections: definition.sections.map((section) => {
      if (section.id === "hero") {
        return {
          ...section,
          title: "A focused operating page for Pneuma work",
          body: "A sharper public surface for current experiments, maintained repositories, and the decisions that need attention next.",
        };
      }
      if (section.id === "github_attention") {
        return {
          ...section,
          title: "What needs attention now",
          body: "The top three GitHub threads ranked by assignment, review requests, mentions, priority labels, and recent activity.",
        };
      }
      return section;
    }),
    style_tokens: {
      ...definition.style_tokens,
      accent: "#7c3aed",
      background: "#f8fafc",
      surface: "#ffffff",
      type_scale: "editorial",
      density: "focused",
      tone: "editorial",
    },
    modules: {
      github_attention: {
        ...definition.modules.github_attention,
        ranking: {
          top_n: 3,
          signals: [
            "assigned",
            "review_requested",
            "mentioned",
            "priority_label",
            "recent_activity",
          ],
        },
      },
    },
  };
}

export function summarizeSiteDefinition(
  definition: PersonalFocusSiteDefinition,
): PersonalFocusSiteSummary {
  return {
    version: definition.version,
    primary_shape: "open-ended-site",
    routes: definition.routes.length,
    sections: definition.sections.map((section) => section.kind),
    modules: Object.keys(definition.modules),
    table_like_surfaces: [],
    changed_surface: definition.version === "v1" ? "sections+style+github_attention" : "baseline",
  };
}

export function writeSiteDefinition(
  path: string,
  definition: PersonalFocusSiteDefinition,
): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmpPath = `${path}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(definition, null, 2)}\n`);
  renameSync(tmpPath, path);
}

export function readSiteDefinition(path: string): PersonalFocusSiteDefinition {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as PersonalFocusSiteDefinition;
  if (parsed.schema_version !== 1 || parsed.site_id !== "personal-focus-site") {
    throw new Error(`unsupported Personal Focus Site definition at ${path}`);
  }
  return parsed;
}
