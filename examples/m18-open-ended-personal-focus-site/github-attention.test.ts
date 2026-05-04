import { describe, expect, test } from "bun:test";
import {
  PANDAZKI_GITHUB_ATTENTION_FIXTURE,
  PANDAZKI_PUBLIC_PROFILE_FIXTURE,
  rankGitHubAttention,
} from "./github-attention.js";

describe("M18 GitHub attention ranking", () => {
  test("ranks personal GitHub attention ahead of generic repository activity", () => {
    const ranked = rankGitHubAttention(PANDAZKI_GITHUB_ATTENTION_FIXTURE.items, {
      viewer_login: "pandazki",
      top_n: 3,
    });

    expect(ranked).toHaveLength(3);
    expect(ranked[0]).toMatchObject({
      repo: "pneuma-skills",
      kind: "issue",
      relevance: expect.arrayContaining(["assigned"]),
    });
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
    expect(ranked.map((item) => item.title)).toContain("Clarify Webcraft plugin packaging boundary");
  });

  test("uses pandazki public profile fixture as deterministic demo identity", () => {
    expect(PANDAZKI_PUBLIC_PROFILE_FIXTURE).toMatchObject({
      login: "pandazki",
      display_name: "Pandazki",
      profile_url: "https://github.com/pandazki",
    });
    expect(PANDAZKI_PUBLIC_PROFILE_FIXTURE.public_repos).toBeGreaterThanOrEqual(80);
    expect(PANDAZKI_PUBLIC_PROFILE_FIXTURE.pinned_repositories).toEqual(
      expect.arrayContaining(["pneuma-skills", "nemori", "leaf-playground", "deepict"]),
    );
  });
});
