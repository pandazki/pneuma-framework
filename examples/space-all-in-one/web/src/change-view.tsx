import { useState } from "react";
import { Button } from "../beautifui/atoms/Button";
import { EntityChip } from "../beautifui/atoms/EntityChip";
import { ValuePill } from "../beautifui/atoms/ValuePill";
import LoadingState from "../beautifui/primitives/LoadingState";
import { CheckOption, Drawer, FieldRow, Meter } from "../beautifui/primitives/Recommendation";
import TaskRows, { type TaskRow } from "../beautifui/primitives/TaskRows";
import { Collapsible, FileChips } from "../beautifui/primitives/ToolChips";
import { Section, Surface } from "../beautifui/site";
import { act, fill, hue, useOwner, usePage, useUi } from "./lib";
import type { ChangeModel, Notice, Side } from "./model";
import { TONE_VAR } from "./home";
import { ArrowOut, ButtonLink, DetailsBlock, EmptyState, Header, Picture, RichText, StatePill } from "./parts";

/** What a failed write says: the plain line, and the Host's own words under Details. */
export function Failure({ text, detail }: { text: string; detail: string }) {
  const ui = useUi();
  return (
    <div role="alert" className="mt-2 rounded-control bg-red-tint px-2.5 py-2 text-[12.5px] text-red" style={{ animation: "fade-in 200ms ease-out both" }}>
      <p className="font-medium">{text}</p>
      {detail && (
        <Collapsible label={ui.details} className="mt-1 [&_button]:text-red/80">
          <pre className="max-h-40 overflow-auto font-mono text-[11px] leading-[1.6] whitespace-pre-wrap text-ink-2 [overflow-wrap:anywhere]">{detail}</pre>
        </Collapsible>
      )}
    </div>
  );
}

/** A refused write in one plain sentence when the Host's refusal code has one; the Host's own words go under Details. */
export function refusalText(refusals: Readonly<Record<string, string>>, data: Record<string, unknown>, fallback: string): string {
  return refusals[String(data.reason ?? "")] ?? fallback;
}

export function noticeRow(notice: Notice, i: number): TaskRow {
  return { key: `n${i}`, wrap: true, label: <span className="font-normal leading-relaxed">{notice.text}</span>, status: notice.tone === "red" ? "failed" : notice.tone === "orange" ? "caution" : "plain" };
}

/** One side of before and after: a card with its label, a way to open the real thing, and its picture. */
function SideCard({ side, name, index }: { side: Side; name: string; index: number }) {
  const ui = useUi();
  const { refusals } = usePage();
  const owner = useOwner();
  const [again, setAgain] = useState<"idle" | "working" | { error: string; detail: string }>("idle");
  const showAgain = async () => {
    if (!side.again) return;
    setAgain("working");
    const result = await act(side.again.url, {});
    if (result.lost) {
      owner.lose();
      setAgain("idle");
      return;
    }
    if (result.ok) {
      location.reload();
      return;
    }
    setAgain({ error: refusalText(refusals, result.data, ui.failed), detail: String(result.data.detail ?? result.data.error ?? "") });
  };
  return (
    <div className="flex flex-col overflow-hidden rounded-card bg-surface shadow-card" style={{ animation: `fade-up 400ms cubic-bezier(0.23,1,0.32,1) ${index * 100}ms both` }}>
      <div className="flex h-12 items-center gap-2.5 border-b border-line px-3">
        <span className="shrink-0 text-[13px] font-medium text-ink">{side.label}</span>
        {side.note && (
          <span className="min-w-0 truncate text-[11.5px] text-ink-3">
            <RichText rich={side.note} />
          </span>
        )}
        {side.open && (
          <ButtonLink href={side.open} variant="secondary" size="xs" external className="ml-auto">
            {ui.open}
            <ArrowOut />
          </ButtonLink>
        )}
      </div>
      {side.shot && <Picture shot={side.shot} name={name} className={side.empty ? "border-b border-line opacity-60 grayscale" : ""} />}
      {side.empty && (
        <div className={side.shot ? "" : "flex aspect-[16/10] flex-col items-center justify-center"}>
          <EmptyState
            title={side.empty.text}
            icon={
              side.empty.tone === "green" ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6L9 17l-5-5" /></svg>
              ) : undefined
            }
          />
          {side.again && (
            <div className="-mt-6 flex flex-col items-center px-4 pb-6">
              {again === "working" ? (
                <LoadingState label={ui.preview_again_working} variant="Dots" />
              ) : owner.state === "yes" ? (
                <Button variant="secondary" size="sm" className="text-[12.5px]" onClick={showAgain}>
                  {side.again.label}
                </Button>
              ) : null}
              {typeof again === "object" && <Failure text={again.error} detail={again.detail} />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type Mode = "idle" | "approve" | "deny";

/**
 * The decision, as a RecommendationCard: the question, the change, how well it was checked, and two actions.
 * Each action opens the card's drawer to confirm; a one-way change asks for the box to be ticked first.
 */
function DecisionCard({ model }: { model: ChangeModel }) {
  const ui = useUi();
  const owner = useOwner();
  const d = model.decision;
  const [mode, setMode] = useState<Mode>("idle");
  const [ticked, setTicked] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ text: string; detail: string } | null>(null);
  const can = owner.state === "yes";

  const go = async (verb: "approve" | "deny") => {
    setBusy(true);
    setFailure(null);
    const result = await act(verb === "approve" ? d.approveUrl : d.denyUrl, verb === "deny" && reason.trim() ? { reason: reason.trim() } : {});
    setBusy(false);
    if (result.lost) return owner.lose();
    if (result.ok && !(verb === "approve" && result.data.status === "rejected")) {
      location.href = verb === "approve" ? d.doneLive : d.doneNo;
      return;
    }
    const why = model.reasons[String(result.data.reason ?? "")] ?? ui.why_other;
    setFailure({
      text: result.ok ? fill(ui.not_released, { why }) : refusalText(model.refusals, result.data, ui.failed),
      detail: String(result.data.detail ?? result.data.error ?? ""),
    });
  };

  const open = (next: Mode) => {
    setFailure(null);
    setTicked(false);
    setMode(next);
  };

  return (
    <div className="w-full overflow-hidden rounded-card bg-surface shadow-card" style={{ animation: "fade-up 380ms cubic-bezier(0.23,1,0.32,1) both" }}>
      <div className="primitive-card-pad">
        <span className="text-[14px] font-medium text-ink">{ui.decide_title}</span>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2 [overflow-wrap:anywhere]">
          {model.intent}
          <span className="whitespace-nowrap">
            {" "}
            <EntityChip name={model.appTitle} color={hue(model.name)} />
          </span>
          {d.oneWay && <ValuePill tone="red">{ui.one_way}</ValuePill>}
        </p>
        {d.blocked && can && <p className="mt-2 rounded-control bg-orange-tint px-2.5 py-2 text-[12.5px] leading-relaxed text-orange">{d.blocked}</p>}
      </div>

      <Drawer open={mode === "approve"}>
        <p className="pb-1 text-[11px] font-medium text-ink-3">{ui.confirm_title}</p>
        <ul className="flex flex-col gap-1">
          {[...d.lines, ...(d.marks ? [d.marks] : [])].map((line) => (
            <li key={line} className="flex gap-2 text-[12.5px] leading-relaxed text-ink-2">
              <span aria-hidden className="mt-[0.6em] size-1 shrink-0 rounded-full bg-ink-3" />
              {line}
            </li>
          ))}
        </ul>
        {d.consequence && <p className="mt-2 rounded-control bg-red-tint px-2.5 py-2 text-[12.5px] leading-relaxed text-red">{d.consequence}</p>}
        {d.check && (
          <div className="mt-2">
            <CheckOption checked={ticked} onChange={setTicked} disabled={busy}>
              {d.check}
            </CheckOption>
          </div>
        )}
        {failure && mode === "approve" && <Failure text={failure.text} detail={failure.detail} />}
      </Drawer>

      <Drawer open={mode === "deny"}>
        <p className="pb-1 text-[11px] font-medium text-ink-3">{ui.deny_title}</p>
        <p className="text-[12.5px] leading-relaxed text-ink-2">{ui.deny_body}</p>
        <div className="mt-1.5">
          <FieldRow value={reason} onChange={setReason} placeholder={ui.deny_reason} label={ui.deny_reason} maxLength={500} />
        </div>
        {failure && mode === "deny" && <Failure text={failure.text} detail={failure.detail} />}
      </Drawer>

      <div className="primitive-card-footer flex flex-wrap items-center justify-between gap-x-3 gap-y-2 bg-surface">
        {busy ? (
          <span className="pl-0.5">
            <LoadingState label={ui.working} />
          </span>
        ) : (
          <span className="flex min-w-0 items-center gap-2 pl-0.5">
            <Meter signal={d.signal} tone={TONE_VAR[d.signalTone]} />
            <span className="truncate text-[12.5px] font-medium text-ink-2">{d.signalLabel}</span>
          </span>
        )}
        {can ? (
          <span className="-mr-0.5 ml-auto flex items-center gap-2">
            {mode === "idle" ? (
              <>
                <Button variant="secondary" size="sm" className="px-2.5 text-[12.5px]" onClick={() => open("deny")}>
                  {ui.deny}
                </Button>
                <Button variant="accent" size="sm" className="text-[12.5px]" disabled={Boolean(d.blocked)} onClick={() => open("approve")}>
                  {ui.approve}
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" className="px-2.5 text-[12.5px]" disabled={busy} onClick={() => open("idle")}>
                  {ui.cancel}
                </Button>
                {mode === "approve" ? (
                  <Button variant="accent" size="sm" className="text-[12.5px]" disabled={busy || (Boolean(d.check) && !ticked)} onClick={() => go("approve")}>
                    {ui.confirm_go}
                  </Button>
                ) : (
                  <Button variant="primary" size="sm" className="text-[12.5px]" disabled={busy} onClick={() => go("deny")}>
                    {ui.deny_go}
                  </Button>
                )}
              </>
            )}
          </span>
        ) : (
          <span className="w-full px-0.5 text-[12px] leading-relaxed text-ink-3 sm:w-auto sm:max-w-[60%] sm:text-right">{owner.state === "checking" ? ui.owner_checking : ui.read_only_decide}</span>
        )}
      </div>
    </div>
  );
}

export function ChangeView({ model, onSearch }: { model: ChangeModel; onSearch: () => void }) {
  const ui = useUi();
  const crumbs = [{ text: ui.my_apps, href: model.links.home }, { text: model.appTitle, href: model.appHref }, { text: ui.change_title }];
  if (model.gone) {
    return (
      <>
        <Header crumbs={crumbs} title={model.intent} onSearch={onSearch} />
        <Section number="01" title={model.appTitle} index={1}>
          <Surface>
            <EmptyState title={model.intent} />
            <div className="-mt-4 flex justify-center pb-6">
              <ButtonLink href={model.appHref} variant="secondary" size="sm">
                {model.appTitle}
              </ButtonLink>
            </div>
          </Surface>
        </Section>
      </>
    );
  }
  const checks: TaskRow[] = model.checked.map((row, i) => ({
    key: `c${i}`,
    label: row.text,
    status: row.tone === "caution" ? "caution" : "done",
    ...(row.files?.length
      ? { amount: String(row.files.length), details: <FileChips files={row.files.slice(0, 24)} more={row.files.length > 24 ? `+${row.files.length - 24}` : undefined} /> }
      : {}),
  }));
  const why: TaskRow[] = [
    ...(model.oneWay ? [{ key: "one-way", label: model.oneWay.title, status: "caution" as const, details: <p className="text-[12.5px] leading-relaxed text-ink-2">{model.oneWay.body}</p>, defaultOpen: true }] : []),
    ...model.why.map((line, i): TaskRow => ({ key: `w${i}`, label: <span className="font-normal">{line}</span>, status: "caution" })),
  ];
  return (
    <>
      <Header
        crumbs={crumbs}
        title={model.intent}
        meta={<RichText rich={model.meta} />}
        pills={<StatePill tone="orange">{ui.waiting_title}</StatePill>}
        onSearch={onSearch}
      />
      <Section number="01" title={`${model.before.label} · ${model.after.label}`} note={model.after.open ? ui.preview_open_hint : undefined} index={1}>
        <Surface>
          <div className="grid gap-3 sm:grid-cols-2">
            <SideCard side={model.before} name={model.name} index={0} />
            <SideCard side={model.after} name={model.name} index={1} />
          </div>
          {model.notices.length > 0 && (
            <div className="mx-auto mt-3 w-full max-w-[720px]">
              <TaskRows rows={model.notices.map(noticeRow)} />
            </div>
          )}
        </Surface>
      </Section>
      <Section number="02" title={ui.checked_title} index={2}>
        <Surface>
          <div className="grid gap-3 lg:grid-cols-2">
            <TaskRows rows={checks} />
            <div className="flex flex-col gap-1.5">
              <p className="px-0.5 text-[11.5px] font-medium text-ink-3">{ui.why_title}</p>
              <TaskRows rows={why} />
            </div>
          </div>
        </Surface>
      </Section>
      <Section number="03" title={ui.decision_title} note={ui.decide_lead} index={3}>
        <Surface>
          <div className="mx-auto max-w-[480px]">
            <DecisionCard model={model} />
          </div>
        </Surface>
      </Section>
      <DetailsBlock facts={model.facts} />
    </>
  );
}
