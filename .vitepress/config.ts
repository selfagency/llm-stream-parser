import { defineConfig } from "vitepress";

const architectureItems = [
  { link: "/architecture/", text: "Overview" },
  { link: "/architecture/package-ecosystem", text: "Package ecosystem" },
  { link: "/architecture/stream-processing", text: "Stream processing flow" },
  { link: "/architecture/platform-evolution", text: "Platform evolution" },
];

export default defineConfig({
  base: "/",
  description:
    "Composable TypeScript infrastructure for stream parsing, agent loops, renderers, and VS Code integrations.",
  head: [
    ["link", { href: "https://agentsy.self.agency/", rel: "canonical" }],
    ["meta", { content: "Agentsy documentation", property: "og:title" }],
    [
      "meta",
      {
        content:
          "Learn how the @agentsy package ecosystem fits together, from provider normalizers and stream processors to agent loops and VS Code integrations.",
        property: "og:description",
      },
    ],
  ],
  outDir: ".gh-pages",
  srcDir: "docs",
  themeConfig: {
    docFooter: {
      next: "Next page",
      prev: "Previous page",
    },
    footer: {
      copyright: "Copyright © 2026 Agentsy Contributors",
      message: "Open source under GPL-3.0-or-later License",
    },
    logo: "🤖",
    nav: [
      { link: "/", text: "Home" },
      {
        items: [
          { link: "/getting-started", text: "Getting started" },
          { link: "/why-agentsy", text: "Why Agentsy" },
          { link: "/examples/", text: "Examples" },
          {
            link: "/migrating-from-llm-stream-parser",
            text: "Migration from llm-stream-parser",
          },
        ],
        text: "Guide",
      },
      {
        items: architectureItems,
        text: "Architecture",
      },
      { link: "/packages", text: "Packages" },
      {
        items: [
          { link: "/api", text: "API index" },
          { link: "/packages", text: "Package catalog" },
          { link: "/roadmap", text: "Roadmap" },
        ],
        text: "Reference",
      },
      { link: "/developers/", text: "Developers" },
    ],
    outline: {
      level: [2, 3],
    },
    search: {
      provider: "local",
    },
    sidebar: {
      "/": [
        {
          items: [
            { link: "/", text: "Home" },
            { link: "/getting-started", text: "Getting started" },
            { link: "/why-agentsy", text: "Why Agentsy" },
            { link: "/examples/", text: "Examples" },
            {
              link: "/migrating-from-llm-stream-parser",
              text: "Migration from llm-stream-parser",
            },
            { link: "/roadmap", text: "Roadmap" },
          ],
          text: "Guide",
        },
        {
          items: [
            { link: "/architecture/", text: "Architecture" },
            { link: "/packages", text: "Packages" },
            { link: "/api", text: "API index" },
            { link: "/developers/", text: "Developers" },
          ],
          text: "Reference",
        },
      ],
      "/architecture/": [
        {
          items: architectureItems,
          text: "Architecture",
        },
      ],
      "/developers/": [
        { link: "/developers/", text: "Developer guide" },
        { link: "/developers/contributing", text: "Contributing" },
        {
          link: "/developers/integration-copilot",
          text: "Copilot integration",
        },
        { link: "/developers/releasing", text: "Releasing" },
      ],
      "/examples/": [
        {
          items: [
            { link: "/examples/", text: "Overview" },
            {
              link: "/examples/cli-log-summarizer",
              text: "CLI log summarizer (easy)",
            },
            {
              link: "/examples/dns-blocklist",
              text: "Node DNS blocklist workflow",
            },
            {
              link: "/examples/multi-provider-policy-gate",
              text: "Multi-provider policy gate",
            },
            {
              link: "/examples/tool-loop-retries-continuation",
              text: "Agent tool loop with retries + continuation",
            },
            {
              link: "/examples/stateful-ops-copilot",
              text: "Stateful ops copilot backend",
            },
            {
              link: "/examples/all-tooling-end-to-end",
              text: "All-tooling end-to-end workflow",
            },
          ],
          text: "Examples",
        },
      ],
      "/packages/": [
        {
          items: [
            { link: "/packages", text: "Package overview" },
            { link: "/packages/runtime", text: "@agentsy/runtime" },
            { link: "/packages/agent", text: "@agentsy/orchestrator/agent" },
            { link: "/packages/adapters", text: "@agentsy/adapters" },
            { link: "/packages/providers", text: "@agentsy/providers" },
            { link: "/packages/ui", text: "@agentsy/ui" },
            { link: "/packages/context", text: "@agentsy/context" },
            { link: "/packages/vscode", text: "@agentsy/vscode" },
          ],
          text: "Catalog",
        },
        {
          items: [
            { link: "/packages/thinking", text: "@agentsy/thinking" },
            { link: "/packages/tool-calls", text: "@agentsy/tool-calls" },
            { link: "/packages/structured", text: "@agentsy/structured" },
            { link: "/packages/context", text: "@agentsy/context" },
            { link: "/packages/formatting", text: "@agentsy/formatting" },
            { link: "/packages/recovery", text: "@agentsy/recovery" },
            { link: "/packages/xml-filter", text: "@agentsy/xml-filter" },
            { link: "/packages/sse", text: "@agentsy/sse" },
            { link: "/packages/types", text: "@agentsy/shared" },
            { link: "/packages/ui", text: "@agentsy/ui" },
            { link: "/packages/ag-ui", text: "@agentsy/runtime/ag-ui" },
            { link: "/packages/testing", text: "@agentsy/testing" },
          ],
          text: "Core utilities",
        },
      ],
    },
    siteTitle: "Agentsy docs",
    socialLinks: [
      { icon: "github", link: "https://github.com/selfagency/agentsy" },
      { icon: "npm", link: "https://www.npmjs.com/org/agentsy" },
    ],
  },
  title: "Agentsy",
});
