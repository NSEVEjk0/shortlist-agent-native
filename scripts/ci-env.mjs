import { appendFileSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
mkdirSync("reports", { recursive: true });
if (!process.env.GITHUB_ENV) throw new Error("This helper is for an isolated CI job.");
const secret = randomBytes(32).toString("hex");
process.stdout.write("::add-mask::" + secret + "\n");
appendFileSync(process.env.GITHUB_ENV, "BETTER_AUTH_SECRET=" + secret + "\n");
