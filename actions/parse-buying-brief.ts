import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { idSchema } from "../server/action-schemas.ts";
import { decisionErrors } from "../server/action-errors.ts";
import { domainFailure, humanOnly, readDecision, requireSponsoredAi } from "../server/store.ts";
import { buyingBriefSchema, understandBrief } from "../server/voice.ts";
import { VULTR_AGENT_MODEL } from "../server/vultr.ts";

export default defineAction({
  description: "Propose explicit requirements from a typed or transcribed buying brief using Vultr. The buyer reviews and saves them with the normal versioned requirements action.",
  agentTool: false, mcpTool: false, readOnly: true, http: { method: "POST" }, errors: decisionErrors,
  schema: z.object({ id: idSchema, transcript: z.string().trim().min(3).max(2400) }),
  outputSchema: buyingBriefSchema.extend({ id: z.string(), version: z.number(), provider: z.literal("Vultr"), model: z.string() }),
  run: async ({ id, transcript }, ctx) => {
    const view = await readDecision(id, humanOnly(ctx));
    requireSponsoredAi();
    try { return { ...(await understandBrief(transcript, ctx?.signal)), id, version: view.version, provider: "Vultr" as const, model: VULTR_AGENT_MODEL }; }
    catch (error) { return domainFailure(error); }
  },
});
