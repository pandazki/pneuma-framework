import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOpencodeReviewQueueDraftAgent, DEFAULT_OPENCODE_MODEL } from "./host/opencode-code-agent.js";
import { createReferenceHost } from "./host/reference-host.js";

const workspace = process.env.PNEUMA_REFERENCE_HOST_WORKSPACE
  ?? mkdtempSync(join(tmpdir(), "pneuma-reference-host-opencode-"));
const keepWorkspace = process.env.PNEUMA_KEEP_REFERENCE_HOST_WORKSPACE === "1";
const model = process.env.PNEUMA_REFERENCE_HOST_MODEL ?? DEFAULT_OPENCODE_MODEL;

const draftAgent = createOpencodeReviewQueueDraftAgent({
  model,
  timeout_ms: Number(process.env.PNEUMA_REFERENCE_HOST_AGENT_TIMEOUT_MS ?? "180000"),
});
const host = createReferenceHost({ workspace, draft_agent: draftAgent });

try {
  await host.createProject({
    app_id: "team-notes",
    builder_user_id: "user:bob",
  });
  const proposal = await host.requestReviewQueueEvolution({
    app_id: "team-notes",
    builder_subject: "user:bob",
    message: "Add a review queue so notes can be marked needs_review and approved.",
  });
  const blocked = await host.approveEvolution({
    app_id: "team-notes",
    proposal_id: proposal.proposal_id,
    subject: "user:bob",
  });
  const approved = await host.approveEvolution({
    app_id: "team-notes",
    proposal_id: proposal.proposal_id,
    subject: "user:alice",
  });
  const preview = await host.startPreview({ app_id: "team-notes" });
  const published = await host.publish({ app_id: "team-notes" });
  const rolledBack = await host.rollback({ app_id: "team-notes" });
  const state = host.state();
  console.log(JSON.stringify({
    ok: true,
    model,
    workspace,
    proposal_status: proposal.status,
    bob_decision: blocked,
    alice_decision: approved.status,
    code_agent_receipt: state?.pending_evolution?.code_agent_receipt,
    preview,
    published_url: published.url,
    rolled_back: rolledBack,
  }, null, 2));
} finally {
  await host.close();
  if (!keepWorkspace && !process.env.PNEUMA_REFERENCE_HOST_WORKSPACE) {
    rmSync(workspace, { recursive: true, force: true });
  }
}
