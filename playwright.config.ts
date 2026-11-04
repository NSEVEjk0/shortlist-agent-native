import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser", timeout: 60_000, retries: 0, workers: 1,
  use: { baseURL: process.env.SHORTLIST_TEST_URL ?? "http://127.0.0.1:4173", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.SHORTLIST_TEST_URL ? undefined : { command: "npm run start", url: "http://127.0.0.1:4173", timeout: 120_000, reuseExistingServer: false, env: { PORT: "4173", HOST: "127.0.0.1", NODE_ENV: "production" } },
});
