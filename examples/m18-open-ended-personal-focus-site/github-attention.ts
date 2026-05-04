export interface GitHubPublicProfileFixture {
  readonly login: string;
  readonly display_name: string;
  readonly profile_url: string;
  readonly public_repos: number;
  readonly pinned_repositories: readonly string[];
}

export type GitHubAttentionKind = "issue" | "pull_request";

export interface GitHubAttentionItem {
  readonly id: string;
  readonly repo: string;
  readonly kind: GitHubAttentionKind;
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly state: "open";
  readonly updated_at: string;
  readonly labels: readonly string[];
  readonly relevance: readonly string[];
  readonly author_login: string;
  readonly assignee_logins: readonly string[];
  readonly comment_count: number;
}

export interface RankedGitHubAttentionItem extends GitHubAttentionItem {
  readonly score: number;
  readonly score_reasons: readonly string[];
}

export interface GitHubAttentionFixture {
  readonly owner: string;
  readonly generated_at: string;
  readonly mode: "fixture";
  readonly items: readonly GitHubAttentionItem[];
}

export interface RankGitHubAttentionOptions {
  readonly viewer_login: string;
  readonly top_n?: number;
  readonly now?: string;
}

export interface LoadGitHubAttentionOptions {
  readonly mode: "fixture" | "public";
  readonly owner?: string;
  readonly repos?: readonly string[];
  readonly token?: string;
}

const DEFAULT_NOW = "2026-05-04T00:00:00.000Z";
const DAY_MS = 24 * 60 * 60 * 1000;

export const PANDAZKI_PUBLIC_PROFILE_FIXTURE: GitHubPublicProfileFixture = {
  login: "pandazki",
  display_name: "Pandazki",
  profile_url: "https://github.com/pandazki",
  public_repos: 86,
  pinned_repositories: [
    "pneuma-skills",
    "nemori",
    "leaf-playground",
    "deepict",
  ],
};

export const PANDAZKI_GITHUB_ATTENTION_FIXTURE: GitHubAttentionFixture = {
  owner: "pandazki",
  generated_at: DEFAULT_NOW,
  mode: "fixture",
  items: [
    {
      id: "pneuma-skills-184",
      repo: "pneuma-skills",
      kind: "issue",
      number: 184,
      title: "Clarify Webcraft plugin packaging boundary",
      url: "https://github.com/pandazki/pneuma-skills/issues/184",
      state: "open",
      updated_at: "2026-05-03T11:40:00.000Z",
      labels: ["priority", "architecture"],
      relevance: ["assigned", "mentioned"],
      author_login: "pandazki",
      assignee_logins: ["pandazki"],
      comment_count: 6,
    },
    {
      id: "nemori-57",
      repo: "nemori",
      kind: "pull_request",
      number: 57,
      title: "Review capture pipeline changes before next release",
      url: "https://github.com/pandazki/nemori/pull/57",
      state: "open",
      updated_at: "2026-05-02T15:05:00.000Z",
      labels: ["review"],
      relevance: ["review_requested"],
      author_login: "contributor-demo",
      assignee_logins: [],
      comment_count: 3,
    },
    {
      id: "leaf-playground-32",
      repo: "leaf-playground",
      kind: "issue",
      number: 32,
      title: "Investigate stale playground examples after dependency bump",
      url: "https://github.com/pandazki/leaf-playground/issues/32",
      state: "open",
      updated_at: "2026-04-30T09:30:00.000Z",
      labels: ["bug", "help wanted"],
      relevance: ["repo_activity"],
      author_login: "community-demo",
      assignee_logins: [],
      comment_count: 1,
    },
    {
      id: "deepict-21",
      repo: "deepict",
      kind: "issue",
      number: 21,
      title: "Document image prompt comparison workflow",
      url: "https://github.com/pandazki/deepict/issues/21",
      state: "open",
      updated_at: "2026-04-26T08:00:00.000Z",
      labels: ["documentation"],
      relevance: ["repo_activity"],
      author_login: "pandazki",
      assignee_logins: [],
      comment_count: 0,
    },
  ],
};

export function rankGitHubAttention(
  items: readonly GitHubAttentionItem[],
  options: RankGitHubAttentionOptions,
): RankedGitHubAttentionItem[] {
  const topN = options.top_n ?? items.length;
  const nowMs = Date.parse(options.now ?? DEFAULT_NOW);
  return items
    .map((item) => scoreGitHubAttentionItem(item, options.viewer_login, nowMs))
    .sort((a, b) => b.score - a.score || b.comment_count - a.comment_count || a.title.localeCompare(b.title))
    .slice(0, topN);
}

export async function loadGitHubAttention(
  options: LoadGitHubAttentionOptions,
): Promise<GitHubAttentionFixture> {
  if (options.mode === "fixture") return PANDAZKI_GITHUB_ATTENTION_FIXTURE;
  const owner = options.owner ?? PANDAZKI_PUBLIC_PROFILE_FIXTURE.login;
  const repos = options.repos?.length ? options.repos : PANDAZKI_PUBLIC_PROFILE_FIXTURE.pinned_repositories;
  const items = await fetchPublicGitHubItems({ owner, repos, token: options.token });
  return {
    owner,
    generated_at: new Date().toISOString(),
    mode: "fixture",
    items,
  };
}

function scoreGitHubAttentionItem(
  item: GitHubAttentionItem,
  viewerLogin: string,
  nowMs: number,
): RankedGitHubAttentionItem {
  const reasons: string[] = [];
  let score = 0;

  if (item.relevance.includes("assigned") || item.assignee_logins.includes(viewerLogin)) {
    score += 70;
    reasons.push("assigned to you");
  }
  if (item.relevance.includes("review_requested")) {
    score += 64;
    reasons.push("review requested");
  }
  if (item.relevance.includes("mentioned")) {
    score += 18;
    reasons.push("mentions you");
  }
  if (item.author_login === viewerLogin) {
    score += 8;
    reasons.push("you opened it");
  }
  if (item.labels.includes("security")) {
    score += 30;
    reasons.push("security label");
  }
  if (item.labels.includes("priority") || item.labels.includes("blocked")) {
    score += 24;
    reasons.push("priority label");
  }
  if (item.labels.includes("bug")) {
    score += 14;
    reasons.push("bug label");
  }
  if (item.labels.includes("help wanted")) {
    score += 8;
    reasons.push("needs maintainer response");
  }

  const ageDays = Math.max(0, Math.floor((nowMs - Date.parse(item.updated_at)) / DAY_MS));
  const recencyScore = Math.max(0, 20 - ageDays * 3);
  score += recencyScore;
  reasons.push(`updated ${ageDays === 0 ? "today" : `${ageDays}d ago`}`);

  score += Math.min(8, item.comment_count);

  return {
    ...item,
    score,
    score_reasons: reasons,
  };
}

async function fetchPublicGitHubItems(input: {
  readonly owner: string;
  readonly repos: readonly string[];
  readonly token?: string;
}): Promise<readonly GitHubAttentionItem[]> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "pneuma-framework-m18-demo",
  };
  if (input.token) headers.authorization = `Bearer ${input.token}`;

  const collected: GitHubAttentionItem[] = [];
  for (const repo of input.repos) {
    const response = await fetch(
      `https://api.github.com/repos/${input.owner}/${repo}/issues?state=open&per_page=10&sort=updated&direction=desc`,
      { headers },
    );
    if (!response.ok) continue;
    const issues = await response.json() as Array<Record<string, unknown>>;
    for (const issue of issues.slice(0, 4)) {
      const number = Number(issue.number);
      const title = typeof issue.title === "string" ? issue.title : `Open item #${number}`;
      const url = typeof issue.html_url === "string"
        ? issue.html_url
        : `https://github.com/${input.owner}/${repo}/issues/${number}`;
      const labels = Array.isArray(issue.labels)
        ? issue.labels.flatMap((label) => {
          if (label && typeof label === "object" && "name" in label && typeof label.name === "string") {
            return [label.name];
          }
          return [];
        })
        : [];
      const assignees = Array.isArray(issue.assignees)
        ? issue.assignees.flatMap((assignee) => {
          if (assignee && typeof assignee === "object" && "login" in assignee && typeof assignee.login === "string") {
            return [assignee.login];
          }
          return [];
        })
        : [];

      collected.push({
        id: `${repo}-${number}`,
        repo,
        kind: issue.pull_request ? "pull_request" : "issue",
        number,
        title,
        url,
        state: "open",
        updated_at: typeof issue.updated_at === "string" ? issue.updated_at : new Date().toISOString(),
        labels,
        relevance: assignees.includes(input.owner) ? ["assigned"] : ["repo_activity"],
        author_login: readLogin(issue.user),
        assignee_logins: assignees,
        comment_count: typeof issue.comments === "number" ? issue.comments : 0,
      });
    }
  }
  return collected.length > 0 ? collected : PANDAZKI_GITHUB_ATTENTION_FIXTURE.items;
}

function readLogin(value: unknown): string {
  if (value && typeof value === "object" && "login" in value && typeof value.login === "string") {
    return value.login;
  }
  return "unknown";
}
