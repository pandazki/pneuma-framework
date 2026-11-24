// ---------------------------------------------------------------------------
// The owner page's stylesheet and script, inlined into every page with the
// response's nonce. No build step and no external asset: the Host is a small
// server, and the page must keep working when it is the only thing running.
// ---------------------------------------------------------------------------

export const STYLE = `
:root {
  color-scheme: light dark;
  --bg: #f5f6f8; --surface: #ffffff; --surface-2: #f0f2f5; --line: #e4e7eb; --line-strong: #d3d8de;
  --text: #15171c; --muted: #5f6672; --faint: #8a919c;
  --accent: #2563eb; --accent-hover: #1d4fd8; --accent-text: #ffffff; --accent-soft: #e9f0ff;
  --ok: #157f3c; --ok-soft: #e6f5ea; --wait: #a85d06; --wait-soft: #fcf1df; --bad: #b42318; --bad-soft: #fdecea; --unknown: #5f6672; --unknown-soft: #eceef1;
  --shadow: 0 1px 2px rgba(17, 24, 39, .04), 0 1px 3px rgba(17, 24, 39, .05);
  --shadow-lift: 0 10px 24px rgba(17, 24, 39, .08), 0 2px 6px rgba(17, 24, 39, .05);
  --radius: 16px; --radius-sm: 10px;
  --ph-a: #e8eefc; --ph-b: #d6e0fa; --ph-ink: #3b5bb5;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f1114; --surface: #171a1f; --surface-2: #1e2228; --line: #272c34; --line-strong: #353b45;
    --text: #e9ebef; --muted: #a0a7b2; --faint: #737b87;
    --accent: #5b93ff; --accent-hover: #78a6ff; --accent-text: #0b1020; --accent-soft: #1b2843;
    --ok: #5fd38a; --ok-soft: #14291c; --wait: #f2b54a; --wait-soft: #2c2211; --bad: #ff8a80; --bad-soft: #321716; --unknown: #a0a7b2; --unknown-soft: #23272e;
    --shadow: 0 0 0 1px rgba(255, 255, 255, .02);
    --shadow-lift: 0 10px 24px rgba(0, 0, 0, .35);
    --ph-a: #1c2433; --ph-b: #243049; --ph-ink: #9db6f2;
  }
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0; background: var(--bg); color: var(--text);
  font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif;
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
p { margin: 0; }
h1, h2, h3 { margin: 0; font-weight: 650; letter-spacing: -0.01em; }
code, pre { font: 12.5px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
code { background: var(--surface-2); border-radius: 6px; padding: 1px 5px; overflow-wrap: anywhere; }
pre { background: var(--surface-2); border-radius: var(--radius-sm); padding: 10px 12px; margin: 6px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.wrap { max-width: 1180px; margin: 0 auto; padding: 0 32px; }
.muted { color: var(--muted); }
.faint { color: var(--faint); }
.quote { overflow-wrap: anywhere; }

/* top row: back link on the left, search, language and owner state on the right */
.top { display: flex; align-items: center; gap: 12px; padding: 22px 0 8px; }
.top .back { color: var(--muted); font-weight: 500; display: inline-flex; align-items: center; gap: 6px; min-height: 36px; }
.top .back:hover { color: var(--text); text-decoration: none; }
.top .spacer { flex: 1; }
.search-btn {
  display: inline-flex; align-items: center; gap: 8px; height: 36px; padding: 0 10px 0 12px; min-width: 210px;
  border: 1px solid var(--line); background: var(--surface); color: var(--faint); border-radius: 10px; font: inherit; cursor: pointer;
}
.search-btn:hover { border-color: var(--line-strong); color: var(--muted); }
.search-btn .label { flex: 1; text-align: left; }
.search-btn kbd { font: 12px/1 ui-monospace, Menlo, monospace; color: var(--faint); border: 1px solid var(--line); border-radius: 6px; padding: 3px 5px; background: var(--surface-2); }
.icon { width: 16px; height: 16px; flex: none; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.lang { display: inline-flex; border: 1px solid var(--line); background: var(--surface); border-radius: 10px; padding: 3px; height: 36px; }
.lang a { color: var(--muted); padding: 0 10px; border-radius: 7px; display: inline-flex; align-items: center; font-size: 13.5px; }
.lang a:hover { text-decoration: none; color: var(--text); }
.lang a[aria-current="true"] { background: var(--surface-2); color: var(--text); font-weight: 600; }
.owner {
  display: inline-flex; align-items: center; gap: 8px; height: 36px; padding: 0 12px; border-radius: 999px; font: inherit; font-size: 13.5px; cursor: pointer;
  border: 1px solid var(--line); background: var(--surface); color: var(--muted);
}
.owner i { width: 8px; height: 8px; border-radius: 50%; background: var(--faint); }
.owner .yes { display: none; }
html[data-owner="yes"] .owner { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 30%, var(--line)); background: var(--ok-soft); }
html[data-owner="yes"] .owner i { background: var(--ok); }
html[data-owner="yes"] .owner .yes { display: inline; }
html[data-owner="yes"] .owner .no { display: none; }
html[data-owner="checking"] .owner { visibility: hidden; }

/* what only the owner's own session can do, and what everyone else reads instead */
html:not([data-owner="yes"]) .owner-only { display: none !important; }
html[data-owner="yes"] .not-owner, html[data-owner="checking"] .not-owner { display: none !important; }

.head { padding: 18px 0 26px; display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.head h1 { font-size: 30px; line-height: 1.2; }
.head .sub { color: var(--muted); margin-top: 6px; }
.head .grow { flex: 1; min-width: 240px; }
.section-title { font-size: 15px; font-weight: 650; margin: 8px 0 14px; display: flex; align-items: center; gap: 8px; }
.section-title .count { color: var(--faint); font-weight: 500; }
section + section { margin-top: 36px; }

/* buttons */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 38px; padding: 0 16px; border-radius: 10px;
  font: inherit; font-weight: 600; font-size: 14px; cursor: pointer; border: 1px solid var(--line); background: var(--surface); color: var(--text); white-space: nowrap;
}
.btn:hover { text-decoration: none; border-color: var(--line-strong); }
.btn-primary { background: var(--accent); border-color: var(--accent); color: var(--accent-text); }
.btn-primary:hover { background: var(--accent-hover); border-color: var(--accent-hover); }
.btn-danger { background: var(--bad); border-color: var(--bad); color: #fff; }
.btn-quiet { background: transparent; border-color: transparent; color: var(--muted); }
.btn-quiet:hover { color: var(--text); background: var(--surface-2); }
.btn-small { height: 32px; padding: 0 12px; font-size: 13.5px; }
.btn-icon { width: 38px; padding: 0; }
.btn[disabled], .btn[aria-disabled="true"] { opacity: .45; cursor: not-allowed; }

/* status pill */
.pill { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 550; padding: 3px 10px 3px 9px; border-radius: 999px; }
.pill i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; flex: none; }
.pill-normal { color: var(--ok); background: var(--ok-soft); }
.pill-waiting { color: var(--wait); background: var(--wait-soft); }
.pill-not_live { color: var(--bad); background: var(--bad-soft); }
.pill-uncertain, .pill-unpublished, .pill-unreadable { color: var(--unknown); background: var(--unknown-soft); }

/* pictures, and the placeholder that stands in for one */
.shot { position: relative; aspect-ratio: 16 / 10; overflow: hidden; background: var(--surface-2); }
.shot img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: top center; display: block; background: var(--surface); }
.ph { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; background: linear-gradient(160deg, var(--ph-a), var(--ph-b)); color: var(--ph-ink); }
.ph-mark { width: 30%; max-width: 76px; aspect-ratio: 1; border-radius: 24%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: clamp(18px, 3.2vw, 30px); background: color-mix(in srgb, var(--surface) 72%, transparent); box-shadow: 0 6px 18px rgba(0, 0, 0, .06); }
.ph-lines { display: flex; flex-direction: column; align-items: center; gap: 6px; width: 46%; }
.ph-lines span { display: block; height: 7px; border-radius: 4px; background: color-mix(in srgb, var(--ph-ink) 16%, transparent); width: 100%; }
.ph-lines span + span { width: 64%; }
.ph-cap { position: absolute; left: 12px; right: 12px; bottom: 10px; text-align: center; font-size: 12.5px; color: color-mix(in srgb, var(--ph-ink) 80%, var(--muted)); }
.hue-1 { --ph-a: #e9f6ee; --ph-b: #d3eedc; --ph-ink: #2c7a4b; }
.hue-2 { --ph-a: #fdf1e3; --ph-b: #f9e0c3; --ph-ink: #a2581a; }
.hue-3 { --ph-a: #f6ebfb; --ph-b: #ead8f5; --ph-ink: #7d3fa3; }
.hue-4 { --ph-a: #e6f5f7; --ph-b: #cdebef; --ph-ink: #23737f; }
.hue-5 { --ph-a: #fcecef; --ph-b: #f7d6dd; --ph-ink: #a83a55; }
.hue-6 { --ph-a: #eef0fb; --ph-b: #dde1f6; --ph-ink: #4b55a8; }
.hue-7 { --ph-a: #f3f3ea; --ph-b: #e6e6d2; --ph-ink: #6d6a2c; }
@media (prefers-color-scheme: dark) {
  .hue-1 { --ph-a: #15241b; --ph-b: #1b3324; --ph-ink: #8fd7aa; }
  .hue-2 { --ph-a: #2a1f13; --ph-b: #3a2a17; --ph-ink: #f0bf86; }
  .hue-3 { --ph-a: #241a2c; --ph-b: #31223d; --ph-ink: #d2a8ef; }
  .hue-4 { --ph-a: #13252a; --ph-b: #19343a; --ph-ink: #8fd3dd; }
  .hue-5 { --ph-a: #2b1a1f; --ph-b: #3b222a; --ph-ink: #f2a7b8; }
  .hue-6 { --ph-a: #1b1e31; --ph-b: #252a45; --ph-ink: #b0b8f2; }
  .hue-7 { --ph-a: #23231a; --ph-b: #303022; --ph-ink: #d8d49a; }
}

/* the grid of apps */
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 22px; }
.card { display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow); transition: box-shadow .15s, transform .15s, border-color .15s; }
.card:hover { box-shadow: var(--shadow-lift); border-color: var(--line-strong); }
.card .shot { border-bottom: 1px solid var(--line); }
.card-body { padding: 16px 18px 6px; display: flex; flex-direction: column; gap: 6px; flex: 1; }
.card-title { font-size: 16.5px; }
.card-title a { color: var(--text); }
.card-meta { color: var(--muted); font-size: 13.5px; }
.card-state { margin-top: 2px; }
.card-actions { display: flex; align-items: center; gap: 8px; padding: 12px 18px 18px; }
.card-actions .btn-primary { flex: 1; }

/* changes waiting for the owner, at the top */
.waiting { display: flex; flex-direction: column; gap: 12px; }
.wait-row { display: grid; grid-template-columns: 148px 1fr auto; gap: 18px; align-items: center; background: var(--surface); border: 1px solid color-mix(in srgb, var(--wait) 28%, var(--line)); border-radius: var(--radius); padding: 12px; box-shadow: var(--shadow); }
.wait-row .shot { border-radius: 10px; }
.wait-row .ph-mark { font-size: 18px; }
.wait-row .ph-lines, .wait-row .ph-cap { display: none; }
.wait-app { font-size: 13px; color: var(--wait); font-weight: 600; display: flex; align-items: center; gap: 8px; }
.wait-intent { font-size: 16.5px; font-weight: 600; margin-top: 4px; overflow-wrap: anywhere; }
.wait-meta { color: var(--muted); font-size: 13.5px; margin-top: 4px; }
.chip-oneway { display: inline-flex; align-items: center; gap: 6px; color: var(--bad); background: var(--bad-soft); border-radius: 999px; font-size: 12.5px; font-weight: 600; padding: 2px 9px; }

/* the hint: what to say to one's agent */
.hint { margin-top: 40px; background: var(--surface); border: 1px dashed var(--line-strong); border-radius: var(--radius); padding: 20px 22px; display: flex; gap: 18px; align-items: flex-start; }
.hint .hint-icon { width: 36px; height: 36px; border-radius: 10px; background: var(--accent-soft); color: var(--accent); display: flex; align-items: center; justify-content: center; flex: none; }
.hint .hint-icon .icon { width: 18px; height: 18px; }
.hint h2 { font-size: 15.5px; }
.hint p { color: var(--muted); margin-top: 4px; }
.say { margin-top: 12px; display: flex; gap: 10px; align-items: center; }
.say q { flex: 1; quotes: none; background: var(--surface-2); border-radius: 10px; padding: 9px 12px; color: var(--text); overflow-wrap: anywhere; }
.empty { text-align: center; padding: 56px 20px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); }
.empty h2 { font-size: 18px; }
.empty p { color: var(--muted); margin-top: 6px; }

/* details: the technical layer, never on the surface */
details.more { margin-top: 12px; }
details.more > summary { cursor: pointer; color: var(--faint); font-size: 13px; list-style: none; display: inline-flex; align-items: center; gap: 6px; user-select: none; }
details.more > summary::-webkit-details-marker { display: none; }
details.more > summary::before { content: "›"; display: inline-block; transition: transform .15s; font-size: 15px; line-height: 1; }
details.more[open] > summary::before { transform: rotate(90deg); }
details.more > summary:hover { color: var(--muted); }
.kv { display: grid; grid-template-columns: max-content 1fr; gap: 4px 14px; margin: 10px 0 0; font-size: 13px; }
.kv dt { color: var(--faint); }
.kv dd { margin: 0; overflow-wrap: anywhere; color: var(--muted); }
.kv ul { margin: 0; padding-left: 18px; }
.about { margin: 48px 0 40px; padding-top: 18px; border-top: 1px solid var(--line); }
.about p + p { margin-top: 8px; }
.about .kv { font-size: 13px; }

/* one app */
.app-head { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; padding: 14px 0 24px; }
.app-head h1 { font-size: 28px; }
.app-head .meta { color: var(--muted); font-size: 14px; width: 100%; margin-top: -6px; }
.app-head .grow { flex: 1; }
.layout { display: grid; grid-template-columns: minmax(0, 1.65fr) minmax(320px, 1fr); gap: 28px; align-items: start; }
.frame { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow); }
.frame-bar { display: flex; align-items: center; gap: 10px; padding: 10px 12px 10px 16px; border-bottom: 1px solid var(--line); font-size: 13px; color: var(--muted); }
.frame-bar .addr { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.frame .shot { aspect-ratio: 16 / 10; }
.under { margin-top: 18px; }
.notice { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border-radius: 12px; font-size: 14px; background: var(--surface); border: 1px solid var(--line); }
.notice .icon { margin-top: 2px; }
.notice-wait { background: var(--wait-soft); border-color: transparent; color: var(--text); }
.notice-wait .icon { color: var(--wait); }
.notice-bad { background: var(--bad-soft); border-color: transparent; }
.notice-bad .icon { color: var(--bad); }
.notice-ok { background: var(--ok-soft); border-color: transparent; }
.notice-ok .icon { color: var(--ok); }
.notice .grow { flex: 1; }
.notice + .notice { margin-top: 10px; }
.side { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 18px 18px 8px; box-shadow: var(--shadow); }
.side h2 { font-size: 15.5px; margin-bottom: 10px; }

/* the history, told as a timeline */
.timeline { list-style: none; margin: 0; padding: 0; }
.item { position: relative; padding: 2px 0 18px 26px; }
.item::before { content: ""; position: absolute; left: 6px; top: 18px; bottom: -2px; width: 2px; background: var(--line); }
.item:last-child::before { display: none; }
.item .dot { position: absolute; left: 0; top: 6px; width: 14px; height: 14px; border-radius: 50%; background: var(--surface); border: 2px solid var(--line-strong); }
.item.is-live .dot { border-color: var(--ok); background: var(--ok); box-shadow: 0 0 0 4px var(--ok-soft); }
.item.is-wait .dot { border-color: var(--wait); background: var(--wait-soft); }
.item.is-bad .dot { border-color: var(--bad); }
.item-top { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.item-title { font-weight: 600; overflow-wrap: anywhere; }
.badge { font-size: 12px; font-weight: 600; border-radius: 999px; padding: 1px 8px; white-space: nowrap; }
.badge-live { color: var(--ok); background: var(--ok-soft); }
.badge-idle { color: var(--muted); background: var(--surface-2); }
.item-meta { color: var(--muted); font-size: 13px; margin-top: 2px; }
.item-standing { font-size: 13.5px; margin-top: 6px; display: flex; gap: 7px; align-items: flex-start; color: var(--text); }
.item-standing .icon { color: var(--ok); margin-top: 3px; width: 14px; height: 14px; }
.item-standing.warn .icon { color: var(--wait); }
.item-standing.bad .icon { color: var(--bad); }
.item-standing.plain .icon { color: var(--faint); }
.item-oneway { margin-top: 8px; font-size: 13.5px; background: var(--bad-soft); border-radius: 10px; padding: 8px 10px; }
.item-oneway strong { color: var(--bad); display: flex; align-items: center; gap: 6px; font-size: 13px; }
.item-oneway .why { color: var(--muted); font-size: 12.5px; margin-top: 3px; overflow-wrap: anywhere; }
.item-actions { margin-top: 10px; display: flex; gap: 8px; }
.item details.more { margin-top: 6px; }
details.earlier > summary { cursor: pointer; color: var(--accent); font-size: 13.5px; font-weight: 550; list-style: none; padding: 4px 0 14px 26px; }
details.earlier > summary::-webkit-details-marker { display: none; }

/* a change waiting for the owner */
.review-head { padding: 12px 0 22px; }
.review-head .eyebrow { color: var(--wait); font-weight: 600; font-size: 13.5px; display: flex; gap: 8px; align-items: center; }
.review-head h1 { font-size: 27px; margin-top: 8px; overflow-wrap: anywhere; }
.review-head .meta { color: var(--muted); margin-top: 8px; }
.compare { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.compare .label { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; font-weight: 600; }
.compare .frame .shot { aspect-ratio: 16 / 10; }
.compare .gone { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 8px; padding: 24px; text-align: center; color: var(--muted); background: var(--surface-2); font-size: 14px; }
.compare .gone .icon { width: 22px; height: 22px; color: var(--ok); }
.facts { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 22px; }
.fact { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 18px; box-shadow: var(--shadow); }
.fact h2 { font-size: 15px; margin-bottom: 10px; }
.fact ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.fact li { display: flex; gap: 9px; align-items: flex-start; font-size: 14px; }
.fact li .icon { margin-top: 3px; color: var(--ok); }
.fact.why li .icon { color: var(--wait); }
.fact li.caution { color: var(--muted); }
.fact li.caution .icon { color: var(--faint); }
.oneway-box { margin-top: 20px; border-radius: var(--radius); padding: 16px 18px; background: var(--bad-soft); }
.oneway-box h2 { font-size: 15px; color: var(--bad); display: flex; gap: 8px; align-items: center; }
.oneway-box p { margin-top: 6px; }
.decide { margin-top: 24px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px 18px; box-shadow: var(--shadow); }
.decide .grow { flex: 1; min-width: 200px; color: var(--muted); font-size: 14px; }
.decide .btn { height: 42px; padding: 0 20px; font-size: 15px; }

/* going back */
.confirm-page { max-width: 620px; margin: 10px auto 60px; }
.panel { background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 26px 28px; box-shadow: var(--shadow); }
.panel h1 { font-size: 23px; line-height: 1.3; }
.panel .made { margin-top: 6px; font-size: 14px; }
.panel h2 { font-size: 14px; color: var(--muted); font-weight: 600; margin: 22px 0 8px; }
.panel .big { font-size: 16px; font-weight: 600; margin-top: 6px; overflow-wrap: anywhere; }
.undone { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.undone li { padding: 9px 12px; border-radius: 10px; background: var(--surface-2); font-size: 14px; overflow-wrap: anywhere; }
.undone li .faint { font-size: 12.5px; display: block; margin-top: 2px; }
.undone li.ow { background: var(--bad-soft); }
.check { display: flex; gap: 10px; align-items: flex-start; margin-top: 16px; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--line-strong); cursor: pointer; font-size: 14px; }
.check input { margin-top: 3px; width: 17px; height: 17px; accent-color: var(--bad); flex: none; }
.panel-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px; flex-wrap: wrap; }
.panel-actions .btn { height: 42px; padding: 0 20px; }
.result { margin-top: 16px; }

/* dialogs: owner help, confirmations, search */
dialog { border: none; padding: 0; background: transparent; color: var(--text); max-width: calc(100vw - 32px); }
dialog::backdrop { background: rgba(15, 18, 24, .38); backdrop-filter: blur(2px); }
.sheet { width: 520px; background: var(--surface); border-radius: 18px; padding: 24px 24px 20px; box-shadow: 0 24px 60px rgba(0, 0, 0, .22); border: 1px solid var(--line); }
.sheet h2 { font-size: 19px; }
.sheet p { margin-top: 10px; color: var(--muted); }
.sheet ul { margin: 12px 0 0; padding-left: 20px; color: var(--text); }
.sheet .consequence { background: var(--bad-soft); color: var(--text); border-radius: 12px; padding: 12px 14px; }
.sheet li + li { margin-top: 6px; }
.sheet textarea { width: 100%; min-height: 76px; margin-top: 12px; border: 1px solid var(--line-strong); background: var(--surface); color: var(--text); border-radius: 10px; padding: 10px 12px; font: inherit; resize: vertical; }
.sheet label.field { display: block; margin-top: 14px; font-size: 13.5px; color: var(--muted); }
.palette { width: 600px; margin-top: 12vh; }
.palette-box { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; box-shadow: 0 24px 60px rgba(0, 0, 0, .22); overflow: hidden; }
.palette-input { display: flex; align-items: center; gap: 10px; padding: 0 16px; border-bottom: 1px solid var(--line); color: var(--faint); }
.palette input { flex: 1; height: 54px; border: none; outline: none; background: transparent; color: var(--text); font: inherit; font-size: 16px; }
.palette ul { list-style: none; margin: 0; padding: 6px; max-height: 50vh; overflow: auto; }
.palette li { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 10px; cursor: pointer; }
.palette li[aria-selected="true"] { background: var(--accent-soft); }
.palette li .t { font-weight: 600; }
.palette li .w { color: var(--muted); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.palette li .txt { min-width: 0; flex: 1; display: flex; flex-direction: column; }
.palette li .mark { width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; background: linear-gradient(160deg, var(--ph-a), var(--ph-b)); color: var(--ph-ink); flex: none; }
.palette .empty-line { padding: 22px 16px; color: var(--muted); text-align: center; }
.palette .keys { padding: 9px 16px; border-top: 1px solid var(--line); color: var(--faint); font-size: 12.5px; }
.toast { margin: 4px 0 18px; }
.busy { display: none; color: var(--muted); font-size: 14px; align-items: center; gap: 8px; }
.is-busy .busy { display: inline-flex; }
.spin { width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--line-strong); border-top-color: var(--accent); animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.err { margin-top: 12px; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

@media (max-width: 960px) {
  .layout { grid-template-columns: 1fr; }
  .compare, .facts { grid-template-columns: 1fr; }
}
@media (max-width: 640px) {
  .wrap { padding: 0 16px; }
  .top { padding-top: 14px; gap: 8px; flex-wrap: wrap; }
  .search-btn { min-width: 0; padding: 0 10px; }
  .search-btn .label, .search-btn kbd { display: none; }
  .owner { padding: 0 10px; }
  .owner span { display: none; }
  .head { padding: 10px 0 20px; }
  .head h1 { font-size: 26px; }
  .grid { grid-template-columns: 1fr; gap: 12px; }
  .card { display: grid; grid-template-columns: 112px 1fr; grid-template-areas: "shot body" "actions actions"; }
  .card > a:first-child { grid-area: shot; padding: 14px 0 0 14px; }
  .card .shot { border: 1px solid var(--line); border-radius: 10px; }
  .card .ph-lines, .card .ph-cap { display: none; }
  .card .ph-mark { width: 42%; font-size: 16px; }
  .card-body { grid-area: body; padding: 12px 14px 2px; gap: 4px; }
  .card-title { font-size: 16px; }
  .card-actions { grid-area: actions; padding: 10px 14px 14px; }
  .wait-row { grid-template-columns: 88px 1fr; gap: 12px; }
  .wait-row .btn { grid-column: 1 / -1; }
  .hint { flex-direction: column; padding: 18px; }
  .say { flex-direction: column; }
  .app-head h1 { font-size: 24px; }
  .panel { padding: 20px 18px; }
  .decide { position: sticky; bottom: 10px; }
  .decide .btn { flex: 1; }
  .kv { grid-template-columns: 1fr; }
  .kv dt { margin-top: 6px; }
  .palette { margin-top: 6vh; }
}
@media (prefers-color-scheme: dark) { .shot img { filter: brightness(.92); } }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
`;

/**
 * The page's script. It holds the owner link for this tab (in sessionStorage, never in a cookie: apps on the
 * runtime share this machine's name, and cookies do not separate ports), sends it with the page's own writes,
 * keeps times current in the person's time zone, remembers the language, and runs the search palette and the
 * confirmations. Values from the record reach the DOM only as text.
 */
export const SCRIPT = `
(() => {
  const root = document.documentElement;
  const W = JSON.parse(document.getElementById("page-words").textContent);
  const KEY = "pneuma-owner";
  const store = {
    get() { try { return sessionStorage.getItem(KEY); } catch { return null; } },
    set(value) { try { value ? sessionStorage.setItem(KEY, value) : sessionStorage.removeItem(KEY); } catch {} },
  };

  // The language the person chose last time, unless the address names one.
  const params = new URLSearchParams(location.search);
  try {
    const saved = localStorage.getItem("pneuma-lang");
    if (!params.has("lang") && (saved === "en" || saved === "zh") && saved !== W.lang) {
      params.set("lang", saved);
      location.replace(location.pathname + "?" + params.toString());
      return;
    }
  } catch {}
  for (const a of document.querySelectorAll("[data-lang]")) {
    a.addEventListener("click", () => { try { localStorage.setItem("pneuma-lang", a.dataset.lang); } catch {} });
  }

  // Is this tab the owner's? The head already took the link out of the address.
  const setOwner = (state) => { root.dataset.owner = state; };
  const lost = () => { store.set(null); setOwner("no"); for (const el of document.querySelectorAll("[data-owner-lost]")) el.hidden = false; };
  async function checkOwner() {
    const token = store.get();
    if (!token) return setOwner("no");
    try {
      const res = await fetch("/owner/session", { method: "POST", headers: { "content-type": "application/json", "x-pneuma-owner": token }, body: "{}" });
      if (res.ok) setOwner("yes"); else lost();
    } catch { setOwner("no"); }
  }
  checkOwner();

  // Times: relative ones stay current, absolute ones in the person's own time zone.
  const rel = new Intl.RelativeTimeFormat(W.locale, { numeric: "auto" });
  const abs = new Intl.DateTimeFormat(W.locale, { dateStyle: "medium", timeStyle: "short" });
  const units = [["year", 31536e6], ["month", 2592e6], ["week", 6048e5], ["day", 864e5], ["hour", 36e5], ["minute", 6e4]];
  function relative(ms) {
    const diff = ms - Date.now();
    for (const [unit, size] of units) if (Math.abs(diff) >= size) return rel.format(Math.round(diff / size), unit);
    return rel.format(0, "minute");
  }
  function times() {
    for (const el of document.querySelectorAll("time[datetime]")) {
      const ms = Date.parse(el.getAttribute("datetime"));
      if (Number.isNaN(ms)) continue;
      const text = el.hasAttribute("data-rel") ? relative(ms) : abs.format(ms);
      el.textContent = el.dataset.wrap ? el.dataset.wrap.replace("{when}", text) : text;
      el.title = abs.format(ms);
    }
  }
  times();
  setInterval(times, 60000);

  // A picture that cannot be loaded leaves the placeholder showing.
  for (const img of document.querySelectorAll(".shot img")) {
    const drop = () => img.remove();
    if (img.complete && img.naturalWidth === 0) drop(); else img.addEventListener("error", drop);
  }

  // Copy buttons.
  for (const btn of document.querySelectorAll("[data-copy]")) {
    btn.addEventListener("click", async () => {
      const text = btn.dataset.copy;
      try { await navigator.clipboard.writeText(text); } catch {
        const area = document.createElement("textarea"); area.value = text; document.body.append(area); area.select();
        try { document.execCommand("copy"); } catch {} area.remove();
      }
      const label = btn.textContent; btn.textContent = W.copied; setTimeout(() => (btn.textContent = label), 1600);
    });
  }

  // Dialogs: anything with data-open names the dialog it opens; data-close closes its own.
  for (const btn of document.querySelectorAll("[data-open]")) {
    btn.addEventListener("click", () => document.getElementById(btn.dataset.open)?.showModal());
  }
  for (const btn of document.querySelectorAll("[data-close]")) {
    btn.addEventListener("click", () => btn.closest("dialog")?.close());
  }
  for (const dialog of document.querySelectorAll("dialog")) {
    dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  }
  // A one-way decision waits for its box to be ticked.
  for (const box of document.querySelectorAll("[data-arms]")) {
    const target = document.getElementById(box.dataset.arms);
    const sync = () => { if (target) target.disabled = !box.checked; };
    box.addEventListener("change", sync); sync();
  }

  // The page's own writes: approve, deny, go back. Each carries the owner link and nothing else that authorises it.
  for (const btn of document.querySelectorAll("[data-act]")) {
    btn.addEventListener("click", async () => {
      const token = store.get();
      const scope = btn.closest("[data-act-scope]") || document.body;
      const error = scope.querySelector("[data-error]");
      if (!token) return lost();
      const body = {};
      if (btn.dataset.to) body.to = btn.dataset.to;
      if (btn.dataset.accept === "1") body.accept_one_way = true;
      const reason = scope.querySelector("[data-reason]");
      if (reason && reason.value.trim()) body.reason = reason.value.trim();
      scope.classList.add("is-busy");
      for (const b of scope.querySelectorAll("button")) b.disabled = true;
      if (error) error.hidden = true;
      let res, data = {};
      try {
        res = await fetch(btn.dataset.act, { method: "POST", headers: { "content-type": "application/json", "x-pneuma-owner": token }, body: JSON.stringify(body) });
        data = await res.json().catch(() => ({}));
      } catch (err) { data = { error: String(err) }; }
      scope.classList.remove("is-busy");
      for (const b of scope.querySelectorAll("button")) b.disabled = false;
      for (const box of scope.querySelectorAll("[data-arms]")) box.dispatchEvent(new Event("change"));
      if (res && (data.reason === "owner_link_required" || data.reason === "owner_page_off")) return lost();
      const outcome = res && res.ok ? (data.status === "rejected" && btn.dataset.kind === "approve" ? "not_released" : "done") : "failed";
      if (outcome === "done") { location.href = btn.dataset.done; return; }
      if (error) {
        error.hidden = false;
        error.querySelector("[data-error-text]").textContent = outcome === "not_released" ? W.not_released.replace("{why}", W.why[data.reason] || W.why_other) : W.failed;
        error.querySelector("[data-error-detail]").textContent = data.detail || data.error || "";
      }
    });
  }

  // Search: a palette over the apps the page already lists.
  const palette = document.getElementById("palette");
  const data = JSON.parse(document.getElementById("search-data")?.textContent || "[]");
  if (palette) {
    const input = palette.querySelector("input");
    const list = palette.querySelector("ul");
    const empty = palette.querySelector(".empty-line");
    let shown = [], active = 0;
    const render = () => {
      const terms = input.value.toLowerCase().split(/\\s+/).filter(Boolean);
      shown = data.filter((app) => terms.every((term) => (app.t + " " + app.n + " " + app.w).toLowerCase().includes(term)));
      active = Math.min(active, Math.max(shown.length - 1, 0));
      list.replaceChildren(...shown.map((app, i) => {
        const li = document.createElement("li");
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", String(i === active));
        li.className = "hue-" + app.h;
        const mark = document.createElement("span"); mark.className = "mark"; mark.textContent = app.i;
        const txt = document.createElement("span"); txt.className = "txt";
        const t = document.createElement("span"); t.className = "t"; t.textContent = app.t;
        const w = document.createElement("span"); w.className = "w"; w.textContent = app.s + (app.w ? " · " + app.w : "");
        txt.append(t, w); li.append(mark, txt);
        li.addEventListener("click", () => (location.href = app.u));
        li.addEventListener("mousemove", () => { if (active !== i) { active = i; render(); } });
        return li;
      }));
      empty.hidden = shown.length > 0;
    };
    const open = () => { if (!palette.open) { input.value = ""; active = 0; render(); palette.showModal(); input.focus(); } };
    for (const btn of document.querySelectorAll("[data-search]")) btn.addEventListener("click", open);
    document.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); palette.open ? palette.close() : open(); }
    });
    input.addEventListener("input", () => { active = 0; render(); });
    input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") { event.preventDefault(); active = Math.min(active + 1, shown.length - 1); render(); }
      else if (event.key === "ArrowUp") { event.preventDefault(); active = Math.max(active - 1, 0); render(); }
      else if (event.key === "Enter" && shown[active]) { event.preventDefault(); location.href = shown[active].u; }
    });
    if (!/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) {
      for (const kbd of document.querySelectorAll("[data-kbd]")) kbd.textContent = "Ctrl K";
    }
  }
})();
`;

/**
 * Runs in the head, before anything is drawn: takes the owner link out of the address (so it is not left in
 * the address bar, the history or a screenshot) and keeps it for this tab, and says whether the tab may hold one.
 */
export const HEAD_SCRIPT = `
(() => {
  const m = /(?:^#|&)owner=([A-Za-z0-9_-]{16,})/.exec(location.hash);
  if (m) {
    try { sessionStorage.setItem("pneuma-owner", m[1]); } catch {}
    history.replaceState(null, "", location.pathname + location.search);
  }
  let held = null;
  try { held = sessionStorage.getItem("pneuma-owner"); } catch {}
  document.documentElement.dataset.owner = held ? "checking" : "no";
})();
`;
