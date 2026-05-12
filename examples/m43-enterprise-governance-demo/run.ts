import { createEnterpriseGovernanceDemoServer } from "./server.js";

const server = createEnterpriseGovernanceDemoServer();

try {
  const proposed = await post("/api/propose");
  if (proposed.stage !== "awaiting_reviewer") throw new Error("expected awaiting_reviewer after propose");
  process.stdout.write("m43 propose: awaiting reviewer\n");

  const selfApproval = await post("/api/decision", { subject: "user:bob", decision: "approved" });
  if (selfApproval.governance_decision.allowed !== false) throw new Error("expected self approval to be denied");
  process.stdout.write("m43 self approval: denied\n");

  const reviewerApproval = await post("/api/decision", { subject: "user:rachel", decision: "approved" });
  if (reviewerApproval.governance_decision.allowed !== true) throw new Error("expected reviewer approval to allow");
  if (reviewerApproval.assurance.readiness !== "ready_to_publish") throw new Error("expected ready_to_publish");
  process.stdout.write("m43 reviewer approval: allowed\n");

  const published = await post("/api/publish");
  if (published.stage !== "published" || published.published.active !== true) {
    throw new Error("expected active published app");
  }
  process.stdout.write("m43 publish: active\n");

  const operatorState = await get("/api/state?role=operator");
  if (operatorState.permissions.can_operate !== true) throw new Error("expected operator visibility");

  const endUserState = await get("/api/state?role=end_user");
  if (endUserState.published.active !== true || endUserState.board_items.length === 0) {
    throw new Error("expected end user to see published board items");
  }

  const rolledBack = await post("/api/rollback", { subject: "user:olivia" });
  if (rolledBack.stage !== "rolled_back" || rolledBack.published.active !== false) {
    throw new Error("expected owner rollback to complete");
  }
  process.stdout.write("m43 rollback: completed\n");
} finally {
  server.stop();
}

async function post(path: string, body: unknown = {}) {
  const response = await fetch(`${server.url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok && response.status !== 409) {
    throw new Error(`${path} failed: ${response.status} ${await response.text()}`);
  }
  return await response.json();
}

async function get(path: string) {
  const response = await fetch(`${server.url}${path}`);
  if (!response.ok) throw new Error(`${path} failed: ${response.status}`);
  return await response.json();
}
