const state = {
  story: null,
  locale: new URLSearchParams(window.location.search).get("lang") === "zh-CN" ? "zh-CN" : "en",
  activeStepId: null,
  activeInspector: "agent_package",
};

const copy = {
  en: {
    pageTitle: "M24 RC Pressure Walkthrough",
    pageEyebrow: "pneuma-framework / M24 evidence",
    loading: "Loading",
    passed: "RC pressure passed",
    blocked: "RC pressure blocked",
    scenario: "Scenario",
    agentBoundary: "Agent boundary",
    providerBranching: "Provider branching",
    providerAllowed: "allowed",
    providerForbidden: "forbidden",
    failClosedChecks: "Fail-closed checks",
    blockedProbes: "blocked probes",
    storyRail: "story rail",
    builderJourney: "Builder journey",
    decision: "decision",
    allowedVerified: "allowed / verified",
    blockedDecision: "blocked",
    contractRefs: "contract refs",
    evidence: "Evidence",
    failureProbes: "Failure probes",
    contractInspector: "contract inspector",
    executableInputs: "Executable inputs",
    inspectorLabels: {
      agent_package: "Agent Package",
      provider_capabilities: "Provider Matrix",
      share_artifact: "Share Artifact",
      sharing_governance: "Governance",
      credential_evidence: "Credential Evidence",
    },
  },
  "zh-CN": {
    pageTitle: "M24 RC Pressure 中文演示",
    pageEyebrow: "pneuma-framework / M24 证据",
    loading: "加载中",
    passed: "RC pressure 已通过",
    blocked: "RC pressure 被阻断",
    scenario: "场景",
    agentBoundary: "Agent 边界",
    providerBranching: "Provider 分支",
    providerAllowed: "允许",
    providerForbidden: "禁止",
    failClosedChecks: "Fail-closed 检查",
    blockedProbes: "个阻断探针",
    storyRail: "故事线",
    builderJourney: "Builder 旅程",
    decision: "判断",
    allowedVerified: "允许 / 已验证",
    blockedDecision: "已阻断",
    contractRefs: "契约引用",
    evidence: "证据",
    failureProbes: "失败探针",
    contractInspector: "契约检查器",
    executableInputs: "可执行输入",
    inspectorLabels: {
      agent_package: "Agent Package",
      provider_capabilities: "Provider Matrix",
      share_artifact: "Share Artifact",
      sharing_governance: "Governance",
      credential_evidence: "Credential Evidence",
    },
  },
};

async function loadStory() {
  renderChrome();
  const suffix = state.locale === "zh-CN" ? "?lang=zh-CN" : "";
  const response = await fetch(`/api/story${suffix}`);
  if (!response.ok) throw new Error(`story load failed: HTTP ${response.status}`);
  state.story = await response.json();
  state.activeStepId = state.story.steps[0]?.id ?? null;
  state.activeInspector = state.story.steps[0]?.inspection_focus ?? "agent_package";
  renderStory();
}

export function renderStory() {
  if (!state.story) return;
  renderSummary();
  renderStoryRail();
  renderActiveStep();
  renderInspectorTabs();
  renderInspector();
}

function renderChrome() {
  const labels = copy[state.locale];
  document.documentElement.lang = state.locale === "zh-CN" ? "zh-CN" : "en";
  document.title = labels.pageTitle;
  text("#page-title", labels.pageTitle);
  text("#page-eyebrow", labels.pageEyebrow);
  text("#overall-status", labels.loading);
  text("#label-scenario", labels.scenario);
  text("#label-agent-boundary", labels.agentBoundary);
  text("#label-provider-branching", labels.providerBranching);
  text("#label-failure-count", labels.failClosedChecks);
  text("#story-eyebrow", labels.storyRail);
  text("#story-heading", labels.builderJourney);
  text("#label-decision", labels.decision);
  text("#label-contracts", labels.contractRefs);
  text("#evidence-heading", labels.evidence);
  text("#failure-heading", labels.failureProbes);
  text("#inspector-eyebrow", labels.contractInspector);
  text("#inspector-heading", labels.executableInputs);
  document.querySelector("#english-link").classList.toggle("active", state.locale === "en");
  document.querySelector("#chinese-link").classList.toggle("active", state.locale === "zh-CN");
}

function renderSummary() {
  const story = state.story;
  const labels = copy[state.locale];
  const dot = document.querySelector("#overall-dot");
  dot.classList.toggle("ok", story.report.ok);
  text("#overall-status", story.report.ok ? labels.passed : labels.blocked);
  text("#scenario-label", story.scenario_label);
  text("#agent-boundary", story.report.agent_context_visible_to_builder_agent.join(" / "));
  text("#provider-branching", story.report.provider_specific_branching_allowed ? labels.providerAllowed : labels.providerForbidden);
  text("#failure-count", state.locale === "zh-CN"
    ? `${story.failure_cases.length} ${labels.blockedProbes}`
    : `${story.failure_cases.length} ${labels.blockedProbes}`);
}

function renderStoryRail() {
  const rail = document.querySelector("#story-rail");
  rail.replaceChildren(...state.story.steps.map((step, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `story-step${step.id === state.activeStepId ? " active" : ""}`;
    button.dataset.stepId = step.id;
    button.addEventListener("click", () => {
      state.activeStepId = step.id;
      state.activeInspector = step.inspection_focus;
      renderStory();
    });

    const count = document.createElement("span");
    count.className = "step-index";
    count.textContent = String(index + 1).padStart(2, "0");

    const copy = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = step.actor;
    const subtitle = document.createElement("span");
    subtitle.textContent = step.title;
    copy.append(title, subtitle);

    button.append(count, copy);
    return button;
  }));
}

function renderActiveStep() {
  const step = activeStep();
  const labels = copy[state.locale];
  text("#active-actor", step.actor);
  text("#active-title", step.title);
  text("#active-intent", step.intent);
  text("#active-result", step.result === "passed" ? labels.allowedVerified : labels.blockedDecision);
  text("#active-contracts", step.contract_refs.join(" + "));

  const resultBand = document.querySelector("#result-band");
  resultBand.classList.toggle("passed", step.result === "passed");
  resultBand.classList.toggle("blocked", step.result === "blocked");

  const evidence = document.querySelector("#active-evidence");
  evidence.replaceChildren(...step.evidence.map((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    return li;
  }));

  const failures = document.querySelector("#failure-list");
  failures.replaceChildren(...state.story.failure_cases.map((entry, index) => {
    const details = document.createElement("details");
    details.className = "failure-case";
    details.open = index === 0;

    const summary = document.createElement("summary");
    summary.textContent = entry.title;

    const body = document.createElement("div");
    for (const issue of entry.issues) {
      const code = document.createElement("code");
      code.textContent = issue;
      body.append(code);
    }
    for (const line of entry.evidence) {
      const note = document.createElement("span");
      note.textContent = line;
      body.append(note);
    }

    details.append(summary, body);
    return details;
  }));
}

function renderInspectorTabs() {
  const tabs = document.querySelector("#inspector-tabs");
  tabs.replaceChildren(...Object.entries(copy[state.locale].inspectorLabels).map(([key, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tab${key === state.activeInspector ? " active" : ""}`;
    button.textContent = label;
    button.addEventListener("click", () => {
      state.activeInspector = key;
      renderInspectorTabs();
      renderInspector();
    });
    return button;
  }));
}

function renderInspector() {
  const value = state.story.inspector[state.activeInspector];
  document.querySelector("#json-view").textContent = JSON.stringify(value, null, 2);
}

function activeStep() {
  return state.story.steps.find((step) => step.id === state.activeStepId) ?? state.story.steps[0];
}

function text(selector, value) {
  document.querySelector(selector).textContent = value;
}

loadStory().catch((err) => {
  document.querySelector("#overall-status").textContent = err instanceof Error ? err.message : String(err);
});
