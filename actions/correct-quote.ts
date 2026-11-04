import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { fieldValueSchema, idSchema, mutationSchema, quoteIdSchema, versionSchema } from "../server/action-schemas.ts";
import { decisionErrors } from "../server/action-errors.ts";
import { changeQuote, correctField } from "../server/domain.ts";
import { humanOnly, mutateDecision } from "../server/store.ts";
export default defineAction({
  description: "A person corrects a supplier field, records a reason and optionally locks it against AI extraction. Unavailable to agent tools.",
  agentTool: false, mcpTool: false,
  schema: z.object({ id: idSchema, quoteId: quoteIdSchema, expectedVersion: versionSchema, field: z.enum(["quantity", "unitMinor", "shippingMinor", "taxMinor", "currency", "deliveryDate"]).describe("Supplier fact to correct"), value: fieldValueSchema.describe("Corrected integer minor units, quantity, currency code or YYYY-MM-DD date"), note: z.string().min(3).max(300).describe("Reason for correction or unlocking"), locked: z.boolean().default(true).describe("True protects this field from AI changes; defaults to true") }),
  outputSchema: mutationSchema, errors: decisionErrors,
  run: async ({ id, quoteId, expectedVersion, field, value, note, locked }, ctx) => {
    humanOnly(ctx);
    return mutateDecision({ id, expectedVersion, ctx, kind: "correction", summary: (locked ? "Corrected and locked " : "Corrected and unlocked ") + field, change: state => changeQuote(state, quoteId, quote => correctField(quote, field, value, note, locked)) });
  },
});
