import * as React from "react";
import type { CSSProperties } from "react";
import type { PermissionLedgerRequestRecord } from "@pneuma-framework/core";

export interface GovernanceEvidencePanelProps {
  pending: readonly PermissionLedgerRequestRecord[];
  recent: readonly PermissionLedgerRequestRecord[];
}

export function formatPrincipal(principal: PermissionLedgerRequestRecord["requested_principal"]): string {
  if (!principal) return "unknown";
  return `${principal.kind}:${principal.id}`;
}

export function formatTarget(target: PermissionLedgerRequestRecord["target"], fallback?: string): string {
  if (!target) return fallback ?? "target:unknown";
  return `${target.kind}:${target.id ?? target.fingerprint ?? "unknown"}`;
}

export function formatPermissionStatus(record: PermissionLedgerRequestRecord): string {
  if (record.status === "pending" && record.live) return "Pending, actionable";
  if (record.status === "pending") return "Pending, stale";
  if (record.status === "denied") return "Denied";
  if (record.status === "failed") return "Failed";
  if (record.status === "expired") return "Expired";
  if (record.status === "completed") return "Completed";
  if (record.status === "authorized") return "Authorized";
  return "Allowed";
}

export function GovernanceEvidencePanel({ pending, recent }: GovernanceEvidencePanelProps) {
  const records = [...pending, ...recent];
  return (
    <section aria-label="Governance evidence" style={panelStyle}>
      <div style={headerStyle}>
        <div style={headerCopyStyle}>
          <div style={eyebrowStyle}>Governance evidence</div>
          <h2 style={titleStyle}>AI-created changes need proof</h2>
        </div>
        <div style={countStyle}>{pending.length} pending</div>
      </div>
      {records.length === 0 ? (
        <div style={emptyStyle}>No governance evidence yet.</div>
      ) : (
        <div style={listStyle}>
          {records.map((record) => <EvidenceRow key={record.prompt_id} record={record} />)}
        </div>
      )}
    </section>
  );
}

function EvidenceRow({ record }: { readonly record: PermissionLedgerRequestRecord }) {
  const status = formatPermissionStatus(record);
  const tokenText = record.approval_token_hash ? `token hash ${record.approval_token_hash}` : "no token issued";
  const approvedBy = record.approved_by ? formatBuilder(record.approved_by) : "not approved";
  const decision = record.decision ? `decision ${record.decision}` : "awaiting decision";
  return (
    <article style={rowStyle}>
      <div style={rowTopStyle}>
        <span style={{ ...statusStyle, ...statusTone(record) }}>{status}</span>
        <span style={toolStyle}>{record.tool}</span>
      </div>
      <div style={primaryLineStyle}>{record.capability ?? "capability:unknown"}</div>
      <div style={targetStyle}>{formatTarget(record.target, record.target_fingerprint)}</div>
      <dl style={evidenceGridStyle}>
        <EvidencePair label="Proposed by" value={formatPrincipal(record.requested_principal)} />
        <EvidencePair label="Approved by" value={approvedBy} />
        <EvidencePair label="Executed by" value={formatPrincipal(record.execution_principal)} />
        <EvidencePair label="Decision" value={decision} />
        <EvidencePair label="Authorization" value={record.authorization_reason_code ?? "not executed"} />
        <EvidencePair label="Token" value={tokenText} />
      </dl>
    </article>
  );
}

function EvidencePair({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div style={pairStyle}>
      <dt style={pairLabelStyle}>{label}</dt>
      <dd style={pairValueStyle}>{value}</dd>
    </div>
  );
}

function formatBuilder(builder: { readonly kind: "builder"; readonly id: string }): string {
  return `${builder.kind}:${builder.id}`;
}

function statusTone(record: PermissionLedgerRequestRecord): CSSProperties {
  if (record.status === "pending" && record.live) return liveStatusStyle;
  if (record.status === "pending") return staleStatusStyle;
  if (record.status === "completed" || record.status === "authorized" || record.status === "allowed") return completeStatusStyle;
  if (record.status === "denied" || record.status === "failed" || record.status === "expired") return blockedStatusStyle;
  return neutralStatusStyle;
}

const panelStyle: CSSProperties = {
  border: "1px solid oklch(88% 0.014 70)",
  borderRadius: 8,
  background: "oklch(98% 0.009 78)",
  color: "oklch(24% 0.018 74)",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  overflow: "hidden",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
  padding: "16px 18px 14px",
  borderBottom: "1px solid oklch(90% 0.012 70)",
};

const headerCopyStyle: CSSProperties = {
  display: "grid",
  gap: 4,
};

const eyebrowStyle: CSSProperties = {
  color: "oklch(48% 0.075 55)",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0,
  textTransform: "uppercase",
};

const titleStyle: CSSProperties = {
  margin: 0,
  color: "oklch(22% 0.02 74)",
  fontSize: 16,
  fontWeight: 700,
  lineHeight: 1.25,
};

const countStyle: CSSProperties = {
  flex: "0 0 auto",
  padding: "4px 8px",
  border: "1px solid oklch(84% 0.018 70)",
  borderRadius: 999,
  color: "oklch(39% 0.03 70)",
  background: "oklch(96% 0.014 72)",
  fontSize: 12,
  fontWeight: 650,
  lineHeight: 1.2,
};

const emptyStyle: CSSProperties = {
  padding: "16px 18px",
  color: "oklch(48% 0.014 70)",
  fontSize: 13,
};

const listStyle: CSSProperties = {
  display: "grid",
};

const rowStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  padding: "14px 18px 16px",
  borderTop: "1px solid oklch(92% 0.01 70)",
  background: "oklch(99% 0.006 78)",
};

const rowTopStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};

const statusStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 22,
  padding: "3px 8px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1.2,
};

const liveStatusStyle: CSSProperties = {
  color: "oklch(38% 0.09 145)",
  background: "oklch(94% 0.035 145)",
  border: "1px solid oklch(82% 0.045 145)",
};

const staleStatusStyle: CSSProperties = {
  color: "oklch(42% 0.035 75)",
  background: "oklch(94% 0.018 78)",
  border: "1px solid oklch(84% 0.018 78)",
};

const completeStatusStyle: CSSProperties = {
  color: "oklch(38% 0.075 170)",
  background: "oklch(94% 0.03 170)",
  border: "1px solid oklch(82% 0.04 170)",
};

const blockedStatusStyle: CSSProperties = {
  color: "oklch(42% 0.12 28)",
  background: "oklch(95% 0.028 28)",
  border: "1px solid oklch(84% 0.05 28)",
};

const neutralStatusStyle: CSSProperties = {
  color: "oklch(38% 0.024 260)",
  background: "oklch(95% 0.018 260)",
  border: "1px solid oklch(84% 0.026 260)",
};

const toolStyle: CSSProperties = {
  color: "oklch(48% 0.014 70)",
  fontSize: 12,
  fontVariantNumeric: "tabular-nums",
};

const primaryLineStyle: CSSProperties = {
  color: "oklch(24% 0.018 74)",
  fontSize: 14,
  fontWeight: 700,
  lineHeight: 1.35,
};

const targetStyle: CSSProperties = {
  color: "oklch(42% 0.018 74)",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: 12,
  lineHeight: 1.45,
  overflowWrap: "anywhere",
};

const evidenceGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: "8px 12px",
  margin: 0,
};

const pairStyle: CSSProperties = {
  display: "grid",
  gap: 2,
  minWidth: 0,
};

const pairLabelStyle: CSSProperties = {
  color: "oklch(52% 0.012 70)",
  fontSize: 11,
  fontWeight: 650,
  lineHeight: 1.2,
};

const pairValueStyle: CSSProperties = {
  margin: 0,
  color: "oklch(31% 0.016 74)",
  fontSize: 12,
  lineHeight: 1.35,
  overflowWrap: "anywhere",
};
