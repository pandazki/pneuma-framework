const state = {
  project: null,
  transcript: [
    { kind: "host", text: "Create a Team Notes Board, then ask the Build-phase Agent for a review queue evolution." },
  ],
};

const requiredStates = [
  "awaiting_reviewer_approval",
  "preview_data_rehearsal_failed",
  "published",
  "rolled_back",
];

const els = {
  statusDot: document.getElementById("statusDot"),
  statusText: document.getElementById("statusText"),
  thread: document.getElementById("thread"),
  notesTable: document.getElementById("notesTable"),
  versionPill: document.getElementById("versionPill"),
  reviewHeader: document.getElementById("reviewHeader"),
  reviewQueue: document.getElementById("reviewQueue"),
  queueSummary: document.getElementById("queueSummary"),
  proposalEvidence: document.getElementById("proposalEvidence"),
  rehearsalEvidence: document.getElementById("rehearsalEvidence"),
  runtimeEvidence: document.getElementById("runtimeEvidence"),
  failureProbe: document.getElementById("failureProbe"),
  createProject: document.getElementById("createProject"),
  requestChange: document.getElementById("requestChange"),
  builderApprove: document.getElementById("builderApprove"),
  reviewerApprove: document.getElementById("reviewerApprove"),
  startPreview: document.getElementById("startPreview"),
  publish: document.getElementById("publish"),
  rollback: document.getElementById("rollback"),
};

els.createProject.addEventListener("click", async () => {
  await mutate("/api/project/create");
  state.transcript.push({ kind: "host", text: "v0 created with two notes and a baseline local release." });
  await refresh();
});

els.requestChange.addEventListener("click", async () => {
  const result = await mutate("/api/evolution/request");
  state.transcript.push({ kind: "user", text: "Add a review queue so notes can be marked needs_review and approved." });
  state.transcript.push({ kind: "agent", text: `Proposal ${result.proposal_id}: source change plus data_migration. Reviewer approval required.` });
  await refresh();
});

els.builderApprove.addEventListener("click", async () => {
  const result = await mutate("/api/evolution/approve", { subject: "user:bob" });
  state.transcript.push({ kind: "host", text: `Bob approval blocked: ${result.reason}.` });
  await refresh();
});

els.reviewerApprove.addEventListener("click", async () => {
  const result = await mutate("/api/evolution/approve", { subject: "user:alice" });
  state.transcript.push({ kind: "host", text: `Alice approved. Preview Data Rehearsal receipt: ${result.data_receipt?.receipt_id}.` });
  await refresh();
});

els.startPreview.addEventListener("click", async () => {
  const result = await mutate("/api/preview/start");
  state.transcript.push({ kind: "host", text: `Preview runtime ready at ${result.url}.` });
  await refresh();
});

els.publish.addEventListener("click", async () => {
  const result = await mutate("/api/publish");
  state.transcript.push({ kind: "host", text: `Published v1 at ${result.url}.` });
  await refresh();
});

els.rollback.addEventListener("click", async () => {
  const result = await mutate("/api/rollback");
  state.transcript.push({ kind: "host", text: `Rollback completed. Active version is ${result.active_version_id}.` });
  await refresh();
});

await refresh();

async function mutate(path, body = undefined) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function refresh() {
  const response = await fetch("/api/state");
  const payload = await response.json();
  state.project = payload.project ?? state.project;
  render();
}

function render() {
  const project = state.project;
  const status = project?.status ?? "idle";
  els.statusText.textContent = labelForStatus(status);
  els.statusDot.className = `status-dot ${statusClass(status)}`;
  renderThread();
  renderNotes(project);
  renderEvidence(project);
  setControls(project);
}

function renderThread() {
  els.thread.replaceChildren(...state.transcript.map((turn) => {
    const li = document.createElement("li");
    li.className = turn.kind;
    li.textContent = turn.text;
    return li;
  }));
}

function renderNotes(project) {
  const notes = notesFor(project);
  els.versionPill.textContent = project ? `${project.active_version_id} / working ${project.version_id}` : "No project";
  els.reviewHeader.hidden = !notes.some((note) => "review_status" in note);
  els.notesTable.replaceChildren(...notes.map((note) => {
    const tr = document.createElement("tr");
    tr.append(cell(note.title), cell(note.owner), cell(note.status), cell(note.review_status ?? "pending schema"));
    return tr;
  }));
  if (notes.length === 0) {
    const tr = document.createElement("tr");
    const td = cell("Create v0 to seed the app.");
    td.colSpan = 4;
    tr.append(td);
    els.notesTable.append(tr);
  }
  const reviewCount = notes.filter((note) => note.review_status === "needs_review").length;
  els.queueSummary.textContent = project?.version_id === "v1"
    ? `${reviewCount} notes need review. Existing notes received review_status=not_required.`
    : "The queue appears after reviewer approval and data rehearsal.";
}

function renderEvidence(project) {
  const pending = project?.pending_evolution;
  els.proposalEvidence.textContent = pending
    ? `${pending.proposal_id}, ${pending.review_packet.risk_classification.join(" + ")}`
    : "Not proposed";
  els.rehearsalEvidence.textContent = project?.data_receipt
    ? `${project.data_receipt.receipt_id}, ${project.data_receipt.steps[0]?.message ?? "completed"}`
    : "No receipt";
  els.runtimeEvidence.textContent = project?.published_url
    ? `Published at ${project.published_url}`
    : "Not published";
  els.failureProbe.textContent = project?.last_block_reason
    ? `Last blocked state: ${project.last_block_reason}`
    : "preview_data_rehearsal_failed is blocked before publish";
}

function setControls(project) {
  const status = project?.status;
  els.createProject.disabled = Boolean(project);
  els.requestChange.disabled = status !== "created";
  els.builderApprove.disabled = status !== "awaiting_reviewer_approval";
  els.reviewerApprove.disabled = status !== "awaiting_reviewer_approval" && status !== "blocked";
  els.startPreview.disabled = status !== "ready_to_preview";
  els.publish.disabled = status !== "previewing";
  els.rollback.disabled = status !== "published";
}

function notesFor(project) {
  if (!project) return [];
  if (project.version_id === "v1" && project.notes_v1) return project.notes_v1;
  return project.notes_v0 ?? [];
}

function cell(text) {
  const td = document.createElement("td");
  td.textContent = text;
  return td;
}

function labelForStatus(status) {
  const labels = {
    idle: "Idle",
    created: "v0 created",
    awaiting_reviewer_approval: "Awaiting reviewer approval",
    blocked: "Blocked",
    ready_to_preview: "Ready to preview",
    previewing: "Previewing",
    published: "Published",
    rolled_back: "Rolled back",
  };
  return labels[status] ?? status;
}

function statusClass(status) {
  if (status === "blocked") return "blocked";
  if (["ready_to_preview", "previewing", "published", "rolled_back"].includes(status)) return "active";
  return "";
}

void requiredStates;
