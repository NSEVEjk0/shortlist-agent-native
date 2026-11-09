import { readFile, mkdir, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { spawn } from "node:child_process";
import path from "node:path";

// Run the actual compiled app on the dedicated browser-test port. All browser
// fixtures belong to fresh accounts; this never restarts a deployed service.
const value = name => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
const envFile = value("--env-file"), target = value("--target"), fixture = value("--voice-fixture");
const serverEntry = value("--server-entry");
const releaseDir = value("--release-dir");
const configuration = envFile ? parseEnv(await readFile(envFile, "utf8")) : {};
const environment = { ...process.env, ...configuration,
  HOST: "127.0.0.1", PORT: "4173", NITRO_HOST: "127.0.0.1", NITRO_PORT: "4173", NODE_ENV: "production",
  APP_URL: target ?? "http://127.0.0.1:4173", BETTER_AUTH_URL: target ?? "http://127.0.0.1:4173",
  AUTH_DISABLED: "false", AUTH_AUTO_SIGN_IN: "false",
  SHORTLIST_SPONSORED_AI: process.argv.includes("--live-ai") ? "true" : "false",
  SHORTLIST_LIVE_AI: process.argv.includes("--live-ai") ? "true" : "false",
};
if (target) environment.SHORTLIST_TEST_URL = target; else delete environment.SHORTLIST_TEST_URL;
if (!target) { delete environment.APP_URL; delete environment.BETTER_AUTH_URL; }
if (fixture) environment.SHORTLIST_VOICE_FIXTURE = fixture;
if (serverEntry) environment.SHORTLIST_TEST_SERVER_ENTRY = serverEntry;
if (releaseDir) {
  if (target) throw new Error("Build checks need a local test release; a public target uses its already deployed build.");
  // Build with the public deployment configuration, then serve that exact
  // artifact with the test origin. A localhost URL is valid for the browser
  // fixture but deliberately fails the framework's public-deploy check.
  const buildEnvironment = { ...environment, APP_URL: configuration.APP_URL ?? environment.APP_URL, BETTER_AUTH_URL: configuration.BETTER_AUTH_URL ?? environment.BETTER_AUTH_URL };
  const build = spawn("npm", ["run", "build"], { cwd: releaseDir, env: buildEnvironment, stdio: ["ignore", "pipe", "pipe"] });
  let buildLog = "";
  build.stdout.on("data", bytes => { buildLog += bytes; }); build.stderr.on("data", bytes => { buildLog += bytes; });
  const buildCode = await new Promise((resolve, reject) => { build.once("error", reject); build.once("close", resolve); });
  for (const [key, secret] of Object.entries(configuration)) if (/SECRET|TOKEN|PASSWORD|API_KEY|DATABASE_URL/.test(key) && secret.length > 8) buildLog = buildLog.replaceAll(secret, "[REDACTED]");
  await mkdir("reports", { recursive: true });
  await writeFile("reports/browser-production-build.log", buildLog, { mode: 0o600 });
  if (buildCode !== 0 || buildLog.includes("production configuration errors")) throw new Error("The production build failed before browser verification. Redacted diagnostics are in reports/browser-production-build.log.");
  console.log("Production build passed with the public deployment configuration.");
  environment.SHORTLIST_TEST_SERVER_ENTRY = path.resolve(releaseDir, ".output/server/index.mjs");
}
const args = ["playwright", "test", ...process.argv.slice(2).filter((arg, index, list) => ["--grep", "--config"].includes(arg) || ["--grep", "--config"].includes(list[index - 1]))];
const child = spawn("npx", args, { env: environment, stdio: "inherit" });
const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
process.exitCode = code;
