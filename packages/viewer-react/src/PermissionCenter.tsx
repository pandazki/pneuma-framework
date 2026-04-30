import * as React from "react";
import type { CSSProperties } from "react";
import type {
  DefinitionRepairStatus,
  PermissionLedgerRequestQuery,
  PermissionLedgerRequestRecord,
  PermissionLedgerRequestStatus,
  WirePermissionResponse,
} from "@pneuma-framework/core";
import { formatPermissionStatus, formatPrincipal } from "./GovernanceEvidence.js";

export interface PermissionCenterPanelProps {
  readonly pending: readonly PermissionLedgerRequestRecord[];
  readonly recent: readonly PermissionLedgerRequestRecord[];
  readonly repairStatus?: DefinitionRepairStatus;
  readonly initialQuery?: PermissionLedgerRequestQuery;
  readonly onQueryChange?: (query: PermissionLedgerRequestQuery) => void;
  readonly onRespond?: (response: WirePermissionResponse) => void;
}

const EMPTY_QUERY: PermissionLedgerRequestQuery = {};

export function PermissionCenterPanel({
  pending,
  recent,
  repairStatus,
  initialQuery = EMPTY_QUERY,
  onQueryChange,
  onRespond,
}: PermissionCenterPanelProps) {
  const [status, setStatus] = React.useState<"all" | PermissionLedgerRequestStatus>(
    typeof initialQuery.status === "string" ? initialQuery.status : "all",
  );
  const [capability, setCapability] = React.useState(
    typeof initialQuery.capability === "string" ? initialQuery.capability : "all",
  );
  const [principalKind, setPrincipalKind] = React.useState(
    typeof initialQuery.requested_principal_kind === "string" ? initialQuery.requested_principal_kind : "all",
  );
  const [tool, setTool] = React.useState(
    typeof initialQuery.tool === "string" ? initialQuery.tool : "all",
  );
  const [text, setText] = React.useState(initialQuery.text ?? "");
  const baseRecords = React.useMemo(() => [...pending, ...recent], [pending, recent]);
  const capabilities = React.useMemo(() => uniqueStrings(baseRecords.map((record) => record.capability)), [baseRecords]);
  const principalKinds = React.useMemo(() => uniqueStrings(baseRecords.map((record) => record.requested_principal?.kind)), [baseRecords]);
  const tools = React.useMemo(() => uniqueStrings(baseRecords.map((record) => record.tool)), [baseRecords]);
  const query = React.useMemo<PermissionLedgerRequestQuery>(() => {
    return {
      ...initialQuery,
      status: status === "all" ? undefined : status,
      capability: capability === "all" ? undefined : capability as PermissionLedgerRequestQuery["capability"],
      requested_principal_kind: principalKind === "all"
        ? undefined
        : principalKind as PermissionLedgerRequestQuery["requested_principal_kind"],
      tool: tool === "all" ? undefined : tool,
      text: text.trim() || undefined,
    };
  }, [capability, initialQuery, principalKind, status, text, tool]);
  const records = React.useMemo(() => filterPermissionRecords(baseRecords, query), [baseRecords, query]);
  const summary = React.useMemo(() => summarizePermissionRecords(records), [records]);

  React.useEffect(() => {
    onQueryChange?.(query);
  }, [onQueryChange, query]);

  return (
    <section aria-label="Permission Center" style={panelStyle}>
      <div style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>Permission Center</div>
          <h2 style={titleStyle}>Human control for AI-created changes</h2>
        </div>
      </div>
      <div style={summaryStyle}>
        <SummaryItem label="pending" value={summary.pending} />
        <SummaryItem label="completed" value={summary.completed} />
        <SummaryItem label="denied" value={summary.denied} />
        <SummaryItem label="failed" value={summary.failed} />
      </div>
      {repairStatus?.status === "dirty" && (
        <div style={dirtyStyle}>
          <strong>Definition repair required</strong>
          <span>{repairStatus.guard?.error?.code ?? "dirty_definition_state"}</span>
        </div>
      )}
      <div style={filterBarStyle}>
        <FilterSelect
          label="Status filter"
          value={status}
          options={["pending", "completed", "denied", "failed", "expired"]}
          allLabel="All"
          onChange={(value) => setStatus(value as "all" | PermissionLedgerRequestStatus)}
        />
        <FilterSelect
          label="Capability filter"
          value={capability}
          options={capabilities}
          allLabel="All capabilities"
          onChange={setCapability}
        />
        <FilterSelect
          label="Principal filter"
          value={principalKind}
          options={principalKinds}
          allLabel="All principals"
          onChange={setPrincipalKind}
        />
        <FilterSelect
          label="Tool filter"
          value={tool}
          options={tools}
          allLabel="All tools"
          onChange={setTool}
        />
        <label style={filterLabelStyle}>
          <span>Search permission records</span>
          <input
            value={text}
            onInput={(event) => setText(event.currentTarget.value)}
            style={controlStyle}
          />
        </label>
      </div>
      <div style={listStyle}>
        {records.length === 0 ? (
          <div style={emptyStyle}>No permission records match this view.</div>
        ) : records.map((record) => (
          <PermissionRecordRow key={record.prompt_id} record={record} onRespond={onRespond} />
        ))}
      </div>
    </section>
  );
}

function SummaryItem({ label, value }: { readonly label: string; readonly value: number }) {
  return <div style={summaryItemStyle}>{value} {label}</div>;
}

function FilterSelect({
  label,
  value,
  options,
  allLabel,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly options: readonly string[];
  readonly allLabel: string;
  readonly onChange: (value: string) => void;
}) {
  const handleValue = (event: React.ChangeEvent<HTMLSelectElement> | React.FormEvent<HTMLSelectElement>) => {
    onChange(event.currentTarget.value);
  };
  return (
    <label style={filterLabelStyle}>
      <span>{label}</span>
      <select
        value={value}
        onChange={handleValue}
        onInput={handleValue}
        style={controlStyle}
      >
        <option value="all">{allLabel}</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function PermissionRecordRow({
  record,
  onRespond,
}: {
  readonly record: PermissionLedgerRequestRecord;
  readonly onRespond?: (response: WirePermissionResponse) => void;
}) {
  const actionable = record.status === "pending" && record.live && onRespond;
  return (
    <article style={rowStyle}>
      <div style={rowTopStyle}>
        <strong>{record.capability ?? "capability:unknown"}</strong>
        <span style={statusStyle}>{formatPermissionStatus(record)}</span>
      </div>
      <div style={targetStyle}>{targetDisplay(record)}</div>
      <dl style={proofGridStyle}>
        <Pair label="Proposed by" value={formatPrincipal(record.requested_principal)} />
        <Pair label="Approved by" value={record.approved_by ? `${record.approved_by.kind}:${record.approved_by.id}` : "not approved"} />
        <Pair label="Executed by" value={formatPrincipal(record.execution_principal)} />
        <Pair label="Authorization" value={record.authorization_reason_code ?? "not executed"} />
        <Pair label="Token" value={record.approval_token_hash ? `token hash ${record.approval_token_hash}` : "no token issued"} />
      </dl>
      {record.message && <div style={messageStyle}>{record.message}</div>}
      {actionable && (
        <div style={actionStyle}>
          <button type="button" onClick={() => onRespond({ id: record.prompt_id, decision: "allow" })}>Allow</button>
          <button type="button" onClick={() => onRespond({ id: record.prompt_id, decision: "deny" })}>Deny</button>
        </div>
      )}
    </article>
  );
}

function Pair({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div style={pairStyle}>
      <dt style={pairLabelStyle}>{label}</dt>
      <dd style={pairValueStyle}>{value}</dd>
    </div>
  );
}

function targetDisplay(record: PermissionLedgerRequestRecord): string {
  return record.target?.id ?? record.target?.fingerprint ?? record.target_fingerprint ?? "target:unknown";
}

function uniqueStrings(values: readonly (string | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string"))].sort();
}

function filterPermissionRecords(
  records: readonly PermissionLedgerRequestRecord[],
  query: PermissionLedgerRequestQuery,
): readonly PermissionLedgerRequestRecord[] {
  return records.filter((record) => {
    if (!matchesOneOrMany(record.status, query.status)) return false;
    if (!matchesOneOrMany(record.tool, query.tool)) return false;
    if (!matchesOneOrMany(record.capability, query.capability)) return false;
    if (!matchesOneOrMany(record.requested_principal?.kind, query.requested_principal_kind)) return false;
    if (!matchesOneOrMany(record.execution_principal?.kind, query.execution_principal_kind)) return false;
    if (query.text && !recordSearchText(record).includes(query.text.toLowerCase())) return false;
    return true;
  });
}

function summarizePermissionRecords(records: readonly PermissionLedgerRequestRecord[]) {
  return {
    pending: records.filter((record) => record.status === "pending").length,
    completed: records.filter((record) => record.status === "completed").length,
    denied: records.filter((record) => record.status === "denied").length,
    failed: records.filter((record) => record.status === "failed").length,
  };
}

function matchesOneOrMany(value: string | undefined, allowed: string | readonly string[] | undefined): boolean {
  if (allowed === undefined) return true;
  if (value === undefined) return false;
  return Array.isArray(allowed) ? allowed.includes(value) : value === allowed;
}

function recordSearchText(record: PermissionLedgerRequestRecord): string {
  return [
    record.prompt_id,
    record.tool,
    record.capability,
    record.target?.id,
    record.target?.fingerprint,
    record.target_fingerprint,
    record.requested_principal?.id,
    record.execution_principal?.id,
    record.authorization_reason_code,
    record.message,
  ].filter((value): value is string => typeof value === "string").join(" ").toLowerCase();
}

const panelStyle: CSSProperties = {
  border: "1px solid oklch(87% 0.012 250)",
  borderRadius: 8,
  background: "oklch(99% 0.004 255)",
  color: "oklch(22% 0.02 255)",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  overflow: "hidden",
};

const headerStyle: CSSProperties = {
  padding: "16px 18px 12px",
  borderBottom: "1px solid oklch(90% 0.01 250)",
};

const eyebrowStyle: CSSProperties = {
  color: "oklch(42% 0.07 255)",
  fontSize: 11,
  fontWeight: 750,
  letterSpacing: 0,
  textTransform: "uppercase",
};

const titleStyle: CSSProperties = {
  margin: "4px 0 0",
  fontSize: 16,
  lineHeight: 1.25,
};

const summaryStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 8,
  padding: 12,
  borderBottom: "1px solid oklch(91% 0.01 250)",
};

const summaryItemStyle: CSSProperties = {
  minHeight: 30,
  display: "grid",
  placeItems: "center",
  border: "1px solid oklch(87% 0.012 250)",
  borderRadius: 6,
  background: "oklch(96% 0.009 255)",
  fontSize: 12,
  fontWeight: 700,
};

const dirtyStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: "10px 12px",
  borderBottom: "1px solid oklch(84% 0.05 28)",
  color: "oklch(42% 0.12 28)",
  background: "oklch(96% 0.028 28)",
  fontSize: 12,
};

const filterBarStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))",
  gap: 10,
  padding: 12,
  borderBottom: "1px solid oklch(91% 0.01 250)",
};

const filterLabelStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  color: "oklch(42% 0.014 255)",
  fontSize: 11,
  fontWeight: 650,
};

const controlStyle: CSSProperties = {
  minHeight: 30,
  border: "1px solid oklch(84% 0.014 250)",
  borderRadius: 6,
  padding: "4px 7px",
  background: "white",
  color: "oklch(24% 0.018 255)",
  fontSize: 12,
};

const listStyle: CSSProperties = {
  display: "grid",
};

const emptyStyle: CSSProperties = {
  padding: 14,
  color: "oklch(50% 0.014 255)",
  fontSize: 13,
};

const rowStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  padding: "14px 16px",
  borderTop: "1px solid oklch(93% 0.008 250)",
};

const rowTopStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
};

const statusStyle: CSSProperties = {
  color: "oklch(42% 0.024 255)",
  fontSize: 12,
  fontWeight: 700,
};

const targetStyle: CSSProperties = {
  color: "oklch(36% 0.018 255)",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: 12,
  overflowWrap: "anywhere",
};

const proofGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))",
  gap: "8px 12px",
  margin: 0,
};

const pairStyle: CSSProperties = {
  display: "grid",
  gap: 2,
};

const pairLabelStyle: CSSProperties = {
  color: "oklch(52% 0.012 250)",
  fontSize: 11,
  fontWeight: 650,
};

const pairValueStyle: CSSProperties = {
  margin: 0,
  color: "oklch(29% 0.016 255)",
  fontSize: 12,
  overflowWrap: "anywhere",
};

const messageStyle: CSSProperties = {
  color: "oklch(42% 0.05 28)",
  fontSize: 12,
};

const actionStyle: CSSProperties = {
  display: "flex",
  gap: 8,
};
