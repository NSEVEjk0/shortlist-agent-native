import { appendFileSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
mkdirSync("reports", { recursive: true });
if (!process.env.GITHUB_ENV) throw new Error("This helper is for an isolated CI job.");
appendFileSync(process.env.GITHUB_ENV, "BETTER_AUTH_SECRET=" + randomBytes(32).toString("hex") + "\n");
