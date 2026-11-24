// ---------------------------------------------------------------------------
// The owner page's words, in English and Chinese.
//
// The record speaks in reason codes, risk names and guarantee names. The page
// speaks to a person who never saw a terminal: what happened, in their words,
// and what stood behind it. Every code keeps a place under "Details"; nothing
// here replaces it, so an unknown code still reads as something plain.
// ---------------------------------------------------------------------------

export type Lang = "en" | "zh";

/** `?lang=` first, then the browser's own languages in its order, then English. */
export function chooseLang(query: string | null | undefined, acceptLanguage: string | undefined): Lang {
  if (query === "en" || query === "zh") return query;
  for (const part of String(acceptLanguage ?? "").split(",")) {
    const tag = part.split(";")[0]!.trim().toLowerCase();
    if (tag.startsWith("zh")) return "zh";
    if (tag.startsWith("en")) return "en";
  }
  return "en";
}

const en = {
  html_lang: "en",
  title_home: "My apps",
  tagline: "Apps your agents built for you on this computer.",
  apps_one: "1 app",
  apps_other: "{n} apps",
  search: "Search",
  search_label: "Search apps",
  search_placeholder: "An app's name, or something you asked for",
  search_empty: "No app matches.",
  search_keys: "↑ ↓ to move · Enter to open · Esc to close",
  owner_yes: "You can decide here",
  owner_no: "View only",
  owner_help_title: "Deciding from this page",
  owner_help:
    "Letting a change go live, saying no, and going back are yours to decide. This page can do them once you open it from your owner link, which the Host prints when it starts. Your agent does not get that link.",
  owner_how: "Find it in the Host's log, on the line that starts with “owner link”:",
  owner_lost: "This page can no longer decide: the Host restarted after you opened your owner link. Open the new link from the Host's log.",
  cancel: "Cancel",
  copy: "Copy",
  copied: "Copied",
  details: "Details",
  my_apps: "My apps",
  waiting_title: "Waiting for you",
  all_apps: "All apps",
  empty_title: "No apps yet",
  empty_body: "Ask your agent to make one. It will show up here.",
  open: "Open",
  review: "Review the change",
  open_new: "Open in a new window",
  open_app: "Open the app",
  updated: "Updated {when}",
  never_changed: "Not changed yet",
  state_normal: "Running normally",
  state_waiting: "A change is waiting for you",
  state_not_live: "The last change didn't go live",
  state_uncertain: "Can't confirm what's running",
  state_unpublished: "Not live yet",
  state_unreadable: "Can't read this app",
  unreadable_body: "The Host could not read this app's folder. Your agent may be able to tell what is wrong with it.",
  serves_other_body: "Your app still shows an earlier version: the newest saved one didn't go live. The changes list says why.",
  uncertain_undo_body: "The last time you went back, it didn't finish, so the Host can't tell which version your app shows. Changes can't go live until you go back again and the app answers.",
  uncertain_answer_body: "The Host can't tell which version your app's address shows right now: the last time a version went out, the app didn't answer. Nothing is held up; the next version that goes live and answers settles it. Open the app to see.",
  elsewhere_body: "{manager} runs this app on PneumaSpace, not this Host. This Host doesn't change an app someone else runs, so letting a change go live and going back are refused here. Details has the Host's own words on how to settle it.",
  malformed_body: "A change here can't be decided: its file (.pneuma/pending/{file}) isn't in the shape the Host writes. Ask your agent to look at it, or delete it.",
  malformed_home: "A change in {app} can't be decided: its file isn't in the shape the Host writes. Ask your agent to look at it, or delete it.",
  change_malformed: "This change can't be decided: its file isn't in the shape the Host writes.",
  blocked_undo: "This can't go live yet: the last time you went back, it didn't finish. Go back again first; you can still say no.",
  blocked_elsewhere: "This can't go live from here: {manager} runs this app on PneumaSpace, not this Host. You can still say no.",
  blocked_preview: "Look at it first: the preview isn't running, and a change goes live only after you could see it. Use “Show it to me again” above.",
  blocked_preview_unknown: "The Host couldn't check the preview just now, and a change goes live only after you could see it. Reload in a minute.",
  back_blocked_elsewhere: "You can't go back from here: {manager} runs this app on PneumaSpace, not this Host.",
  marks_live: "PneumaSpace doesn't list who runs this app yet; letting this go live records this Host as the one that does.",
  marks_back: "PneumaSpace doesn't list who runs this app yet; going back records this Host as the one that does.",
  done_live_marked: "It's live now. PneumaSpace now lists this Host as the one that runs this app.",
  done_back_marked: "Done. The app is back to that version, and PneumaSpace now lists this Host as the one that runs it.",
  preview_ends: "ends itself {when}",
  refuse_preview_gone: "Nothing went live: the preview of this change isn't running, and a change goes live only after you could look at it. Use “Show it to me again”, look, then decide.",
  refuse_preview_unknown: "Nothing happened: the Host couldn't check whether the preview is still running, and a change goes live only after you could look at it. Nothing was changed; try again in a minute.",
  refuse_managed_elsewhere: "Nothing happened: another manager runs this app on PneumaSpace, and this Host doesn't change an app someone else runs. The Host's words below say how to settle it.",
  refuse_serving_uncertain: "Nothing went live: the last time you went back, it didn't finish, so the Host can't tell which version your app shows. Go back again first.",
  refuse_malformed_pending: "This change can't be decided: its file isn't in the shape the Host writes. Ask your agent to look at it, or delete it.",
  refuse_previews_off: "This Host runs without previews, so there is nothing to show again.",
  refuse_preview_failed: "The preview didn't come up, so there is nothing to look at yet. The change still waits; try again in a minute.",
  refuse_preview_refused: "The app platform wouldn't put the preview up just now: too many previews at once, or previews set to last longer than it allows. Nothing is wrong with the change, and it still waits. The Host's words below say what to do.",
  refuse_draft_changed_after_check: "This change's files aren't what was checked any more, so it can't be shown or go live. Say no, and ask your agent to send it again.",
  refuse_crosses_one_way_change: "Going back now crosses a change that can't be undone. Reload the page to see what that means for your data, then decide.",
  refuse_plan_changed: "Nothing happened: your app changed after this page showed what going back would do. This is what it would do now; look again, then decide.",
  d_manager: "On PneumaSpace",
  d_malformed: "Not a waiting change",
  no_picture: "No picture yet",
  no_picture_sign_in: "Asks visitors to sign in, so there is no picture",
  picture_taken: "Picture taken {when}",
  picture_older: "Picture taken {when}, before the latest change went live",
  hint_title: "Want a new app, or a change?",
  hint_body: "Tell your agent. Open Claude Code or Codex in your apps folder and say something like:",
  hint_new: "Make me a new app called reading-list: a list of books I want to read, where I can add a book and tick it off when I've read it.",
  hint_app_body: "To change this app, tell your agent, for example:",
  hint_app: "In my {name} app, make the buttons bigger.",
  history_title: "Changes",
  running_now: "Running now",
  saved_not_live: "Saved, not live",
  undone_later: "Undone",
  go_back: "Go back to this",
  show_earlier: "Show {n} earlier",
  working_here_one: "Your agent is in the middle of a change here: 1 file edited, not sent yet.",
  working_here_other: "Your agent is in the middle of a change here: {n} files edited, not sent yet.",
  item_created: "Created the app",
  item_undo: "Went back to {version}",
  item_undo_failed: "Tried to go back to {version}",
  first_version: "how the app first was",
  item_undo_version: "Went back to an earlier version",
  item_snapshot: "Saved a copy of your data",
  item_unreadable: "An entry here could not be shown.",
  by_on: "{who} · {when}",
  checked_tried: "Checked and tried out",
  checked: "Checked",
  tried: "Tried out",
  not_checked: "Not checked",
  you_confirmed: "you confirmed it",
  auto_approved: "approved automatically as a routine change",
  approved_by: "approved by {who}",
  waiting_for_you: "waiting for you",
  live_no_checks: "Went live without checks",
  said_no: "You said no · nothing changed",
  did_not_go_live: "Didn't go live: {why}",
  saved_did_not_go_live: "Saved, but didn't go live: {why}",
  undo_failed_why: "It didn't work: {why}.",
  no_decision: "No decision was recorded for it",
  data_back: "Your stored data went back to the copy saved {when}.",
  data_back_undated: "Your stored data went back to the copy saved before that change.",
  data_kept: "Only the app went back; your stored data stayed as it was.",
  snapshot_saved: "A copy of your stored data was saved before this went live.",
  one_way: "Can't be undone by going back",
  one_way_destructive: "It deletes or rewrites data you already have, and going back won't bring that data back.",
  one_way_other: "Going back won't undo what it did to your stored data.",
  one_way_why: "Why: {why}",
  change_title: "A change is waiting for you",
  made_by: "{who} made this change · {when}",
  decide_lead: "Nothing changes until you decide.",
  now: "Now",
  after: "With this change",
  preview_gone: "The preview isn't running any more.",
  preview_passed: "It was tried out before it came to you, and it started fine.",
  no_preview: "No preview was made for this change.",
  checked_title: "What was checked",
  tests_passed: "Its tests passed ({n} tests, {own} of them for this app)",
  tests_passed_plain: "Its tests passed",
  tests_none_own: "None of those tests were written for this app itself.",
  started_in_preview: "It started when it was tried out",
  files_one: "1 file changed",
  files_other: "{n} files changed",
  why_title: "Why it needs you",
  review_all: "This Host asks you to look at every change.",
  one_way_title: "This one can't be taken back",
  one_way_with_snapshot:
    "Before it goes live, the Host saves a copy of your data. If you go back later, your data returns to that copy, and anything saved after it won't be in the app.",
  one_way_no_snapshot: "If you go back later, only the app goes back. The data this change removes stays removed, and the older version may not work with your data.",
  approve: "Let it go live",
  deny: "Not this time",
  read_only_decide: "To decide here, open this page from your owner link. You can also decide in a terminal (see Details).",
  confirm_title: "Before this goes live",
  confirm_who: "Everyone who opens {app} gets this version right away.",
  confirm_sign_in: "After this, anyone with the address can open it without signing in.",
  confirm_back: "You can go back to the current version later.",
  confirm_check_snapshot: "I understand: if I go back later, anything saved after this won't be in the app.",
  confirm_check_none: "I understand: going back later won't bring this data back.",
  confirm_go: "Go live",
  deny_title: "Say no to this change?",
  deny_body: "Nothing changes in your app. Your agent will see that you said no.",
  deny_reason: "Tell your agent why (optional)",
  deny_go: "Say no",
  working: "Working on it… this can take a little while.",
  done_live: "It's live now.",
  done_no: "OK, nothing changed. Your agent will see that you said no.",
  done_back: "Done. The app is back to that version.",
  failed: "That didn't work.",
  not_released: "It didn't go live: {why}. Nothing changed in your app.",
  change_gone: "This change isn't waiting any more.",
  back_title: "Go back to {version}?",
  back_made: "That version was made {when}.",
  back_undoes: "These changes will be undone:",
  data_title: "Your stored data",
  back_data_stays: "Your stored data stays as it is. Going back changes the app, not the data in it.",
  back_data_snapshot: "Your stored data goes back to the copy saved {when}, before “{change}”. Anything saved after that is set aside and won't be in the app.",
  back_data_none: "Your stored data can't be put back. Only the app goes back; the data stays as it is now, so the older version may not work with it.",
  back_check_snapshot: "I understand: anything saved after that copy won't be in the app.",
  back_check_none: "I understand: the older version may not work with my data as it is now.",
  back_go: "Go back",
  back_blocked_one: "Your agent is in the middle of a change here (1 file edited, not sent yet). Going back would overwrite it, so ask your agent to finish or drop that work first.",
  back_blocked_other: "Your agent is in the middle of a change here ({n} files edited, not sent yet). Going back would overwrite them, so ask your agent to finish or drop that work first.",
  back_not_earlier: "You can't go back to this version from here: the version running now wasn't built on it. To bring it back, ask your agent to make that change again.",
  back_current: "This is the version running now.",
  not_found: "There is nothing here.",
  agent_unknown: "an agent",
  agent_you: "you",
  agent_host: "the Host",
  agent_script: "a script",
  // Reasons a change did not go live.
  why_tests: "its tests failed",
  why_preview: "it didn't start when it was tried out",
  why_preview_refused: "the app platform had no room for its preview just then; nothing was found wrong with the change itself",
  why_check: "a check failed",
  why_protected: "it changed files that are off-limits",
  why_outside: "it changed files outside the app's own code",
  why_no_change: "there was nothing to change",
  why_changed_after: "its files changed after they were checked",
  why_base: "another change went live first",
  why_manifest: "the app's settings file was broken",
  why_publish: "the app platform didn't accept it",
  why_unhealthy: "it didn't start",
  why_snapshot: "a copy of your data couldn't be saved first",
  why_record: "it couldn't be written down",
  why_agent: "the agent stopped before it finished",
  why_denied: "you said no",
  why_snapshot_refused: "the saved copy of your data couldn't be used",
  why_restore: "your data couldn't be put back",
  why_after_restore: "the app didn't start after your data came back",
  why_working_tree: "your agent had edits that weren't sent yet",
  why_other: "it was turned down",
  // Why a change waits for the owner.
  risk_destructive_definition: "It deletes or rewrites data you already have.",
  risk_policy_change: "Anyone with the address could open the app without signing in.",
  risk_source_code_change: "It changes how the app works.",
  risk_additive_ui: "It changes how the app looks.",
  risk_definition_additive: "It lets the app keep a new kind of data.",
  risk_release_change: "It changes what the app runs on, or stops using something it used.",
  risk_other: "This Host's rules ask you to look at this kind of change.",
  // Labels under "Details": the record's own terms, for whoever wants them.
  d_version: "Version",
  d_change: "Change id",
  d_outcome: "Recorded as",
  d_agent: "Agent",
  d_guarantees: "Guarantees",
  d_recorded_only: "none (recorded only)",
  d_risks: "Risks",
  d_approval: "Approval",
  d_files: "Files",
  d_tests: "Tests",
  d_one_way: "One-way",
  d_data: "Stored data saved",
  d_reason: "Reason",
  d_address: "Address",
  d_note: "Note",
  d_channel: "Came through",
  d_terminal: "In a terminal",
  d_governance: "Governance",
  d_snapshot: "Data snapshot",
  d_none: "none",
  d_pictures: "Pictures",
  d_pictures_on: "taken by a headless browser when a version goes live",
  d_pictures_off: "off: no screenshot browser is configured (PNEUMA_SCREENSHOT_CDP)",
  d_host: "This Host",
  d_console: "PneumaSpace console",
  d_console_warn: "The apps this Host releases are marked there as run by {manager}. Before it removes, purges, changes access or policy, or publishes over one, the console asks for that name; typing it goes around this Host, and after that the history here no longer matches what is live.",
  d_disclosure: "What the Host said",
  d_plan: "What the Host will do",
  d_owner: "Owner",
  d_serving: "The address serves",
  d_current: "Current version",
  d_previous: "Previous version",
  d_uncommitted: "Not submitted",
  d_error: "Error",
  d_preview: "Preview",
  waiting_for_you_pill: "Waiting for you",
  not_live_pill: "Didn't go live",
  preview_again: "Show it to me again",
  preview_again_working: "Putting the preview up again…",
  preview_unknown: "The Host couldn't check whether the preview is still running.",
  preview_open_hint: "Opens the version with this change, in a new window. It isn't live.",
  d_preview_gone: "no longer running",
  d_preview_unknown: "unknown",
  assets_missing: "This page's files are missing. Build them with: bun run build:page",
  needs_script: "This page needs JavaScript to show your apps.",
  theme_light: "Light",
  theme_dark: "Dark",
  language: "Language",
  owner_checking: "Checking your owner link…",
  owner_off: "This Host was started without an owner link, so this page only shows. Decide in a terminal.",
  search_open: "Search apps",
  decide_title: "Let this change go live?",
  decision_title: "Your decision",
  section_waiting_hint: "Nothing goes live until you say so.",
};

export type Words = typeof en;

const zh: Words = {
  html_lang: "zh-CN",
  title_home: "我的应用",
  tagline: "你的 AI 助手在这台电脑上为你做的应用。",
  apps_one: "1 个应用",
  apps_other: "{n} 个应用",
  search: "搜索",
  search_label: "搜索应用",
  search_placeholder: "应用名称，或你提过的需求",
  search_empty: "没有匹配的应用。",
  search_keys: "↑ ↓ 选择 · Enter 打开 · Esc 关闭",
  owner_yes: "你可以在这里做决定",
  owner_no: "仅查看",
  owner_help_title: "在这个页面上做决定",
  owner_help: "让改动上线、拒绝改动、回到之前的版本，都由你来决定。用 Host 启动时打印的“主人链接”打开这个页面，就可以在这里操作。你的 AI 助手拿不到这个链接。",
  owner_how: "在 Host 的日志里，找以 “owner link” 开头的那一行：",
  owner_lost: "这个页面已经不能做决定了：你打开主人链接之后，Host 重启过。请从 Host 的日志里打开新的链接。",
  cancel: "取消",
  copy: "复制",
  copied: "已复制",
  details: "详细信息",
  my_apps: "我的应用",
  waiting_title: "等你确认",
  all_apps: "全部应用",
  empty_title: "还没有应用",
  empty_body: "让你的 AI 助手做一个吧，做好后会出现在这里。",
  open: "打开",
  review: "查看改动",
  open_new: "在新窗口打开",
  open_app: "打开应用",
  updated: "{when}更新",
  never_changed: "还没有改动",
  state_normal: "运行正常",
  state_waiting: "有改动等你确认",
  state_not_live: "上次的改动没有上线",
  state_uncertain: "无法确认正在运行的版本",
  state_unpublished: "尚未上线",
  state_unreadable: "无法读取这个应用",
  unreadable_body: "Host 读不了这个应用的文件夹。你的 AI 助手也许能看出哪里出了问题。",
  serves_other_body: "你的应用仍在显示更早的版本：最新保存的版本没有上线。改动记录里写了原因。",
  uncertain_undo_body: "上一次回退没有完成，所以 Host 无法确认你的应用现在显示的是哪个版本。在你再回退一次、并且应用有回应之前，改动不能上线。",
  uncertain_answer_body: "Host 无法确认应用地址现在显示的是哪个版本：上一次发布某个版本时，应用没有回应。这不会挡住任何操作；下一个上线并有回应的版本会让它重新确定下来。打开应用看看。",
  elsewhere_body: "这个应用在 PneumaSpace 上由 {manager} 管理，不是这个 Host。这个 Host 不会改动别人管理的应用，所以在这里让改动上线、回退都会被拒绝。“详细信息”里有 Host 给出的处理办法。",
  malformed_body: "这里有一个改动无法决定：它的文件（.pneuma/pending/{file}）不是 Host 写出的格式。请你的 AI 助手看看，或者把它删掉。",
  malformed_home: "{app} 里有一个改动无法决定：它的文件不是 Host 写出的格式。请你的 AI 助手看看，或者把它删掉。",
  change_malformed: "这个改动无法决定：它的文件不是 Host 写出的格式。",
  blocked_undo: "现在还不能上线：上一次回退没有完成。请先再回退一次；你仍然可以拒绝这个改动。",
  blocked_elsewhere: "不能在这里上线：这个应用在 PneumaSpace 上由 {manager} 管理，不是这个 Host。你仍然可以拒绝这个改动。",
  blocked_preview: "请先看一看：预览没有在运行，而改动要在你能看到之后才能上线。用上面的“再给我看一次”。",
  blocked_preview_unknown: "Host 刚才没能确认预览的状态，而改动要在你能看到之后才能上线。过一分钟再刷新。",
  back_blocked_elsewhere: "不能在这里回退：这个应用在 PneumaSpace 上由 {manager} 管理，不是这个 Host。",
  marks_live: "PneumaSpace 还没有记下这个应用由谁管理；让它上线会把这个 Host 记为它的管理方。",
  marks_back: "PneumaSpace 还没有记下这个应用由谁管理；回退会把这个 Host 记为它的管理方。",
  done_live_marked: "已经上线了。PneumaSpace 现在把这个 Host 记为这个应用的管理方。",
  done_back_marked: "完成，应用已经回到那个版本；PneumaSpace 现在把这个 Host 记为它的管理方。",
  preview_ends: "{when}自动结束",
  refuse_preview_gone: "什么都没有上线：这个改动的预览没有在运行，而改动要在你能看到之后才能上线。用“再给我看一次”，看过之后再决定。",
  refuse_preview_unknown: "什么都没有发生：Host 没能确认预览是否还在运行，而改动要在你能看到之后才能上线。什么都没有改变，过一分钟再试。",
  refuse_managed_elsewhere: "什么都没有发生：这个应用在 PneumaSpace 上由别的管理方管理，这个 Host 不会改动别人管理的应用。下面 Host 的原话说明了怎么处理。",
  refuse_serving_uncertain: "什么都没有上线：上一次回退没有完成，所以 Host 无法确认你的应用现在显示的是哪个版本。请先再回退一次。",
  refuse_malformed_pending: "这个改动无法决定：它的文件不是 Host 写出的格式。请你的 AI 助手看看，或者把它删掉。",
  refuse_previews_off: "这个 Host 没有开启预览，所以没有可以再看的预览。",
  refuse_preview_failed: "预览没能启动，所以现在还没有可看的东西。改动仍在等待，过一分钟再试。",
  refuse_preview_refused: "运行平台现在不肯放出预览：同时存在的预览太多，或者预览设定的时长超过了它允许的上限。改动本身没有问题，仍在等待。下面 Host 的原话说明了该怎么做。",
  refuse_draft_changed_after_check: "这个改动的文件已经不是检查过的那一份了，所以不能展示，也不能上线。请拒绝它，再让你的 AI 助手重新提交。",
  refuse_crosses_one_way_change: "现在回退会越过一个无法撤销的改动。刷新页面，看看这对你的数据意味着什么，再做决定。",
  refuse_plan_changed: "什么都没有发生：页面列出回退会做什么之后，你的应用又变了。下面是现在回退会做的事，请再看一遍，然后决定。",
  d_manager: "在 PneumaSpace 上",
  d_malformed: "不是等待中的改动",
  no_picture: "还没有截图",
  no_picture_sign_in: "这个应用要求访客登录，所以没有截图",
  picture_taken: "截图于{when}",
  picture_older: "截图于{when}，是在最近一次改动上线之前",
  hint_title: "想要一个新应用，或者改一改？",
  hint_body: "直接告诉你的 AI 助手。在应用文件夹里打开 Claude Code 或 Codex，然后这样说：",
  hint_new: "帮我做一个叫 reading-list 的新应用：记下我想读的书，可以添加书，读完了可以打勾。",
  hint_app_body: "想改这个应用，就告诉你的 AI 助手，比如：",
  hint_app: "在我的 {name} 应用里，把按钮做大一点。",
  history_title: "改动记录",
  running_now: "正在运行",
  saved_not_live: "已保存，未上线",
  undone_later: "已撤回",
  go_back: "回到这个版本",
  show_earlier: "显示更早的 {n} 条",
  working_here_one: "AI 助手正在修改这个应用：改了 1 个文件，还没有提交。",
  working_here_other: "AI 助手正在修改这个应用：改了 {n} 个文件，还没有提交。",
  item_created: "创建了这个应用",
  item_undo: "回到了{version}的版本",
  item_undo_failed: "尝试回到{version}的版本",
  first_version: "最初",
  item_undo_version: "回到了之前的版本",
  item_snapshot: "保存了一份数据副本",
  item_unreadable: "这里有一条记录无法显示。",
  by_on: "{who} · {when}",
  checked_tried: "检查过，也试运行过",
  checked: "检查过",
  tried: "试运行过",
  not_checked: "未经检查",
  you_confirmed: "你确认过",
  auto_approved: "例行改动，自动通过",
  approved_by: "由 {who} 批准",
  waiting_for_you: "等你确认",
  live_no_checks: "未经检查直接上线",
  said_no: "你没有同意 · 什么都没改",
  did_not_go_live: "没有上线：{why}",
  saved_did_not_go_live: "已保存，但没有上线：{why}",
  undo_failed_why: "没有成功：{why}。",
  no_decision: "没有记录到对它的决定",
  data_back: "数据回到了{when}保存的副本。",
  data_back_undated: "数据回到了那次改动之前保存的副本。",
  data_kept: "只有应用回去了，数据保持原样。",
  snapshot_saved: "上线前先保存了一份数据副本。",
  one_way: "无法通过回退撤销",
  one_way_destructive: "它会删除或改写你已有的数据，回退也找不回这些数据。",
  one_way_other: "回退无法撤销它对数据做的改动。",
  one_way_why: "原因：{why}",
  change_title: "有一个改动等你确认",
  made_by: "{who} 做了这个改动 · {when}",
  decide_lead: "在你决定之前，什么都不会改变。",
  now: "现在",
  after: "改动之后",
  preview_gone: "预览已经不在运行了。",
  preview_passed: "交给你之前已经试运行过，能正常启动。",
  no_preview: "这个改动没有做预览。",
  checked_title: "检查了什么",
  tests_passed: "测试通过（共 {n} 个，其中 {own} 个是这个应用自己的）",
  tests_passed_plain: "测试通过",
  tests_none_own: "这些测试里没有这个应用自己的测试。",
  started_in_preview: "试运行时能正常启动",
  files_one: "改了 1 个文件",
  files_other: "改了 {n} 个文件",
  why_title: "为什么需要你",
  review_all: "这台 Host 设置为每个改动都要你确认。",
  one_way_title: "这个改动无法撤回",
  one_way_with_snapshot: "上线前，Host 会先保存一份数据副本。以后如果回退，数据会回到这份副本，之后保存的内容不会留在应用里。",
  one_way_no_snapshot: "以后如果回退，只有应用会回去。这次删掉的数据不会回来，旧版本也可能无法正常使用你的数据。",
  approve: "让它上线",
  deny: "这次不要",
  read_only_decide: "要在这里做决定，请用主人链接打开这个页面。也可以在终端里决定（见详细信息）。",
  confirm_title: "上线之前",
  confirm_who: "所有打开「{app}」的人会立刻用上这个版本。",
  confirm_sign_in: "之后，任何知道地址的人不用登录就能打开它。",
  confirm_back: "以后你可以回到现在这个版本。",
  confirm_check_snapshot: "我明白：以后回退的话，此后保存的内容不会留在应用里。",
  confirm_check_none: "我明白：以后回退也找不回这些数据。",
  confirm_go: "上线",
  deny_title: "不要这个改动？",
  deny_body: "应用不会有任何变化。你的 AI 助手会看到你没有同意。",
  deny_reason: "告诉 AI 助手原因（可选）",
  deny_go: "不要",
  working: "正在处理……可能需要一点时间。",
  done_live: "已经上线了。",
  done_no: "好的，什么都没改。你的 AI 助手会看到你没有同意。",
  done_back: "完成，应用已经回到那个版本。",
  failed: "没有成功。",
  not_released: "没有上线：{why}。应用没有任何变化。",
  change_gone: "这个改动已经不在等待了。",
  back_title: "回到{version}的版本？",
  back_made: "那个版本做于{when}。",
  back_undoes: "这些改动会被撤回：",
  data_title: "你的数据",
  back_data_stays: "数据保持不变。回退改变的是应用本身，不是里面的数据。",
  back_data_snapshot: "数据会回到{when}保存的副本（在“{change}”之前）。之后保存的内容会被移到一边，不会留在应用里。",
  back_data_none: "数据无法恢复。只有应用会回去，数据保持现在的样子，旧版本可能无法正常使用它。",
  back_check_snapshot: "我明白：那份副本之后保存的内容不会留在应用里。",
  back_check_none: "我明白：旧版本可能无法正常使用现在的数据。",
  back_go: "回退",
  back_blocked_one: "AI 助手正在修改这个应用（改了 1 个文件，还没有提交）。回退会覆盖这处修改，请先让它完成或放弃这次修改。",
  back_blocked_other: "AI 助手正在修改这个应用（改了 {n} 个文件，还没有提交）。回退会覆盖这些修改，请先让它完成或放弃这次修改。",
  back_not_earlier: "不能从这里回到这个版本：正在运行的版本不是在它的基础上做的。想找回它，就让 AI 助手把那次改动再做一遍。",
  back_current: "这就是正在运行的版本。",
  not_found: "这里什么都没有。",
  agent_unknown: "某个 AI 助手",
  agent_you: "你",
  agent_host: "Host",
  agent_script: "脚本",
  why_tests: "测试没有通过",
  why_preview: "试运行时没能启动",
  why_preview_refused: "运行平台当时没有接受它的预览；改动本身没有发现问题",
  why_check: "检查没有通过",
  why_protected: "改动了不允许修改的文件",
  why_outside: "改动了应用代码以外的文件",
  why_no_change: "没有需要改的内容",
  why_changed_after: "检查之后文件又被改动了",
  why_base: "另一个改动先上线了",
  why_manifest: "应用的配置文件有错误",
  why_publish: "运行平台没有接受它",
  why_unhealthy: "没能启动",
  why_snapshot: "没能先保存数据副本",
  why_record: "没能记录下来",
  why_agent: "AI 助手没有做完",
  why_denied: "你没有同意",
  why_snapshot_refused: "保存的数据副本无法使用",
  why_restore: "数据没能恢复",
  why_after_restore: "数据恢复后应用没能启动",
  why_working_tree: "AI 助手还有没提交的修改",
  why_other: "被拒绝了",
  risk_destructive_definition: "它会删除或改写你已有的数据。",
  risk_policy_change: "任何知道地址的人不用登录就能打开这个应用。",
  risk_source_code_change: "它会改变应用的工作方式。",
  risk_additive_ui: "它会改变应用的外观。",
  risk_definition_additive: "它让应用开始保存一种新的数据。",
  risk_release_change: "它改变了应用运行的方式，或不再使用某项原来用的能力。",
  risk_other: "这台 Host 的规则要求你确认这类改动。",
  d_version: "版本",
  d_change: "改动编号",
  d_outcome: "记录为",
  d_agent: "Agent",
  d_guarantees: "保证",
  d_recorded_only: "无（仅记录）",
  d_risks: "风险",
  d_approval: "批准",
  d_files: "文件",
  d_tests: "测试",
  d_one_way: "单向",
  d_data: "已保存的数据",
  d_reason: "原因",
  d_address: "地址",
  d_note: "备注",
  d_channel: "来源",
  d_terminal: "在终端里",
  d_governance: "治理模式",
  d_snapshot: "数据快照",
  d_none: "无",
  d_pictures: "截图",
  d_pictures_on: "版本上线时由无头浏览器截取",
  d_pictures_off: "关闭：没有配置截图浏览器（PNEUMA_SCREENSHOT_CDP）",
  d_host: "这台 Host",
  d_console: "PneumaSpace 控制台",
  d_console_warn: "这个 Host 发布的应用在那里被标记为由 {manager} 管理。控制台在移除、清除、修改访问权限或策略、覆盖发布之前，会要求输入这个名字；输入它就绕过了这个 Host，之后这里的记录就和实际运行的不一致了。",
  d_disclosure: "Host 的原话",
  d_plan: "Host 会做什么",
  d_owner: "主人",
  d_serving: "地址上运行的是",
  d_current: "当前版本",
  d_previous: "上一个版本",
  d_uncommitted: "未提交",
  d_error: "错误",
  d_preview: "预览",
  waiting_for_you_pill: "等你确认",
  not_live_pill: "没有上线",
  preview_again: "再给我看一次",
  preview_again_working: "正在重新打开预览…",
  preview_unknown: "Host 没能确认预览是否还在运行。",
  preview_open_hint: "在新窗口打开包含这个改动的版本。它还没有上线。",
  d_preview_gone: "已不在运行",
  d_preview_unknown: "未知",
  assets_missing: "这个页面的文件缺失。请运行：bun run build:page",
  needs_script: "这个页面需要 JavaScript 才能显示你的应用。",
  theme_light: "浅色",
  theme_dark: "深色",
  language: "语言",
  owner_checking: "正在核对你的主人链接…",
  owner_off: "这个 Host 启动时没有生成主人链接，所以这个页面只能查看。请在终端里做决定。",
  search_open: "搜索应用",
  decide_title: "让这个改动上线吗？",
  decision_title: "你的决定",
  section_waiting_hint: "你同意之前，什么都不会上线。",
};

export const WORDS: Readonly<Record<Lang, Words>> = { en, zh };

export type WordKey = { [K in keyof Words]: Words[K] extends string ? K : never }[keyof Words];

/** A word with its `{slots}` filled as plain text. The caller escapes the result. */
export function fill(template: string, vars: Readonly<Record<string, string | number>> = {}): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in vars ? String(vars[key]) : whole));
}

/** The reason a change did not go live, in words. `checks` tells a failed test run from a preview that did not start. */
export function reasonWords(w: Words, reason: unknown, checks?: unknown): string {
  const failed = (id: string) => Array.isArray(checks) && checks.some((check) => check?.id === id && check?.status === "failed");
  switch (reason) {
    case "verify_failed":
      return failed("npm-test") ? w.why_tests : failed("space-preview") ? w.why_preview : w.why_check;
    case "preview_refused":
      return w.why_preview_refused;
    case "protected_file_changed":
      return w.why_protected;
    case "outside_writable_roots":
      return w.why_outside;
    case "no_change":
      return w.why_no_change;
    case "draft_changed_after_check":
    case "draft_changed_during_verify":
      return w.why_changed_after;
    case "base_changed":
      return w.why_base;
    case "invalid_manifest":
      return w.why_manifest;
    case "publish_failed":
      return w.why_publish;
    case "published_unhealthy":
      return w.why_unhealthy;
    case "data_snapshot_failed":
      return w.why_snapshot;
    case "record_failed":
      return w.why_record;
    case "agent_failed":
      return w.why_agent;
    case "denied":
      return w.why_denied;
    case "data_snapshot_refused":
      return w.why_snapshot_refused;
    case "data_restore_failed":
      return w.why_restore;
    case "unhealthy_after_data_restore":
      return w.why_after_restore;
    default:
      return w.why_other;
  }
}

/** Why a change waits for the owner, one sentence per risk the preset found. */
export function riskWords(w: Words, risk: unknown): string {
  const key = `risk_${String(risk)}` as keyof Words;
  const value = w[key];
  return typeof value === "string" && String(risk) !== "other" ? value : w.risk_other;
}

/** Who did something, as the person would say it. `owner` is the app's owner subject, which reads as "you". */
export function agentWords(w: Words, agent: unknown, owner: string | undefined): string {
  const name = typeof agent === "string" ? agent.trim() : "";
  if (!name || name === "unknown") return w.agent_unknown;
  if (name === owner || name === "owner") return w.agent_you;
  switch (name) {
    case "claude-code":
      return "Claude Code";
    case "codex":
      return "Codex";
    case "host":
      return w.agent_host;
    case "scripted":
      return w.agent_script;
    default:
      return name;
  }
}

/** "todo" -> "Todo", "habit-tracker" -> "Habit tracker": the directory name, read aloud. */
export function appTitle(name: string): string {
  const words = name.replace(/[-_]+/g, " ").trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : name;
}

const UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 86_400_000],
  ["month", 30 * 86_400_000],
  ["week", 7 * 86_400_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "12 minutes ago", "12分钟前". The page redoes this in the browser, so it stays current. */
export function relativeTime(lang: Lang, iso: unknown, now: number): string {
  const at = typeof iso === "string" ? Date.parse(iso) : NaN;
  if (Number.isNaN(at)) return "";
  const diff = at - now;
  const format = new Intl.RelativeTimeFormat(lang === "zh" ? "zh-CN" : "en", { numeric: "auto" });
  for (const [unit, ms] of UNITS) if (Math.abs(diff) >= ms) return format.format(Math.round(diff / ms), unit);
  return format.format(0, "minute");
}

/** "Nov 24, 2026, 2:03 PM UTC". In UTC on the server; the page rewrites it in the person's own time zone. */
export function absoluteTime(lang: Lang, iso: unknown): string {
  const at = typeof iso === "string" ? Date.parse(iso) : NaN;
  if (Number.isNaN(at)) return typeof iso === "string" ? iso : "";
  return `${new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(at)} UTC`;
}
