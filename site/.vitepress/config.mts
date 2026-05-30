import { defineConfig } from "vitepress";

// GitHub Pages serves a project site under /<repo>/. Override with DOCS_BASE in
// the deploy workflow if the repository name differs.
const base = process.env.DOCS_BASE ?? "/pneuma-framework/";

export default defineConfig({
  base,
  lang: "en-US",
  title: "pneuma-framework",
  description:
    "Infrastructure for AI-native creation tools: build a Creation Host where a Builder creates, evolves, previews, publishes, and rolls back applications by talking to an agent.",
  cleanUrls: true,
  lastUpdated: true,
  themeConfig: {
    nav: [
      { text: "Architecture", link: "/architecture/" },
      { text: "Build a Host", link: "/guide/" },
      { text: "For Agents", link: "/agents/" },
    ],
    sidebar: {
      "/architecture/": [
        {
          text: "Architecture",
          items: [
            { text: "The problem & the model", link: "/architecture/" },
            { text: "The governed loop", link: "/architecture/governed-loop" },
            { text: "Boundaries & ownership", link: "/architecture/boundaries" },
          ],
        },
      ],
      "/guide/": [
        {
          text: "Build a governed project",
          items: [
            { text: "Overview", link: "/guide/" },
            { text: "1 · The Generated App", link: "/guide/generated-app" },
            { text: "2 · The Creation Host", link: "/guide/creation-host" },
            { text: "3 · End to end", link: "/guide/end-to-end" },
          ],
        },
      ],
      "/agents/": [
        {
          text: "For coding agents",
          items: [{ text: "Building a Host with an agent", link: "/agents/" }],
        },
      ],
    },
    outline: { level: [2, 3], label: "On this page" },
    search: { provider: "local" },
    footer: {
      message: "Framework → Creation Host → Generated Application → Published Application",
      copyright: "pneuma-framework",
    },
  },
});
