import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { idSchema, stateSchema } from "../server/action-schemas.ts";
import { decisionErrors } from "../server/action-errors.ts";
import { stateHash } from "../server/domain.ts";
import { readDecision, requireOwner } from "../server/store.ts";
import { money } from "../shared/format.ts";
export default defineAction({
  description: "Export the current buying brief plus original quotes, evidence and corrections. Explicitly reports when no offer meets all requirements.",
  schema: z.object({ id: idSchema }),
  outputSchema: z.object({ id: z.string(), version: z.number(), brief: z.string(), sha256: z.string(), evidence: stateSchema }), errors: decisionErrors,
  http: { method: "GET" }, readOnly: true,
  run: async ({ id }, ctx) => {
    const view = await readDecision(id, requireOwner(ctx));
    const winner = view.recommendation.winner;
    const req = view.state.requirements;
    const lines = ["# " + view.state.title, "", "Version: " + view.version, "Budget: " + money(req.budgetMinor, req.currency), "Quantity: " + req.quantity, "Delivery by: " + req.deliveryBy, "", winner ? "Recommended: " + winner.supplier + " at " + money(winner.totalMinor, req.currency) : "No suitable offer meets all confirmed requirements.", "", ...view.recommendation.assessments.map(offer => "- " + offer.supplier + ": " + money(offer.totalMinor, req.currency) + "; " + (offer.eligible ? "meets confirmed requirements" : offer.reasons.join("; "))), "", "Source excerpts support entered facts. Manual corrections are buyer assertions. Review supplier terms before purchasing."];
    return { id, version: view.version, brief: lines.join("\n"), sha256: stateHash(view.state), evidence: view.state };
  },
});
