import type { EnterpriseGovernanceDemoPublicState } from "./server.js";

export function renderEnterpriseGovernanceDemoPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>M43 Enterprise Governance Demo</title>
    <style>
      :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { margin: 0; background: #f7f8fb; color: #172033; }
      main { max-width: 1180px; margin: 0 auto; padding: 32px; }
      header { display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; margin-bottom: 28px; }
      h1 { margin: 0; font-size: 30px; letter-spacing: 0; }
      p { color: #4e5c72; line-height: 1.55; }
      .grid { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 18px; }
      .panel { background: #fff; border: 1px solid #dfe5ef; border-radius: 8px; padding: 18px; box-shadow: 0 8px 22px rgb(27 39 62 / 6%); }
      .toolbar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
      button, select { border: 1px solid #c9d2e2; background: #fff; color: #172033; border-radius: 6px; padding: 8px 10px; font: inherit; }
      button { cursor: pointer; }
      button.primary { background: #174ea6; color: white; border-color: #174ea6; }
      button.danger { background: #9f1239; color: white; border-color: #9f1239; }
      button:disabled { opacity: 0.45; cursor: not-allowed; }
      .status { display: inline-flex; padding: 4px 8px; border-radius: 999px; background: #e7efff; color: #174ea6; font-size: 12px; font-weight: 700; }
      .list { display: grid; gap: 10px; }
      .item { border: 1px solid #e1e6ef; border-radius: 8px; padding: 10px; background: #fbfcff; }
      .muted { color: #64748b; font-size: 13px; }
      pre { margin: 0; white-space: pre-wrap; word-break: break-word; background: #101827; color: #e5eefc; padding: 14px; border-radius: 8px; font-size: 12px; line-height: 1.45; }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <h1>Enterprise Governance Demo</h1>
          <p>One Builder + Agent business change moves through Reviewer approval, Build Assurance readiness, publish, and Owner rollback. GitHub public data and mock Linear data feed the proposed Dev Activity Board.</p>
        </div>
        <span class="status" id="stage">loading</span>
      </header>
      <section class="panel">
        <div class="toolbar">
          <select id="role">
            <option value="builder">Builder Bob</option>
            <option value="reviewer">Reviewer Rachel</option>
            <option value="owner">Owner Olivia</option>
            <option value="operator">Operator Otto</option>
            <option value="end_user">End User Erin</option>
          </select>
          <button class="primary" data-action="propose">Propose</button>
          <button data-action="self">Builder self-approve</button>
          <button data-action="review">Reviewer approve</button>
          <button class="primary" data-action="publish">Publish</button>
          <button class="danger" data-action="rollback">Owner rollback</button>
        </div>
      </section>
      <section class="grid" style="margin-top: 18px;">
        <div class="panel">
          <h2>Published App</h2>
          <div id="app" class="list"></div>
        </div>
        <div class="panel">
          <h2>Governance Evidence</h2>
          <pre id="evidence"></pre>
        </div>
      </section>
    </main>
    <script>
      const role = document.querySelector("#role");
      const stage = document.querySelector("#stage");
      const app = document.querySelector("#app");
      const evidence = document.querySelector("#evidence");
      const subjectByRole = {
        builder: "user:bob",
        reviewer: "user:rachel",
        owner: "user:olivia",
        operator: "user:otto",
        end_user: "user:erin",
      };
      async function post(path, body = {}) {
        const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        return res.json();
      }
      async function refresh() {
        const res = await fetch("/api/state?role=" + role.value);
        render(await res.json());
      }
      function render(state) {
        stage.textContent = state.stage;
        app.innerHTML = state.published.active
          ? state.board_items.map((item) => '<div class="item"><strong>' + escapeHtml(item.title) + '</strong><div class="muted">' + escapeHtml(item.provider) + ' · ' + escapeHtml(item.url ?? item.status ?? '') + '</div></div>').join("")
          : '<div class="item muted">No published version is active.</div>';
        evidence.textContent = JSON.stringify(state, null, 2);
      }
      function escapeHtml(text) { return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
      document.querySelector('[data-action="propose"]').onclick = async () => { render(await post("/api/propose")); };
      document.querySelector('[data-action="self"]').onclick = async () => { render(await post("/api/decision", { subject: "user:bob", decision: "approved" })); };
      document.querySelector('[data-action="review"]').onclick = async () => { render(await post("/api/decision", { subject: "user:rachel", decision: "approved" })); };
      document.querySelector('[data-action="publish"]').onclick = async () => { render(await post("/api/publish")); };
      document.querySelector('[data-action="rollback"]').onclick = async () => { render(await post("/api/rollback", { subject: "user:olivia" })); };
      role.onchange = refresh;
      refresh();
    </script>
  </body>
</html>`;
}

export function summarizePublicState(state: EnterpriseGovernanceDemoPublicState): string {
  return [
    `stage=${state.stage}`,
    `published=${state.published.active}`,
    `readiness=${state.assurance?.readiness ?? "none"}`,
    `governance=${state.governance_decision?.reason_code ?? "none"}`,
  ].join(" ");
}
