import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "ci-smoke.spec.ts",
  timeout: 30000,
  workers: 2,
  use: {
    baseURL: "http://127.0.0.1:4179",
    headless: true,
    trace: "off",
  },
  webServer: {
    command: "pnpm exec vite preview --host 127.0.0.1 --port 4179 --strictPort",
    url: "http://127.0.0.1:4179",
    reuseExistingServer: false,
    timeout: 30000,
  },
  reporter: "list",
});
