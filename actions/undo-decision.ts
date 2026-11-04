import { defineAction } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { idSchema, mutationSchema, versionSchema } from "../server/action-schemas.ts";
import { decisionErrors } from "../server/action-errors.ts";
import { getDb } from "../server/db/index.ts";
import { decisionEvents } from "../server/db/schema.ts";
import { humanOnly, mutateDecision } from "../server/store.ts";
export default defineAction({
  description: "Undo the most recent change. Restores prior content while creating a new version, so stale responses remain rejected. Human control only.",
  agentTool: false, mcpTool: false,
  schema: z.object({ id: idSchema, expectedVersion: versionSchema }), outputSchema: mutationSchema, errors: decisionErrors,
  run: async ({ id, expectedVersion }, ctx) => {
    const owner = humanOnly(ctx);
    const [last] = await getDb().select().from(decisionEvents).where(and(eq(decisionEvents.decisionId, id), eq(decisionEvents.ownerEmail, owner), eq(decisionEvents.version, expectedVersion))).limit(1);
    if (!last || last.kind === "undo") decisionErrors.fail("There is no recent change to undo.", "undo_unavailable", { statusCode: 409 });
    return mutateDecision({ id, expectedVersion, ctx, kind: "undo", summary: "Undid: " + last.summary, change: () => structuredClone(last.beforeState) });
  },
});
