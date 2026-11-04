import { appendFileSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
mkdirSync("reports", { recursive: true });
// guard:allow-env-credential — GitHub's non-secret output-file path for an isolated CI job.
const githubEnv = process.env.GITHUB_ENV;
if (!githubEnv) throw new Error("This helper is for an isolated CI job.");
const secret = randomBytes(32).toString("hex");
process.stdout.write("::add-mask::" + secret + "\n");
appendFileSync(githubEnv, "BETTER_AUTH_SECRET=" + secret + "\n");
