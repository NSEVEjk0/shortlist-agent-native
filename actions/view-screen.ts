import { defineAction } from "@agent-native/core/action";
import { readAppStateForCurrentTab } from "@agent-native/core/application-state";
import { z } from "zod";
import { viewSchema } from "../server/action-schemas.ts";
import { decisionErrors } from "../server/action-errors.ts";
import { readDecision, requireOwner } from "../server/store.ts";

export default defineAction({
  description: "Read the buyer's current private workspace, version, selected supplier and requirements before acting.",
  schema: z.object({}),
  outputSchema: z.object({ view: z.string(), decision: viewSchema.nullable(), selectedQuoteId: z.string().nullable() }),
  errors: decisionErrors,
  http: false,
  readOnly: true,
  run: async (_args, ctx) => {
    const owner = requireOwner(ctx);
    const navigation = await readAppStateForCurrentTab("navigation") as { decisionId?: string; quoteId?: string; view?: string } | null;
    return { view: navigation?.view ?? "home", decision: navigation?.decisionId ? await readDecision(navigation.decisionId, owner) : null, selectedQuoteId: navigation?.quoteId ?? null };
  },
});
