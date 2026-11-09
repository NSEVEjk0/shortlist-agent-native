import { defineConfig, devices } from "@playwright/test";
// guard:allow-env-credential — Non-secret browser test target; this is not a user credential.
const target = process.env.SHORTLIST_TEST_URL;
// guard:allow-env-credential — Non-secret local WAV fixture used only for a microphone browser check.
const voiceFixture = process.env.SHORTLIST_VOICE_FIXTURE;
// guard:allow-env-credential — Explicit path to the compiled release under browser verification, on the dedicated test port.
const serverEntry = process.env.SHORTLIST_TEST_SERVER_ENTRY ?? ".output/server/index.mjs";
const serverCommand = "node '" + serverEntry.replace(/'/g, "'\\''") + "'";
export default defineConfig({
  testDir: "./tests/browser", timeout: 60_000, retries: 0, workers: 1,
  use: { baseURL: target ?? "http://127.0.0.1:4173", trace: "retain-on-failure", screenshot: "only-on-failure", ...(voiceFixture ? { permissions: ["microphone"], launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--use-file-for-fake-audio-capture=" + voiceFixture] } } : {}) },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  ...(target ? {} : { webServer: { command: serverCommand, url: "http://127.0.0.1:4173/_agent-native/health", timeout: 90_000, reuseExistingServer: false, stdout: "pipe", stderr: "pipe", env: { PORT: "4173", HOST: "127.0.0.1", NITRO_PORT: "4173", NITRO_HOST: "127.0.0.1", NODE_ENV: "production" } } }),
});
