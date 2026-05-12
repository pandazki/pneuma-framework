export interface GitHubAttentionItem {
  readonly provider: "github";
  readonly kind: "repo" | "issue" | "pull_request";
  readonly title: string;
  readonly url: string;
  readonly repo?: string;
}

export async function fetchGitHubPublicAttention(input: {
  readonly owner: string;
  readonly limit?: number;
}): Promise<GitHubAttentionItem[]> {
  const limit = input.limit ?? 5;
  const response = await fetch(
    `https://api.github.com/users/${encodeURIComponent(input.owner)}/repos?sort=updated&per_page=${limit}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "pneuma-m43-enterprise-governance-demo",
      },
    },
  );

  if (!response.ok) {
    return [
      {
        provider: "github",
        kind: "repo",
        title: `GitHub public-read unavailable: ${response.status}`,
        url: `https://github.com/${input.owner}`,
      },
    ];
  }

  const repos = await response.json() as Array<{
    readonly name: string;
    readonly html_url: string;
    readonly full_name: string;
  }>;

  if (repos.length === 0) {
    return [
      {
        provider: "github",
        kind: "repo",
        title: `No public repos found for ${input.owner}`,
        url: `https://github.com/${input.owner}`,
      },
    ];
  }

  return repos.slice(0, limit).map((repo) => ({
    provider: "github",
    kind: "repo",
    title: repo.name,
    url: repo.html_url,
    repo: repo.full_name,
  }));
}
