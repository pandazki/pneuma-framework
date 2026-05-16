import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProductCreationHost } from "./host/product-host.js";
import { createOpencodeDevBoardDraftAgent, DEFAULT_OPENCODE_MODEL } from "./host/opencode-code-agent.js";

const workspace = process.env.PNEUMA_PRODUCT_HOST_WORKSPACE
  ?? mkdtempSync(join(tmpdir(), "pneuma-product-host-opencode-"));
const host = createProductCreationHost({
  workspace,
  base_url: "http://127.0.0.1:8895",
  draft_agent: createOpencodeDevBoardDraftAgent({
    model: process.env.PNEUMA_PRODUCT_HOST_MODEL ?? DEFAULT_OPENCODE_MODEL,
    timeout_ms: Number(process.env.PNEUMA_PRODUCT_HOST_AGENT_TIMEOUT_MS ?? "240000"),
  }),
});

try {
  const engineering = await host.createProject({
    name: "Engineering Dev Board",
    goal: "Track release work, review queues, and GitHub attention.",
    template_id: "engineering",
    builder_subject: "user:bob",
  });
  await host.requestEvolution({
    app_id: engineering.app_id,
    builder_subject: "user:bob",
    message: "Add a review queue so items can be marked needs_review and approved.",
  });
  const engineeringApproved = await host.approveEvolution({ app_id: engineering.app_id, subject: "role:reviewer" });
  if (engineeringApproved.status !== "ready_to_preview") {
    throw new Error(`Engineering board was not approved: ${JSON.stringify(engineeringApproved)}`);
  }
  await host.startPreview({ app_id: engineering.app_id });
  await host.publish({ app_id: engineering.app_id });

  const personal = await host.createProject({
    name: "Personal Focus Dev Board",
    goal: "Track GitHub attention and priority focus for daily work.",
    template_id: "personal",
    builder_subject: "user:charlie",
  });
  await host.requestEvolution({
    app_id: personal.app_id,
    builder_subject: "user:charlie",
    message: "Add a priority lane and GitHub attention list for my daily focus workflow.",
  });
  const personalApproved = await host.approveEvolution({ app_id: personal.app_id, subject: "role:reviewer" });
  if (personalApproved.status !== "ready_to_preview") {
    throw new Error(`Personal board was not approved: ${JSON.stringify(personalApproved)}`);
  }
  await host.startPreview({ app_id: personal.app_id });
  await host.publish({ app_id: personal.app_id });

  const snapshot = host.snapshot();
  console.log(JSON.stringify({
    workspace,
    model: process.env.PNEUMA_PRODUCT_HOST_MODEL ?? DEFAULT_OPENCODE_MODEL,
    projects: snapshot.projects.map((project) => ({
      app_id: project.app_id,
      status: project.status,
      current_version_id: project.current_version_id,
      active_version_id: project.active_version_id,
      modules: project.current_version?.definition.modules.map((mod) => mod.kind),
      agent_logs: project.agent_logs.map((log) => `${log.kind}: ${log.text}`).slice(-10),
    })),
  }, null, 2));
} finally {
  await host.close();
}
