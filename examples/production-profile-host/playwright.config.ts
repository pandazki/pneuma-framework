import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "*.pw.ts",
  timeout: 120_000,
  use: {
    baseURL: "http://127.0.0.1:8999",
    channel: "chrome",
    viewport: { width: 1440, height: 980 },
  },
  webServer: {
    command: "PORT=8999 bun run serve",
    url: "http://127.0.0.1:8999/api/state",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
