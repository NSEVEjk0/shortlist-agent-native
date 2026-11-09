import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { idSchema, planSchema, stateSchema } from "../server/action-schemas.ts";
import { decisionErrors } from "../server/action-errors.ts";
import { domainFailure, readDecision, requireOwner } from "../server/store.ts";
import { approvedPurchasePlan } from "../server/buying.ts";
import { money } from "../shared/format.ts";
export default defineAction({
  description: "Export the currently approved purchase plan with original quotes, human corrections and independent checks. Rechecks the exact approval and input fingerprints before export.",
  schema: z.object({ id: idSchema }), outputSchema: z.object({ id: z.string(), version: z.number(), brief: z.string(), plan: planSchema, evidence: stateSchema }), errors: decisionErrors,
  readOnly: true, http: { method: "GET" },
  run: async ({ id }, ctx) => {
    const view = await readDecision(id, requireOwner(ctx));
    let plan;
    try { plan = approvedPurchasePlan(view.state); }
    catch (error) { return domainFailure(error); }
    const quote = view.state.quotes.find(item => item.id === plan.quoteId)!;
    const brief = ["# Approved purchase plan — " + view.state.title, "", "Supplier: " + plan.supplier, "Quantity: " + plan.quantity,
      "Unit price: " + money(plan.unitMinor, plan.currency), "Shipping: " + money(plan.shippingMinor, plan.currency), "Stated tax: " + money(plan.taxMinor, plan.currency),
      "Complete total: " + money(plan.totalMinor, plan.currency), "Delivery: " + plan.deliveryDate, "Required by: " + view.state.requirements.deliveryBy,
      "Budget: " + money(view.state.requirements.budgetMinor, plan.currency), "", "Supplier exclusions: " + (quote.exclusions.map(item => item.text).join("; ") || "None stated in the reviewed quote"),
      "", "Prepared: " + plan.preparedAt, "Approved by the workspace buyer: " + plan.approval!.approvedAt,
      "Plan fingerprint: " + plan.fingerprint, "", "Independent checks:", ...plan.verification.checks.map(check => "- " + check.label + ": " + (check.ok ? "passed" : "failed")),
      "", "This packet records the buyer's approved purchase plan and the supplied quote evidence."].join("\n");
    return { id, version: view.version, brief, plan, evidence: view.state };
  },
});
