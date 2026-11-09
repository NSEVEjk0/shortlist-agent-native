import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { and, eq } from "drizzle-orm";
import { closeDbExec } from "@agent-native/core/db";
import { checkActionProperties } from "@agent-native/core/action-properties";
import { getDb } from "../server/db/index.ts";
import { decisionEvents, decisions } from "../server/db/schema.ts";
import { humanOnly, mutateDecision, readDecision, requireOwner } from "../server/store.ts";
import { sampleDecision, withRequirements } from "../server/domain.ts";
import correctAction from "../actions/correct-quote.ts";
import approveAction from "../actions/approve-purchase-plan.ts";
import permissionAction from "../actions/set-agent-permissions.ts";
import { approvePurchasePlan, approvedPurchasePlan, checkAgentMutation, permissionsFor, preparePurchasePlan, updatePermissions } from "../server/buying.ts";

if (!process.env.DATABASE_URL) throw new Error("Storage tests require an isolated PostgreSQL database with migrations applied.");
const owner = "storage-fixture-" + randomUUID() + "@example.invalid";
const ctx = { caller: "frontend" as const, userEmail: owner };
const ids: string[] = [];
async function fixture() {
  const id = randomUUID(); ids.push(id);
  await getDb().insert(decisions).values({ id, ownerEmail: owner, version: 1, state: sampleDecision(), updatedAt: new Date().toISOString() });
  return id;
}

test("concurrent writes with the same version commit exactly one change and one event", async () => {
  const id = await fixture();
  const results = await Promise.allSettled([59000, 60000].map(budgetMinor => mutateDecision({ id, expectedVersion: 1, ctx, kind: "requirements", summary: "Changed budget", change: state => withRequirements(state, { budgetMinor }) })));
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  const rejected = results.find(result => result.status === "rejected");
  assert.equal(rejected?.status === "rejected" && rejected.reason.errorCode, "stale_version");
  const view = await readDecision(id, owner);
  assert.equal(view.version, 2);
  assert.equal(view.events.length, 1);
  assert.ok([59000, 60000].includes(view.state.requirements.budgetMinor));
});

test("a committed PostgreSQL JSONB change returns a verified receipt", async () => {
  const id = await fixture();
  const result = await mutateDecision({ id, expectedVersion: 1, ctx, kind: "requirements", summary: "Changed budget", change: () => withRequirements(sampleDecision(), { budgetMinor: 59000 }) });
  assert.equal(result.state.requirements.budgetMinor, 59000);
  assert.equal(result._receipt.changed, true);
  assert.equal(result._receipt.verified, true);
  assert.deepEqual(result._receipt.checks, [{ id: "committed-state", ok: true }]);
  assert.equal((await readDecision(id, owner)).version, 2);
});

test("equivalent content reconstructed after JSONB storage creates no change or event", async () => {
  const id = await fixture();
  await assert.rejects(mutateDecision({ id, expectedVersion: 1, ctx, kind: "requirements", summary: "Same values", change: () => sampleDecision() }), error => typeof error === "object" && error !== null && "errorCode" in error && error.errorCode === "no_change");
  const view = await readDecision(id, owner);
  assert.equal(view.version, 1);
  assert.equal(view.events.length, 0);
});

test("private reads and writes fail closed for other owners or absent sessions", async () => {
  const id = await fixture();
  await assert.rejects(readDecision(id, "another-owner@example.invalid"), error => typeof error === "object" && error !== null && "errorCode" in error && error.errorCode === "not_found");
  await assert.rejects(mutateDecision({ id, expectedVersion: 1, ctx: { caller: "tool", userEmail: "another-owner@example.invalid" }, kind: "requirements", summary: "Forbidden change", change: state => withRequirements(state, { budgetMinor: 1 }) }));
  assert.throws(() => requireOwner({ caller: "tool" }));
  assert.equal((await readDecision(id, owner)).version, 1);
});

test("a rejected domain change rolls back both state and its event", async () => {
  const id = await fixture();
  await assert.rejects(mutateDecision({ id, expectedVersion: 1, ctx, kind: "requirements", summary: "Invalid budget", change: state => withRequirements(state, { budgetMinor: -1 }) }));
  const view = await readDecision(id, owner);
  assert.equal(view.version, 1);
  assert.equal(view.state.requirements.budgetMinor, 65000);
  assert.equal(view.events.length, 0);
});

test("a content restore advances the version and rejects pre-restore responses", async () => {
  const id = await fixture();
  const original = (await readDecision(id, owner)).state;
  await mutateDecision({ id, expectedVersion: 1, ctx, kind: "requirements", summary: "Changed", change: state => withRequirements(state, { budgetMinor: 59000 }) });
  await mutateDecision({ id, expectedVersion: 2, ctx, kind: "undo", summary: "Restored", change: () => original });
  assert.equal((await readDecision(id, owner)).version, 3);
  await assert.rejects(mutateDecision({ id, expectedVersion: 1, ctx: { caller: "tool", userEmail: owner }, kind: "requirements", summary: "Old response", change: state => withRequirements(state, { budgetMinor: 20000 }) }));
  assert.equal((await readDecision(id, owner)).state.requirements.budgetMinor, 65000);
});

test("agent callers cannot authorize human corrections; the real action wrapper rejects invalid input", async () => {
  assert.throws(() => humanOnly({ caller: "tool", userEmail: owner }));
  await checkActionProperties(correctAction, { context: { caller: "tool", userEmail: owner }, runs: 15, seed: 41104 });
});

test("every external agent surface checks current write permissions and records the agent actor", async () => {
  const id = await fixture();
  for (const caller of ["tool", "mcp", "webmcp", "a2a", "cli", "automation", "mcp-widget", "mcp-widget-write"] as const) {
    await assert.rejects(mutateDecision({ id, expectedVersion: 1, ctx: { caller, userEmail: owner }, kind: "requirements", permissionVersion: 1, summary: "Forbidden requirements change", change: state => withRequirements(state, { budgetMinor: 70000 }) }), error => typeof error === "object" && error !== null && "errorCode" in error && error.errorCode === "permission_denied");
  }
  await mutateDecision({ id, expectedVersion: 1, ctx: { caller: "mcp", userEmail: owner }, kind: "plan_prepared", permissionVersion: 1, summary: "Prepared plan", change: state => preparePurchasePlan(state, "harbor", 2) });
  const view = await readDecision(id, owner);
  assert.equal(view.events[0]?.actor, "agent");
  assert.equal(view.state.purchasePlan?.verification.passed, true);
});

test("exact approval persists in JSONB; a later human write and undo cannot restore it", async () => {
  const id = await fixture();
  const prepared = await mutateDecision({ id, expectedVersion: 1, ctx, kind: "plan_prepared", summary: "Prepared", change: state => preparePurchasePlan(state, "harbor", 2) });
  const fingerprint = prepared.state.purchasePlan!.fingerprint;
  await mutateDecision({ id, expectedVersion: 2, ctx, kind: "plan_approved", summary: "Approved", change: state => approvePurchasePlan(state, fingerprint, 2, true) });
  const approved = await readDecision(id, owner);
  assert.equal(approvedPurchasePlan(approved.state).totalMinor, 59500);
  await mutateDecision({ id, expectedVersion: 3, ctx, kind: "requirements", summary: "Changed budget", change: state => withRequirements(state, { budgetMinor: 66000 }) });
  assert.equal((await readDecision(id, owner)).state.purchasePlan?.status, "outdated");
  await mutateDecision({ id, expectedVersion: 4, ctx, kind: "undo", summary: "Restored content", change: () => approved.state });
  const restored = await readDecision(id, owner);
  assert.equal(restored.state.purchasePlan?.approval, null);
  assert.throws(() => approvedPurchasePlan(restored.state));
  assert.ok(restored.permissions.version > approved.permissions.version);
});

test("permission revocation rejects in-flight work; undo advances its epoch", async () => {
  const id = await fixture();
  const original = (await readDecision(id, owner)).state;
  await mutateDecision({ id, expectedVersion: 1, ctx, kind: "permissions", summary: "Revoked", change: state => updatePermissions(state, { extractFacts: false, addQuotes: false, draftPlans: false, changeRequirements: false }) });
  await assert.rejects(mutateDecision({ id, expectedVersion: 2, ctx: { caller: "a2a", userEmail: owner }, kind: "plan_prepared", permissionVersion: 1, summary: "Stale agent plan", change: state => preparePurchasePlan(state, "harbor", 3) }), error => typeof error === "object" && error !== null && "errorCode" in error && error.errorCode === "stale_permission");
  await mutateDecision({ id, expectedVersion: 2, ctx, kind: "undo", summary: "Restored permission choice", change: () => original });
  const restored = await readDecision(id, owner);
  assert.equal(restored.permissions.allowed.draftPlans, true);
  assert.equal(restored.permissions.version, 3);
  assert.throws(() => checkAgentMutation(restored.state, "plan_prepared", 1));
  assert.doesNotThrow(() => checkAgentMutation(restored.state, "plan_prepared", 3));
});

test("purchase approval and permission actions reject agents through framework contracts", async () => {
  for (const action of [approveAction, permissionAction]) await checkActionProperties(action, { context: { caller: "mcp", userEmail: owner }, runs: 15, seed: 91108 });
  assert.throws(() => humanOnly({ caller: "frontend", userEmail: owner, networkProtocol: "mcp" }));
});

test("the configured agent admits repeated turns without user or global daily quotas", () => {
  // Non-secret operator settings; no provider or model request is made here.
  const module = JSON.stringify(new URL("../server/store.ts", import.meta.url).href);
  const configured = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e",
    `import { requireSponsoredAi } from ${module}; for (let i = 0; i < 25; i++) requireSponsoredAi();`], {
    env: { ...process.env, SHORTLIST_SPONSORED_AI: "true", SHORTLIST_DAILY_AI_LIMIT: "1", SHORTLIST_USER_DAILY_AI_LIMIT: "1" },
    encoding: "utf8", timeout: 10000,
  });
  assert.equal(configured.status, 0, "Configured agent admissions were blocked by a trial quota.");
  const disabled = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e",
    `import assert from "node:assert/strict"; import { requireSponsoredAi } from ${module}; assert.throws(() => requireSponsoredAi(), error => error.errorCode === "ai_not_configured");`], {
    env: { ...process.env, SHORTLIST_SPONSORED_AI: "false" }, encoding: "utf8", timeout: 10000,
  });
  assert.equal(disabled.status, 0, "An unconfigured sponsored provider was admitted.");
});

test.after(async () => {
  for (const id of ids) {
    await getDb().delete(decisionEvents).where(and(eq(decisionEvents.decisionId, id), eq(decisionEvents.ownerEmail, owner)));
    await getDb().delete(decisions).where(and(eq(decisions.id, id), eq(decisions.ownerEmail, owner)));
  }
  await closeDbExec();
});
