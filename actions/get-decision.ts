import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { idSchema, viewSchema } from "../server/action-schemas.ts";
import { decisionErrors } from "../server/action-errors.ts";
import { readDecision, requireOwner } from "../server/store.ts";
export default defineAction({
  description: "Read a private decision, its current version, deterministic recommendation and recent changes. Unknown facts prevent selection.",
  schema: z.object({ id: idSchema }), outputSchema: viewSchema, errors: decisionErrors,
  http: { method: "GET" }, readOnly: true,
  run: async ({ id }, ctx) => readDecision(id, requireOwner(ctx)),
});
