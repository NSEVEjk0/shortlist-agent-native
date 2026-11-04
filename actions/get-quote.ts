import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { idSchema, quoteIdSchema, quoteSchema } from "../server/action-schemas.ts";
import { decisionErrors } from "../server/action-errors.ts";
import { readDecision, requireOwner } from "../server/store.ts";
export default defineAction({
  description: "Read one supplier's original quote, exact source hash, extracted fields and human locks before applying extraction.",
  schema: z.object({ id: idSchema, quoteId: quoteIdSchema }),
  outputSchema: z.object({ id: z.string(), version: z.number(), quote: quoteSchema }), errors: decisionErrors,
  http: { method: "GET" }, readOnly: true,
  run: async ({ id, quoteId }, ctx) => {
    const view = await readDecision(id, requireOwner(ctx));
    const quote = view.state.quotes.find(item => item.id === quoteId);
    if (!quote) decisionErrors.fail("That quote was not found.", "not_found", { statusCode: 404 });
    return { id, version: view.version, quote };
  },
});
