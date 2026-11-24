// What the Host sends the owner page: one view's data, already decided and worded on the server
// (src/page.ts). The client (web/) only lays it out with Beautiful UI's components; it imports these types. Every string here may
// have come from the record or an app, which an agent can write: the views render them as text, never as
// markup, and only use `href`s the server built or checked.

export type Lang = "en" | "zh";

/** The page's own words the client needs, in the view's language (src/page-words.ts). */
export const UI_KEYS = [
  "tagline", "apps_one", "apps_other", "search", "search_label", "search_placeholder", "search_empty", "search_keys", "search_open",
  "owner_yes", "owner_no", "owner_help_title", "owner_help", "owner_how", "owner_lost", "owner_checking", "owner_off",
  "cancel", "copy", "copied", "details", "my_apps", "waiting_title", "section_waiting_hint", "all_apps", "empty_title", "empty_body",
  "open", "review", "open_new", "open_app", "hint_title", "history_title", "running_now", "go_back", "show_earlier", "one_way",
  "change_title", "decide_title", "decision_title", "decide_lead", "approve", "deny", "read_only_decide", "confirm_title", "confirm_go", "deny_title", "deny_body", "deny_reason", "deny_go",
  "working", "failed", "not_released", "why_other", "preview_again_working", "preview_open_hint", "checked_title", "why_title", "back_undoes", "data_title", "back_go", "back_current", "back_not_earlier",
  "theme_light", "theme_dark", "language",
] as const;
export type UiKey = (typeof UI_KEYS)[number];
export type Ui = Readonly<Record<UiKey, string>>;
export type Tone = "neutral" | "green" | "orange" | "red" | "accent";
export type AppState = "normal" | "waiting" | "not_live" | "uncertain" | "unpublished" | "unreadable";

/** A moment, shown relative ("5 minutes ago") or absolute; the page keeps it current in the reader's time zone. */
export interface Stamp {
  readonly at: string;
  readonly mode: "rel" | "abs";
  /** The server's rendering, shown until the page renders its own. */
  readonly label: string;
}

/** Words with moments in them: each part is plain text or a moment. */
export interface Rich {
  readonly parts: readonly (string | Stamp)[];
}

/** A picture of an app as the Host stored it, or what to show instead. */
export interface Shot {
  /** `/pictures/<file>`, or null for the placeholder. */
  readonly src: string | null;
  /** Initials for the placeholder. */
  readonly monogram: string;
  /** Why there is no picture, when the Host knows; null shows the placeholder alone. */
  readonly caption: string | null;
  /** When the picture was taken, and whether it shows what runs now. */
  readonly taken?: Rich;
}

/** One technical fact, for "Details". */
export interface Fact {
  readonly label: string;
  readonly value: string;
  readonly mono?: boolean;
  /** An http(s) address the server checked. */
  readonly href?: string;
}

export interface SearchEntry {
  readonly name: string;
  readonly title: string;
  readonly href: string;
  readonly state: AppState;
  readonly stateLabel: string;
  /** The words of recent changes, to search in. */
  readonly words: string;
  readonly monogram: string;
}

export interface Notice {
  readonly tone: Tone;
  readonly text: string;
}

interface Common {
  readonly lang: Lang;
  readonly ui: Ui;
  /** Why a change did not go live, by the record's reason code, for what a decision answers. */
  readonly reasons: Readonly<Record<string, string>>;
  /** What a refused write means, by the Host's refusal code: one plain sentence each. */
  readonly refusals: Readonly<Record<string, string>>;
  readonly title: string;
  /** The server's clock when it built this, so relative times match until the page takes over. */
  readonly now: number;
  readonly links: { readonly home: string; readonly zh: string; readonly en: string };
  readonly search: readonly SearchEntry[];
  /** Said once after one of the page's own decisions went through. */
  readonly done?: string;
  /** The Host was started without an owner link: the page decides nothing. */
  readonly ownerOff: boolean;
  /** Whether the Host takes pictures at all (for "Details"). */
  readonly picturesOn: boolean;
}

export interface WaitingCard {
  readonly app: string;
  readonly appTitle: string;
  readonly href: string;
  readonly intent: string;
  readonly meta: Rich;
  readonly oneWay: boolean;
  readonly signal: number;
  readonly signalLabel: string;
  readonly signalTone: Tone;
  readonly shot: Shot;
}

export interface AppCard {
  readonly name: string;
  readonly title: string;
  readonly href: string;
  readonly state: AppState;
  readonly stateLabel: string;
  readonly tone: Tone;
  readonly meta: Rich;
  readonly shot: Shot;
  /** Where the app runs: an http(s) address the server checked. */
  readonly address: string | null;
  /** A change waits: where to review it. */
  readonly review: string | null;
  /** The Host could not read the app. */
  readonly unreadable: string | null;
}

export interface Hint {
  readonly body: string;
  readonly example: string;
}

/** A file among the waiting changes that the Host could not read as one: it cannot be decided. */
export interface Problem {
  readonly app: string;
  readonly appTitle: string;
  readonly href: string;
  readonly text: string;
  /** The Host's own line, for "Details". */
  readonly line: string;
}

export interface HomeModel extends Common {
  readonly view: "home";
  readonly waiting: readonly WaitingCard[];
  readonly problems: readonly Problem[];
  readonly apps: readonly AppCard[];
  readonly hint: Hint;
  readonly facts: readonly Fact[];
}

export type RowBadge = "done" | "failed" | "waiting" | "plain" | "undo";

/** One event in an app's history, as a person would tell it. */
export interface HistoryRow {
  readonly id: string;
  readonly title: string;
  readonly when: Rich;
  readonly badge: RowBadge;
  readonly pill: { readonly label: string; readonly tone: Tone } | null;
  /** What stood behind it, in plain words. */
  readonly standing: Rich | null;
  readonly standingTone: Tone;
  /** Who, and when. */
  readonly who: Rich;
  /** The reason an undo was given. */
  readonly note: string | null;
  readonly oneWay: { readonly body: string; readonly why: string | null } | null;
  readonly snapshot: string | null;
  readonly review: string | null;
  readonly back: string | null;
  readonly files: readonly string[];
  readonly facts: readonly Fact[];
}

export interface AppModel extends Common {
  readonly view: "app";
  readonly name: string;
  readonly appTitle: string;
  readonly state: AppState;
  readonly stateLabel: string;
  readonly tone: Tone;
  readonly meta: Rich;
  readonly address: string | null;
  readonly addressText: string;
  readonly shot: Shot;
  readonly notices: readonly Notice[];
  readonly waiting: readonly { readonly intent: string; readonly href: string }[];
  readonly history: readonly HistoryRow[];
  /** The history could not be read at all. */
  readonly historyError: string | null;
  readonly hint: Hint;
  readonly facts: readonly Fact[];
}

/** One side of before and after. */
export interface Side {
  readonly label: string;
  /** Opens the real thing in a new window: an address on the runtime the server checked. */
  readonly open: string | null;
  readonly shot: Shot | null;
  /** Shown instead of a picture. */
  readonly empty: { readonly text: string; readonly tone: Tone } | null;
  /** The preview no longer stands and the Host can publish it again. */
  readonly again: { readonly label: string; readonly url: string } | null;
  /** A line under it: when the preview ends itself. */
  readonly note: Rich | null;
}

export interface CheckRow {
  readonly text: string;
  readonly tone: "done" | "caution";
  readonly files?: readonly string[];
}

export interface Decision {
  readonly approveUrl: string;
  readonly denyUrl: string;
  readonly doneLive: string;
  readonly doneNo: string;
  readonly oneWay: boolean;
  /** What going live means, one line each. */
  readonly lines: readonly string[];
  /** For a one-way change: the consequence, and the sentence the owner ticks. */
  readonly consequence: string | null;
  readonly check: string | null;
  readonly signal: number;
  readonly signalLabel: string;
  readonly signalTone: Tone;
  /** Letting it go live would be refused now, and why: the owner can still say no. */
  readonly blocked: string | null;
  /** Going live also makes this Host the app's manager on PneumaSpace: said before it happens. */
  readonly marks: string | null;
}

export interface ChangeModel extends Common {
  readonly view: "change";
  readonly name: string;
  readonly appTitle: string;
  readonly appHref: string;
  readonly changeId: string;
  /** The change no longer waits. */
  readonly gone: boolean;
  readonly intent: string;
  readonly meta: Rich;
  readonly before: Side;
  readonly after: Side;
  readonly checked: readonly CheckRow[];
  readonly why: readonly string[];
  readonly oneWay: { readonly title: string; readonly body: string } | null;
  /** What holds the app as a whole: another manager, an unfinished undo, an address nobody saw answer. */
  readonly notices: readonly Notice[];
  readonly decision: Decision;
  readonly facts: readonly Fact[];
}

export interface BackModel extends Common {
  readonly view: "back";
  readonly name: string;
  readonly appTitle: string;
  readonly appHref: string;
  readonly version: string;
  /** "Go back to “…”?", already worded. */
  readonly heading: string;
  readonly made: Rich | null;
  readonly kind: "plan" | "current" | "not_earlier";
  readonly undone: readonly { readonly title: string; readonly when: Rich | null; readonly oneWay: boolean }[];
  readonly data: Rich | null;
  readonly check: string | null;
  readonly blocked: string | null;
  /** Going back also makes this Host the app's manager on PneumaSpace: said before it happens. */
  readonly marks: string | null;
  readonly undoUrl: string;
  readonly accept: boolean;
  /** The version the plan shown starts from. Sent with "Go back"; the Host refuses with `plan_changed` once it is not current. */
  readonly from: string | null;
  readonly doneHref: string;
  readonly facts: readonly Fact[];
}

export interface MissingModel extends Common {
  readonly view: "missing";
  readonly message: string;
}

export interface UnreadableModel extends Common {
  readonly view: "unreadable";
  readonly name: string;
  readonly appTitle: string;
  readonly stateLabel: string;
  readonly body: string;
  readonly facts: readonly Fact[];
}

export type PageModel = HomeModel | AppModel | ChangeModel | BackModel | MissingModel | UnreadableModel;
