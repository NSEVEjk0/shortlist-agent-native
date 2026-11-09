import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { idSchema, mutationSchema, permissionsSchema, versionSchema } from "../server/action-schemas.ts";
import { decisionErrors } from "../server/action-errors.ts";
import { humanOnly, mutateDecision } from "../server/store.ts";
import { updatePermissions } from "../server/buying.ts";
export default defineAction({
  description: "The buyer chooses or revokes the agent's current write permissions. Agent tools cannot grant themselves authority.",
  agentTool: false, mcpTool: false,
  schema: z.object({ id: idSchema, expectedVersion: versionSchema, allowed: permissionsSchema.shape.allowed }), outputSchema: mutationSchema, errors: decisionErrors,
  run: async ({ id, expectedVersion, allowed }, ctx) => {
    humanOnly(ctx);
    return mutateDecision({ id, expectedVersion, ctx, kind: "permissions", summary: "Updated what the agent may change", change: state => updatePermissions(state, allowed) });
  },
});
