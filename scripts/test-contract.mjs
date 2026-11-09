import { readFile, mkdir, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import postgres from "postgres";
import { SHORTLIST_MIGRATIONS } from "../server/db/migrations.ts";

// This test runner creates and drops one isolated schema. It never changes
// the application's tables or controls production services.
const envArg = process.argv.indexOf("--env-file");
const configuration = envArg < 0 ? {} : parseEnv(await readFile(process.argv[envArg + 1], "utf8"));
// guard:allow-env-credential — Explicit operator/CI test database connection, used only to create an isolated test database; never logged.
const connection = configuration.DATABASE_URL ?? process.env.DATABASE_URL;
if (!connection || !/^postgres(?:ql)?:/.test(connection)) throw new Error("Contract checks need a PostgreSQL connection with permission to create an isolated test schema.");
const name = "shortlist_test_" + randomUUID().replaceAll("-", "");
const admin = postgres(connection, { max: 1, connect_timeout: 8, onnotice: () => {} });
const testUrl = new URL(connection); testUrl.searchParams.set("options", "-csearch_path=" + name);
const secrets = [connection, testUrl.href, ...Object.entries(configuration).filter(([key]) => /SECRET|TOKEN|PASSWORD|API_KEY/.test(key)).map(([, value]) => value)].filter(value => value.length > 5);
await mkdir("reports", { recursive: true });
let created = false, passed = false, output = "";
try {
  await admin`CREATE SCHEMA ${admin(name)}`;
  created = true;
  const isolated = postgres(testUrl.href, { max: 1, onnotice: () => {} });
  try {
    if ((await isolated`SELECT current_schema() AS name`)[0].name !== name) throw new Error("PostgreSQL did not isolate the test schema.");
    for (const migration of SHORTLIST_MIGRATIONS) await isolated.unsafe(migration.sql);
    const rows = await isolated`SELECT table_schema FROM information_schema.tables WHERE table_schema = ${name} AND table_name IN ('shortlist_decisions', 'shortlist_events', 'shortlist_ai_budgets')`;
    if (rows.length !== 3) throw new Error("The application's actual migrations did not create the isolated test tables.");
  }
  finally { await isolated.end(); }
  const environment = { ...process.env, DATABASE_URL: testUrl.href, SHORTLIST_TEST_SCHEMA: name, SHORTLIST_SPONSORED_AI: "false" };
  for (const task of ["test:storage"]) {
    const child = spawn("npm", ["run", task], { env: environment, stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    child.stdout.on("data", bytes => { log += bytes; }); child.stderr.on("data", bytes => { log += bytes; });
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
    for (const secret of secrets) log = log.replaceAll(secret, "[REDACTED]");
    output += log;
    if (code !== 0) throw new Error(task + " failed. Redacted diagnostics are in reports/contract.log.");
    console.log(task + " passed against the isolated PostgreSQL schema.");
  }
  passed = true;
} finally {
  if (created) await admin`DROP SCHEMA ${admin(name)} CASCADE`;
  await admin.end();
  await writeFile("reports/contract.log", output, { mode: 0o600 });
  await writeFile("reports/contract.json", JSON.stringify({ passed, isolatedPostgreSQLSchema: true, removed: created, productionServicesChanged: false, modelRequests: 0 }, null, 2) + "\n");
}
