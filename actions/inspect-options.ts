import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { idSchema, optionSchema, permissionsSchema } from "../server/action-schemas.ts";
import { decisionErrors } from "../server/action-errors.ts";
import { readDecision, requireOwner } from "../server/store.ts";
import { buyingInputHash } from "../server/buying.ts";
export default defineAction({
  description: "Find a workable option: read exact budget shortfalls, delivery changes, missing facts, price targets and supplier-question drafts from current quotes. Does not change the buyer's requirements or contact suppliers.",
  schema: z.object({ id: idSchema }), errors: decisionErrors, readOnly: true, http: { method: "GET" },
  outputSchema: z.object({ id: z.string(), version: z.number(), inputHash: z.string(), permissions: permissionsSchema, options: z.array(optionSchema) }),
  run: async ({ id }, ctx) => {
    const view = await readDecision(id, requireOwner(ctx));
    return { id, version: view.version, inputHash: buyingInputHash(view.state), permissions: view.permissions, options: view.options };
  },
});
