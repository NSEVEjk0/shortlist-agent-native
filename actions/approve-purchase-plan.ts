import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { idSchema, mutationSchema, versionSchema } from "../server/action-schemas.ts";
import { decisionErrors } from "../server/action-errors.ts";
import { humanOnly, mutateDecision } from "../server/store.ts";
import { approvePurchasePlan } from "../server/buying.ts";
export default defineAction({
  description: "The buyer approves the exact currently reviewed purchase plan. Stale, altered or agent-generated approvals are rejected.",
  agentTool: false, mcpTool: false,
  schema: z.object({ id: idSchema, expectedVersion: versionSchema, fingerprint: z.string().length(64), confirmed: z.boolean() }), outputSchema: mutationSchema, errors: decisionErrors,
  run: async ({ id, expectedVersion, fingerprint, confirmed }, ctx) => {
    humanOnly(ctx);
    return mutateDecision({ id, expectedVersion, ctx, kind: "plan_approved", summary: "Approved the exact reviewed purchase plan", change: state => approvePurchasePlan(state, fingerprint, expectedVersion, confirmed) });
  },
});
