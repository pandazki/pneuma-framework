import { useMemo, useState } from "react";
import { marked, type Tokens } from "marked";
import { useFocus, usePneumaState } from "@pneuma-framework/viewer-react";

/**
 * Renders doc.md as HTML with editorial styling + click-to-focus on
 * headings, paragraphs, and code blocks. Focus state is local — the
 * envelope is sent via useFocus but we also mark the element visually
 * so the builder can see what the agent "has in context" now.
 */
export function MarkdownPreview() {
  const { docs } = usePneumaState();
  const setFocus = useFocus();
  const [focused, setFocused] = useState<string | undefined>(undefined);
  const raw = docs["doc.md"] ?? "";

  const blocks = useMemo(() => {
    const tokens = marked.lexer(raw);
    const h = { next: 0 };
    const p = { next: 0 };
    const c = { next: 0 };
    return tokens.map((tok, i) =>
      renderToken(tok, i, h, p, c, (elementKey, focusPayload) => {
        setFocused(elementKey);
        setFocus(focusPayload);
      }, focused),
    );
  }, [raw, setFocus, focused]);

  if (!raw) {
    return (
      <article className="reading">
        <p className="empty">Waiting for <code>doc.md</code> · 等待文档…</p>
      </article>
    );
  }
  return <article className="reading">{blocks}</article>;
}

type IdxRef = { next: number };
type OnFocus = (
  elementKey: string,
  focus: Parameters<ReturnType<typeof useFocus>>[0],
) => void;

function renderToken(
  tok: Tokens.Generic,
  key: number,
  h: IdxRef,
  p: IdxRef,
  c: IdxRef,
  onFocus: OnFocus,
  focused: string | undefined,
): React.JSX.Element | null {
  if (tok.type === "heading") {
    const idx = h.next++;
    const level = (tok as Tokens.Heading).depth;
    const text = (tok as Tokens.Heading).text;
    const keyId = `h-${idx}`;
    const Tag = (`h${level}` as unknown) as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
    return (
      <Tag
        key={key}
        className="focusable"
        data-focused={focused === keyId || undefined}
        onClick={() => onFocus(keyId, {
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
    const keyId = `p-${idx}`;
    return (
      <p
        key={key}
        className="focusable"
        data-focused={focused === keyId || undefined}
        onClick={() => onFocus(keyId, {
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
    const keyId = `c-${idx}`;
    return (
      <pre
        key={key}
        className="focusable"
        data-focused={focused === keyId || undefined}
        onClick={() => onFocus(keyId, {
          file: "doc.md",
          element: { kind: "code-block", index: idx, text: text.slice(0, 120) },
        })}
      >
        <code>{text}</code>
      </pre>
    );
  }
  if (tok.type === "list") {
    const items = (tok as Tokens.List).items;
    const ordered = (tok as Tokens.List).ordered;
    const ListTag = (ordered ? "ol" : "ul") as "ul" | "ol";
    return (
      <ListTag key={key}>
        {items.map((it, j) => (
          <li key={j} dangerouslySetInnerHTML={{ __html: marked.parseInline(it.text) as string }} />
        ))}
      </ListTag>
    );
  }
  if (tok.type === "blockquote") {
    const text = (tok as Tokens.Blockquote).text;
    return <blockquote key={key} dangerouslySetInnerHTML={{ __html: marked.parseInline(text) as string }} />;
  }
  if (tok.type === "hr") {
    return <hr key={key} />;
  }
  if (tok.type === "space") return null;
  // Fallback: render via marked.parser for unknown types.
  return <div key={key} dangerouslySetInnerHTML={{ __html: marked.parser([tok]) as string }} />;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
