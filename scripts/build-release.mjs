import { readFile, readdir, mkdir, writeFile, copyFile, symlink, stat } from "node:fs/promises";
import { parseEnv } from "node:util";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";

process.umask(0o077);
const argument = name => { const index = process.argv.indexOf(name); if (index < 0 || !process.argv[index + 1]) throw new Error("Provide " + name + "."); return process.argv[index + 1]; };
const output = path.resolve(argument("--output"));
const configuration = parseEnv(await readFile(argument("--env-file"), "utf8"));
if (!configuration.DATABASE_URL || !configuration.BETTER_AUTH_SECRET || !configuration.VULTR_INFERENCE_API_KEY) throw new Error("The release needs its private PostgreSQL, authentication and Vultr configuration.");
const secrets = Object.entries(configuration).filter(([key, value]) => /SECRET|TOKEN|PASSWORD|API_KEY|DATABASE_URL/.test(key) && value.length > 8).map(([, value]) => value);
await mkdir(output, { recursive: false, mode: 0o700 });
const manifestIndex = process.argv.indexOf("--manifest");
let manifest;
if (manifestIndex >= 0) manifest = await readFile(process.argv[manifestIndex + 1], "utf8");
else {
  const git = spawn("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { stdio: ["ignore", "pipe", "pipe"] });
  manifest = "";
  git.stdout.on("data", bytes => { manifest += bytes; });
  const code = await new Promise((resolve, reject) => { git.once("error", reject); git.once("close", resolve); });
  if (code !== 0) throw new Error("Could not list the release source files.");
}
const files = manifest.split("\0").filter(Boolean);
for (const file of files) {
  if (file.startsWith("../") || path.isAbsolute(file)) throw new Error("A source file is outside the project.");
  const destination = path.join(output, file);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(file, destination);
}
await symlink(path.resolve("node_modules"), path.join(output, "node_modules"));
if (process.argv.includes("--prepare-only")) {
  console.log("Prepared the clean release source for typecheck, doctor, production build and browser verification.");
  process.exit(0);
}
let checks = [];
const environment = { ...process.env, ...configuration, NODE_ENV: "production", NITRO_PRESET: "node-server" };
for (const task of ["typecheck", "agent-native:doctor", "build"]) {
  const child = spawn("npm", ["run", task], { cwd: output, env: environment, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  child.stdout.on("data", bytes => { log += bytes; }); child.stderr.on("data", bytes => { log += bytes; });
  const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
  for (const secret of secrets) log = log.replaceAll(secret, "[REDACTED]");
  await writeFile(path.join(output, "check-" + task.replaceAll(":", "-") + ".log"), log, { mode: 0o600 });
  if (code !== 0 || log.includes("production configuration errors")) throw new Error(task + " failed. Redacted diagnostics are in the prepared release directory.");
  checks.push(task); console.log(task + " passed for the prepared release.");
}
let publicAssets = 0;
async function scan(folder) {
  for (const name of await readdir(folder)) {
    const file = path.join(folder, name), info = await stat(file);
    if (info.isDirectory()) await scan(file);
    else {
      const bytes = await readFile(file);
      if (secrets.some(secret => bytes.includes(Buffer.from(secret)))) throw new Error("A private credential occurs in a public build asset.");
      publicAssets++;
    }
  }
}
await scan(path.join(output, ".output/public"));
const serverEntry = path.join(output, ".output/server/index.mjs");
const report = { completed: true, at: new Date().toISOString(), serverEntry, sha256: createHash("sha256").update(await readFile(serverEntry)).digest("hex"), checks, publicAssets, publicCredentials: false };
await writeFile(path.join(output, "release.json"), JSON.stringify(report, null, 2) + "\n");
console.log("Prepared the production release; " + publicAssets + " public assets passed the credential scan.");
