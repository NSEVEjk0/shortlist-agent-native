import { defineConfig, devices } from "@playwright/test";
// guard:allow-env-credential — A non-secret optional URL for the public tour test.
const target = process.env.SHORTLIST_TOUR_TEST_URL;
export default defineConfig({
  testDir: "./tests/tour", timeout: 45_000, retries: 0, workers: 1,
  use: { baseURL: target ?? "http://127.0.0.1:4184", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  ...(target ? {} : { webServer: { command: "python3 -m http.server 4184 --bind 127.0.0.1 --directory preview", url: "http://127.0.0.1:4184", timeout: 30_000, reuseExistingServer: false } }),
});
