import { defineConfig } from "vitepress";

// GitHub Pages serves a project site under /<repo>/. Override with DOCS_BASE in
// the deploy workflow if the repository name differs.
const base = process.env.DOCS_BASE ?? "/pneuma-framework/";

const enNav = [
  { text: "Architecture", link: "/architecture/" },
  { text: "Build a Host", link: "/guide/" },
  { text: "For Agents", link: "/agents/" },
];

const enSidebar = {
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
};

const zhNav = [
  { text: "架构", link: "/zh/architecture/" },
  { text: "构建 Host", link: "/zh/guide/" },
  { text: "面向 Agent", link: "/zh/agents/" },
];

const zhSidebar = {
  "/zh/architecture/": [
    {
      text: "架构",
      items: [
        { text: "问题与模型", link: "/zh/architecture/" },
        { text: "受治理循环", link: "/zh/architecture/governed-loop" },
        { text: "边界与所有权", link: "/zh/architecture/boundaries" },
      ],
    },
  ],
  "/zh/guide/": [
    {
      text: "构建一个受治理的项目",
      items: [
        { text: "总览", link: "/zh/guide/" },
        { text: "1 · Generated App", link: "/zh/guide/generated-app" },
        { text: "2 · Creation Host", link: "/zh/guide/creation-host" },
        { text: "3 · 端到端", link: "/zh/guide/end-to-end" },
      ],
    },
  ],
  "/zh/agents/": [
    {
      text: "面向 coding agent",
      items: [{ text: "用 agent 构建 Host", link: "/zh/agents/" }],
    },
  ],
};

export default defineConfig({
  base,
  cleanUrls: true,
  lastUpdated: true,
  head: [["link", { rel: "icon", type: "image/svg+xml", href: `${base}favicon.svg` }]],
  themeConfig: {
    logo: "/logo.svg",
    search: { provider: "local" },
    footer: {
      message: "Framework → Creation Host → Generated Application → Published Application",
      copyright: "pneuma-framework",
    },
  },
  locales: {
    root: {
      label: "English",
      lang: "en-US",
      title: "pneuma-framework",
      description:
        "Infrastructure for AI-native creation tools: build a Creation Host where a Builder creates, evolves, previews, publishes, and rolls back applications by talking to an agent.",
      themeConfig: {
        nav: enNav,
        sidebar: enSidebar,
        outline: { level: [2, 3], label: "On this page" },
      },
    },
    zh: {
      label: "简体中文",
      lang: "zh-CN",
      link: "/zh/",
      title: "pneuma-framework",
      description:
        "AI 原生创造工具的基础设施:构建一个 Creation Host,让 Builder 通过与 agent 对话来创建、演进、预览、发布、回滚应用。",
      themeConfig: {
        nav: zhNav,
        sidebar: zhSidebar,
        outline: { level: [2, 3], label: "本页目录" },
        docFooter: { prev: "上一页", next: "下一页" },
        darkModeSwitchLabel: "外观",
        sidebarMenuLabel: "菜单",
        returnToTopLabel: "回到顶部",
        langMenuLabel: "切换语言",
      },
    },
  },
});
