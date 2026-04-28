import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "https://questions.mastersat.uz",
    trace: "on-first-retry",
  },
});

