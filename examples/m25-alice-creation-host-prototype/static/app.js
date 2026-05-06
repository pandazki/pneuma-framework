const state = {
  model: null,
  activeStageId: null,
};

async function loadModel() {
  const response = await fetch("/api/prototype");
  if (!response.ok) throw new Error(`prototype load failed: HTTP ${response.status}`);
  state.model = await response.json();
  state.activeStageId = state.model.stages[0]?.id ?? null;
  render();
}

function render() {
  if (!state.model) return;
  const active = activeStage();
  renderSummary(active);
  renderStages();
  renderFocus(active);
  renderGeneratedApp();
  renderEvidence(active);
  renderTranscript();
  renderInspector(active.inspector_focus);
}

function renderSummary(active) {
  const completed = state.model.completed_stage_ids.length;
  const total = state.model.stages.length;
  const rc = document.querySelector("#rc-state");
  rc.textContent = state.model.rc_ready ? "RC path ready" : "Prototype in progress";
  rc.classList.toggle("ready", state.model.rc_ready);
  text("#north-question", active.developer_question);
  text("#north-shift", active.mental_shift);
  text("#completion", `${completed}/${total}`);
}

function renderStages() {
  const list = document.querySelector("#stage-list");
  list.replaceChildren(...state.model.stages.map((stage) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = [
      "stage-button",
      stage.status === "completed" ? "completed" : "",
      stage.id === state.activeStageId ? "active" : "",
    ].filter(Boolean).join(" ");
    button.addEventListener("click", () => {
      state.activeStageId = stage.id;
      render();
    });

    const count = document.createElement("span");
    count.className = "stage-number";
    count.textContent = String(stage.order).padStart(2, "0");

    const copy = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = stage.title;
    const question = document.createElement("span");
    question.textContent = stage.developer_question;
    copy.append(title, question);

    const pill = document.createElement("span");
    pill.className = "stage-pill";
    pill.textContent = stage.status;

    button.append(count, copy, pill);
    return button;
  }));
}

function renderFocus(stage) {
  text("#active-order", `stage ${String(stage.order).padStart(2, "0")}`);
  text("#active-title", stage.title);
  text("#active-question", stage.developer_question);
  text("#active-shift", stage.mental_shift);
  text("#active-action", stage.alice_action);
  text("#active-contracts", stage.framework_contracts.join(" + "));

  const runStage = document.querySelector("#run-stage");
  runStage.disabled = stage.status === "completed";
  runStage.textContent = stage.status === "completed" ? "已完成" : "执行这一步";
}

function renderGeneratedApp() {
  const app = state.model.generated_app;
  text("#generated-title", app.display_name);
  text("#generated-version", `${app.app_id}@${app.current_version_id}`);
  const grid = document.querySelector("#module-grid");
  grid.replaceChildren(...app.modules.map((module) => {
    const item = document.createElement("div");
    item.className = "module";
    const title = document.createElement("strong");
    title.textContent = module.label;
    const local = document.createElement("span");
    local.textContent = `local profile: ${module.local_profile}`;
    const remote = document.createElement("span");
    remote.textContent = `remote profile: ${module.remote_profile}`;
    const capability = document.createElement("span");
    capability.textContent = `capability: ${module.capability_id}`;
    item.append(title, local, remote, capability);
    return item;
  }));
}

function renderEvidence(stage) {
  const activeIds = new Set(stage.evidence_ids);
  const list = document.querySelector("#evidence-list");
  list.replaceChildren(...state.model.evidence.map((entry) => {
    const item = document.createElement("article");
    item.className = [
      "evidence",
      entry.status,
      activeIds.has(entry.id) ? "active" : "",
    ].filter(Boolean).join(" ");

    const dot = document.createElement("span");
    dot.className = "evidence-dot";
    const body = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = entry.label;
    const source = document.createElement("span");
    source.textContent = entry.source;
    const detail = document.createElement("p");
    detail.textContent = entry.detail;
    body.append(title, source, detail);
    item.append(dot, body);
    return item;
  }));
}

function renderTranscript() {
  const container = document.querySelector("#transcript");
  container.replaceChildren(...state.model.transcript.map((turn) => {
    const item = document.createElement("article");
    item.className = "turn";
    const speaker = document.createElement("strong");
    speaker.textContent = turn.speaker;
    const textNode = document.createElement("p");
    textNode.textContent = turn.text;
    item.append(speaker, textNode);
    return item;
  }));
}

function renderInspector(key) {
  document.querySelector("#json-view").textContent = JSON.stringify(state.model.inspector[key], null, 2);
}

async function post(url) {
  const response = await fetch(url, { method: "POST" });
  if (!response.ok) throw new Error(`POST ${url} failed: HTTP ${response.status}`);
  state.model = await response.json();
  if (!state.model.stages.some((stage) => stage.id === state.activeStageId)) {
    state.activeStageId = state.model.stages[0]?.id ?? null;
  }
  render();
}

function activeStage() {
  return state.model.stages.find((stage) => stage.id === state.activeStageId) ?? state.model.stages[0];
}

function text(selector, value) {
  document.querySelector(selector).textContent = value;
}

document.querySelector("#run-stage").addEventListener("click", async () => {
  const stage = activeStage();
  await post(`/api/prototype/stages/${encodeURIComponent(stage.id)}/run`);
});

document.querySelector("#run-all").addEventListener("click", async () => {
  await post("/api/prototype/run-all");
});

document.querySelector("#reset").addEventListener("click", async () => {
  await post("/api/prototype/reset");
  state.activeStageId = state.model.stages[0]?.id ?? null;
  render();
});

loadModel().catch((err) => {
  document.querySelector("#rc-state").textContent = err instanceof Error ? err.message : String(err);
});
