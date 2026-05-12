import {
  assessBuildChangeReadiness,
  evaluateBuildChangeGovernance,
  type BuildChangeAssuranceAssessment,
  type BuildChangeGovernanceDecision,
  type BuildChangeGovernanceDecisionInput,
} from "../../packages/core/src/index.js";
import { buildGovernancePolicy, buildGovernanceRequest } from "./governance.js";
import { fetchGitHubPublicAttention, type GitHubAttentionItem } from "./providers/github-public.js";
import { fetchLinearMockAttention, type LinearMockAttentionItem } from "./providers/linear-mock.js";
import { renderEnterpriseGovernanceDemoPage } from "./ui.js";

export type EnterpriseGovernanceDemoStage =
  | "idle"
  | "awaiting_reviewer"
  | "reviewer_approved"
  | "published"
  | "rolled_back";

export type EnterpriseGovernanceBoardItem =
  | GitHubAttentionItem
  | (LinearMockAttentionItem & { readonly url?: string });

export interface EnterpriseGovernanceDemoPublicState {
  readonly stage: EnterpriseGovernanceDemoStage;
  readonly role: string;
  readonly board_items: readonly EnterpriseGovernanceBoardItem[];
  readonly decisions: readonly BuildChangeGovernanceDecisionInput[];
  readonly governance_decision?: BuildChangeGovernanceDecision;
  readonly assurance?: BuildChangeAssuranceAssessment;
  readonly published: {
    readonly active: boolean;
    readonly version: string | null;
  };
  readonly permissions: {
    readonly can_propose: boolean;
    readonly can_review: boolean;
    readonly can_publish: boolean;
    readonly can_rollback: boolean;
    readonly can_operate: boolean;
  };
}

interface EnterpriseGovernanceDemoState {
  stage: EnterpriseGovernanceDemoStage;
  boardItems: EnterpriseGovernanceBoardItem[];
  decisions: BuildChangeGovernanceDecisionInput[];
  governanceDecision?: BuildChangeGovernanceDecision;
  assurance?: BuildChangeAssuranceAssessment;
  published: {
    active: boolean;
    version: string | null;
  };
}

export interface EnterpriseGovernanceDemoServer {
  readonly url: string;
  readonly stop: () => void;
  readonly state: EnterpriseGovernanceDemoState;
}

const SUBJECT_BY_ROLE: Record<string, string> = {
  builder: "user:bob",
  reviewer: "user:rachel",
  owner: "user:olivia",
  operator: "user:otto",
  end_user: "user:erin",
};

export function createInitialEnterpriseGovernanceDemoState(): EnterpriseGovernanceDemoState {
  return {
    stage: "idle",
    boardItems: [],
    decisions: [],
    published: {
      active: false,
      version: null,
    },
  };
}

export function createEnterpriseGovernanceDemoServer(input: {
  readonly port?: number;
} = {}): EnterpriseGovernanceDemoServer {
  const state = createInitialEnterpriseGovernanceDemoState();
  const server = Bun.serve({
    port: input.port ?? 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/") {
        return html(renderEnterpriseGovernanceDemoPage());
      }
      if (request.method === "GET" && url.pathname === "/api/state") {
        return json(publicState(state, url.searchParams.get("role") ?? "builder"));
      }
      if (request.method === "POST" && url.pathname === "/api/propose") {
        state.boardItems = await buildBoardItems();
        state.stage = "awaiting_reviewer";
        state.decisions = [];
        state.governanceDecision = evaluateCurrentGovernance(state);
        state.assurance = assessCurrentReadiness(state);
        return json(publicState(state, "builder"));
      }
      if (request.method === "POST" && url.pathname === "/api/decision") {
        const body = await readJson<{ subject?: string; decision?: "approved" | "denied"; reason?: string }>(request);
        if (!body.subject || (body.decision !== "approved" && body.decision !== "denied")) {
          return json({ error: "subject and decision are required" }, 400);
        }
        state.decisions = [
          ...state.decisions,
          { subject: body.subject, decision: body.decision, reason: body.reason, decided_at_ms: Date.now() },
        ];
        state.governanceDecision = evaluateCurrentGovernance(state);
        state.assurance = assessCurrentReadiness(state);
        if (state.governanceDecision.allowed) state.stage = "reviewer_approved";
        return json(publicState(state, roleForSubject(body.subject)));
      }
      if (request.method === "POST" && url.pathname === "/api/publish") {
        state.governanceDecision = evaluateCurrentGovernance(state);
        state.assurance = assessCurrentReadiness(state);
        if (state.assurance.readiness !== "ready_to_publish") {
          return json(publicState(state, "operator"), 409);
        }
        state.stage = "published";
        state.published = { active: true, version: "v1" };
        state.assurance = {
          ...state.assurance,
          readiness: "published",
        };
        return json(publicState(state, "operator"));
      }
      if (request.method === "POST" && url.pathname === "/api/rollback") {
        const body = await readJson<{ subject?: string }>(request);
        if (body.subject !== "user:olivia") {
          return json({ error: "owner role required" }, 403);
        }
        state.stage = "rolled_back";
        state.published = { active: false, version: null };
        state.assurance = {
          readiness: "rolled_back",
          blocking_reasons: [],
          rollback_notes: ["owner rollback completed"],
          migration_notes: [],
        };
        return json(publicState(state, "owner"));
      }
      return json({ error: "not found" }, 404);
    },
  });

  return {
    url: server.url.toString().replace(/\/$/, ""),
    stop: () => server.stop(true),
    state,
  };
}

if (import.meta.main) {
  const server = createEnterpriseGovernanceDemoServer({ port: Number(Bun.env.PORT ?? 8889) });
  process.stdout.write(`M43 Enterprise Governance Demo: ${server.url}\n`);
}

async function buildBoardItems(): Promise<EnterpriseGovernanceBoardItem[]> {
  const [github, linear] = await Promise.all([
    fetchGitHubPublicAttention({ owner: "pandazki", limit: 3 }),
    fetchLinearMockAttention(),
  ]);
  return [...github, ...linear];
}

function evaluateCurrentGovernance(state: EnterpriseGovernanceDemoState): BuildChangeGovernanceDecision {
  return evaluateBuildChangeGovernance(
    buildGovernancePolicy(),
    buildGovernanceRequest({
      builder_subject: "user:bob",
      risks: ["source_code_change"],
      decisions: state.decisions,
    }),
  );
}

function assessCurrentReadiness(state: EnterpriseGovernanceDemoState): BuildChangeAssuranceAssessment {
  return assessBuildChangeReadiness({
    intent_status: "clear",
    proposal_status: state.stage === "idle" ? "not_proposed" : "proposed",
    approval_status: state.governanceDecision?.allowed ? "approved" : "awaiting",
    execution_status: state.governanceDecision?.allowed ? "applied" : "not_started",
    risks: ["source_code_change"],
    checks: [
      { id: "provider-capability-contract", phase: "pre_proposal", status: "passed", message: "GitHub public-read and mock Linear satisfy the demo provider baseline." },
      { id: "review-packet", phase: "post_apply", status: "passed", message: "Review packet contains provider scope and rollback evidence." },
    ],
    release_checks: [
      { name: "health", status: "passed", at_ms: Date.now(), message: "Dev Activity Board can render provider data." },
    ],
    evidence_refs: [
      { kind: "build_thread_turn", thread_id: "thread-m43", turn_id: "proposal-v1" },
      { kind: "host_check", check_id: "provider-capability-contract", status: "passed" },
    ],
    governance: {
      required: true,
      decision: state.governanceDecision,
    },
  });
}

function publicState(state: EnterpriseGovernanceDemoState, role: string): EnterpriseGovernanceDemoPublicState {
  return {
    stage: state.stage,
    role,
    board_items: state.boardItems,
    decisions: state.decisions,
    governance_decision: state.governanceDecision,
    assurance: state.assurance,
    published: state.published,
    permissions: permissionsFor(role),
  };
}

function permissionsFor(role: string): EnterpriseGovernanceDemoPublicState["permissions"] {
  return {
    can_propose: role === "builder",
    can_review: role === "reviewer" || role === "owner",
    can_publish: role === "operator" || role === "owner",
    can_rollback: role === "owner",
    can_operate: role === "operator" || role === "owner",
  };
}

function roleForSubject(subject: string): string {
  return Object.entries(SUBJECT_BY_ROLE).find(([, candidate]) => candidate === subject)?.[0] ?? "builder";
}

async function readJson<T>(request: Request): Promise<T> {
  return await request.json() as T;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function html(body: string): Response {
  return new Response(body, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
