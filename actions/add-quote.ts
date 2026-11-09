import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { idSchema, mutationSchema, permissionVersionSchema, versionSchema } from "../server/action-schemas.ts";
import { decisionErrors } from "../server/action-errors.ts";
import { newQuote } from "../server/domain.ts";
import { mutateDecision } from "../server/store.ts";
export default defineAction({
  description: "Add an original pasted supplier quote. It remains unconfirmed until source-backed extraction or a human correction provides required facts.",
  schema: z.object({ id: idSchema, expectedVersion: versionSchema, permissionVersion: permissionVersionSchema, supplier: z.string().min(1).max(120).describe("Supplier name"), source: z.string().min(1).max(12000).describe("Original quote text including price, delivery and exclusions; do not paraphrase") }),
  outputSchema: mutationSchema, errors: decisionErrors,
  run: async ({ id, expectedVersion, permissionVersion, supplier, source }, ctx) => mutateDecision({ id, expectedVersion, permissionVersion, ctx, kind: "quote_added", summary: "Added " + supplier + "'s original quote", change: state => {
    if (state.quotes.length >= 8) decisionErrors.fail("This workspace already has eight supplier quotes.", "quote_limit", { statusCode: 409 });
    return { ...state, quotes: [...state.quotes, newQuote(supplier, source)] };
  } }),
});
