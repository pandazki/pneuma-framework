import { useMemo } from "react";
import { marked, type Tokens } from "marked";
import { useFocus, usePneumaState } from "@pneuma-framework/viewer-react";

/**
 * Renders doc.md as HTML and wires heading + paragraph clicks to `useFocus`.
 * Element indices are computed per-kind, matching FocusElement.index semantics.
 */
export function MarkdownPreview() {
  const { docs } = usePneumaState();
  const setFocus = useFocus();
  const raw = docs["doc.md"] ?? "";

  const blocks = useMemo(() => {
    const tokens = marked.lexer(raw);
    const headingIdx = { next: 0 };
    const paragraphIdx = { next: 0 };
    const codeIdx = { next: 0 };
    return tokens.map((tok, i) => renderToken(tok, i, headingIdx, paragraphIdx, codeIdx, setFocus));
  }, [raw, setFocus]);

  if (!raw) {
    return (
      <div style={{ padding: 24, color: "#78716c" }}>
        Waiting for <code>doc.md</code>…
      </div>
    );
  }
  return (
    <article style={{ maxWidth: 720, margin: "0 auto", padding: 32, lineHeight: 1.6 }}>
      {blocks}
    </article>
  );
}

type IdxRef = { next: number };
type SetFocus = ReturnType<typeof useFocus>;

function renderToken(
  tok: Tokens.Generic,
  key: number,
  h: IdxRef,
  p: IdxRef,
  c: IdxRef,
  setFocus: SetFocus,
): React.JSX.Element | null {
  if (tok.type === "heading") {
    const idx = h.next++;
    const level = (tok as Tokens.Heading).depth;
    const text = (tok as Tokens.Heading).text;
    const Tag = (`h${level}` as unknown) as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
    return (
      <Tag
        key={key}
        style={{ cursor: "pointer" }}
        onClick={() => setFocus({
          file: "doc.md",
          element: { kind: "heading", index: idx, text, level, anchor: slug(text) },
        })}
      >
        {text}
      </Tag>
    );
  }
  if (tok.type === "paragraph") {
    const idx = p.next++;
    const text = (tok as Tokens.Paragraph).text;
    return (
      <p
        key={key}
        style={{ cursor: "pointer" }}
        onClick={() => setFocus({
          file: "doc.md",
          element: { kind: "paragraph", index: idx, text: text.slice(0, 120) },
        })}
        dangerouslySetInnerHTML={{ __html: marked.parseInline(text) as string }}
      />
    );
  }
  if (tok.type === "code") {
    const idx = c.next++;
    const text = (tok as Tokens.Code).text;
    return (
      <pre
        key={key}
        style={{
          cursor: "pointer",
          background: "#f5f5f4", padding: 12, borderRadius: 4, overflowX: "auto",
        }}
        onClick={() => setFocus({
          file: "doc.md",
          element: { kind: "code-block", index: idx, text: text.slice(0, 120) },
        })}
      ><code>{text}</code></pre>
    );
  }
  if (tok.type === "list") {
    const items = (tok as Tokens.List).items;
    return (
      <ul key={key}>
        {items.map((it, j) => (
          <li key={j} dangerouslySetInnerHTML={{ __html: marked.parseInline(it.text) as string }} />
        ))}
      </ul>
    );
  }
  if (tok.type === "space") return null;
  // Fallback: render raw via marked.parser for unknown types.
  return <div key={key} dangerouslySetInnerHTML={{ __html: marked.parser([tok]) as string }} />;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
