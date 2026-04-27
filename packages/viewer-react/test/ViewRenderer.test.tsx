import { GlobalRegistrator } from "@happy-dom/global-registrator";

const PRESERVED_GLOBALS = [
  "fetch", "Request", "Response", "Headers", "WebSocket", "FormData",
  "Blob", "File", "URL", "AbortController", "AbortSignal",
  "Event", "EventTarget", "queueMicrotask",
  "setTimeout", "setInterval", "clearTimeout", "clearInterval",
] as const;
const nativeGlobals: Record<string, unknown> = {};
for (const k of PRESERVED_GLOBALS) {
  nativeGlobals[k] = (globalThis as unknown as Record<string, unknown>)[k];
}
if (!("window" in globalThis)) GlobalRegistrator.register();
for (const k of PRESERVED_GLOBALS) {
  (globalThis as unknown as Record<string, unknown>)[k] = nativeGlobals[k];
}

import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import * as React from "react";
import {
  PneumaViewRenderer,
  normalizeViewPresentationForRender,
  viewTableRows,
  type ViewRendererView,
} from "../src/index.js";

const reviewQueueView: ViewRendererView = {
  id: "review_queue",
  name: "Review Queue",
  kind: "table",
  presentation: {
    title: "Review Queue",
    columns: [
      { field: "title", label: "Title", role: "title" },
      { field: "url", label: "URL", role: "url" },
      { field: "lens", label: "Lens", role: "metadata" },
    ],
    empty_state: "No sources are waiting for review.",
  },
};

describe("normalizeViewPresentationForRender", () => {
  test("uses the View presentation contract when provided", () => {
    expect(normalizeViewPresentationForRender(reviewQueueView.presentation, {
      title: reviewQueueView.name,
    })).toEqual({
      title: "Review Queue",
      columns: [
        { field: "title", label: "Title", role: "title" },
        { field: "url", label: "URL", role: "url" },
        { field: "lens", label: "Lens", role: "metadata" },
      ],
      emptyState: "No sources are waiting for review.",
    });
  });

  test("falls back to row fields when presentation columns are absent", () => {
    expect(normalizeViewPresentationForRender(undefined, {
      title: "Inferred",
      rows: [{ id: "row-1", title: "A", url: "https://example.com", lens: "Framework" }],
    }).columns.map((column) => column.field)).toEqual(["title", "url", "lens"]);
  });

  test("turns rows into stable display text", () => {
    const presentation = normalizeViewPresentationForRender(reviewQueueView.presentation);
    expect(viewTableRows(presentation, [{
      title: "Pneuma architecture notes",
      url: "https://example.com/full-chain-demo",
      lens: "Framework primitives",
    }])).toEqual([[
      "Pneuma architecture notes",
      "https://example.com/full-chain-demo",
      "Framework primitives",
    ]]);
  });
});

describe("PneumaViewRenderer", () => {
  test("renders a table View from presentation columns and source rows", () => {
    const { getByText } = render(
      <PneumaViewRenderer
        view={reviewQueueView}
        rows={[{
          title: "Pneuma architecture notes",
          url: "https://example.com/full-chain-demo",
          lens: "Framework primitives",
        }]}
      />,
    );

    expect(getByText("Title").textContent).toBe("Title");
    expect(getByText("URL").textContent).toBe("URL");
    expect(getByText("Pneuma architecture notes").textContent).toBe("Pneuma architecture notes");
    expect(getByText("https://example.com/full-chain-demo").textContent)
      .toBe("https://example.com/full-chain-demo");
  });

  test("renders the View empty state for empty source rows", () => {
    const { getByText } = render(<PneumaViewRenderer view={reviewQueueView} rows={[]} />);
    expect(getByText("No sources are waiting for review.").textContent)
      .toBe("No sources are waiting for review.");
  });
});
