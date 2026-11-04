import { randomUUID } from "node:crypto";
import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { mutationSchema } from "../server/action-schemas.ts";
import { decisionErrors } from "../server/action-errors.ts";
import { emptyDecision, sampleDecision } from "../server/domain.ts";
import { getDb } from "../server/db/index.ts";
import { decisions } from "../server/db/schema.ts";
import { domainFailure, readDecision, requireOwner } from "../server/store.ts";
export default defineAction({
  description: "Create a private buying workspace. The example option loads three disclosed fictional supplier quotes, prepared without AI.",
  schema: z.object({ title: z.string().min(1).max(160).describe("Short title for this buying decision"), example: z.boolean().default(false).describe("True to load fictional workshop-kit quotes; defaults to an empty workspace") }),
  outputSchema: mutationSchema, errors: decisionErrors,
  run: async ({ title, example }, ctx) => {
    const ownerEmail = requireOwner(ctx);
    let state;
    try { state = example ? sampleDecision() : emptyDecision(title); }
    catch (error) { return domainFailure(error); }
    state.title = title;
    const id = randomUUID();
    await getDb().insert(decisions).values({ id, ownerEmail, version: 1, state, updatedAt: new Date().toISOString() });
    const view = await readDecision(id, ownerEmail);
    return { ...view, _receipt: { changed: true, verified: view.version === 1, subject: id, summary: "Created " + title, checks: [{ id: "created-workspace", ok: view.version === 1 }] } };
  },
});
