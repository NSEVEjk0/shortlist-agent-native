import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { evidenceSchema, exclusionsSchema, fieldValueSchema, idSchema, mutationSchema, quoteIdSchema, versionSchema } from "../server/action-schemas.ts";
import { decisionErrors } from "../server/action-errors.ts";
import { applyExtraction, changeQuote } from "../server/domain.ts";
import { mutateDecision } from "../server/store.ts";
const extracted = z.object({ value: fieldValueSchema.describe("Integer minor currency units, exact quantity, currency code or YYYY-MM-DD date; null means unknown"), evidence: evidenceSchema });
export default defineAction({
  description: "Apply explicitly quoted facts at the current source hash and workspace version. Exact citations and stated values are validated. Human-locked fields remain unchanged.",
  schema: z.object({
    id: idSchema, quoteId: quoteIdSchema, expectedVersion: versionSchema,
    sourceHash: z.string().length(64).describe("Current SHA-256 sourceHash from get-quote"),
    extraction: z.object({
      fields: z.object({ quantity: extracted.optional(), unitMinor: extracted.optional(), shippingMinor: extracted.optional(), taxMinor: extracted.optional(), currency: extracted.optional(), deliveryDate: extracted.optional() }).describe("Only explicitly stated facts; cents for amounts and YYYY-MM-DD for dates"),
      exclusions: exclusionsSchema, termsReviewed: z.boolean().describe("True only after reading the full source for exclusions; cite any exclusions found"),
    }),
  }),
  outputSchema: mutationSchema, errors: decisionErrors,
  run: async ({ id, quoteId, expectedVersion, sourceHash, extraction }, ctx) => mutateDecision({ id, expectedVersion, ctx, kind: "extraction", summary: "Applied source-linked facts; preserved manual locks", change: state => changeQuote(state, quoteId, quote => applyExtraction(quote, sourceHash, extraction).quote) }),
});
