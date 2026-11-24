import { useEffect, useState } from "react";
import { Button } from "../beautifui/atoms/Button";
import LoadingState from "../beautifui/primitives/LoadingState";
import { CheckOption } from "../beautifui/primitives/Recommendation";
import TaskRows, { TaskPill, type TaskRow } from "../beautifui/primitives/TaskRows";
import { Section, Surface } from "../beautifui/site";
import { act, useOwner, usePage, useUi } from "./lib";
import type { BackModel, MissingModel, UnreadableModel } from "./model";
import { Failure, refusalText } from "./change-view";
import { ButtonLink, DetailsBlock, EmptyState, Header, RichText, StatePill } from "./parts";

const PLAN_CHANGED = "pneuma-plan-changed";

/** Going back, as a card in the RecommendationCard's grammar: what happens to the data, then the decision. */
function BackCard({ model, changed }: { model: BackModel; changed: string | null }) {
  const ui = useUi();
  const { refusals } = usePage();
  const owner = useOwner();
  const [ticked, setTicked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ text: string; detail: string } | null>(null);
  const can = owner.state === "yes" && !model.blocked;

  const go = async () => {
    setBusy(true);
    setFailure(null);
    // The version the plan above starts from: the Host refuses once the app has moved on from it.
    const result = await act(model.undoUrl, { to: model.version, from: model.from, ...(model.accept ? { accept_one_way: true } : {}) });
    setBusy(false);
    if (result.lost) return owner.lose();
    if (result.ok) {
      location.href = model.doneHref;
      return;
    }
    if (result.data.reason === "plan_changed") {
      // Show the plan as it is now, and say why it changed.
      try {
        sessionStorage.setItem(PLAN_CHANGED, String(result.data.error ?? ""));
      } catch {}
      location.reload();
      return;
    }
    setFailure({ text: refusalText(refusals, result.data, ui.failed), detail: String(result.data.detail ?? result.data.error ?? "") });
  };

  return (
    <div className="w-full overflow-hidden rounded-card bg-surface shadow-card" style={{ animation: "fade-up 380ms cubic-bezier(0.23,1,0.32,1) both" }}>
      <div className="primitive-card-pad">
        <span className="text-[14px] font-medium text-ink">{ui.data_title}</span>
        {model.data && (
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2 [overflow-wrap:anywhere]">
            <RichText rich={model.data} />
          </p>
        )}
        {model.blocked && <p className="mt-2 rounded-control bg-orange-tint px-2.5 py-2 text-[12.5px] leading-relaxed text-orange">{model.blocked}</p>}
        {model.marks && !model.blocked && <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">{model.marks}</p>}
        {model.check && can && (
          <div className="mt-2">
            <CheckOption checked={ticked} onChange={setTicked} disabled={busy}>
              {model.check}
            </CheckOption>
          </div>
        )}
        {failure ? <Failure text={failure.text} detail={failure.detail} /> : changed !== null && <Failure text={refusals.plan_changed ?? ui.failed} detail={changed} />}
      </div>
      <div className="primitive-card-footer flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-line">
        {busy ? (
          <span className="pl-0.5">
            <LoadingState label={ui.working} />
          </span>
        ) : !can && !model.blocked ? (
          <span className="px-0.5 text-[12px] leading-relaxed text-ink-3 sm:max-w-[60%]">{owner.state === "checking" ? ui.owner_checking : ui.read_only_decide}</span>
        ) : (
          <span />
        )}
        <span className="-mr-0.5 ml-auto flex items-center gap-2">
          <ButtonLink href={model.appHref} variant="ghost" size="sm" className="px-2.5 text-[12.5px]">
            {ui.cancel}
          </ButtonLink>
          {can && (
            <Button variant="accent" size="sm" className="text-[12.5px]" disabled={busy || (Boolean(model.check) && !ticked)} onClick={go}>
              {ui.back_go}
            </Button>
          )}
        </span>
      </div>
    </div>
  );
}

export function BackView({ model, onSearch }: { model: BackModel; onSearch: () => void }) {
  const ui = useUi();
  // After a reload for a plan that changed: why the page shows another plan, said once.
  const [changed, setChanged] = useState<string | null>(null);
  useEffect(() => {
    try {
      const said = sessionStorage.getItem(PLAN_CHANGED);
      sessionStorage.removeItem(PLAN_CHANGED);
      setChanged(said);
    } catch {}
  }, []);
  const crumbs = [{ text: ui.my_apps, href: model.links.home }, { text: model.appTitle, href: model.appHref }, { text: ui.back_go }];
  const header = <Header crumbs={crumbs} title={model.heading} meta={model.made ? <RichText rich={model.made} /> : undefined} onSearch={onSearch} />;
  if (model.kind !== "plan") {
    return (
      <>
        {header}
        <Section number="01" title={model.appTitle} index={1}>
          <Surface>
            <div className="mx-auto max-w-[480px] overflow-hidden rounded-card bg-surface shadow-card">
              <p className="primitive-card-pad text-[13px] leading-relaxed text-ink-2">{model.kind === "current" ? ui.back_current : ui.back_not_earlier}</p>
              <div className="primitive-card-footer flex justify-end border-t border-line">
                <ButtonLink href={model.appHref} variant="secondary" size="sm" className="text-[12.5px]">
                  {ui.cancel}
                </ButtonLink>
              </div>
            </div>
          </Surface>
        </Section>
      </>
    );
  }
  const undone: TaskRow[] = model.undone.map((row, i) => ({
    key: `u${i}`,
    label: row.title,
    amount: row.when ? <RichText rich={row.when} /> : undefined,
    status: "undo",
    pill: row.oneWay ? <TaskPill tone="red">{ui.one_way}</TaskPill> : undefined,
  }));
  return (
    <>
      {header}
      {undone.length > 0 && (
        <Section number="01" title={ui.back_undoes} note={String(undone.length)} index={1}>
          <Surface>
            <TaskRows rows={undone} />
          </Surface>
        </Section>
      )}
      <Section number={undone.length ? "02" : "01"} title={ui.back_go} index={2}>
        <Surface>
          <div className="mx-auto max-w-[480px]">
            <BackCard model={model} changed={changed} />
          </div>
        </Surface>
      </Section>
      <DetailsBlock facts={model.facts} />
    </>
  );
}

export function MissingView({ model, onSearch }: { model: MissingModel; onSearch: () => void }) {
  const ui = useUi();
  return (
    <>
      <Header crumbs={[{ text: ui.my_apps, href: model.links.home }]} title={model.message} onSearch={onSearch} />
      <div className="px-5 py-8 sm:px-8 sm:py-10">
        <Surface>
          <EmptyState title={model.message} />
          <div className="-mt-4 flex justify-center pb-6">
            <ButtonLink href={model.links.home} variant="secondary" size="sm">
              {ui.my_apps}
            </ButtonLink>
          </div>
        </Surface>
      </div>
    </>
  );
}

export function UnreadableView({ model, onSearch }: { model: UnreadableModel; onSearch: () => void }) {
  const ui = useUi();
  return (
    <>
      <Header crumbs={[{ text: ui.my_apps, href: model.links.home }, { text: model.appTitle }]} title={model.appTitle} pills={<StatePill tone="neutral">{model.stateLabel}</StatePill>} onSearch={onSearch} />
      <div className="px-5 py-8 sm:px-8 sm:py-10">
        <Surface>
          <EmptyState title={model.body} />
        </Surface>
      </div>
      <DetailsBlock facts={model.facts} />
    </>
  );
}
