import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { idSchema, mutationSchema, quoteIdSchema, versionSchema } from "../server/action-schemas.ts";
import { decisionErrors } from "../server/action-errors.ts";
import { changeQuote, replaceSource } from "../server/domain.ts";
import { humanOnly, mutateDecision } from "../server/store.ts";
export default defineAction({
  description: "Replace original quote text. Invalidates old extraction, resets exclusion review and preserves explicitly locked corrections. Human control only.",
  agentTool: false, mcpTool: false,
  schema: z.object({ id: idSchema, quoteId: quoteIdSchema, expectedVersion: versionSchema, source: z.string().min(1).max(12000).describe("New original supplier quote text") }),
  outputSchema: mutationSchema, errors: decisionErrors,
  run: async ({ id, quoteId, expectedVersion, source }, ctx) => {
    humanOnly(ctx);
    return mutateDecision({ id, expectedVersion, ctx, kind: "source_replaced", summary: "Replaced source; old extraction needs review", change: state => changeQuote(state, quoteId, quote => replaceSource(quote, source)) });
  },
});
