import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { idSchema, mutationSchema, permissionVersionSchema, requirementsSchema, versionSchema } from "../server/action-schemas.ts";
import { decisionErrors } from "../server/action-errors.ts";
import { withRequirements } from "../server/domain.ts";
import { mutateDecision } from "../server/store.ts";
export default defineAction({
  description: "Change a decision's budget, exact quantity, currency or delivery deadline at the current version. Recalculates without altering supplier facts or locks.",
  schema: z.object({ id: idSchema, expectedVersion: versionSchema, permissionVersion: permissionVersionSchema, patch: requirementsSchema.partial().describe("Only the requirements to change; amounts are integer minor units and dates are YYYY-MM-DD") }),
  outputSchema: mutationSchema, errors: decisionErrors,
  run: async ({ id, expectedVersion, permissionVersion, patch }, ctx) => mutateDecision({ id, expectedVersion, permissionVersion, ctx, kind: "requirements", summary: "Updated your buying requirements", change: state => withRequirements(state, patch) }),
});
