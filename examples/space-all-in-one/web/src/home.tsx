import { buttonVariants } from "../beautifui/atoms/Button";
import { EntityChip } from "../beautifui/atoms/EntityChip";
import { ValuePill } from "../beautifui/atoms/ValuePill";
import { Meter } from "../beautifui/primitives/Recommendation";
import TaskRows, { type TaskRow } from "../beautifui/primitives/TaskRows";
import { Section, Surface } from "../beautifui/site";
import { fill, hue, useUi } from "./lib";
import type { AppCard, HomeModel, Problem, Tone, WaitingCard } from "./model";
import { AppMark, Details, DetailsBlock, EmptyState, Header, HintCard, Picture, RichText, SourceChip, StatePill } from "./parts";

export const TONE_VAR: Record<Tone, string> = { green: "var(--green)", orange: "var(--orange)", red: "var(--red)", neutral: "var(--ink-3)", accent: "var(--accent)" };

/** A change waiting for the owner, as a RecommendationCard: the request, who made it, and how well it was checked. */
export function WaitingChange({ card, showApp = true }: { card: WaitingCard; showApp?: boolean }) {
  const ui = useUi();
  return (
    <div className="flex w-full flex-col overflow-hidden rounded-card bg-surface shadow-card" style={{ animation: "fade-up 380ms cubic-bezier(0.23,1,0.32,1) both" }}>
      <div className="primitive-card-pad flex-1">
        {showApp && (
          <div className="-ml-0.5 mb-2 flex flex-wrap items-center gap-1">
            <EntityChip name={card.appTitle} monogram={card.shot.monogram} color={hue(card.app)} />
            {card.oneWay && <ValuePill tone="red">{ui.one_way}</ValuePill>}
          </div>
        )}
        <a href={card.href} className="line-clamp-3 text-[14px] font-medium text-ink [overflow-wrap:anywhere] hover:underline hover:decoration-line-strong hover:underline-offset-2">
          {card.intent}
        </a>
        <p className="mt-1.5 text-[12.5px] text-ink-3">
          <RichText rich={card.meta} />
        </p>
        {!showApp && card.oneWay && (
          <p className="mt-2">
            <ValuePill tone="red">{ui.one_way}</ValuePill>
          </p>
        )}
      </div>
      <div className="primitive-card-footer flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 pl-0.5">
          <Meter signal={card.signal} tone={TONE_VAR[card.signalTone]} />
          <span className="truncate text-[12.5px] font-medium text-ink-2">{card.signalLabel}</span>
        </span>
        <a href={card.href} className={`${buttonVariants({ variant: "accent", size: "sm" })} -mr-0.5 shrink-0 text-[12.5px]`}>
          {ui.review}
        </a>
      </div>
    </div>
  );
}

/** One app, as a ContextCards card: a bar with its name and state, its stored picture, and where it runs. */
function AppTile({ app, index }: { app: AppCard; index: number }) {
  const ui = useUi();
  return (
    <div className="group/app flex flex-col overflow-hidden rounded-card bg-surface shadow-card" style={{ animation: `fade-up 400ms cubic-bezier(0.23,1,0.32,1) ${Math.min(index, 8) * 70}ms both` }}>
      <div className="primitive-card-bar flex h-11 items-center gap-2.5 border-b border-line">
        <a href={app.href} className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-ink">
          <AppMark name={app.name} mark={app.shot.monogram} />
          <span className="truncate">{app.title}</span>
        </a>
        {app.address && (
          <span className="ml-auto">
            <SourceChip href={app.address}>{ui.open}</SourceChip>
          </span>
        )}
      </div>
      <a href={app.href} aria-label={app.title} className="block border-b border-line">
        <Picture shot={app.shot} name={app.name} className="transition-[filter] duration-200 group-hover/app:brightness-[0.98]" />
      </a>
      <div className="flex flex-1 items-end gap-2 px-3 pt-2.5 pb-3">
        <div className="min-w-0 flex-1">
          <StatePill tone={app.tone}>{app.stateLabel}</StatePill>
          {/* A div: the foundation sets text-wrap on every p, which outranks truncate. */}
          <div className={`mt-1.5 text-[12px] text-ink-3 ${app.unreadable ? "line-clamp-2" : "truncate"}`}>
            <RichText rich={app.meta} />
          </div>
        </div>
        {app.review && (
          <a href={app.review} className={`${buttonVariants({ variant: "accent", size: "xs" })} shrink-0`}>
            {ui.review}
          </a>
        )}
      </div>
    </div>
  );
}

/** A file among the waiting changes the Host could not read as one: it cannot be decided, so it is a caution row, not a card. */
function problemRow(problem: Problem, i: number): TaskRow {
  return {
    key: `p${i}`,
    label: (
      <a href={problem.href} className="font-normal leading-relaxed hover:underline hover:decoration-line-strong hover:underline-offset-2">
        {problem.text}
      </a>
    ),
    status: "caution",
    wrap: true,
    details: <Details facts={[{ label: problem.appTitle, value: problem.line }]} />,
  };
}

export function Home({ model, onSearch }: { model: HomeModel; onSearch: () => void }) {
  const ui = model.ui;
  let n = 0;
  const number = () => String(++n).padStart(2, "0");
  return (
    <>
      <Header crumbs={[{ text: ui.my_apps }]} title={model.title} meta={ui.tagline} onSearch={onSearch} />
      {(model.waiting.length > 0 || model.problems.length > 0) && (
        <Section number={number()} title={ui.waiting_title} note={ui.section_waiting_hint} index={1}>
          <Surface>
            {model.waiting.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {model.waiting.map((card) => (
                  <WaitingChange key={card.href} card={card} />
                ))}
              </div>
            )}
            {model.problems.length > 0 && (
              <div className={model.waiting.length ? "mt-3" : ""}>
                <TaskRows rows={model.problems.map(problemRow)} />
              </div>
            )}
          </Surface>
        </Section>
      )}
      <Section number={number()} title={ui.all_apps} note={model.apps.length ? fill(model.apps.length === 1 ? ui.apps_one : ui.apps_other, { n: model.apps.length }) : undefined} index={2}>
        <Surface>
          {model.apps.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {model.apps.map((app, i) => (
                <AppTile key={app.name} app={app} index={i} />
              ))}
            </div>
          ) : (
            <EmptyState title={ui.empty_title} body={ui.empty_body} />
          )}
        </Surface>
      </Section>
      <Section number={number()} title={ui.hint_title} index={3}>
        <Surface>
          <div className="mx-auto max-w-[560px]">
            <HintCard hint={model.hint} />
          </div>
        </Surface>
      </Section>
      <DetailsBlock facts={model.facts} />
    </>
  );
}
