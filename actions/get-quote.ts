import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { evidenceSchema, idSchema, permissionsSchema, quoteIdSchema, quoteSchema } from "../server/action-schemas.ts";
import { decisionErrors } from "../server/action-errors.ts";
import { readDecision, requireOwner } from "../server/store.ts";
export default defineAction({
  description: "Read one supplier's original quote, exact source hash, extracted fields and human locks before applying extraction.",
  schema: z.object({ id: idSchema, quoteId: quoteIdSchema }),
  outputSchema: z.object({ id: z.string(), version: z.number(), permissions: permissionsSchema, quote: quoteSchema,
    sourceLines: z.array(evidenceSchema).max(200).describe("Literal source lines with exact UTF-16 offsets, for citations. These are text spans, not extracted facts or interpretations."),
  }), errors: decisionErrors,
  http: { method: "GET" }, readOnly: true,
  run: async ({ id, quoteId }, ctx) => {
    const view = await readDecision(id, requireOwner(ctx));
    const quote = view.state.quotes.find(item => item.id === quoteId);
    if (!quote) return decisionErrors.fail("That quote was not found.", "not_found", { statusCode: 404 });
    let start = 0;
    const sourceLines = quote.source.split("\n").flatMap(text => {
      const span = { start, end: start + text.length, text };
      start += text.length + 1;
      return text.length > 0 && text.length <= 1000 ? [span] : [];
    }).slice(0, 200);
    return { id, version: view.version, permissions: view.permissions, quote, sourceLines };
  },
});
