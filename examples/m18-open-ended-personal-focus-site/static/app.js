const appId = "pandazki-focus-site";
let previewUrl = "";
let latestInspect = null;
let latestEvolution = null;
let latestRollout = null;
let latestActiveVersion = null;
let activeTab = "summary";

const statusEl = document.querySelector("#status");
const outputEl = document.querySelector("#output");
const iframe = document.querySelector("#preview");

const buttons = {
  create: document.querySelector("#create"),
  preview: document.querySelector("#preview-start"),
  inspect: document.querySelector("#inspect"),
  refresh: document.querySelector("#refresh-github"),
  evolve: document.querySelector("#evolve"),
  approve: document.querySelector("#approve"),
  deny: document.querySelector("#deny"),
  publishV0: document.querySelector("#publish-v0"),
  publishV1: document.querySelector("#publish-v1"),
  restart: document.querySelector("#restart"),
  rollback: document.querySelector("#rollback"),
};

buttons.create.addEventListener("click", () => run("created", async () => {
  await post("/api/host/projects", {
    app_id: appId,
    display_name: "Pandazki Focus Site",
    profile_id: "personal-focus-site-bun-sqlite",
  });
  return await startPreview();
}));
buttons.preview.addEventListener("click", () => run("preview", startPreview));
buttons.inspect.addEventListener("click", () => run("inspect", inspect));
buttons.refresh.addEventListener("click", () => run("github refreshed", async () => {
  const result = await post(`/api/host/projects/${appId}/github-attention/refresh`, {});
  await inspect();
  return result;
}));
buttons.evolve.addEventListener("click", () => run("proposal ready", async () => {
  const result = await post(`/api/host/projects/${appId}/evolution/start`, {
    builder_user_id: "builder-alice",
    builder_request: "Make GitHub attention more useful and highlight the top 3 things I should handle.",
  });
  latestEvolution = result.evolution;
  render();
  return result;
}));
buttons.approve.addEventListener("click", () => run("approved", async () => {
  const result = await post(`/api/host/projects/${appId}/evolution/approve`, {});
  latestEvolution = result.evolution;
  previewUrl = result.site ? previewUrl : previewUrl;
  await startPreview("v1");
  return result;
}));
buttons.deny.addEventListener("click", () => run("denied", async () => {
  const result = await post(`/api/host/projects/${appId}/evolution/deny`, {});
  latestEvolution = result.evolution;
  render();
  return result;
}));
buttons.publishV0.addEventListener("click", () => run("published v0", () => publish("v0")));
buttons.publishV1.addEventListener("click", () => run("published v1", () => publish("v1")));
buttons.restart.addEventListener("click", () => run("restarted", async () => {
  latestRollout = await post(`/api/host/projects/${appId}/restart-active`, {});
  await syncActivePublishedUrl();
  render();
  return latestRollout;
}));
buttons.rollback.addEventListener("click", () => run("rolled back", async () => {
  latestRollout = await post(`/api/host/projects/${appId}/rollback`, {});
  await syncActivePublishedUrl();
  render();
  return latestRollout;
}));

for (const tab of document.querySelectorAll(".tabs button")) {
  tab.addEventListener("click", () => {
    activeTab = tab.dataset.tab;
    document.querySelectorAll(".tabs button").forEach((node) => node.classList.toggle("active", node === tab));
    render();
  });
}

async function startPreview(versionId) {
  const result = await post(`/api/host/projects/${appId}/preview/start`, versionId ? { version_id: versionId } : {});
  previewUrl = result.preview.preview_url;
  latestActiveVersion = null;
  iframe.src = previewUrl;
  await inspect();
  return result;
}

async function inspect() {
  latestInspect = await get(`/api/host/projects/${appId}/inspect`);
  latestEvolution = latestInspect.evolution;
  render();
  return latestInspect;
}

async function publish(versionId) {
  latestRollout = await post(`/api/host/projects/${appId}/publish`, { version_id: versionId });
  await syncActivePublishedUrl();
  render();
  return latestRollout;
}

async function run(label, fn) {
  try {
    statusEl.textContent = "working";
    const result = await fn();
    statusEl.textContent = label;
    render(result);
  } catch (err) {
    statusEl.textContent = "error";
    outputEl.textContent = err instanceof Error ? err.stack || err.message : String(err);
  }
}

function render(fallback) {
  const payload = {
    summary: {
      preview_url: previewUrl,
      app_shape: latestInspect?.inspection?.ui_definition?.summary?.primary_shape,
      version: latestActiveVersion ?? latestInspect?.inspection?.ui_definition?.definition?.version,
      active_release: latestRollout?.summary?.active_candidate_id,
      github_top: latestInspect?.inspection?.github_attention?.ranked?.map((item) => ({
        repo: item.repo,
        title: item.title,
        score: item.score,
      })),
    },
    ui: latestInspect?.inspection?.ui_definition,
    github: latestInspect?.inspection?.github_attention,
    transcript: latestEvolution?.transcript,
    rollout: latestRollout,
  };
  outputEl.textContent = JSON.stringify(payload[activeTab] ?? fallback ?? payload.summary, null, 2);
}

async function syncActivePublishedUrl() {
  const activeUrl = latestRollout?.summary?.active_url;
  if (activeUrl) {
    previewUrl = activeUrl;
    iframe.src = activeUrl;
    latestActiveVersion = versionFromCandidate(latestRollout.summary.active_candidate_id);
  }
}

function versionFromCandidate(candidateId) {
  const match = candidateId?.match(/-(v[0-9]+)$/);
  return match ? match[1] : null;
}

async function get(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`GET ${path} failed: ${await response.text()}`);
  return await response.json();
}

async function post(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`POST ${path} failed: ${await response.text()}`);
  return await response.json();
}

render();
