import * as React from "react";
import type { DiscoveredView } from "@pneuma-framework/core";
import {
  normalizeViewPresentationForRender,
  valueText,
  viewTableRows,
  type NormalizedViewColumn,
  type NormalizedViewPresentation,
} from "./view-presentation.js";

export type ViewRendererView = Pick<DiscoveredView, "id" | "name" | "kind" | "presentation">;

export interface PneumaViewRendererProps {
  readonly view: ViewRendererView;
  readonly rows: readonly Record<string, unknown>[];
  readonly fallbackColumns?: readonly string[];
  readonly showTitle?: boolean;
  readonly density?: "comfortable" | "compact";
  readonly className?: string;
  readonly style?: React.CSSProperties;
  readonly renderCell?: (ctx: ViewCellRenderContext) => React.ReactNode;
}

export interface ViewCellRenderContext {
  readonly column: NormalizedViewColumn;
  readonly row: Record<string, unknown>;
  readonly value: unknown;
  readonly text: string;
  readonly rowIndex: number;
  readonly columnIndex: number;
}

export function PneumaViewRenderer({
  view,
  rows,
  fallbackColumns,
  showTitle = false,
  density = "compact",
  className,
  style,
  renderCell,
}: PneumaViewRendererProps) {
  const presentation = normalizeViewPresentationForRender(view.presentation, {
    title: view.name,
    columns: fallbackColumns,
    rows,
  });

  return (
    <section
      className={className}
      data-pneuma-view={view.id}
      style={{
        fontFamily: "var(--pneuma-view-type, -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif)",
        color: "var(--pneuma-view-ink, oklch(21% 0.018 72))",
        ...style,
      }}
    >
      {showTitle && (
        <header style={{ marginBottom: density === "compact" ? 8 : 10 }}>
          <h3
            style={{
              margin: 0,
              fontSize: density === "compact" ? 14 : 16,
              lineHeight: 1.25,
              fontWeight: 720,
            }}
          >
            {presentation.title}
          </h3>
        </header>
      )}
      {rows.length === 0
        ? <ViewEmptyState presentation={presentation} density={density} />
        : view.kind === "detail"
          ? <DetailView rows={rows} presentation={presentation} density={density} renderCell={renderCell} />
          : view.kind === "list"
            ? <ListView rows={rows} presentation={presentation} density={density} renderCell={renderCell} />
            : <TableView rows={rows} presentation={presentation} density={density} renderCell={renderCell} />}
    </section>
  );
}

function TableView({
  rows,
  presentation,
  density,
  renderCell,
}: {
  rows: readonly Record<string, unknown>[];
  presentation: NormalizedViewPresentation;
  density: "comfortable" | "compact";
  renderCell?: (ctx: ViewCellRenderContext) => React.ReactNode;
}) {
  const tableRows = viewTableRows(presentation, rows);
  return (
    <div
      style={{
        overflow: "auto",
        border: "1px solid var(--pneuma-view-rule, oklch(83% 0.014 76))",
        borderRadius: "var(--pneuma-view-radius, 7px)",
        background: "var(--pneuma-view-surface, oklch(98.8% 0.006 76))",
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <thead>
          <tr>
            {presentation.columns.map((column, index) => (
              <th key={`${column.field}-${index}`} scope="col" style={headStyle(density)}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tableRows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((text, columnIndex) => {
                const column = presentation.columns[columnIndex]!;
                const sourceRow = rows[rowIndex]!;
                const value = sourceRow[column.field];
                return (
                  <td key={`${rowIndex}-${column.field}-${columnIndex}`} style={cellStyle(column, density)}>
                    {renderCell
                      ? renderCell({ column, row: sourceRow, value, text, rowIndex, columnIndex })
                      : text}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ListView({
  rows,
  presentation,
  density,
  renderCell,
}: {
  rows: readonly Record<string, unknown>[];
  presentation: NormalizedViewPresentation;
  density: "comfortable" | "compact";
  renderCell?: (ctx: ViewCellRenderContext) => React.ReactNode;
}) {
  const [primary, ...secondary] = presentation.columns;
  return (
    <div style={{ display: "grid", gap: density === "compact" ? 7 : 9 }}>
      {rows.map((row, rowIndex) => {
        const title = primary ? valueText(row[primary.field]) : `Row ${rowIndex + 1}`;
        return (
          <article
            key={rowIndex}
            style={{
              padding: density === "compact" ? "9px 10px" : "12px",
              border: "1px solid var(--pneuma-view-rule, oklch(83% 0.014 76))",
              borderRadius: "var(--pneuma-view-radius, 7px)",
              background: "var(--pneuma-view-surface, oklch(98.8% 0.006 76))",
            }}
          >
            <div style={{ fontWeight: 700 }}>{title}</div>
            {secondary.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 7 }}>
                {secondary.map((column, columnIndex) => {
                  const value = row[column.field];
                  const text = valueText(value);
                  return (
                    <span key={`${column.field}-${columnIndex}`} style={metaStyle(column)}>
                      {renderCell
                        ? renderCell({ column, row, value, text, rowIndex, columnIndex: columnIndex + 1 })
                        : `${column.label}: ${text}`}
                    </span>
                  );
                })}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function DetailView({
  rows,
  presentation,
  density,
  renderCell,
}: {
  rows: readonly Record<string, unknown>[];
  presentation: NormalizedViewPresentation;
  density: "comfortable" | "compact";
  renderCell?: (ctx: ViewCellRenderContext) => React.ReactNode;
}) {
  const row = rows[0]!;
  return (
    <dl
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(90px, 0.28fr) minmax(0, 1fr)",
        margin: 0,
        border: "1px solid var(--pneuma-view-rule, oklch(83% 0.014 76))",
        borderRadius: "var(--pneuma-view-radius, 7px)",
        overflow: "hidden",
        background: "var(--pneuma-view-surface, oklch(98.8% 0.006 76))",
      }}
    >
      {presentation.columns.map((column, columnIndex) => {
        const value = row[column.field];
        const text = valueText(value);
        return (
          <React.Fragment key={`${column.field}-${columnIndex}`}>
            <dt style={detailTermStyle(density)}>{column.label}</dt>
            <dd style={detailValueStyle(column, density)}>
              {renderCell
                ? renderCell({ column, row, value, text, rowIndex: 0, columnIndex })
                : text}
            </dd>
          </React.Fragment>
        );
      })}
    </dl>
  );
}

function ViewEmptyState({
  presentation,
  density,
}: {
  presentation: NormalizedViewPresentation;
  density: "comfortable" | "compact";
}) {
  return (
    <div
      style={{
        padding: density === "compact" ? "10px 11px" : "13px",
        border: "1px solid var(--pneuma-view-rule, oklch(83% 0.014 76))",
        borderRadius: "var(--pneuma-view-radius, 7px)",
        background: "var(--pneuma-view-wash, oklch(94.2% 0.014 76))",
        color: "var(--pneuma-view-muted, oklch(50% 0.016 72))",
        lineHeight: 1.42,
      }}
    >
      {presentation.emptyState}
    </div>
  );
}

function headStyle(density: "comfortable" | "compact"): React.CSSProperties {
  return {
    padding: density === "compact" ? "9px 10px" : "11px 12px",
    textAlign: "left",
    borderBottom: "1px solid var(--pneuma-view-rule, oklch(83% 0.014 76))",
    background: "var(--pneuma-view-wash, oklch(94.2% 0.014 76))",
    color: "var(--pneuma-view-muted, oklch(50% 0.016 72))",
    fontSize: 12,
    fontWeight: 700,
  };
}

function cellStyle(column: NormalizedViewColumn, density: "comfortable" | "compact"): React.CSSProperties {
  return {
    padding: density === "compact" ? "10px" : "13px 12px",
    borderBottom: "1px solid var(--pneuma-view-rule, oklch(83% 0.014 76))",
    color: "var(--pneuma-view-ink, oklch(21% 0.018 72))",
    fontFamily: column.role === "url"
      ? "var(--pneuma-view-mono, ui-monospace, SFMono-Regular, Menlo, monospace)"
      : undefined,
    fontSize: column.role === "url" ? 12 : 13,
    overflowWrap: "anywhere",
    verticalAlign: "top",
  };
}

function metaStyle(column: NormalizedViewColumn): React.CSSProperties {
  return {
    color: column.role === "url"
      ? "var(--pneuma-view-ink, oklch(21% 0.018 72))"
      : "var(--pneuma-view-muted, oklch(50% 0.016 72))",
    fontFamily: column.role === "url"
      ? "var(--pneuma-view-mono, ui-monospace, SFMono-Regular, Menlo, monospace)"
      : undefined,
    fontSize: 12,
    overflowWrap: "anywhere",
  };
}

function detailTermStyle(density: "comfortable" | "compact"): React.CSSProperties {
  return {
    margin: 0,
    padding: density === "compact" ? "9px 10px" : "11px 12px",
    borderBottom: "1px solid var(--pneuma-view-rule, oklch(83% 0.014 76))",
    background: "var(--pneuma-view-wash, oklch(94.2% 0.014 76))",
    color: "var(--pneuma-view-muted, oklch(50% 0.016 72))",
    fontSize: 12,
    fontWeight: 700,
  };
}

function detailValueStyle(column: NormalizedViewColumn, density: "comfortable" | "compact"): React.CSSProperties {
  return {
    margin: 0,
    padding: density === "compact" ? "9px 10px" : "11px 12px",
    borderBottom: "1px solid var(--pneuma-view-rule, oklch(83% 0.014 76))",
    color: "var(--pneuma-view-ink, oklch(21% 0.018 72))",
    fontFamily: column.role === "url"
      ? "var(--pneuma-view-mono, ui-monospace, SFMono-Regular, Menlo, monospace)"
      : undefined,
    fontSize: column.role === "url" ? 12 : 13,
    overflowWrap: "anywhere",
  };
}
