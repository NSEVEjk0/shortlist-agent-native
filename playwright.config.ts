import { defineConfig, devices } from "@playwright/test";
// guard:allow-env-credential — Non-secret browser test target; this is not a user credential.
const target = process.env.SHORTLIST_TEST_URL;
export default defineConfig({
  testDir: "./tests/browser", timeout: 60_000, retries: 0, workers: 1,
  use: { baseURL: target ?? "http://127.0.0.1:4173", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  ...(target ? {} : { webServer: { command: "node .output/server/index.mjs", url: "http://127.0.0.1:4173/_agent-native/health", timeout: 90_000, reuseExistingServer: false, stdout: "pipe", stderr: "pipe", env: { PORT: "4173", HOST: "127.0.0.1", NITRO_PORT: "4173", NITRO_HOST: "127.0.0.1", NODE_ENV: "production" } } }),
});
