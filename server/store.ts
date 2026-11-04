import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { fail, type ActionRunContext } from "@agent-native/core/action";
import type { DecisionState, DecisionView } from "../shared/types.ts";
import { DecisionError, recommend, stateHash } from "./domain.ts";
import { getDb } from "./db/index.ts";
import { aiBudgets, decisionEvents, decisions } from "./db/schema.ts";

export function requireOwner(ctx?: ActionRunContext) {
  if (!ctx?.userEmail) fail("Sign in to open your private workspace.", { errorCode: "unauthenticated", statusCode: 401 });
  return ctx.userEmail;
}

export function humanOnly(ctx?: ActionRunContext) {
  const owner = requireOwner(ctx);
  if (!ctx || !["frontend", "http"].includes(ctx.caller)) fail("This change needs a person using the workspace controls.", { errorCode: "human_only", statusCode: 403 });
  return owner;
}

export function domainFailure(error: unknown): never {
  if (error instanceof DecisionError) fail(error.message, { errorCode: error.code, statusCode: error.code === "not_found" ? 404 : 409 });
  throw error;
}

export async function readDecision(id: string, owner: string): Promise<DecisionView> {
  const db = getDb();
  const [row] = await db.select().from(decisions).where(and(eq(decisions.id, id), eq(decisions.ownerEmail, owner))).limit(1);
  if (!row) fail("That workspace was not found.", { errorCode: "not_found", statusCode: 404 });
  const events = await db.select({
    id: decisionEvents.id, version: decisionEvents.version, kind: decisionEvents.kind, actor: decisionEvents.actor,
    summary: decisionEvents.summary, previousWinner: decisionEvents.previousWinner, nextWinner: decisionEvents.nextWinner, createdAt: decisionEvents.createdAt,
  }).from(decisionEvents).where(and(eq(decisionEvents.decisionId, id), eq(decisionEvents.ownerEmail, owner))).orderBy(desc(decisionEvents.version)).limit(20);
  return { id: row.id, version: row.version, state: row.state, updatedAt: row.updatedAt, recommendation: recommend(row.state), events };
}

export async function mutateDecision(input: {
  id: string;
  expectedVersion: number;
  ctx?: ActionRunContext | undefined;
  kind: string;
  summary: string;
  change: (state: DecisionState) => DecisionState;
}) {
  const owner = requireOwner(input.ctx);
  let committedHash = "";
  const row = await getDb().transaction(async tx => {
    const [before] = await tx.select().from(decisions).where(and(eq(decisions.id, input.id), eq(decisions.ownerEmail, owner))).limit(1).for("update");
    if (!before) fail("That workspace was not found.", { errorCode: "not_found", statusCode: 404 });
    if (before.version !== input.expectedVersion) fail("Your workspace changed. Refresh the current values and try again.", { errorCode: "stale_version", statusCode: 409 });
    let next: DecisionState;
    try { next = input.change(structuredClone(before.state)); }
    catch (error) { return domainFailure(error); }
    if (stateHash(next) === stateHash(before.state)) fail("These values are already saved.", { errorCode: "no_change", statusCode: 409 });
    const version = before.version + 1;
    const now = new Date().toISOString();
    const [saved] = await tx.update(decisions).set({ state: next, version, updatedAt: now }).where(and(eq(decisions.id, input.id), eq(decisions.ownerEmail, owner), eq(decisions.version, before.version))).returning();
    if (!saved) fail("Your workspace changed. Read its current version.", { errorCode: "stale_version", statusCode: 409 });
    await tx.insert(decisionEvents).values({
      id: randomUUID(), decisionId: saved.id, ownerEmail: owner, version, kind: input.kind,
      actor: input.ctx?.caller === "tool" ? "agent" : "human", summary: input.summary,
      previousWinner: recommend(before.state).winner?.supplier ?? null,
      nextWinner: recommend(next).winner?.supplier ?? null, beforeState: before.state, createdAt: now,
    });
    committedHash = stateHash(next);
    return saved;
  });
  const view = await readDecision(row.id, owner);
  return { ...view, _receipt: { changed: true, verified: view.version === row.version && stateHash(view.state) === committedHash, subject: row.id, summary: input.summary, checks: [{ id: "committed-state", ok: view.version === row.version && stateHash(view.state) === committedHash }] } };
}

export async function reserveAiTurn(owner: string) {
  if (process.env.SHORTLIST_SPONSORED_AI !== "true") fail("The sponsored agent is not enabled for this deployment. You can still compare and correct quotes.", { errorCode: "ai_not_configured", statusCode: 503 });
  const day = new Date().toISOString().slice(0, 10);
  const limits = [{ id: "global:" + day, max: Number(process.env.SHORTLIST_DAILY_AI_LIMIT ?? 20) }, { id: owner + ":" + day, max: Number(process.env.SHORTLIST_USER_DAILY_AI_LIMIT ?? 5) }];
  if (limits.some(limit => !Number.isSafeInteger(limit.max) || limit.max < 1 || limit.max > 100)) fail("The agent budget is not configured.", { errorCode: "ai_not_configured", statusCode: 503 });
  await getDb().transaction(async tx => {
    for (const limit of limits) {
      await tx.insert(aiBudgets).values({ id: limit.id, used: 0 }).onConflictDoNothing();
      const [counter] = await tx.update(aiBudgets).set({ used: sql`${aiBudgets.used} + 1` }).where(and(eq(aiBudgets.id, limit.id), sql`${aiBudgets.used} < ${limit.max}`)).returning();
      if (!counter) fail("The daily sponsored agent allowance has been used. Manual workspace tools remain available.", { errorCode: "ai_budget_exhausted", statusCode: 429 });
    }
  });
}
