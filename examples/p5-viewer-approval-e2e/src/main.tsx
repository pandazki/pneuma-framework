import * as React from "react";
import { createRoot } from "react-dom/client";
import type { FrameworkEvent, PermissionPrompt as WirePermissionPrompt } from "@pneuma-framework/core";
import {
  GovernanceEvidencePanel,
  PneumaViewRenderer,
  PermissionPrompt,
  PneumaViewer,
  normalizeViewPresentationForRender,
  useAction,
  usePermissionResponder,
  usePneumaState,
  type ViewRendererView,
} from "@pneuma-framework/viewer-react";

type OperationRollbackResult = {
  executed?: boolean;
  operation_visible_before?: boolean;
  operation_visible_after?: boolean;
  operation_lookup_after_restart?: string | null;
  row_count?: number;
  preserved_bookmark_urls?: string[];
  before_output?: { rows?: Array<Record<string, unknown>> };
  history_version?: number;
};

type CapabilityLifecycleResult = {
  stage?: string;
  operation_visible_initially?: boolean;
  operation_visible_after_add?: boolean;
  operation_visible_after_rollback?: boolean;
  view_visible_after_add?: boolean;
  view_visible_after_rollback?: boolean;
  row_count?: number;
  row_count_after_add?: number;
  bookmark_urls?: string[];
  bookmark_urls_after_add?: string[];
  preserved_bookmark_urls?: string[];
  query_output_after_add?: { rows?: Array<Record<string, unknown>> };
  query_output_before_rollback?: { rows?: Array<Record<string, unknown>> };
  definition_operations?: DefinitionOperationRow[];
  definition_views?: DefinitionViewRow[];
  definition_policy_rules?: DefinitionPolicyRuleRow[];
  policy_access?: PolicyAccessFacts;
  history_entries?: HistoryEntryRow[];
  schema_tables?: SchemaTableRow[];
  history_version?: number;
  history_version_after_add?: number;
  history_version_after_view?: number;
  history_version_after_policy?: number;
};

type SchemaColumnRow = {
  name?: string;
  type?: string;
  nullable?: boolean;
};

type SchemaTableRow = {
  table_id?: string;
  source_kind?: string;
  system_owned?: boolean;
  columns?: SchemaColumnRow[];
  demo_rows?: Array<Record<string, unknown>>;
};

type DefinitionOperationRow = {
  row_id?: string;
  operation_id?: string;
  name?: string;
  handler_kind?: string;
  source_table?: string;
  action?: string;
  reads_only?: boolean;
  definition_version?: number;
  created_by_kind?: string;
};

type DefinitionViewRow = {
  row_id?: string;
  view_id?: string;
  name?: string;
  kind?: string;
  source_operation_id?: string;
  presentation?: unknown;
  presentation_columns?: string[];
  definition_version?: number;
  created_by_kind?: string;
};

type DefinitionPolicyRuleRow = {
  row_id?: string;
  rule_id?: string;
  actions?: string[];
  resource_kind?: string;
  resource_id?: string;
  definition_version?: number;
  created_by_kind?: string;
};

type PolicyAccessFacts = {
  reviewer_can_read_view?: boolean;
  guest_can_read_view?: boolean;
  reviewer_can_invoke_operation?: boolean;
  guest_can_invoke_operation?: boolean;
  reviewer_visible_view_count?: number;
  guest_visible_view_count?: number;
};

type HistoryEntryRow = {
  version?: number;
  actor_kind?: string;
  description?: string;
  operation_scope?: string[];
};

type EndUserRole = "guest" | "reviewer";

type LifecyclePhase = {
  step: number;
  title: string;
  event: string;
  capabilityState: "absent" | "pending" | "live" | "removed";
};

type FrameworkEventState =
  | Extract<FrameworkEvent, { type: "definition-apply-state" }>["state"]
  | Extract<FrameworkEvent, { type: "definition-rollback-prepare-state" }>["state"]
  | Extract<FrameworkEvent, { type: "definition-rollback-execute-state" }>["state"];

const color = {
  paper: "oklch(96.5% 0.012 78)",
  surface: "oklch(98.5% 0.006 78)",
  panel: "oklch(94.5% 0.012 78)",
  raised: "oklch(99% 0.004 78)",
  ink: "oklch(22% 0.02 75)",
  muted: "oklch(46% 0.018 75)",
  soft: "oklch(60% 0.016 75)",
  line: "oklch(84% 0.014 78)",
  lineStrong: "oklch(74% 0.018 78)",
  accent: "oklch(52% 0.14 45)",
  accentSoft: "oklch(92% 0.045 55)",
  success: "oklch(44% 0.09 150)",
  successSoft: "oklch(92% 0.04 150)",
  warn: "oklch(48% 0.12 34)",
  warnSoft: "oklch(94% 0.042 42)",
  code: "oklch(25% 0.018 75)",
  codeInk: "oklch(96% 0.008 78)",
};

const studio = {
  paper: "oklch(96.7% 0.014 76)",
  sheet: "oklch(98.8% 0.006 76)",
  wash: "oklch(94.2% 0.014 76)",
  ink: "oklch(21% 0.018 72)",
  body: "oklch(34% 0.017 72)",
  muted: "oklch(50% 0.016 72)",
  faint: "oklch(66% 0.014 72)",
  line: "oklch(83% 0.014 76)",
  lineStrong: "oklch(72% 0.018 76)",
  amber: "oklch(52% 0.14 45)",
  amberWash: "oklch(92.5% 0.046 55)",
  green: "oklch(43% 0.085 150)",
  greenWash: "oklch(92.6% 0.038 150)",
  red: "oklch(47% 0.12 35)",
  redWash: "oklch(94% 0.04 38)",
  code: "oklch(24% 0.018 72)",
  codeInk: "oklch(96% 0.008 76)",
};

type ViewRendererStyle = React.CSSProperties & Record<`--pneuma-view-${string}`, string>;

const classicViewRendererStyle: ViewRendererStyle = {
  "--pneuma-view-ink": color.ink,
  "--pneuma-view-muted": color.muted,
  "--pneuma-view-rule": color.line,
  "--pneuma-view-surface": color.surface,
  "--pneuma-view-wash": color.panel,
  "--pneuma-view-radius": "6px",
};

const studioViewRendererStyle: ViewRendererStyle = {
  "--pneuma-view-ink": studio.ink,
  "--pneuma-view-muted": studio.muted,
  "--pneuma-view-rule": studio.line,
  "--pneuma-view-surface": studio.sheet,
  "--pneuma-view-wash": studio.wash,
  "--pneuma-view-radius": "7px",
};

function App() {
  const params = new URLSearchParams(window.location.search);
  const scenario = params.get("scenario") ?? "apply";
  const variant = params.get("variant") ?? "classic";
  const wsUrl = `${window.location.origin.replace(/^http/, "ws")}/ws?scenario=${encodeURIComponent(scenario)}`;
  return (
    <PneumaViewer wsUrl={wsUrl} sid={`viewer-approval-e2e-${scenario}-${variant}`}>
      <DemoShell scenario={scenario} variant={variant} />
    </PneumaViewer>
  );
}

function DemoShell({ scenario, variant }: { scenario: string; variant: string }) {
  const isLifecycle = scenario === "capability-lifecycle";
  const isStudio = isLifecycle && (variant === "studio" || variant === "governance");
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: isStudio ? 0 : isLifecycle ? 18 : 24,
        boxSizing: "border-box",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
        background: isStudio ? studio.paper : color.paper,
        color: color.ink,
      }}
    >
      {!isLifecycle && (
        <>
          <h1 style={{ fontSize: 26, margin: 0 }}>Pneuma Definition Live E2E</h1>
          <div style={{ marginTop: 12, color: color.muted }}>Scenario: {scenario}</div>
        </>
      )}
      <StatusPanel scenario={scenario} variant={variant} />
      {!isLifecycle && <PermissionPrompt />}
    </main>
  );
}

function StatusPanel({ scenario, variant }: { scenario: string; variant: string }) {
  const { docs, pendingPrompt, clearPendingPrompt, frameworkEvents, permissionLedger } = usePneumaState();
  const rollbackExecuteResult = docs["rollback-execute/result"];
  const rollbackExecuteError = docs["rollback-execute/error"];
  const operationRollbackExecuteResult = docs["operation-rollback-execute/result"];
  const operationRollbackExecuteError = docs["operation-rollback-execute/error"];
  const capabilityLifecycleStatus = docs["capability-lifecycle/status"];
  const capabilityLifecycleAfterAdd = docs["capability-lifecycle/after-add"];
  const capabilityLifecycleAfterView = docs["capability-lifecycle/after-view"];
  const capabilityLifecycleAfterPolicy = docs["capability-lifecycle/after-policy"];
  const capabilityLifecycleResult = docs["capability-lifecycle/result"];
  const capabilityLifecycleError = docs["capability-lifecycle/error"];
  const capabilityLifecycleRaw = capabilityLifecycleResult
    ?? capabilityLifecycleAfterPolicy
    ?? capabilityLifecycleAfterView
    ?? capabilityLifecycleAfterAdd
    ?? capabilityLifecycleStatus;
  const result = capabilityLifecycleRaw ?? operationRollbackExecuteResult ?? rollbackExecuteResult;
  const error = capabilityLifecycleError ?? operationRollbackExecuteError ?? rollbackExecuteError;
  const operationRollbackResult = operationRollbackExecuteResult
    ? parseOperationRollbackResult(operationRollbackExecuteResult)
    : undefined;
  const capabilityLifecycle = capabilityLifecycleRaw
    ? parseCapabilityLifecycleResult(capabilityLifecycleRaw)
    : undefined;

  if (scenario === "capability-lifecycle" && capabilityLifecycle) {
    return variant === "studio" || variant === "governance" ? (
      <StudioLifecycleDemo
        variant={variant}
        result={capabilityLifecycle}
        pendingPrompt={pendingPrompt}
        clearPendingPrompt={clearPendingPrompt}
        frameworkEvents={frameworkEvents}
        permissionLedger={permissionLedger}
        showGovernanceEvidence={variant === "governance"}
        raw={result}
        error={error}
      />
    ) : (
      <LifecycleDemo
        result={capabilityLifecycle}
        pendingPrompt={pendingPrompt}
        clearPendingPrompt={clearPendingPrompt}
        frameworkEvents={frameworkEvents}
        raw={result}
        error={error}
      />
    );
  }

  return (
    <LegacyStatusPanel
      pendingPrompt={pendingPrompt}
      result={result}
      error={error}
      operationRollbackResult={operationRollbackResult}
      capabilityLifecycle={capabilityLifecycle}
      operationRollbackExecuteResult={operationRollbackExecuteResult}
      operationRollbackExecuteError={operationRollbackExecuteError}
    />
  );
}

function LifecycleDemo({
  result,
  pendingPrompt,
  clearPendingPrompt,
  frameworkEvents,
  raw,
  error,
}: {
  result: CapabilityLifecycleResult;
  pendingPrompt?: WirePermissionPrompt;
  clearPendingPrompt: () => void;
  frameworkEvents: readonly FrameworkEvent[];
  raw?: string;
  error?: string;
}) {
  const [leftView, setLeftView] = React.useState<"app" | "data">("app");
  const sendAction = useAction();
  const respond = usePermissionResponder();
  const viewportWidth = useViewportWidth();
  const phase = lifecyclePhase(result, pendingPrompt?.id);
  const rowUrls = lifecycleRowUrls(result);
  const queryUrl = lifecycleQueryUrl(result);
  const historyVersion = result.history_version ?? result.history_version_after_policy ?? result.history_version_after_view ?? result.history_version_after_add ?? 0;
  const canRequestAdd = result.stage === "baseline" && !pendingPrompt;
  const canRequestView = result.stage === "operation_added" && !pendingPrompt;
  const canRequestPolicy = result.stage === "view_added" && !pendingPrompt;
  const canRequestRollback = (
    result.stage === "policy_added"
    || result.stage === "policy_denied"
    || result.stage === "operation_added"
    || result.stage === "view_denied"
  ) && !pendingPrompt;
  const compact = viewportWidth < 1080;

  const answerPrompt = React.useCallback((decision: "allow" | "deny") => {
    if (!pendingPrompt) return;
    respond(pendingPrompt.id, decision);
    clearPendingPrompt();
  }, [clearPendingPrompt, pendingPrompt, respond]);

  return (
    <section data-testid="status-panel" style={{ minHeight: "calc(100vh - 36px)" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 18,
          padding: "2px 2px 14px",
          borderBottom: `1px solid ${color.line}`,
        }}
      >
        <div>
          <div style={{ fontSize: 12, letterSpacing: 0, color: color.muted }}>Pneuma live E2E</div>
          <h1 style={{ margin: "3px 0 0", fontSize: 22, lineHeight: 1.15, fontWeight: 720 }}>
            One app, changed by conversation
          </h1>
        </div>
        <button
          data-testid="replay-demo"
          onClick={() => window.location.reload()}
          style={buttonStyle("secondary")}
        >
          Replay
        </button>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: compact ? "minmax(0, 1fr)" : "minmax(0, 1.18fr) minmax(0, 0.82fr)",
          gap: 18,
          paddingTop: 18,
          minHeight: "calc(100vh - 112px)",
        }}
      >
        <EndUserPane
          view={leftView}
          onViewChange={setLeftView}
          result={result}
          phase={phase}
          rowUrls={rowUrls}
          queryUrl={queryUrl}
          historyVersion={historyVersion}
          compact={compact}
        />
        <BuilderPane
          result={result}
          phase={phase}
          pendingPrompt={pendingPrompt}
          onRequestAdd={() => sendAction({ kind: "click", target: "capability.request-add" })}
          onRequestView={() => sendAction({ kind: "click", target: "capability.request-view" })}
          onRequestPolicy={() => sendAction({ kind: "click", target: "capability.request-policy" })}
          onRequestRollback={() => sendAction({ kind: "click", target: "capability.request-rollback" })}
          onAnswerPrompt={answerPrompt}
          canRequestAdd={canRequestAdd}
          canRequestView={canRequestView}
          canRequestPolicy={canRequestPolicy}
          canRequestRollback={canRequestRollback}
          raw={raw}
          error={error}
          historyVersion={historyVersion}
          frameworkEvents={frameworkEvents}
        />
      </div>
    </section>
  );
}

function EndUserPane({
  view,
  onViewChange,
  result,
  phase,
  rowUrls,
  queryUrl,
  historyVersion,
  compact,
}: {
  view: "app" | "data";
  onViewChange: (view: "app" | "data") => void;
  result: CapabilityLifecycleResult;
  phase: LifecyclePhase;
  rowUrls: string[];
  queryUrl?: string;
  historyVersion: number;
  compact: boolean;
}) {
  const rowUrl = rowUrls[0] ?? "https://example.com/full-chain-demo";
  const [role, setRole] = React.useState<EndUserRole>("guest");
  return (
    <section
      style={{
        border: `1px solid ${color.line}`,
        borderRadius: 8,
        background: color.surface,
        minHeight: 620,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          padding: "16px 18px",
          borderBottom: `1px solid ${color.line}`,
          background: color.raised,
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: color.muted }}>End user surface</div>
          <div style={{ marginTop: 3, fontSize: 18, fontWeight: 720 }}>Reader Bookmarks</div>
        </div>
        <SegmentedTabs
          value={view}
          options={[
            { value: "app", label: "App" },
            { value: "data", label: "Data" },
          ]}
          onChange={onViewChange}
        />
      </div>

      {view === "app" ? (
        <BookmarkAppView
          rowUrl={rowUrl}
          queryUrl={queryUrl}
          result={result}
          phase={phase}
          historyVersion={historyVersion}
          compact={compact}
          role={role}
          onRoleChange={setRole}
        />
      ) : (
        <BookmarkDataView
          rowUrl={rowUrl}
          result={result}
          phase={phase}
          historyVersion={historyVersion}
          compact={compact}
        />
      )}
    </section>
  );
}

function BookmarkAppView({
  rowUrl,
  queryUrl,
  result,
  phase,
  historyVersion,
  compact,
  role,
  onRoleChange,
}: {
  rowUrl: string;
  queryUrl?: string;
  result: CapabilityLifecycleResult;
  phase: LifecyclePhase;
  historyVersion: number;
  compact: boolean;
  role: EndUserRole;
  onRoleChange: (role: EndUserRole) => void;
}) {
  const isLive = operationIsLive(result);
  const isRemoved = phase.capabilityState === "removed";
  const viewMounted = result.view_visible_after_add === true && result.stage !== "rolled_back";
  const viewVisible = viewMounted && roleCanSeeReviewQueue(result, role);
  const bookmark = studioBookmarkSnapshot(result, rowUrl);
  const activeView = activeLifecycleView(result);
  const rendererView = lifecycleRendererView(activeView);
  const sourceRows = viewSourceRows(result, bookmarkRowForView(bookmark));
  const viewTitle = viewRendererTitle(rendererView, sourceRows, activeView?.presentation_columns);
  return (
    <div style={{ padding: 22 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: compact ? "minmax(0, 1fr)" : "minmax(0, 1fr) 230px",
          gap: 20,
          alignItems: "start",
        }}
      >
        <div>
          <div style={{ fontSize: 13, color: color.muted }}>Saved sources</div>
          <article
            style={{
              marginTop: 12,
              padding: "16px 0",
              borderTop: `1px solid ${color.line}`,
              borderBottom: `1px solid ${color.line}`,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 18 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, lineHeight: 1.25, fontWeight: 680 }}>
                  Pneuma architecture notes
                </h2>
                <div style={{ marginTop: 8, color: color.muted, lineHeight: 1.45 }}>
                  A saved reference used by the reader workflow.
                </div>
              </div>
              <StatusPill tone="neutral">Stored</StatusPill>
            </div>
            <div
              style={{
                marginTop: 18,
                padding: 12,
                background: color.panel,
                border: `1px solid ${color.line}`,
                borderRadius: 6,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 12,
                overflowWrap: "anywhere",
              }}
            >
              {rowUrl}
            </div>
          </article>

          <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 13, color: color.muted }}>Application views</div>
          <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div style={{ color: color.muted, fontSize: 12 }}>Preview as</div>
            <SegmentedTabs
              value={role}
              options={[
                { value: "guest", label: "Guest" },
                { value: "reviewer", label: "Reviewer" },
              ]}
              onChange={onRoleChange}
            />
          </div>
          <div
            style={{
              marginTop: 10,
                padding: 16,
                border: `1px solid ${viewVisible ? color.accent : color.line}`,
                borderRadius: 8,
                background: viewVisible ? color.accentSoft : color.raised,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <div>
                  <div style={{ fontWeight: 720 }}>{viewTitle}</div>
                  <div style={{ marginTop: 6, color: color.muted, lineHeight: 1.45 }}>
                    {viewVisible
                      ? "The reviewer role can now open the Review Queue."
                      : viewMounted
                        ? "The View definition exists, but this role is blocked by policy."
                        : isLive
                          ? "The API exists; the user-facing view has not been added yet."
                        : capabilityCopy(phase.capabilityState)}
                  </div>
                </div>
                <StatusPill tone={viewVisible ? "accent" : isRemoved ? "success" : "neutral"}>
                  {viewVisible ? "Visible" : isRemoved ? "Removed" : viewMounted ? "Policy gated" : "Absent"}
                </StatusPill>
              </div>
              {viewVisible && (
                <div
                  data-testid="review-queue-view"
                  style={{
                    marginTop: 14,
                  }}
                >
                  <PneumaViewRenderer
                    view={rendererView}
                    rows={sourceRows}
                    fallbackColumns={activeView?.presentation_columns}
                    style={classicViewRendererStyle}
                  />
                </div>
              )}
              <div
                style={{
                  marginTop: 14,
                  padding: 12,
                  borderRadius: 6,
                  background: color.surface,
                  border: `1px solid ${color.line}`,
                  minHeight: 54,
                }}
              >
                <div style={{ fontSize: 12, color: color.muted }}>Runtime output</div>
                <code
                  data-testid="capability-output"
                  style={{
                    display: "block",
                    marginTop: 6,
                    overflowWrap: "anywhere",
                    color: isLive ? color.ink : color.soft,
                  }}
                >
                  {isRemoved
                    ? "Capability removed. Bookmark row remains."
                    : queryUrl ?? "No callable operation yet."}
                </code>
              </div>
            </div>
          </div>
        </div>

        <aside
          style={{
            borderLeft: compact ? 0 : `1px solid ${color.line}`,
            borderTop: compact ? `1px solid ${color.line}` : 0,
            paddingLeft: compact ? 0 : 18,
            paddingTop: compact ? 2 : 0,
            minHeight: compact ? 0 : 450,
          }}
        >
          <SideFact label="Definition history" value={`v${historyVersion}`} />
          <SideFact label="Rows" value="1" />
          <SideFact label="Operation" value={isLive ? "queryable" : "not exposed"} />
          <SideFact label="View" value={viewMounted ? "Review Queue" : "not mounted"} />
          <SideFact label="Policy" value={policyRuleCount(result) > 0 ? "reviewer only" : "restricted"} />
        </aside>
      </div>
    </div>
  );
}

function BookmarkDataView({
  rowUrl,
  result,
  phase,
  historyVersion,
  compact,
}: {
  rowUrl: string;
  result: CapabilityLifecycleResult;
  phase: LifecyclePhase;
  historyVersion: number;
  compact: boolean;
}) {
  const rowCount = result.row_count ?? result.row_count_after_add ?? 1;
  const operationRows = result.definition_operations ?? [];
  const viewRows = result.definition_views ?? [];
  const policyRows = result.definition_policy_rules ?? [];
  const historyRows = result.history_entries ?? [];
  const definitionRowCount = operationRows.length + viewRows.length + policyRows.length;
  return (
    <div style={{ padding: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "end" }}>
        <div>
          <div style={{ fontSize: 13, color: color.muted }}>Data view</div>
          <h2 style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 720 }}>
            Business data + definition data
          </h2>
        </div>
        <StatusPill tone={definitionRowCount > 0 ? "accent" : "neutral"}>
          {definitionRowCount} definition row{definitionRowCount === 1 ? "" : "s"}
        </StatusPill>
      </div>

      <div
        style={{
          marginTop: 18,
          display: "grid",
          gridTemplateColumns: compact ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))",
          borderTop: `1px solid ${color.line}`,
          borderBottom: `1px solid ${color.line}`,
        }}
      >
        <DataStat label="Business rows" value={String(rowCount)} />
        <DataStat label="Definition rows" value={String(definitionRowCount)} />
        <DataStat label="History version" value={`v${historyVersion}`} />
        <DataStat label="Capability" value={capabilityLabel(phase.capabilityState)} />
      </div>

      <DataSection
        eyebrow="Business data"
        title="bookmarks"
        aside="unchanged"
        tone={phase.capabilityState === "removed" ? "success" : "neutral"}
      >
        <div
          style={{
            border: `1px solid ${color.line}`,
            borderRadius: 8,
            overflow: "hidden",
            background: color.raised,
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <thead>
              <tr>
                <TableHead width="150px">id</TableHead>
                <TableHead>url</TableHead>
              </tr>
            </thead>
            <tbody>
              <tr>
                <TableCell mono>bookmark-1</TableCell>
                <TableCell mono>{rowUrl}</TableCell>
              </tr>
            </tbody>
          </table>
        </div>
      </DataSection>

      <DataSection
        eyebrow="System-owned definition data"
        title="pneuma_views"
        aside={viewRows.length === 1 ? "row exists" : "empty"}
        tone={viewRows.length === 1 ? "accent" : phase.capabilityState === "removed" ? "success" : "neutral"}
      >
        {viewRows.length > 0 ? (
          <div
            data-testid="definition-views-table"
            style={{
              border: `1px solid ${color.line}`,
              borderRadius: 8,
              overflow: "hidden",
              background: color.raised,
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <thead>
                <tr>
                  <TableHead width="150px">view_id</TableHead>
                  <TableHead width="80px">kind</TableHead>
                  <TableHead>source</TableHead>
                  <TableHead width="76px">version</TableHead>
                </tr>
              </thead>
              <tbody>
                {viewRows.map((row) => (
                  <tr key={row.row_id ?? row.view_id}>
                    <TableCell mono>{row.view_id ?? "unknown"}</TableCell>
                    <TableCell mono>{row.kind ?? "table"}</TableCell>
                    <TableCell mono>{row.source_operation_id ?? "list_bookmark_urls"}</TableCell>
                    <TableCell mono>{row.definition_version === undefined ? "-" : `v${row.definition_version}`}</TableCell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div
            style={{
              padding: 13,
              border: `1px solid ${color.line}`,
              borderRadius: 8,
              background: phase.capabilityState === "removed" ? color.successSoft : color.panel,
              color: phase.capabilityState === "removed" ? color.success : color.muted,
              lineHeight: 1.45,
            }}
          >
            {phase.capabilityState === "removed"
              ? "Rollback deleted the view definition row. The business bookmark row stayed untouched."
              : "No Builder-authored view definition yet."}
          </div>
        )}
      </DataSection>

      <DataSection
        eyebrow="System-owned definition data"
        title="pneuma_operations"
        aside={operationRows.length === 1 ? "row exists" : "empty"}
        tone={operationRows.length === 1 ? "accent" : phase.capabilityState === "removed" ? "success" : "neutral"}
      >
        {operationRows.length > 0 ? (
          <div
            data-testid="definition-operations-table"
            style={{
              border: `1px solid ${color.line}`,
              borderRadius: 8,
              overflow: "hidden",
              background: color.raised,
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <thead>
                <tr>
                  <TableHead width="178px">operation_id</TableHead>
                  <TableHead width="86px">handler</TableHead>
                  <TableHead width="96px">source</TableHead>
                  <TableHead width="76px">version</TableHead>
                </tr>
              </thead>
              <tbody>
                {operationRows.map((row) => (
                  <tr key={row.row_id ?? row.operation_id}>
                    <TableCell mono>{row.operation_id ?? "unknown"}</TableCell>
                    <TableCell mono>{row.handler_kind ?? "query"}</TableCell>
                    <TableCell mono>{row.source_table ?? "bookmarks"}</TableCell>
                    <TableCell mono>{row.definition_version === undefined ? "-" : `v${row.definition_version}`}</TableCell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyDefinitionState phase={phase} />
        )}
      </DataSection>

      <DataSection
        eyebrow="System-owned definition data"
        title="pneuma_policy_rules"
        aside={policyRows.length === 1 ? "row exists" : "empty"}
        tone={policyRows.length === 1 ? "accent" : phase.capabilityState === "removed" ? "success" : "neutral"}
      >
        {policyRows.length > 0 ? (
          <div
            data-testid="definition-policy-rules-table"
            style={{
              border: `1px solid ${color.line}`,
              borderRadius: 8,
              overflow: "hidden",
              background: color.raised,
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <thead>
                <tr>
                  <TableHead>rule_id</TableHead>
                  <TableHead width="82px">actions</TableHead>
                  <TableHead width="120px">resource</TableHead>
                  <TableHead width="76px">version</TableHead>
                </tr>
              </thead>
              <tbody>
                {policyRows.map((row) => (
                  <tr key={row.row_id ?? row.rule_id}>
                    <TableCell mono>{row.rule_id ?? "unknown"}</TableCell>
                    <TableCell mono>{row.actions?.join(", ") || "read"}</TableCell>
                    <TableCell mono>{`${row.resource_kind ?? "view"}:${row.resource_id ?? "review_queue"}`}</TableCell>
                    <TableCell mono>{row.definition_version === undefined ? "-" : `v${row.definition_version}`}</TableCell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div
            style={{
              padding: 13,
              border: `1px solid ${color.line}`,
              borderRadius: 8,
              background: phase.capabilityState === "removed" ? color.successSoft : color.panel,
              color: phase.capabilityState === "removed" ? color.success : color.muted,
              lineHeight: 1.45,
            }}
          >
            {phase.capabilityState === "removed"
              ? "Rollback deleted the PolicyRule definition row."
              : "No Builder-authored policy rule exists yet. The Review Queue stays hidden from end users."}
          </div>
        )}
      </DataSection>

      <DataSection
        eyebrow="Definition history"
        title="app_history"
        aside={historyRows.length === 0 ? "no entries" : `${historyRows.length} entries`}
        tone={historyRows.length > 0 ? "success" : "neutral"}
      >
        {historyRows.length > 0 ? (
          <div
            style={{
              border: `1px solid ${color.line}`,
              borderRadius: 8,
              overflow: "hidden",
              background: color.raised,
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <thead>
                <tr>
                  <TableHead width="72px">version</TableHead>
                  <TableHead width="96px">actor</TableHead>
                  <TableHead>description</TableHead>
                </tr>
              </thead>
              <tbody>
                {historyRows.map((row) => (
                  <tr key={row.version}>
                    <TableCell mono>{row.version === undefined ? "-" : `v${row.version}`}</TableCell>
                    <TableCell mono>{row.actor_kind ?? "framework"}</TableCell>
                    <TableCell>{row.description || "definition snapshot"}</TableCell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div
            style={{
              padding: 13,
              border: `1px solid ${color.line}`,
              borderRadius: 8,
              background: color.panel,
              color: color.muted,
            }}
          >
            No definition history yet. The first approved capability change will append v1.
          </div>
        )}
      </DataSection>
    </div>
  );
}

function DataSection({
  eyebrow,
  title,
  aside,
  tone,
  children,
}: {
  eyebrow: string;
  title: string;
  aside: string;
  tone: "success" | "warn" | "neutral" | "accent";
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginTop: 24 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 14,
          alignItems: "end",
          paddingBottom: 10,
          borderBottom: `1px solid ${color.line}`,
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: color.muted }}>{eyebrow}</div>
          <h3 style={{ margin: "3px 0 0", fontSize: 16, lineHeight: 1.25, fontWeight: 720 }}>{title}</h3>
        </div>
        <StatusPill tone={tone}>{aside}</StatusPill>
      </div>
      <div style={{ marginTop: 12 }}>{children}</div>
    </section>
  );
}

function EmptyDefinitionState({ phase }: { phase: LifecyclePhase }) {
  const text = phase.capabilityState === "removed"
    ? "Rollback deleted the operation definition row. The business bookmark row stayed untouched."
    : "No Builder-authored operation definition exists yet.";
  return (
    <div
      data-testid="definition-operations-empty"
      style={{
        padding: 13,
        border: `1px solid ${color.line}`,
        borderRadius: 8,
        background: phase.capabilityState === "removed" ? color.successSoft : color.panel,
        color: phase.capabilityState === "removed" ? color.success : color.muted,
        lineHeight: 1.45,
      }}
    >
      {text}
    </div>
  );
}

function BuilderPane({
  result,
  phase,
  pendingPrompt,
  onRequestAdd,
  onRequestView,
  onRequestPolicy,
  onRequestRollback,
  onAnswerPrompt,
  canRequestAdd,
  canRequestView,
  canRequestPolicy,
  canRequestRollback,
  raw,
  error,
  historyVersion,
  frameworkEvents,
}: {
  result: CapabilityLifecycleResult;
  phase: LifecyclePhase;
  pendingPrompt?: WirePermissionPrompt;
  onRequestAdd: () => boolean;
  onRequestView: () => boolean;
  onRequestPolicy: () => boolean;
  onRequestRollback: () => boolean;
  onAnswerPrompt: (decision: "allow" | "deny") => void;
  canRequestAdd: boolean;
  canRequestView: boolean;
  canRequestPolicy: boolean;
  canRequestRollback: boolean;
  raw?: string;
  error?: string;
  historyVersion: number;
  frameworkEvents: readonly FrameworkEvent[];
}) {
  return (
    <section
      style={{
        border: `1px solid ${color.line}`,
        borderRadius: 8,
        background: color.surface,
        minHeight: 620,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "16px 18px",
          borderBottom: `1px solid ${color.line}`,
          background: color.raised,
        }}
      >
        <div style={{ fontSize: 12, color: color.muted }}>Build workspace</div>
        <div style={{ marginTop: 3, fontSize: 18, fontWeight: 720 }}>Builder + Agent</div>
      </div>

      <div style={{ display: "grid", gridTemplateRows: "auto auto 1fr", minHeight: 540 }}>
        <div style={{ padding: "18px 18px 0" }}>
          <ChatTranscript result={result} phase={phase} pendingPrompt={pendingPrompt} />
        </div>

        <div style={{ padding: 18, borderBottom: `1px solid ${color.line}` }}>
          {pendingPrompt ? (
            <InlineApprovalCard prompt={pendingPrompt} onAnswer={onAnswerPrompt} />
          ) : (
            <PresenterControls
              phase={phase}
              canRequestAdd={canRequestAdd}
              canRequestView={canRequestView}
              canRequestPolicy={canRequestPolicy}
              canRequestRollback={canRequestRollback}
              onRequestAdd={onRequestAdd}
              onRequestView={onRequestView}
              onRequestPolicy={onRequestPolicy}
              onRequestRollback={onRequestRollback}
            />
          )}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr)",
            alignContent: "start",
            padding: 18,
            gap: 18,
          }}
        >
          <PrimitiveRail phase={phase} pendingPrompt={pendingPrompt} historyVersion={historyVersion} />
          <FrameworkEventProgress frameworkEvents={frameworkEvents} pendingPrompt={pendingPrompt} />
          <CurrentEvent
            phase={phase}
            pendingPrompt={pendingPrompt}
            frameworkEvents={frameworkEvents}
            raw={raw}
            error={error}
          />
        </div>
      </div>
    </section>
  );
}

function ChatTranscript({
  result,
  phase,
  pendingPrompt,
}: {
  result: CapabilityLifecycleResult;
  phase: LifecyclePhase;
  pendingPrompt?: WirePermissionPrompt;
}) {
  const rows = [
    {
      who: "Builder",
      text: "Can this bookmark app expose saved URLs to another AI workflow?",
    },
    {
      who: "Agent",
      text: agentLine(result, pendingPrompt, phase),
    },
    {
      who: "Framework",
      text: frameworkLine(result, pendingPrompt, phase),
    },
  ];
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {rows.map((row) => (
        <div key={row.who} style={{ display: "grid", gridTemplateColumns: "82px minmax(0, 1fr)", gap: 10 }}>
          <div style={{ color: color.muted, fontSize: 12, paddingTop: 2 }}>{row.who}</div>
          <div style={{ lineHeight: 1.45, color: color.ink }}>{row.text}</div>
        </div>
      ))}
    </div>
  );
}

function PresenterControls({
  phase,
  canRequestAdd,
  canRequestView,
  canRequestPolicy,
  canRequestRollback,
  onRequestAdd,
  onRequestView,
  onRequestPolicy,
  onRequestRollback,
}: {
  phase: LifecyclePhase;
  canRequestAdd: boolean;
  canRequestView: boolean;
  canRequestPolicy: boolean;
  canRequestRollback: boolean;
  onRequestAdd: () => boolean;
  onRequestView: () => boolean;
  onRequestPolicy: () => boolean;
  onRequestRollback: () => boolean;
}) {
  if (phase.capabilityState === "removed") {
    return (
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 680 }}>Lifecycle complete</div>
          <div style={{ marginTop: 5, color: color.muted }}>The capability changed, then disappeared. Data stayed in place.</div>
        </div>
        <button onClick={() => window.location.reload()} style={buttonStyle("primary")}>Replay</button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
      <div>
        <div style={{ fontWeight: 680 }}>{phase.title}</div>
        <div style={{ marginTop: 5, color: color.muted }}>{phase.event}</div>
      </div>
      {canRequestAdd && (
        <button
          data-testid="request-add-capability"
          onClick={onRequestAdd}
          style={buttonStyle("primary")}
        >
          Ask agent to propose capability
        </button>
      )}
      {canRequestView && (
        <button
          data-testid="request-add-view"
          onClick={onRequestView}
          style={buttonStyle("primary")}
        >
          Add app view
        </button>
      )}
      {canRequestPolicy && (
        <button
          data-testid="request-add-policy"
          onClick={onRequestPolicy}
          style={buttonStyle("primary")}
        >
          Add reviewer access
        </button>
      )}
      {canRequestRollback && (
        <button
          data-testid="request-rollback-capability"
          onClick={onRequestRollback}
          style={buttonStyle("primary")}
        >
          Review rollback impact
        </button>
      )}
    </div>
  );
}

function InlineApprovalCard({
  prompt,
  onAnswer,
}: {
  prompt: WirePermissionPrompt;
  onAnswer: (decision: "allow" | "deny") => void;
}) {
  const detail = prompt.detail;
  const isRollback = prompt.tool === "definition.rollback.validate";
  const addedOperations = asRecordArray(detail.impact, "added_operations");
  const addedViews = asRecordArray(detail.impact, "added_views");
  const addedPolicyRules = asRecordArray(detail.impact, "added_policy_rules");
  const removedOperations = asRecordArray(detail.impact, "removed_operations");
  const removedViews = asRecordArray(detail.impact, "removed_views");
  const removedPolicyRules = asRecordArray(detail.impact, "removed_policy_rules");
  const isViewPrompt = addedViews.length > 0;
  const isPolicyPrompt = addedPolicyRules.length > 0;
  return (
    <div
      style={{
        border: `1px solid ${color.accent}`,
        borderRadius: 8,
        background: color.accentSoft,
        padding: 14,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
        <div>
          <div style={{ fontSize: 12, color: color.muted }}>Approval required</div>
          <div style={{ marginTop: 3, fontWeight: 720 }}>
            {isRollback ? "Rollback capability change" : isPolicyPrompt ? "Add reviewer access" : isViewPrompt ? "Add end-user app view" : "Add callable capability"}
          </div>
        </div>
        <StatusPill tone="accent">{prompt.tool}</StatusPill>
      </div>

      <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
        {!isRollback && (
          <>
            {isPolicyPrompt ? (
              <>
                <ImpactLine label="PolicyRule" value={String(addedPolicyRules[0]?.rule_id ?? "reviewers-can-read-review-queue")} />
                <ImpactLine label="Resource" value="view:review_queue" />
              </>
            ) : isViewPrompt ? (
              <>
                <ImpactLine label="View" value={String(addedViews[0]?.view_id ?? "review_queue")} />
                <ImpactLine label="Source" value={String(addedViews[0]?.source_operation_id ?? "list_bookmark_urls")} />
              </>
            ) : (
              <>
                <ImpactLine label="Operation" value={String(addedOperations[0]?.operation_id ?? "list_bookmark_urls")} />
                <ImpactLine label="Handler" value={String(addedOperations[0]?.handler_kind ?? "query")} />
              </>
            )}
            <ImpactLine label="Restart" value={String(detail.restart_required ?? true)} />
          </>
        )}
        {isRollback && (
          <>
            <ImpactLine label="Target history" value={`v${String(detail.target_history_version ?? 0)}`} />
            <ImpactLine label="Current history" value={`v${String(detail.current_history_version ?? "?")}`} />
            <ImpactLine label="Removed operation" value={String(removedOperations[0]?.operation_id ?? "list_bookmark_urls")} />
            {removedViews.length > 0 && (
              <ImpactLine label="Removed view" value={String(removedViews[0]?.view_id ?? "review_queue")} />
            )}
            {removedPolicyRules.length > 0 && (
              <ImpactLine label="Removed policy" value={String(removedPolicyRules[0]?.rule_id ?? "reviewers-can-read-review-queue")} />
            )}
          </>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
        <button
          data-testid="deny-inline-approval"
          onClick={() => onAnswer("deny")}
          style={buttonStyle("secondary")}
        >
          Deny
        </button>
        <button
          data-testid="allow-inline-approval"
          onClick={() => onAnswer("allow")}
          style={buttonStyle("primary")}
        >
          Allow
        </button>
      </div>
    </div>
  );
}

function PrimitiveRail({
  phase,
  pendingPrompt,
  historyVersion,
}: {
  phase: LifecyclePhase;
  pendingPrompt?: WirePermissionPrompt;
  historyVersion: number;
}) {
  const items = [
    { step: 0, label: "Builder intent", meta: "viewer action" },
    { step: 1, label: "definition.apply", meta: "add_operation" },
    { step: 2, label: "runtime restart", meta: "query proof" },
    { step: 3, label: "definition.apply", meta: "add_view" },
    { step: 4, label: "definition.apply", meta: "add_policy_rule" },
    { step: 5, label: "definition.rollback.validate", meta: "impact disclosure" },
    { step: 6, label: "definition.rollback.execute", meta: `history v${historyVersion}` },
  ];
  return (
    <div>
      <div style={{ fontSize: 12, color: color.muted }}>Framework primitives</div>
      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
        {items.map((item) => (
          <PrimitiveItem
            key={item.label}
            label={item.label}
            meta={item.meta}
            status={primitiveStatus(phase.step, item.step, pendingPrompt?.id)}
          />
        ))}
      </div>
    </div>
  );
}

function FrameworkEventProgress({
  frameworkEvents,
  pendingPrompt,
}: {
  frameworkEvents: readonly FrameworkEvent[];
  pendingPrompt?: WirePermissionPrompt;
}) {
  const latest = latestFrameworkEvent(frameworkEvents);
  const state = latest ? frameworkEventState(latest) : undefined;
  const timeline = state?.timeline ?? [];
  return (
    <section
      data-testid="framework-event-progress"
      style={{
        borderTop: `1px solid ${color.line}`,
        paddingTop: 14,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
        <div>
          <div style={{ fontSize: 12, color: color.muted }}>Framework event stream</div>
          <div style={{ marginTop: 4, fontWeight: 700 }}>
            {latest ? frameworkEventTitle(latest) : "Waiting for framework event"}
          </div>
          <div
            style={{
              marginTop: 5,
              color: color.muted,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 12,
              overflowWrap: "anywhere",
            }}
          >
            {state ? frameworkEventId(state) : pendingPrompt ? pendingPrompt.id : "no event yet"}
          </div>
          <div style={{ marginTop: 6, color: color.muted, fontSize: 12, lineHeight: 1.38 }}>
            {frameworkConsumerLine(latest, state, pendingPrompt)}
          </div>
        </div>
        <StatusPill tone={frameworkStatusTone(state?.status, pendingPrompt)}>
          {frameworkStatusLabel(state?.status, pendingPrompt)}
        </StatusPill>
      </div>
      <div style={{ marginTop: 12, display: "grid", gap: 7 }}>
        {(timeline.length > 0 ? timeline : [{ phase: "idle", at: 0 }]).slice(-7).map((entry, index, items) => {
          const active = Boolean(state && entry.phase === state.phase && index === items.length - 1);
          const done = Boolean(state && state.status !== "pending" && index === items.length - 1);
          return (
            <div
              key={`${entry.phase}-${entry.at}-${index}`}
              style={{
                display: "grid",
                gridTemplateColumns: "14px minmax(0, 1fr) auto",
                gap: 9,
                alignItems: "center",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: done
                    ? color.success
                    : active
                      ? color.accent
                      : color.lineStrong,
                  boxShadow: active && !done ? `0 0 0 4px ${color.accentSoft}` : undefined,
                }}
              />
              <div
                style={{
                  color: active || done ? color.ink : color.muted,
                  fontSize: 13,
                  fontWeight: active || done ? 680 : 560,
                  overflowWrap: "anywhere",
                }}
              >
                {frameworkPhaseLabel(entry.phase)}
              </div>
              <div style={{ color: color.muted, fontSize: 12 }}>{formatEventTime(entry.at)}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CurrentEvent({
  phase,
  pendingPrompt,
  frameworkEvents,
  raw,
  error,
}: {
  phase: LifecyclePhase;
  pendingPrompt?: WirePermissionPrompt;
  frameworkEvents: readonly FrameworkEvent[];
  raw?: string;
  error?: string;
}) {
  const latest = latestFrameworkEvent(frameworkEvents);
  const latestState = latest ? frameworkEventState(latest) : undefined;
  return (
    <div style={{ borderTop: `1px solid ${color.line}`, paddingTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 12, color: color.muted }}>Current event</div>
          <div style={{ marginTop: 4, fontWeight: 680 }}>
            {pendingPrompt
              ? `waiting for ${pendingPrompt.tool}`
              : latestState
                ? frameworkPhaseLabel(latestState.phase)
                : phase.event}
          </div>
        </div>
        <StatusPill tone={frameworkStatusTone(latestState?.status, pendingPrompt)}>
          {frameworkStatusLabel(latestState?.status, pendingPrompt, "settled")}
        </StatusPill>
      </div>

      {raw && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer", color: color.muted, fontSize: 13 }}>
            Raw event payload
          </summary>
          <pre
            data-testid="capability-lifecycle-result"
            style={{
              margin: "10px 0 0",
              padding: 12,
              overflow: "auto",
              borderRadius: 6,
              background: color.code,
              color: color.codeInk,
              fontSize: 12,
              lineHeight: 1.45,
              maxHeight: 180,
            }}
          >
            {raw}
          </pre>
        </details>
      )}
      {error && (
        <pre
          data-testid="capability-lifecycle-error"
          style={{
            margin: "12px 0 0",
            padding: 12,
            overflow: "auto",
            borderRadius: 6,
            background: color.warnSoft,
            color: color.warn,
            fontSize: 12,
            lineHeight: 1.45,
          }}
        >
          {error}
        </pre>
      )}
    </div>
  );
}

function StudioLifecycleDemo({
  variant,
  result,
  pendingPrompt,
  clearPendingPrompt,
  frameworkEvents,
  permissionLedger,
  showGovernanceEvidence,
  raw,
  error,
}: {
  variant: string;
  result: CapabilityLifecycleResult;
  pendingPrompt?: WirePermissionPrompt;
  clearPendingPrompt: () => void;
  frameworkEvents: readonly FrameworkEvent[];
  permissionLedger: ReturnType<typeof usePneumaState>["permissionLedger"];
  showGovernanceEvidence: boolean;
  raw?: string;
  error?: string;
}) {
  const sendAction = useAction();
  const respond = usePermissionResponder();
  const viewportWidth = useViewportWidth();
  const phase = lifecyclePhase(result, pendingPrompt?.id);
  const rowUrls = lifecycleRowUrls(result);
  const queryUrl = lifecycleQueryUrl(result);
  const historyVersion = result.history_version ?? result.history_version_after_policy ?? result.history_version_after_view ?? result.history_version_after_add ?? 0;
  const compact = viewportWidth < 1120;
  const canRequestAdd = result.stage === "baseline" && !pendingPrompt;
  const canRequestView = result.stage === "operation_added" && !pendingPrompt;
  const canRequestPolicy = result.stage === "view_added" && !pendingPrompt;
  const canRequestRollback = (
    result.stage === "policy_added"
    || result.stage === "policy_denied"
    || result.stage === "operation_added"
    || result.stage === "view_denied"
  ) && !pendingPrompt;

  const answerPrompt = React.useCallback((decision: "allow" | "deny") => {
    if (!pendingPrompt) return;
    respond(pendingPrompt.id, decision);
    clearPendingPrompt();
  }, [clearPendingPrompt, pendingPrompt, respond]);

  return (
    <section
      data-testid="studio-demo"
      style={{
        minHeight: "100vh",
        background: studio.paper,
        color: studio.ink,
      }}
    >
      <header
        style={{
          minHeight: 78,
          display: "grid",
          gridTemplateColumns: compact ? "minmax(0, 1fr)" : "minmax(0, 1fr) auto",
          gap: 16,
          alignItems: "center",
          padding: "18px 28px",
          borderBottom: `1px solid ${studio.line}`,
          boxSizing: "border-box",
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: studio.muted }}>Pneuma framework live demo</div>
          <h1 style={{ margin: "3px 0 0", maxWidth: 680, fontSize: 24, lineHeight: 1.12, fontWeight: 760 }}>
            Reader Bookmarks, rebuilt live
          </h1>
        </div>
        <div style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          justifyContent: compact ? "flex-start" : "flex-end",
          alignItems: "center",
        }}>
          <a href="?scenario=capability-lifecycle" style={studioLinkStyle(false)}>Classic proof</a>
          <a href="?scenario=capability-lifecycle&variant=studio" style={studioLinkStyle(variant === "studio")}>Studio narrative</a>
          <a href="?scenario=capability-lifecycle&variant=governance" style={studioLinkStyle(variant === "governance")}>Governance proof</a>
          <button data-testid="replay-demo" onClick={() => window.location.reload()} style={studioButtonStyle("secondary")}>
            Replay
          </button>
        </div>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: compact ? "minmax(0, 1fr)" : "minmax(0, 1.48fr) minmax(360px, 0.72fr)",
          minHeight: "calc(100vh - 79px)",
        }}
      >
        <StudioProductTheater
          result={result}
          phase={phase}
          rowUrl={rowUrls[0] ?? "https://example.com/full-chain-demo"}
          queryUrl={queryUrl}
          historyVersion={historyVersion}
          compact={compact}
        />
        <StudioBuilderStudio
          result={result}
          phase={phase}
          pendingPrompt={pendingPrompt}
          canRequestAdd={canRequestAdd}
          canRequestView={canRequestView}
          canRequestPolicy={canRequestPolicy}
          canRequestRollback={canRequestRollback}
          onRequestAdd={() => sendAction({ kind: "click", target: "capability.request-add" })}
          onRequestView={() => sendAction({ kind: "click", target: "capability.request-view" })}
          onRequestPolicy={() => sendAction({ kind: "click", target: "capability.request-policy" })}
          onRequestRollback={() => sendAction({ kind: "click", target: "capability.request-rollback" })}
          onAnswerPrompt={answerPrompt}
          raw={raw}
          error={error}
          compact={compact}
          frameworkEvents={frameworkEvents}
          permissionLedger={permissionLedger}
          showGovernanceEvidence={showGovernanceEvidence}
        />
      </div>
    </section>
  );
}

function StudioProductTheater({
  result,
  phase,
  rowUrl,
  queryUrl,
  historyVersion,
  compact,
}: {
  result: CapabilityLifecycleResult;
  phase: LifecyclePhase;
  rowUrl: string;
  queryUrl?: string;
  historyVersion: number;
  compact: boolean;
}) {
  return (
    <section
      style={{
        padding: compact ? "22px 20px 28px" : "28px 30px 34px",
        boxSizing: "border-box",
      }}
    >
      <StudioMilestoneStrip phase={phase} compact={compact} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: compact ? "minmax(0, 1fr)" : "minmax(0, 1.08fr) minmax(260px, 0.62fr)",
          gap: compact ? 22 : 28,
          marginTop: 22,
          alignItems: "start",
        }}
      >
        <StudioReaderApp result={result} phase={phase} rowUrl={rowUrl} queryUrl={queryUrl} compact={compact} />
        <StudioStackSummary result={result} phase={phase} historyVersion={historyVersion} />
      </div>

      <StudioSystemViewer
        result={result}
        phase={phase}
        rowUrl={rowUrl}
        historyVersion={historyVersion}
        compact={compact}
      />
    </section>
  );
}

function StudioMilestoneStrip({
  phase,
  compact,
}: {
  phase: LifecyclePhase;
  compact: boolean;
}) {
  const items = [
    {
      label: "Business data",
      value: "source row exists",
      active: true,
      done: true,
    },
    {
      label: "Capability surface",
      value: phase.capabilityState === "absent"
        ? "not exposed"
        : phase.capabilityState === "pending"
          ? "approval pending"
          : phase.capabilityState === "removed"
            ? "rolled back"
            : "callable",
      active: phase.capabilityState === "pending" || phase.capabilityState === "live",
      done: phase.capabilityState === "live",
    },
    {
      label: "Governed change",
      value: phase.capabilityState === "removed"
        ? "rollback proved"
        : phase.capabilityState === "live"
          ? "ready for rollback review"
          : "waiting for proposal",
      active: phase.capabilityState === "removed" || phase.capabilityState === "live",
      done: phase.capabilityState === "removed",
    },
  ];
  return (
    <div
      data-testid="studio-narrative-strip"
      style={{
        display: "grid",
        gridTemplateColumns: compact ? "minmax(0, 1fr)" : "repeat(3, minmax(0, 1fr))",
        borderTop: `1px solid ${studio.line}`,
        borderBottom: `1px solid ${studio.line}`,
        background: studio.sheet,
      }}
    >
      {items.map((item, index) => (
        <div
          key={item.label}
          style={{
            minHeight: 72,
            padding: "13px 15px",
            borderRight: !compact && index < items.length - 1 ? `1px solid ${studio.line}` : 0,
            borderBottom: compact && index < items.length - 1 ? `1px solid ${studio.line}` : 0,
            boxSizing: "border-box",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: item.done ? studio.green : item.active ? studio.amber : studio.lineStrong,
              }}
            />
            <div style={{ color: studio.muted, fontSize: 12 }}>{item.label}</div>
          </div>
          <div style={{ marginTop: 8, color: studio.ink, fontSize: 17, fontWeight: 740, lineHeight: 1.15 }}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function StudioReaderApp({
  result,
  phase,
  rowUrl,
  queryUrl,
  compact,
}: {
  result: CapabilityLifecycleResult;
  phase: LifecyclePhase;
  rowUrl: string;
  queryUrl?: string;
  compact: boolean;
}) {
  const live = operationIsLive(result);
  const removed = phase.capabilityState === "removed";
  const pending = phase.capabilityState === "pending";
  const viewMounted = result.view_visible_after_add === true && result.stage !== "rolled_back";
  const [role, setRole] = React.useState<EndUserRole>("guest");
  const viewVisible = viewMounted && roleCanSeeReviewQueue(result, role);
  const bookmark = studioBookmarkSnapshot(result, rowUrl);
  const activeView = activeLifecycleView(result);
  const rendererView = lifecycleRendererView(activeView);
  const sourceRows = viewSourceRows(result, bookmarkRowForView(bookmark));
  const viewTitle = viewRendererTitle(rendererView, sourceRows, activeView?.presentation_columns);
  const workflowTone = live ? "amber" : removed ? "green" : pending ? "amber" : "neutral";
  return (
    <div
      style={{
        background: studio.sheet,
        border: `1px solid ${studio.line}`,
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 18,
          alignItems: "center",
          padding: "16px 18px",
          borderBottom: `1px solid ${studio.line}`,
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: studio.muted }}>End-user app</div>
          <div style={{ marginTop: 3, fontSize: 19, fontWeight: 760 }}>Reader Bookmarks</div>
          <div style={{ marginTop: 3, color: studio.body, fontSize: 13 }}>
            Source inbox for preparing AI research handoffs
          </div>
        </div>
        <StudioMark tone={workflowTone}>
          {capabilityLabel(phase.capabilityState)}
        </StudioMark>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: compact ? "minmax(0, 1fr)" : "minmax(190px, 0.44fr) minmax(0, 1fr)",
          minHeight: 394,
        }}
      >
        <div
          style={{
            borderRight: compact ? 0 : `1px solid ${studio.line}`,
            borderBottom: compact ? `1px solid ${studio.line}` : 0,
            background: studio.wash,
          }}
        >
          <div style={{ padding: "13px 14px", borderBottom: `1px solid ${studio.line}` }}>
            <div style={{ color: studio.muted, fontSize: 12 }}>Inbox</div>
            <div style={{ marginTop: 4, fontWeight: 740 }}>Sources for brief</div>
          </div>
          <StudioSourceRow
            selected
            title={bookmark.title}
            lens={bookmark.lens}
            source={bookmark.source}
          />
          <div style={{ padding: "13px 14px", borderTop: `1px solid ${studio.line}` }}>
            <div style={{ color: studio.muted, fontSize: 12 }}>Lenses</div>
            <div style={{ marginTop: 9, display: "flex", flexWrap: "wrap", gap: 7 }}>
              <StudioAppTab active>Framework</StudioAppTab>
              <StudioAppTab>Personal tools</StudioAppTab>
              <StudioAppTab>SaaS</StudioAppTab>
            </div>
          </div>
        </div>

        <div style={{ padding: "17px 19px 19px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start" }}>
            <div>
              <div style={{ color: studio.muted, fontSize: 12 }}>Selected source</div>
              <h2 style={{ margin: "5px 0 0", fontSize: 23, lineHeight: 1.18, fontWeight: 740 }}>
                {bookmark.title}
              </h2>
            </div>
            <StudioMark tone="neutral">{bookmark.lens}</StudioMark>
          </div>

          <p style={{ margin: "9px 0 0", color: studio.body, lineHeight: 1.48 }}>
            Saved into a research lens so a later AI session can work from the exact source set.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 0,
              marginTop: 15,
              borderTop: `1px solid ${studio.line}`,
              borderBottom: `1px solid ${studio.line}`,
            }}
          >
            <StudioMetaCell label="Source" value={bookmark.source} />
            <StudioMetaCell label="Lens" value={bookmark.lens} />
            <StudioMetaCell label="Selected" value="1 URL" />
          </div>

          <div
            style={{
              marginTop: 13,
              padding: "10px 11px",
              border: `1px solid ${studio.line}`,
              borderRadius: 6,
              background: studio.wash,
            }}
          >
            <div style={{ fontSize: 12, color: studio.muted }}>Canonical URL</div>
            <code
              style={{
                display: "block",
                marginTop: 5,
                color: studio.ink,
                overflowWrap: "anywhere",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 12,
              }}
            >
              {bookmark.url}
            </code>
          </div>

          <div
            style={{
              marginTop: 17,
              border: `1px solid ${viewVisible ? studio.amber : studio.line}`,
              borderRadius: 8,
              overflow: "hidden",
              background: viewVisible ? studio.amberWash : studio.sheet,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 14,
                alignItems: "center",
                padding: "11px 12px",
                borderBottom: `1px solid ${live ? "oklch(79% 0.055 52)" : studio.line}`,
              }}
            >
              <div>
                <div style={{ fontSize: 12, color: studio.muted }}>AI handoff</div>
                <div style={{ marginTop: 3, fontWeight: 740 }}>
                  {viewMounted ? viewTitle : "Export selected URLs"}
                </div>
              </div>
              <StudioRoleSwitch value={role} onChange={setRole} />
              <StudioMark tone={workflowTone}>
                {viewVisible ? "visible" : viewMounted ? "policy gated" : live ? "ready" : removed ? "rolled back" : pending ? "approval pending" : "needs capability"}
              </StudioMark>
            </div>
            <div style={{ padding: "12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "22px minmax(0, 1fr)", gap: 9 }}>
                <StudioWorkflowStep done label="Collect source" />
                <StudioWorkflowStep done label="Place in research lens" />
                <StudioWorkflowStep
                  done={live}
                  label={live ? "URL export returned the selected source" : "URL export is not callable yet"}
                />
                <StudioWorkflowStep
                  done={viewMounted}
                  label={viewMounted ? "Review Queue view definition exists" : "End-user view is not mounted yet"}
                />
                <StudioWorkflowStep
                  done={viewVisible}
                  label={viewVisible ? "Reviewer policy can see the queue" : "Selected role cannot see the queue yet"}
                />
              </div>
              {viewVisible ? (
                <div
                  data-testid="studio-review-queue-view"
                  style={{
                    marginTop: 12,
                  }}
                >
                  <PneumaViewRenderer
                    view={rendererView}
                    rows={sourceRows}
                    fallbackColumns={activeView?.presentation_columns}
                    style={studioViewRendererStyle}
                  />
                </div>
              ) : viewMounted ? (
                <div
                  data-testid="studio-review-queue-policy-gate"
                  style={{
                    marginTop: 12,
                    padding: "13px 14px",
                    border: `1px solid ${studio.line}`,
                    borderRadius: 7,
                    background: studio.sheet,
                    color: studio.body,
                    lineHeight: 1.42,
                  }}
                >
                  Review Queue is part of app definition, but {role === "guest" ? "Guest" : "Reviewer"} has no readable surface until PolicyRule allows it.
                </div>
              ) : null}
              <div
                style={{
                  marginTop: 12,
                  padding: "10px 11px",
                  border: `1px solid ${studio.line}`,
                  borderRadius: 6,
                  background: studio.sheet,
                }}
              >
                <div style={{ fontSize: 12, color: studio.muted }}>Runtime output</div>
                <code
                  data-testid="capability-output"
                  style={{
                    display: "block",
                    marginTop: 5,
                    color: live ? studio.ink : removed ? studio.green : studio.faint,
                    overflowWrap: "anywhere",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    fontSize: 12,
                  }}
                >
                  {removed ? "Capability removed. Bookmark row remains." : queryUrl ?? "No callable operation yet."}
                </code>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StudioAppTab({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 24,
        padding: "0 8px",
        border: `1px solid ${active ? studio.amber : studio.line}`,
        borderRadius: 7,
        background: active ? studio.amberWash : studio.sheet,
        color: active ? studio.amber : studio.body,
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {children}
    </span>
  );
}

function StudioSourceRow({
  selected,
  title,
  lens,
  source,
}: {
  selected?: boolean;
  title: string;
  lens: string;
  source: string;
}) {
  return (
    <div
      style={{
        padding: "13px 14px",
        background: selected ? studio.sheet : "transparent",
        borderBottom: `1px solid ${studio.line}`,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 730, lineHeight: 1.28 }}>{title}</div>
          <div style={{ marginTop: 6, color: studio.muted, fontSize: 12, lineHeight: 1.35 }}>{source}</div>
        </div>
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            marginTop: 5,
            background: selected ? studio.amber : studio.lineStrong,
            flex: "0 0 auto",
          }}
        />
      </div>
      <div style={{ marginTop: 9, color: studio.body, fontSize: 12 }}>{lens}</div>
    </div>
  );
}

function StudioMetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: "10px 11px", borderRight: `1px solid ${studio.line}` }}>
      <div style={{ color: studio.muted, fontSize: 12 }}>{label}</div>
      <div style={{ marginTop: 5, fontWeight: 720, overflowWrap: "anywhere" }}>{value}</div>
    </div>
  );
}

function StudioWorkflowStep({ done, label }: { done: boolean; label: string }) {
  return (
    <>
      <span
        aria-hidden
        style={{
          width: 9,
          height: 9,
          borderRadius: "50%",
          marginTop: 5,
          background: done ? studio.green : studio.lineStrong,
        }}
      />
      <span style={{ color: done ? studio.ink : studio.muted, lineHeight: 1.35 }}>{label}</span>
    </>
  );
}

function StudioRoleSwitch({
  value,
  onChange,
}: {
  value: EndUserRole;
  onChange: (value: EndUserRole) => void;
}) {
  const options: Array<{ value: EndUserRole; label: string }> = [
    { value: "guest", label: "Guest" },
    { value: "reviewer", label: "Reviewer" },
  ];
  return (
    <div
      role="tablist"
      aria-label="End-user role"
      style={{
        display: "inline-flex",
        padding: 3,
        border: `1px solid ${studio.line}`,
        borderRadius: 7,
        background: studio.sheet,
        flex: "0 0 auto",
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={selected}
            data-testid={`studio-role-${option.value}`}
            onClick={() => onChange(option.value)}
            style={{
              minHeight: 26,
              minWidth: 66,
              padding: "0 9px",
              border: 0,
              borderRadius: 5,
              background: selected ? studio.wash : "transparent",
              color: selected ? studio.ink : studio.muted,
              cursor: "pointer",
              fontWeight: selected ? 730 : 600,
              fontSize: 12,
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function StudioStackSummary({
  result,
  phase,
  historyVersion,
}: {
  result: CapabilityLifecycleResult;
  phase: LifecyclePhase;
  historyVersion: number;
}) {
  const operationRows = result.definition_operations ?? [];
  const viewRows = result.definition_views ?? [];
  const policyRows = result.definition_policy_rules ?? [];
  const rowCount = result.row_count ?? result.row_count_after_add ?? 1;
  return (
    <aside
      style={{
        background: studio.sheet,
        border: `1px solid ${studio.line}`,
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "15px 16px", borderBottom: `1px solid ${studio.line}` }}>
        <div style={{ fontSize: 12, color: studio.muted }}>Software stack</div>
        <div style={{ marginTop: 4, fontSize: 18, fontWeight: 740 }}>Schema, service, API, policy</div>
      </div>
      <div style={{ display: "grid" }}>
        <StudioFact label="Schema rows" value={String(rowCount)} detail="demo data in bookmarks stays stable" />
        <StudioFact
          label="Domain service"
          value={String(operationRows.length)}
          detail={operationRows.length === 1 ? "list_bookmark_urls is installed" : "URL export is absent"}
          accent={operationRows.length === 1}
        />
        <StudioFact
          label="App views"
          value={String(viewRows.length)}
          detail={viewRows.length === 1 ? "review_queue is defined" : "end-user app unchanged"}
          accent={viewRows.length === 1}
        />
        <StudioFact
          label="Policy rules"
          value={String(policyRows.length)}
          detail={policyRows.length === 1 ? "reviewer can read Review Queue" : "Review Queue remains hidden"}
          accent={policyRows.length === 1}
        />
        <StudioFact label="API contract" value={`v${historyVersion}`} detail={phase.event} />
      </div>
    </aside>
  );
}

function StudioFact({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <div style={{ padding: "14px 16px", borderBottom: `1px solid ${studio.line}` }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div style={{ color: studio.muted, fontSize: 12 }}>{label}</div>
        <div style={{ color: accent ? studio.amber : studio.ink, fontSize: 22, fontWeight: 760 }}>{value}</div>
      </div>
      <div style={{ marginTop: 5, color: studio.body, fontSize: 13, lineHeight: 1.4 }}>{detail}</div>
    </div>
  );
}

function StudioSystemViewer({
  result,
  phase,
  rowUrl,
  historyVersion,
  compact,
}: {
  result: CapabilityLifecycleResult;
  phase: LifecyclePhase;
  rowUrl: string;
  historyVersion: number;
  compact: boolean;
}) {
  const operationRows = result.definition_operations ?? [];
  const viewRows = result.definition_views ?? [];
  const policyRows = result.definition_policy_rules ?? [];
  const historyRows = result.history_entries ?? [];
  const schemaTable = findSchemaTable(result, "bookmarks");
  const schemaColumns = schemaTable?.columns?.length ? schemaTable.columns : fallbackBookmarkColumns();
  const demoRows = schemaTable?.demo_rows?.length ? schemaTable.demo_rows : [fallbackBookmarkRow(rowUrl)];
  const serviceRows = studioDomainServiceRows(phase, operationRows);
  const apiRows = studioApiRows(phase, operationRows);
  return (
    <section
      data-testid="studio-system-viewer"
      style={{
        marginTop: 26,
        paddingTop: 18,
        borderTop: `1px solid ${studio.line}`,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "end" }}>
        <div>
          <div style={{ fontSize: 12, color: studio.muted }}>System viewer</div>
          <h2 style={{ margin: "3px 0 0", fontSize: 21, lineHeight: 1.18, fontWeight: 750 }}>
            Traditional app layers, changed by conversation.
          </h2>
        </div>
        <StudioMark tone={policyRows.length > 0 || viewRows.length > 0 || operationRows.length > 0 ? "amber" : phase.capabilityState === "removed" ? "green" : "neutral"}>
          schema -> service -> api -> view -> policy
        </StudioMark>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: compact ? "minmax(0, 1fr)" : "repeat(5, minmax(0, 1fr))",
          gap: compact ? 18 : 22,
          marginTop: 18,
        }}
      >
        <StudioLedgerPane eyebrow="Layer 1" title="Schema + demo data" status="stable">
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <div style={{ marginBottom: 7, color: studio.muted, fontSize: 12 }}>bookmarks columns</div>
              <StudioMiniTable
                columns={["column", "type", "nullable"]}
                rows={schemaColumns.map((column) => [
                  column.name ?? "-",
                  column.type ?? "Text",
                  column.nullable ? "yes" : "no",
                ])}
              />
            </div>
            <div>
              <div style={{ marginBottom: 7, color: studio.muted, fontSize: 12 }}>demo row</div>
              <StudioMiniTable
                columns={["id", "title", "url", "lens"]}
                rows={demoRows.map((row) => [
                  valueText(row.id),
                  valueText(row.title),
                  valueText(row.url),
                  valueText(row.lens),
                ])}
              />
            </div>
          </div>
        </StudioLedgerPane>
        <StudioLedgerPane
          eyebrow="Layer 2"
          title="Domain service"
          status={operationRows.length === 1 ? "extended" : "baseline"}
          tone={operationRows.length === 1 ? "amber" : phase.capabilityState === "removed" ? "green" : "neutral"}
        >
          <div style={{ display: "grid", gap: 9 }}>
            {serviceRows.map((row) => (
              <StudioServiceRow key={row.name} {...row} />
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            {operationRows.length > 0 ? (
              <div data-testid="definition-operations-table">
                <StudioMiniTable
                  columns={["operation_id", "handler", "version"]}
                  rows={operationRows.map((row) => [
                    row.operation_id ?? "unknown",
                    row.handler_kind ?? "query",
                    row.definition_version === undefined ? "-" : `v${row.definition_version}`,
                  ])}
                />
              </div>
            ) : (
              <StudioEmptyLine testId="definition-operations-empty">
                {phase.capabilityState === "removed"
                  ? "Rollback removed the operation definition row."
                  : "No Builder-authored operation definition yet."}
              </StudioEmptyLine>
            )}
          </div>
        </StudioLedgerPane>
        <StudioLedgerPane
          eyebrow="Layer 3"
          title="API surface"
          status={operationRows.length === 1 ? "route exposed" : "not exposed"}
          tone={operationRows.length === 1 ? "amber" : phase.capabilityState === "removed" ? "green" : "neutral"}
        >
          <div style={{ display: "grid", gap: 9 }}>
            {apiRows.map((row) => (
              <StudioServiceRow key={row.name} {...row} />
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <StudioMiniTable
              columns={["history", "actor", "description"]}
              rows={historyRows.length > 0
                ? historyRows.map((row) => [
                  row.version === undefined ? "-" : `v${row.version}`,
                  row.actor_kind ?? "framework",
                  row.description || "definition snapshot",
                ])
                : [["v0", "framework", "baseline app definition"]]}
            />
          </div>
        </StudioLedgerPane>
        <StudioLedgerPane
          eyebrow="Layer 4"
          title="App view"
          status={viewRows.length === 1 ? "mounted" : "not mounted"}
          tone={viewRows.length === 1 ? "amber" : phase.capabilityState === "removed" ? "green" : "neutral"}
        >
          {viewRows.length > 0 ? (
            <div data-testid="definition-views-table">
              <StudioMiniTable
                columns={["view_id", "source", "columns"]}
                rows={viewRows.map((row) => [
                  row.view_id ?? "unknown",
                  row.source_operation_id ?? "list_bookmark_urls",
                  row.presentation_columns?.join(", ") || "declared presentation",
                ])}
              />
            </div>
          ) : (
            <StudioEmptyLine testId="definition-views-empty">
              {phase.capabilityState === "removed"
                ? "Rollback removed the view definition row."
                : "No Builder-authored view definition yet."}
            </StudioEmptyLine>
          )}
        </StudioLedgerPane>
        <StudioLedgerPane
          eyebrow="Layer 5"
          title="Policy"
          status={policyRows.length === 1 ? "role gated" : "restricted"}
          tone={policyRows.length === 1 ? "amber" : phase.capabilityState === "removed" ? "green" : "neutral"}
        >
          {policyRows.length > 0 ? (
            <div data-testid="definition-policy-rules-table">
              <StudioMiniTable
                columns={["rule_id", "resource", "version"]}
                rows={policyRows.map((row) => [
                  row.rule_id ?? "unknown",
                  `${row.resource_kind ?? "view"}:${row.resource_id ?? "review_queue"}`,
                  row.definition_version === undefined ? "-" : `v${row.definition_version}`,
                ])}
              />
            </div>
          ) : (
            <StudioEmptyLine testId="definition-policy-rules-empty">
              {phase.capabilityState === "removed"
                ? "Rollback removed the PolicyRule definition row."
                : "No Builder-authored PolicyRule yet. End-user access stays restricted."}
            </StudioEmptyLine>
          )}
        </StudioLedgerPane>
      </div>
    </section>
  );
}

type StudioServiceRowModel = {
  name: string;
  contract: string;
  status: string;
  tone: "neutral" | "amber" | "green";
};

type StudioBookmarkSnapshot = {
  title: string;
  url: string;
  source: string;
  lens: string;
};

function studioBookmarkSnapshot(result: CapabilityLifecycleResult, rowUrl: string): StudioBookmarkSnapshot {
  const row = findSchemaTable(result, "bookmarks")?.demo_rows?.[0] ?? fallbackBookmarkRow(rowUrl);
  return {
    title: valueText(row.title) === "-" ? "Pneuma architecture notes" : valueText(row.title),
    url: valueText(row.url) === "-" ? rowUrl : valueText(row.url),
    source: valueText(row.source) === "-" ? "Architecture research" : valueText(row.source),
    lens: valueText(row.lens) === "-" ? "Framework primitives" : valueText(row.lens),
  };
}

function findSchemaTable(result: CapabilityLifecycleResult, tableId: string): SchemaTableRow | undefined {
  return result.schema_tables?.find((table) => table.table_id === tableId);
}

function fallbackBookmarkColumns(): SchemaColumnRow[] {
  return [
    { name: "title", type: "Text" },
    { name: "url", type: "URL" },
    { name: "source", type: "Text" },
    { name: "lens", type: "Text" },
    { name: "saved_at", type: "Date" },
  ];
}

function fallbackBookmarkRow(rowUrl: string): Record<string, unknown> {
  return {
    id: "bookmark-1",
    title: "Pneuma architecture notes",
    url: rowUrl,
    source: "Architecture research",
    lens: "Framework primitives",
    saved_at: "2026-04-27",
  };
}

function activeLifecycleView(result: CapabilityLifecycleResult): DefinitionViewRow | undefined {
  return result.definition_views?.find((view) => view.view_id === "review_queue")
    ?? result.definition_views?.[0];
}

function bookmarkRowForView(bookmark: StudioBookmarkSnapshot): Record<string, unknown> {
  return {
    title: bookmark.title,
    url: bookmark.url,
    source: bookmark.source,
    lens: bookmark.lens,
  };
}

function viewSourceRows(
  result: CapabilityLifecycleResult,
  fallback: Record<string, unknown>,
): Array<Record<string, unknown>> {
  const rows = result.query_output_before_rollback?.rows
    ?? result.query_output_after_add?.rows;
  if (rows === undefined) return [fallback];
  return rows.map((row) => ({ ...fallback, ...row }));
}

function lifecycleRendererView(view: DefinitionViewRow | undefined): ViewRendererView {
  return {
    id: view?.view_id ?? "review_queue",
    name: view?.name ?? "Review Queue",
    kind: view?.kind ?? "table",
    presentation: view?.presentation as ViewRendererView["presentation"],
  };
}

function viewRendererTitle(
  view: ViewRendererView,
  rows: Array<Record<string, unknown>>,
  fallbackColumns?: string[],
): string {
  return normalizeViewPresentationForRender(view.presentation, {
    title: view.name,
    columns: fallbackColumns,
    rows,
  }).title;
}

function studioDomainServiceRows(
  phase: LifecyclePhase,
  operationRows: DefinitionOperationRow[],
): StudioServiceRowModel[] {
  const operation = operationRows[0];
  return [
    {
      name: "BookmarkStore",
      contract: "persist saved source rows and keep row ids stable",
      status: "baseline",
      tone: "neutral",
    },
    {
      name: "ReaderLensService",
      contract: "attach source and lens metadata for the reader workflow",
      status: "baseline",
      tone: "neutral",
    },
    {
      name: operation?.operation_id ?? "list_bookmark_urls",
      contract: `read ${operation?.source_table ?? "bookmarks"}.url for another AI workflow`,
      status: domainCapabilityStatus(phase.capabilityState),
      tone: phase.capabilityState === "live" || phase.capabilityState === "pending"
        ? "amber"
        : phase.capabilityState === "removed"
          ? "green"
          : "neutral",
    },
  ];
}

function studioApiRows(
  phase: LifecyclePhase,
  operationRows: DefinitionOperationRow[],
): StudioServiceRowModel[] {
  const operation = operationRows[0];
  return [
    {
      name: "GET /app/bookmarks",
      contract: "render the end-user Reader Bookmarks surface",
      status: "stable",
      tone: "neutral",
    },
    {
      name: "POST /api/operations/list_bookmark_urls",
      contract: operation
        ? `${operation.action ?? "read"} operation, reads_only=${String(operation.reads_only ?? true)}`
        : "not exposed until the definition row exists",
      status: apiCapabilityStatus(phase.capabilityState),
      tone: phase.capabilityState === "live" || phase.capabilityState === "pending"
        ? "amber"
        : phase.capabilityState === "removed"
          ? "green"
          : "neutral",
    },
    {
      name: "wire permission envelope",
      contract: "approval gates definition.apply and rollback.validate",
      status: phase.capabilityState === "pending" ? "waiting" : "available",
      tone: phase.capabilityState === "pending" ? "amber" : "neutral",
    },
  ];
}

function domainCapabilityStatus(state: LifecyclePhase["capabilityState"]): string {
  if (state === "live") return "installed";
  if (state === "pending") return "proposed";
  if (state === "removed") return "rolled back";
  return "not installed";
}

function apiCapabilityStatus(state: LifecyclePhase["capabilityState"]): string {
  if (state === "live") return "exposed";
  if (state === "pending") return "approval pending";
  if (state === "removed") return "removed";
  return "hidden";
}

function valueText(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function StudioServiceRow({
  name,
  contract,
  status,
  tone,
}: StudioServiceRowModel) {
  return (
    <div
      style={{
        border: `1px solid ${studio.line}`,
        borderRadius: 7,
        background: studio.sheet,
        padding: "10px 11px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 12,
              color: studio.ink,
              overflowWrap: "anywhere",
            }}
          >
            {name}
          </div>
          <div style={{ marginTop: 5, color: studio.body, fontSize: 12, lineHeight: 1.4 }}>
            {contract}
          </div>
        </div>
        <StudioMark tone={tone}>{status}</StudioMark>
      </div>
    </div>
  );
}

function StudioBuilderStudio({
  result,
  phase,
  pendingPrompt,
  canRequestAdd,
  canRequestView,
  canRequestPolicy,
  canRequestRollback,
  onRequestAdd,
  onRequestView,
  onRequestPolicy,
  onRequestRollback,
  onAnswerPrompt,
  raw,
  error,
  compact,
  frameworkEvents,
  permissionLedger,
  showGovernanceEvidence,
}: {
  result: CapabilityLifecycleResult;
  phase: LifecyclePhase;
  pendingPrompt?: WirePermissionPrompt;
  canRequestAdd: boolean;
  canRequestView: boolean;
  canRequestPolicy: boolean;
  canRequestRollback: boolean;
  onRequestAdd: () => boolean;
  onRequestView: () => boolean;
  onRequestPolicy: () => boolean;
  onRequestRollback: () => boolean;
  onAnswerPrompt: (decision: "allow" | "deny") => void;
  raw?: string;
  error?: string;
  compact: boolean;
  frameworkEvents: readonly FrameworkEvent[];
  permissionLedger: ReturnType<typeof usePneumaState>["permissionLedger"];
  showGovernanceEvidence: boolean;
}) {
  return (
    <aside
      style={{
        borderLeft: compact ? 0 : `1px solid ${studio.line}`,
        borderTop: compact ? `1px solid ${studio.line}` : 0,
        background: studio.sheet,
        minHeight: compact ? "auto" : "calc(100vh - 79px)",
        display: "grid",
        gridTemplateRows: "auto auto minmax(0, 1fr)",
      }}
    >
      <div style={{ padding: "20px 22px", borderBottom: `1px solid ${studio.line}` }}>
        <div style={{ fontSize: 12, color: studio.muted }}>Builder studio</div>
        <h2 style={{ margin: "3px 0 0", fontSize: 20, lineHeight: 1.2, fontWeight: 750 }}>
          Conversation edits schema, service, API, view, and policy
        </h2>
      </div>

      <div style={{ padding: "18px 22px", borderBottom: `1px solid ${studio.line}` }}>
        <StudioConversation result={result} phase={phase} pendingPrompt={pendingPrompt} />
      </div>

      <div style={{ padding: "18px 22px 24px", display: "grid", alignContent: "start", gap: 18 }}>
        {pendingPrompt ? (
          <StudioApprovalCard prompt={pendingPrompt} onAnswer={onAnswerPrompt} />
        ) : (
          <StudioActionPanel
            phase={phase}
            canRequestAdd={canRequestAdd}
            canRequestView={canRequestView}
            canRequestPolicy={canRequestPolicy}
            canRequestRollback={canRequestRollback}
            onRequestAdd={onRequestAdd}
            onRequestView={onRequestView}
            onRequestPolicy={onRequestPolicy}
            onRequestRollback={onRequestRollback}
          />
        )}
        {showGovernanceEvidence && (
          <GovernanceEvidencePanel
            pending={permissionLedger.pending}
            recent={permissionLedger.recent}
          />
        )}
        <StudioPrimitivePath phase={phase} pendingPrompt={pendingPrompt} />
        <StudioFrameworkProgress frameworkEvents={frameworkEvents} pendingPrompt={pendingPrompt} />
        <StudioTrace
          phase={phase}
          pendingPrompt={pendingPrompt}
          frameworkEvents={frameworkEvents}
          raw={raw}
          error={error}
        />
      </div>
    </aside>
  );
}

function StudioConversation({
  result,
  phase,
  pendingPrompt,
}: {
  result: CapabilityLifecycleResult;
  phase: LifecyclePhase;
  pendingPrompt?: WirePermissionPrompt;
}) {
  const rows = [
    ["Builder", "Can this app expose saved URLs to another workflow?"],
    ["Agent", agentLine(result, pendingPrompt, phase)],
    ["Framework", frameworkLine(result, pendingPrompt, phase)],
  ];
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {rows.map(([who, text]) => (
        <div key={who} style={{ display: "grid", gridTemplateColumns: "86px minmax(0, 1fr)", gap: 12 }}>
          <div style={{ color: studio.muted, fontSize: 12, paddingTop: 2 }}>{who}</div>
          <div style={{ color: studio.body, lineHeight: 1.48 }}>{text}</div>
        </div>
      ))}
    </div>
  );
}

function StudioActionPanel({
  phase,
  canRequestAdd,
  canRequestView,
  canRequestPolicy,
  canRequestRollback,
  onRequestAdd,
  onRequestView,
  onRequestPolicy,
  onRequestRollback,
}: {
  phase: LifecyclePhase;
  canRequestAdd: boolean;
  canRequestView: boolean;
  canRequestPolicy: boolean;
  canRequestRollback: boolean;
  onRequestAdd: () => boolean;
  onRequestView: () => boolean;
  onRequestPolicy: () => boolean;
  onRequestRollback: () => boolean;
}) {
  if (phase.capabilityState === "removed") {
    return (
      <section style={{ border: `1px solid ${studio.line}`, borderRadius: 8, padding: 14, background: studio.wash }}>
        <div style={{ fontWeight: 740 }}>Lifecycle complete</div>
        <p style={{ margin: "6px 0 12px", color: studio.body, lineHeight: 1.45 }}>
          The app changed, proved the new capability, then rolled it back without touching business data.
        </p>
        <button onClick={() => window.location.reload()} style={studioButtonStyle("primary")}>Replay</button>
      </section>
    );
  }
  return (
    <section style={{ border: `1px solid ${studio.line}`, borderRadius: 8, padding: 14, background: studio.wash }}>
      <div style={{ fontWeight: 740 }}>{phase.title}</div>
      <p style={{ margin: "6px 0 12px", color: studio.body, lineHeight: 1.45 }}>{phase.event}</p>
      {canRequestAdd && (
        <button data-testid="request-add-capability" onClick={onRequestAdd} style={studioButtonStyle("primary")}>
          Ask agent to propose capability
        </button>
      )}
      {canRequestView && (
        <button data-testid="request-add-view" onClick={onRequestView} style={studioButtonStyle("primary")}>
          Add Review Queue view
        </button>
      )}
      {canRequestPolicy && (
        <button data-testid="request-add-policy" onClick={onRequestPolicy} style={studioButtonStyle("primary")}>
          Add reviewer access
        </button>
      )}
      {canRequestRollback && (
        <button data-testid="request-rollback-capability" onClick={onRequestRollback} style={studioButtonStyle("primary")}>
          Review rollback impact
        </button>
      )}
    </section>
  );
}

function StudioApprovalCard({
  prompt,
  onAnswer,
}: {
  prompt: WirePermissionPrompt;
  onAnswer: (decision: "allow" | "deny") => void;
}) {
  const detail = prompt.detail;
  const isRollback = prompt.tool === "definition.rollback.validate";
  const addedOperations = asRecordArray(detail.impact, "added_operations");
  const addedViews = asRecordArray(detail.impact, "added_views");
  const addedPolicyRules = asRecordArray(detail.impact, "added_policy_rules");
  const removedOperations = asRecordArray(detail.impact, "removed_operations");
  const removedViews = asRecordArray(detail.impact, "removed_views");
  const removedPolicyRules = asRecordArray(detail.impact, "removed_policy_rules");
  const isViewPrompt = addedViews.length > 0;
  const isPolicyPrompt = addedPolicyRules.length > 0;
  return (
    <section
      style={{
        border: `1px solid ${studio.amber}`,
        borderRadius: 8,
        padding: 15,
        background: studio.amberWash,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
        <div>
          <div style={{ fontSize: 12, color: studio.muted }}>Approval required</div>
          <div style={{ marginTop: 3, fontWeight: 760 }}>
            {isRollback ? "Rollback capability definition" : isPolicyPrompt ? "Grant reviewer access" : isViewPrompt ? "Mount app view" : "Install capability definition"}
          </div>
        </div>
        <StudioMark tone="amber">{prompt.tool}</StudioMark>
      </div>
      <div style={{ marginTop: 14, display: "grid", gap: 9 }}>
        {!isRollback && (
          <>
            {isPolicyPrompt ? (
              <>
                <StudioImpactLine label="Policy" value={String(addedPolicyRules[0]?.rule_id ?? "reviewers-can-read-review-queue")} />
                <StudioImpactLine label="Resource" value="view:review_queue" />
                <StudioImpactLine label="Effect" value="Reviewer can see the Review Queue; Guest remains blocked" />
              </>
            ) : isViewPrompt ? (
              <>
                <StudioImpactLine label="View" value={String(addedViews[0]?.view_id ?? "review_queue")} />
                <StudioImpactLine label="Source" value={String(addedViews[0]?.source_operation_id ?? "list_bookmark_urls")} />
                <StudioImpactLine label="Surface" value="Reader Bookmarks gains Review Queue" />
              </>
            ) : (
              <>
                <StudioImpactLine label="Schema" value="bookmarks data stays; pneuma_operations gets a row" />
                <StudioImpactLine label="Domain" value={String(addedOperations[0]?.operation_id ?? "list_bookmark_urls")} />
                <StudioImpactLine label="API" value="POST /api/operations/list_bookmark_urls" />
              </>
            )}
          </>
        )}
        {isRollback && (
          <>
            <StudioImpactLine label="Schema" value="bookmark rows untouched" />
            <StudioImpactLine label="Domain" value={`remove ${String(removedOperations[0]?.operation_id ?? "list_bookmark_urls")}`} />
            {removedViews.length > 0 && (
              <StudioImpactLine label="View" value={`remove ${String(removedViews[0]?.view_id ?? "review_queue")}`} />
            )}
            {removedPolicyRules.length > 0 && (
              <StudioImpactLine label="Policy" value={`remove ${String(removedPolicyRules[0]?.rule_id ?? "reviewers-can-read-review-queue")}`} />
            )}
            <StudioImpactLine label="API" value={`restore definition history v${String(detail.target_history_version ?? 0)}`} />
          </>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 15 }}>
        <button data-testid="deny-inline-approval" onClick={() => onAnswer("deny")} style={studioButtonStyle("secondary")}>
          Deny
        </button>
        <button data-testid="allow-inline-approval" onClick={() => onAnswer("allow")} style={studioButtonStyle("primary")}>
          Allow
        </button>
      </div>
    </section>
  );
}

function StudioPrimitivePath({
  phase,
  pendingPrompt,
}: {
  phase: LifecyclePhase;
  pendingPrompt?: WirePermissionPrompt;
}) {
  const items = [
    { step: 0, label: "Intent", detail: "Builder asks for a capability" },
    { step: 1, label: "Apply", detail: "definition.apply writes the Operation row" },
    { step: 2, label: "Restart", detail: "runtime discovers the new capability" },
    { step: 3, label: "View", detail: "definition.apply mounts a user-facing View" },
    { step: 4, label: "Policy", detail: "definition.apply writes a PolicyRule row" },
    { step: 5, label: "Validate rollback", detail: "impact is disclosed before removal" },
    { step: 6, label: "Execute rollback", detail: "definition rows are removed" },
  ];
  return (
    <section style={{ paddingTop: 2 }}>
      <div style={{ fontSize: 12, color: studio.muted }}>Primitive path</div>
      <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
        {items.map((item) => (
          <div key={item.label} style={{ display: "grid", gridTemplateColumns: "14px minmax(0, 1fr)", gap: 10 }}>
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                marginTop: 7,
                background: primitiveStatus(phase.step, item.step, pendingPrompt?.id) === "done"
                  ? studio.green
                  : primitiveStatus(phase.step, item.step, pendingPrompt?.id) === "active"
                    ? studio.amber
                    : studio.lineStrong,
              }}
            />
            <div>
              <div style={{ fontWeight: 710, color: studio.ink }}>{item.label}</div>
              <div style={{ marginTop: 2, color: studio.muted, fontSize: 12, lineHeight: 1.35 }}>{item.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function StudioFrameworkProgress({
  frameworkEvents,
  pendingPrompt,
}: {
  frameworkEvents: readonly FrameworkEvent[];
  pendingPrompt?: WirePermissionPrompt;
}) {
  const latest = latestFrameworkEvent(frameworkEvents);
  const state = latest ? frameworkEventState(latest) : undefined;
  const timeline = state?.timeline ?? [];
  return (
    <section
      data-testid="studio-framework-event-progress"
      style={{ borderTop: `1px solid ${studio.line}`, paddingTop: 14 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
        <div>
          <div style={{ fontSize: 12, color: studio.muted }}>Framework protocol</div>
          <div style={{ marginTop: 4, fontWeight: 740, color: studio.ink }}>
            {latest ? frameworkEventTitle(latest) : "Waiting for protocol event"}
          </div>
          <div
            style={{
              marginTop: 5,
              color: studio.muted,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 12,
              overflowWrap: "anywhere",
            }}
          >
            {state ? frameworkEventId(state) : pendingPrompt ? pendingPrompt.id : "idle"}
          </div>
          <div style={{ marginTop: 6, color: studio.body, fontSize: 12, lineHeight: 1.38 }}>
            {frameworkConsumerLine(latest, state, pendingPrompt)}
          </div>
        </div>
        <StudioMark tone={studioStatusTone(state?.status, pendingPrompt)}>
          {frameworkStatusLabel(state?.status, pendingPrompt)}
        </StudioMark>
      </div>
      <div style={{ marginTop: 12, display: "grid", gap: 7 }}>
        {(timeline.length > 0 ? timeline : [{ phase: "idle", at: 0 }]).slice(-7).map((entry, index, items) => {
          const active = Boolean(state && entry.phase === state.phase && index === items.length - 1);
          const final = Boolean(state && state.status !== "pending" && index === items.length - 1);
          return (
            <div
              key={`${entry.phase}-${entry.at}-${index}`}
              style={{
                display: "grid",
                gridTemplateColumns: "14px minmax(0, 1fr) auto",
                gap: 9,
                alignItems: "center",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: final
                    ? studio.green
                    : active
                      ? studio.amber
                      : studio.lineStrong,
                  boxShadow: active && !final ? `0 0 0 4px ${studio.amberWash}` : undefined,
                }}
              />
              <div
                style={{
                  color: active || final ? studio.ink : studio.muted,
                  fontSize: 13,
                  fontWeight: active || final ? 720 : 560,
                  overflowWrap: "anywhere",
                }}
              >
                {frameworkPhaseLabel(entry.phase)}
              </div>
              <div style={{ color: studio.muted, fontSize: 12 }}>{formatEventTime(entry.at)}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function StudioTrace({
  phase,
  pendingPrompt,
  frameworkEvents,
  raw,
  error,
}: {
  phase: LifecyclePhase;
  pendingPrompt?: WirePermissionPrompt;
  frameworkEvents: readonly FrameworkEvent[];
  raw?: string;
  error?: string;
}) {
  const latest = latestFrameworkEvent(frameworkEvents);
  const latestState = latest ? frameworkEventState(latest) : undefined;
  return (
    <section style={{ borderTop: `1px solid ${studio.line}`, paddingTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 12, color: studio.muted }}>Current event</div>
          <div style={{ marginTop: 4, fontWeight: 710 }}>
            {pendingPrompt
              ? `waiting for ${pendingPrompt.tool}`
              : latestState
                ? frameworkPhaseLabel(latestState.phase)
                : phase.event}
          </div>
        </div>
        <StudioMark tone={studioStatusTone(latestState?.status, pendingPrompt)}>
          {frameworkStatusLabel(latestState?.status, pendingPrompt, "settled")}
        </StudioMark>
      </div>
      {raw && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer", color: studio.muted, fontSize: 13 }}>Raw event payload</summary>
          <pre
            data-testid="capability-lifecycle-result"
            style={{
              margin: "10px 0 0",
              padding: 12,
              overflow: "auto",
              maxHeight: 160,
              borderRadius: 6,
              background: studio.code,
              color: studio.codeInk,
              fontSize: 12,
              lineHeight: 1.45,
            }}
          >
            {raw}
          </pre>
        </details>
      )}
      {error && (
        <pre style={{ marginTop: 10, color: studio.red, background: studio.redWash, padding: 12, borderRadius: 6 }}>
          {error}
        </pre>
      )}
    </section>
  );
}

function StudioLedgerPane({
  eyebrow,
  title,
  status,
  tone = "neutral",
  children,
}: {
  eyebrow: string;
  title: string;
  status: string;
  tone?: "neutral" | "amber" | "green";
  children: React.ReactNode;
}) {
  return (
    <section style={{ borderTop: `1px solid ${studio.line}`, paddingTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
        <div>
          <div style={{ fontSize: 12, color: studio.muted }}>{eyebrow}</div>
          <h3 style={{ margin: "3px 0 0", fontSize: 16, lineHeight: 1.22, fontWeight: 740 }}>{title}</h3>
        </div>
        <StudioMark tone={tone}>{status}</StudioMark>
      </div>
      <div style={{ marginTop: 11 }}>{children}</div>
    </section>
  );
}

function StudioMiniTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: string[][];
}) {
  return (
    <div style={{ overflow: "hidden", border: `1px solid ${studio.line}`, borderRadius: 7, background: studio.sheet }}>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th
                key={`${column}-${index}`}
                style={{
                  padding: "9px 10px",
                  textAlign: "left",
                  borderBottom: `1px solid ${studio.line}`,
                  background: studio.wash,
                  color: studio.muted,
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td
                  key={`${index}-${cellIndex}`}
                  style={{
                    padding: "10px",
                    borderBottom: index === rows.length - 1 ? 0 : `1px solid ${studio.line}`,
                    color: studio.ink,
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    fontSize: 12,
                    overflowWrap: "anywhere",
                    verticalAlign: "top",
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StudioEmptyLine({
  children,
  testId,
}: {
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      style={{
        padding: "12px 13px",
        border: `1px solid ${studio.line}`,
        borderRadius: 7,
        background: studio.wash,
        color: studio.muted,
        lineHeight: 1.42,
      }}
    >
      {children}
    </div>
  );
}

function StudioImpactLine({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "110px minmax(0, 1fr)", gap: 10 }}>
      <div style={{ color: studio.muted }}>{label}</div>
      <div style={{ color: studio.ink, fontWeight: 710, overflowWrap: "anywhere" }}>{value}</div>
    </div>
  );
}

function StudioMark({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "neutral" | "amber" | "green" | "red";
}) {
  const palette = tone === "amber"
    ? { bg: studio.amberWash, border: "oklch(76% 0.07 52)", text: studio.amber }
    : tone === "green"
      ? { bg: studio.greenWash, border: "oklch(73% 0.055 150)", text: studio.green }
      : tone === "red"
        ? { bg: studio.redWash, border: "oklch(74% 0.055 38)", text: studio.red }
        : { bg: studio.wash, border: studio.line, text: studio.muted };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 25,
        padding: "0 8px",
        border: `1px solid ${palette.border}`,
        borderRadius: 999,
        background: palette.bg,
        color: palette.text,
        fontSize: 12,
        fontWeight: 730,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function studioButtonStyle(kind: "primary" | "secondary"): React.CSSProperties {
  const primary = kind === "primary";
  return {
    minHeight: 34,
    padding: "0 12px",
    border: `1px solid ${primary ? studio.amber : studio.lineStrong}`,
    borderRadius: 7,
    background: primary ? studio.amber : studio.sheet,
    color: primary ? "oklch(98% 0.006 76)" : studio.ink,
    cursor: "pointer",
    fontWeight: 740,
    whiteSpace: "nowrap",
  };
}

function studioLinkStyle(active: boolean): React.CSSProperties {
  return {
    minHeight: 32,
    display: "inline-flex",
    alignItems: "center",
    padding: "0 10px",
    border: `1px solid ${active ? studio.amber : studio.line}`,
    borderRadius: 7,
    background: active ? studio.amberWash : studio.sheet,
    color: active ? studio.amber : studio.body,
    textDecoration: "none",
    fontSize: 13,
    fontWeight: 700,
  };
}

function LegacyStatusPanel({
  pendingPrompt,
  result,
  error,
  operationRollbackResult,
  capabilityLifecycle,
  operationRollbackExecuteResult,
  operationRollbackExecuteError,
}: {
  pendingPrompt?: WirePermissionPrompt;
  result?: string;
  error?: string;
  operationRollbackResult?: OperationRollbackResult;
  capabilityLifecycle?: CapabilityLifecycleResult;
  operationRollbackExecuteResult?: string;
  operationRollbackExecuteError?: string;
}) {
  return (
    <section
      data-testid="status-panel"
      style={{
        marginTop: 24,
        padding: 16,
        border: `1px solid ${color.line}`,
        borderRadius: 8,
        background: color.surface,
        boxSizing: "border-box",
        width: "100%",
        maxWidth: "min(560px, calc(100vw - 48px))",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div style={{ fontWeight: 650 }}>Prompt state</div>
        <button data-testid="replay-demo" onClick={() => window.location.reload()} style={buttonStyle("secondary")}>
          Replay
        </button>
      </div>
      <div style={{ marginTop: 8, color: color.muted }}>
        {pendingPrompt ? `pending: ${pendingPrompt.tool}` : "none"}
      </div>
      {capabilityLifecycle && <CapabilityLifecycleSummary result={capabilityLifecycle} />}
      {operationRollbackResult && <OperationRollbackSummary result={operationRollbackResult} />}
      {result && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer", color: color.muted, fontSize: 13 }}>
            Raw event payload
          </summary>
          <pre
            data-testid={operationRollbackExecuteResult ? "operation-rollback-execute-result" : "rollback-execute-result"}
            style={{
              margin: "12px 0 0",
              padding: 12,
              overflow: "auto",
              borderRadius: 6,
              background: color.code,
              color: color.codeInk,
              fontSize: 12,
              lineHeight: 1.45,
            }}
          >
            {result}
          </pre>
        </details>
      )}
      {error && (
        <pre
          data-testid={operationRollbackExecuteError ? "operation-rollback-execute-error" : "rollback-execute-error"}
          style={{
            margin: "12px 0 0",
            padding: 12,
            overflow: "auto",
            borderRadius: 6,
            background: color.warnSoft,
            color: color.warn,
            fontSize: 12,
            lineHeight: 1.45,
          }}
        >
          {error}
        </pre>
      )}
    </section>
  );
}

function CapabilityLifecycleSummary({ result }: { result: CapabilityLifecycleResult }) {
  const queryUrl = result.query_output_before_rollback?.rows?.[0]?.url
    ?? result.query_output_after_add?.rows?.[0]?.url;
  const rowCount = result.row_count ?? result.row_count_after_add;
  const historyVersion = result.history_version ?? result.history_version_after_add;
  return (
    <div
      data-testid="capability-lifecycle-summary"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: 12,
        marginTop: 16,
      }}
    >
      <ProofTile
        label="Baseline"
        value={result.operation_visible_initially === false ? "operation absent" : "checking"}
        tone={result.operation_visible_initially === false ? "ok" : "warn"}
      />
      <ProofTile
        label="After add"
        value={result.operation_visible_after_add ? "operation live" : "waiting"}
        tone={result.operation_visible_after_add ? "ok" : "warn"}
      />
      <ProofTile
        label="After rollback"
        value={rollbackValue(result)}
        tone={result.operation_visible_after_rollback === false ? "ok" : "warn"}
      />
      <ProofTile
        label="Rows preserved"
        value={rowCount === undefined ? "-" : String(rowCount)}
        tone={rowCount === 1 ? "ok" : "warn"}
      />
      <div
        style={{
          gridColumn: "1 / -1",
          padding: 12,
          border: `1px solid ${color.line}`,
          borderRadius: 8,
          background: color.panel,
        }}
      >
        <div style={{ fontSize: 12, color: color.muted }}>Stage</div>
        <div style={{ marginTop: 6, fontWeight: 650 }}>{result.stage ?? "starting"}</div>
        <div style={{ marginTop: 10, fontSize: 12, color: color.muted }}>Query output after add</div>
        <code style={{ display: "block", marginTop: 6, fontSize: 13, overflowWrap: "anywhere" }}>
          {typeof queryUrl === "string" ? queryUrl : "waiting"}
        </code>
        <div style={{ marginTop: 10, fontSize: 12, color: color.muted }}>History</div>
        <div style={{ marginTop: 6, fontWeight: 650 }}>{historyVersion === undefined ? "-" : `v${historyVersion}`}</div>
      </div>
    </div>
  );
}

function OperationRollbackSummary({ result }: { result: OperationRollbackResult }) {
  const beforeUrl = result.before_output?.rows?.[0]?.url;
  return (
    <div
      data-testid="operation-rollback-summary"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: 12,
        marginTop: 16,
      }}
    >
      <ProofTile
        label="Before"
        value={result.operation_visible_before ? "operation live" : "not found"}
        tone={result.operation_visible_before ? "ok" : "warn"}
      />
      <ProofTile
        label="After rollback"
        value={result.operation_visible_after ? "still live" : "operation removed"}
        tone={result.operation_visible_after ? "warn" : "ok"}
      />
      <ProofTile
        label="Rows preserved"
        value={String(result.row_count ?? "-")}
        tone={result.row_count === 1 ? "ok" : "warn"}
      />
      <ProofTile
        label="History"
        value={result.history_version === undefined ? "-" : `v${result.history_version}`}
        tone={result.executed ? "ok" : "warn"}
      />
      <div
        style={{
          gridColumn: "1 / -1",
          padding: 12,
          border: `1px solid ${color.line}`,
          borderRadius: 8,
          background: color.panel,
        }}
      >
        <div style={{ fontSize: 12, color: color.muted }}>Query output before rollback</div>
        <code style={{ display: "block", marginTop: 6, fontSize: 13, overflowWrap: "anywhere" }}>
          {typeof beforeUrl === "string" ? beforeUrl : "empty"}
        </code>
      </div>
    </div>
  );
}

function SegmentedTabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="tablist"
      style={{
        display: "inline-flex",
        padding: 3,
        border: `1px solid ${color.line}`,
        borderRadius: 8,
        background: color.panel,
      }}
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
            style={{
              minWidth: 64,
              minHeight: 30,
              padding: "0 12px",
              border: 0,
              borderRadius: 6,
              background: selected ? color.surface : "transparent",
              color: selected ? color.ink : color.muted,
              cursor: "pointer",
              fontWeight: selected ? 680 : 560,
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function SideFact({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: "14px 0", borderBottom: `1px solid ${color.line}` }}>
      <div style={{ fontSize: 12, color: color.muted }}>{label}</div>
      <div style={{ marginTop: 6, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function TableHead({ children, width }: { children: React.ReactNode; width?: string }) {
  return (
    <th
      style={{
        width,
        padding: "11px 12px",
        textAlign: "left",
        color: color.muted,
        fontSize: 12,
        fontWeight: 680,
        background: color.panel,
        borderBottom: `1px solid ${color.line}`,
      }}
    >
      {children}
    </th>
  );
}

function TableCell({
  children,
  mono,
}: {
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <td
      style={{
        padding: "13px 12px",
        borderBottom: `1px solid ${color.line}`,
        overflowWrap: "anywhere",
        fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined,
        fontSize: mono ? 12 : 14,
      }}
    >
      {children}
    </td>
  );
}

function DataStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: "14px 16px", borderRight: `1px solid ${color.line}` }}>
      <div style={{ fontSize: 12, color: color.muted }}>{label}</div>
      <div style={{ marginTop: 6, fontWeight: 700, overflowWrap: "anywhere" }}>{value}</div>
    </div>
  );
}

function ImpactLine({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "128px minmax(0, 1fr)", gap: 10 }}>
      <div style={{ color: color.muted }}>{label}</div>
      <div style={{ fontWeight: 680, overflowWrap: "anywhere" }}>{value}</div>
    </div>
  );
}

function PrimitiveItem({
  label,
  meta,
  status,
}: {
  label: string;
  meta: string;
  status: "done" | "active" | "pending";
}) {
  const dot = status === "done" ? color.success : status === "active" ? color.accent : color.lineStrong;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "14px minmax(0, 1fr)", gap: 10, alignItems: "start" }}>
      <span
        aria-hidden
        style={{
          width: 9,
          height: 9,
          borderRadius: "50%",
          marginTop: 6,
          background: dot,
          boxShadow: status === "active" ? `0 0 0 4px ${color.accentSoft}` : undefined,
        }}
      />
      <div>
        <div style={{ color: status === "pending" ? color.muted : color.ink, fontWeight: 680 }}>{label}</div>
        <div style={{ marginTop: 2, color: color.muted, fontSize: 12 }}>{meta}</div>
      </div>
    </div>
  );
}

function StatusPill({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "success" | "warn" | "neutral" | "accent";
}) {
  const colors = tone === "success"
    ? { bg: color.successSoft, border: "oklch(73% 0.055 150)", text: color.success }
    : tone === "warn"
      ? { bg: color.warnSoft, border: "oklch(76% 0.06 42)", text: color.warn }
      : tone === "accent"
        ? { bg: color.accentSoft, border: "oklch(76% 0.07 52)", text: color.accent }
        : { bg: color.panel, border: color.line, text: color.muted };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 26,
        padding: "0 9px",
        border: `1px solid ${colors.border}`,
        borderRadius: 999,
        background: colors.bg,
        color: colors.text,
        fontSize: 12,
        fontWeight: 720,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function ProofTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "ok" | "warn";
}) {
  return (
    <div
      style={{
        minHeight: 74,
        padding: 12,
        border: `1px solid ${tone === "ok" ? "oklch(73% 0.055 150)" : "oklch(76% 0.06 42)"}`,
        borderRadius: 8,
        background: tone === "ok" ? color.successSoft : color.warnSoft,
      }}
    >
      <div style={{ fontSize: 12, color: color.muted }}>{label}</div>
      <div style={{ marginTop: 6, fontWeight: 650, overflowWrap: "anywhere" }}>{value}</div>
    </div>
  );
}

function useViewportWidth(): number {
  const [width, setWidth] = React.useState(() => window.innerWidth);
  React.useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}

function lifecyclePhase(
  result: CapabilityLifecycleResult,
  pendingPromptId: string | undefined,
): LifecyclePhase {
  if (result.stage === "rolled_back") {
    return {
      step: 6,
      title: "Capability, view, and policy removed; bookmark data preserved",
      event: "Rollback executed and runtime restarted",
      capabilityState: "removed",
    };
  }
  if (result.stage === "rollback_denied") {
    return {
      step: 5,
      title: "Rollback denied; capability remains live",
      event: "Rollback approval was denied",
      capabilityState: "live",
    };
  }
  if (pendingPromptId === "pneuma:capability-lifecycle:rollback-operation") {
    return {
      step: 5,
      title: "Capability is live; rollback needs approval",
      event: "Waiting for rollback approval",
      capabilityState: "live",
    };
  }
  if (result.stage === "operation_added" && pendingPromptId !== "pneuma:capability-lifecycle:add-view") {
    return {
      step: 2,
      title: "Capability added and queryable",
      event: "Runtime restarted and query returned data; app view is still absent",
      capabilityState: "live",
    };
  }
  if (result.stage === "view_added" && pendingPromptId !== "pneuma:capability-lifecycle:add-policy") {
    return {
      step: 3,
      title: "View definition added; access still restricted",
      event: "Runtime restarted and the Review Queue definition exists, but policy has not exposed it",
      capabilityState: "live",
    };
  }
  if (result.stage === "policy_added") {
    return {
      step: 4,
      title: "Reviewer access added",
      event: "PolicyRule row is live; reviewer can see Review Queue while guest stays blocked",
      capabilityState: "live",
    };
  }
  if (result.stage === "policy_denied") {
    return {
      step: 4,
      title: "Reviewer access denied",
      event: "Review Queue remains in definition, but end-user access is still blocked",
      capabilityState: "live",
    };
  }
  if (result.stage === "view_denied") {
    return {
      step: 3,
      title: "View creation denied",
      event: "The API capability remains live, but the app surface did not change",
      capabilityState: "live",
    };
  }
  if (result.stage === "add_denied") {
    return {
      step: 1,
      title: "Capability creation denied",
      event: "Add approval was denied",
      capabilityState: "absent",
    };
  }
  if (pendingPromptId === "pneuma:capability-lifecycle:add-operation") {
    return {
      step: 1,
      title: "Agent proposed a new app capability",
      event: "Waiting for add approval",
      capabilityState: "pending",
    };
  }
  if (pendingPromptId === "pneuma:capability-lifecycle:add-view") {
    return {
      step: 3,
      title: "Agent proposed an end-user view",
      event: "Waiting for app-surface approval",
      capabilityState: "pending",
    };
  }
  if (pendingPromptId === "pneuma:capability-lifecycle:add-policy") {
    return {
      step: 4,
      title: "Agent proposed reviewer access",
      event: "Waiting for PolicyRule approval",
      capabilityState: "pending",
    };
  }
  return {
    step: 0,
    title: "Baseline app: data exists, capability absent",
    event: "Ready for a Builder request",
    capabilityState: "absent",
  };
}

function primitiveStatus(
  phaseStep: number,
  itemStep: number,
  pendingPromptId?: string,
): "done" | "active" | "pending" {
  if (phaseStep > itemStep) return "done";
  if (phaseStep === itemStep) return pendingPromptId || itemStep === 0 ? "active" : "done";
  return "pending";
}

function latestFrameworkEvent(events: readonly FrameworkEvent[]): FrameworkEvent | undefined {
  return events.length > 0 ? events[events.length - 1] : undefined;
}

function frameworkEventState(event: FrameworkEvent): FrameworkEventState {
  return event.state;
}

function frameworkEventId(state: FrameworkEventState): string {
  if ("change_id" in state) return state.change_id;
  return `${state.rollback_id} -> v${state.target_history_version}`;
}

function frameworkEventTitle(event: FrameworkEvent): string {
  if (event.type === "definition-apply-state") return "definition.apply";
  if (event.type === "definition-rollback-prepare-state") return "definition.rollback.validate";
  return "definition.rollback.execute";
}

function frameworkPhaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    idle: "Ready",
    validating: "Validate requested change",
    "awaiting-approval": "Await Builder approval",
    "applying-definition": "Write definition row",
    "stopping-for-definition-apply": "Stop runtime for rediscovery",
    "starting-after-definition-apply": "Start runtime again",
    "refreshing-definition": "Refresh /api/config",
    running: "Runtime running with new definition",
    denied: "Denied by Builder",
    failed: "Failed",
    "ready-to-execute": "Rollback prepared",
    preparing: "Prepare rollback execution",
    "executing-rollback": "Remove definition rows",
    "stopping-after-rollback": "Stop runtime after rollback",
    "starting-after-rollback": "Start runtime after rollback",
  };
  return labels[phase] ?? phase;
}

function frameworkConsumerLine(
  event: FrameworkEvent | undefined,
  state: FrameworkEventState | undefined,
  pendingPrompt?: WirePermissionPrompt,
): string {
  if (!event || !state) {
    return pendingPrompt
      ? "Permission prompt is visible; protocol state has not arrived yet."
      : "No framework state snapshot has crossed the viewer channel yet.";
  }
  if (pendingPrompt || state.status === "pending") {
    return "Viewer renders this snapshot while the framework waits for the next gated step.";
  }
  if (state.status === "failed") {
    return "Terminal failure snapshot received; the final tool result remains the recovery source.";
  }
  if (state.status === "denied") {
    return "Terminal denial snapshot received; no definition mutation continued.";
  }
  if (event.type === "definition-rollback-execute-state") {
    return "Terminal rollback snapshot received; runtime has rediscovered the restored definition.";
  }
  if (event.type === "definition-rollback-prepare-state") {
    return "Rollback impact is prepared; execute is still a separate governed step.";
  }
  return "Terminal apply snapshot received; runtime has rediscovered the new definition.";
}

function frameworkStatusLabel(
  status: string | undefined,
  pendingPrompt?: WirePermissionPrompt,
  emptyLabel = "idle",
): string {
  if (pendingPrompt || status === "pending") return "waiting";
  if (status === "ready_to_execute") return "ready";
  if (status === "rolled_back") return "rolled back";
  if (status === "applied") return "applied";
  if (status === "validated") return "validated";
  if (status === "denied") return "denied";
  if (status === "failed") return "failed";
  if (status === "noop") return "no change";
  return emptyLabel;
}

function frameworkStatusTone(
  status: string | undefined,
  pendingPrompt?: WirePermissionPrompt,
): "success" | "warn" | "neutral" | "accent" {
  if (status === "failed" || status === "denied") return "warn";
  if (status === "pending" || pendingPrompt) return "accent";
  if (status) return "success";
  return "neutral";
}

function studioStatusTone(
  status: string | undefined,
  pendingPrompt?: WirePermissionPrompt,
): "neutral" | "amber" | "green" | "red" {
  if (status === "failed" || status === "denied") return "red";
  if (status === "pending" || pendingPrompt) return "amber";
  if (status) return "green";
  return "neutral";
}

function formatEventTime(at: number): string {
  if (!at) return "ready";
  return new Date(at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function lifecycleQueryUrl(result: CapabilityLifecycleResult): string | undefined {
  const value = result.query_output_before_rollback?.rows?.[0]?.url
    ?? result.query_output_after_add?.rows?.[0]?.url;
  return typeof value === "string" ? value : undefined;
}

function lifecycleRowUrls(result: CapabilityLifecycleResult): string[] {
  return [
    ...(result.preserved_bookmark_urls ?? []),
    ...(result.bookmark_urls_after_add ?? []),
    ...(result.bookmark_urls ?? []),
  ].filter((url, index, urls): url is string =>
    typeof url === "string" && urls.indexOf(url) === index
  );
}

function operationIsLive(result: CapabilityLifecycleResult): boolean {
  return result.operation_visible_after_add === true
    && result.stage !== "rolled_back"
    && result.stage !== "add_denied";
}

function roleCanSeeReviewQueue(result: CapabilityLifecycleResult, role: EndUserRole): boolean {
  const access = result.policy_access;
  if (role === "reviewer") return (access?.reviewer_visible_view_count ?? 0) > 0;
  return (access?.guest_visible_view_count ?? 0) > 0;
}

function policyRuleCount(result: CapabilityLifecycleResult): number {
  return result.definition_policy_rules?.length ?? 0;
}

function rollbackValue(result: CapabilityLifecycleResult): string {
  if (result.stage === "rolled_back") {
    return result.operation_visible_after_rollback ? "still live" : "operation removed";
  }
  if (result.stage === "rollback_denied") return "still live";
  if (result.stage === "add_denied") return "not run";
  return "waiting";
}

function capabilityLabel(state: LifecyclePhase["capabilityState"]): string {
  if (state === "live") return "Available";
  if (state === "removed") return "Removed";
  if (state === "pending") return "Pending";
  return "Not installed";
}

function capabilityCopy(state: LifecyclePhase["capabilityState"]): string {
  if (state === "live") return "The app now exposes a read-only operation, a View, and a governed access rule.";
  if (state === "removed") return "The operation, view, and policy were rolled back from app definition. The bookmark row remains.";
  if (state === "pending") return "The agent is asking the framework to mutate app definition.";
  return "No URL export operation is part of this app yet.";
}

function agentLine(
  result: CapabilityLifecycleResult,
  pendingPrompt: WirePermissionPrompt | undefined,
  phase: LifecyclePhase,
): string {
  if (pendingPrompt?.id === "pneuma:capability-lifecycle:add-operation") {
    return "I can add list_bookmark_urls as a query operation on bookmarks.url.";
  }
  if (pendingPrompt?.id === "pneuma:capability-lifecycle:add-view") {
    return "Now I can mount that Operation as a Review Queue view in the end-user app.";
  }
  if (pendingPrompt?.id === "pneuma:capability-lifecycle:add-policy") {
    return "The View exists, but it should only be visible to reviewers. I can add that PolicyRule.";
  }
  if (pendingPrompt?.id === "pneuma:capability-lifecycle:rollback-operation") {
    return "Rollback will remove the operation, view, and policy definition rows. Stored bookmark rows are not deleted.";
  }
  if (result.stage === "operation_added") {
    return "The operation is live after restart, but the end-user app still needs a View.";
  }
  if (result.stage === "view_added") {
    return "The Review Queue definition is live after restart. Access is still blocked until policy is added.";
  }
  if (result.stage === "policy_added") {
    return "Reviewer access is live after restart. Guest remains blocked by policy.";
  }
  if (result.stage === "rolled_back") {
    return "Rollback is complete. The runtime no longer exposes the Operation, View, or PolicyRule.";
  }
  return phase.step === 0
    ? "I will propose a definition change, then wait for framework approval."
    : phase.event;
}

function frameworkLine(
  result: CapabilityLifecycleResult,
  pendingPrompt: WirePermissionPrompt | undefined,
  phase: LifecyclePhase,
): string {
  if (pendingPrompt) return "Approval is required before this definition change can continue.";
  if (result.stage === "operation_added") return "History advanced, runtime restarted, and the operation is queryable.";
  if (result.stage === "view_added") return "History advanced again, runtime restarted, and app definition includes the View.";
  if (result.stage === "policy_added") return "History advanced again, runtime restarted, and policy now gates reviewer access.";
  if (result.stage === "rolled_back") return "History advanced again, restart completed, data verification passed.";
  return phase.event;
}

function asRecordArray(source: unknown, key: string): Array<Record<string, unknown>> {
  if (!source || typeof source !== "object") return [];
  const value = (source as Record<string, unknown>)[key];
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    : [];
}

function buttonStyle(kind: "primary" | "secondary"): React.CSSProperties {
  const primary = kind === "primary";
  return {
    minHeight: 34,
    padding: "0 12px",
    border: `1px solid ${primary ? color.accent : color.lineStrong}`,
    borderRadius: 7,
    background: primary ? color.accent : color.surface,
    color: primary ? "oklch(98% 0.006 78)" : color.ink,
    cursor: "pointer",
    fontWeight: 720,
    whiteSpace: "nowrap",
  };
}

function parseOperationRollbackResult(raw: string): OperationRollbackResult | undefined {
  try {
    const parsed = JSON.parse(raw) as OperationRollbackResult;
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function parseCapabilityLifecycleResult(raw: string): CapabilityLifecycleResult | undefined {
  try {
    const parsed = JSON.parse(raw) as CapabilityLifecycleResult;
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

createRoot(document.getElementById("root")!).render(<App />);
