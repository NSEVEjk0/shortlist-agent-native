import { defineAction } from "@agent-native/core/action";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../server/db/index.ts";
import { decisions } from "../server/db/schema.ts";
import { decisionErrors } from "../server/action-errors.ts";
import { requireOwner } from "../server/store.ts";
export default defineAction({
  description: "List your 20 most recently updated private buying workspaces.",
  schema: z.object({}),
  outputSchema: z.array(z.object({ id: z.string(), version: z.number(), title: z.string(), updatedAt: z.string() })),
  errors: decisionErrors, http: { method: "GET" }, readOnly: true,
  run: async (_args, ctx) => {
    const owner = requireOwner(ctx);
    const rows = await getDb().select({ id: decisions.id, version: decisions.version, state: decisions.state, updatedAt: decisions.updatedAt }).from(decisions).where(eq(decisions.ownerEmail, owner)).orderBy(desc(decisions.updatedAt)).limit(20);
    return rows.map(row => ({ id: row.id, version: row.version, title: row.state.title, updatedAt: row.updatedAt }));
  },
});
