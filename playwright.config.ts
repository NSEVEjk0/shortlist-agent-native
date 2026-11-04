import { defineConfig, devices } from "@playwright/test";
// guard:allow-env-credential — Non-secret browser test target; this is not a user credential.
const target = process.env.SHORTLIST_TEST_URL;
export default defineConfig({
  testDir: "./tests/browser", timeout: 60_000, retries: 0, workers: 1,
  use: { baseURL: target ?? "http://127.0.0.1:4173", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  ...(target ? {} : { webServer: { command: "npm run start", url: "http://127.0.0.1:4173", timeout: 120_000, reuseExistingServer: false, env: { PORT: "4173", HOST: "127.0.0.1", NODE_ENV: "production" } } }),
});
