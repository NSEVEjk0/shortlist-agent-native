import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { idSchema, mutationSchema, permissionVersionSchema, quoteIdSchema, versionSchema } from "../server/action-schemas.ts";
import { decisionErrors } from "../server/action-errors.ts";
import { mutateDecision } from "../server/store.ts";
import { preparePurchasePlan } from "../server/buying.ts";
export default defineAction({
  description: "Prepare a purchase plan for a quote that fits the reviewed requirements. Independently recomputes costs and checks evidence, quantity, currency, delivery and terms. Pauses for exact human approval.",
  schema: z.object({ id: idSchema, quoteId: quoteIdSchema, expectedVersion: versionSchema, permissionVersion: permissionVersionSchema }), outputSchema: mutationSchema, errors: decisionErrors,
  run: async ({ id, quoteId, expectedVersion, permissionVersion }, ctx) => mutateDecision({ id, expectedVersion, permissionVersion, ctx, kind: "plan_prepared", summary: "Prepared an independently checked purchase plan", change: state => preparePurchasePlan(state, quoteId, expectedVersion + 1) }),
});
