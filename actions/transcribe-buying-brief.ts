import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { idSchema } from "../server/action-schemas.ts";
import { decisionErrors } from "../server/action-errors.ts";
import { domainFailure, humanOnly, readDecision, requireSponsoredAi } from "../server/store.ts";
import { MAX_BRIEF_BASE64, transcribeBrief } from "../server/voice.ts";
import { VULTR_ASR_MODEL } from "../server/vultr.ts";

export default defineAction({
  description: "Transcribe the buyer's recorded brief using Vultr voice. Returns text for review; never changes requirements or approves a plan.",
  agentTool: false, mcpTool: false, readOnly: true, http: { method: "POST" }, errors: decisionErrors,
  schema: z.object({ id: idSchema, audioBase64: z.string().min(1).max(MAX_BRIEF_BASE64) }),
  outputSchema: z.object({ id: z.string(), version: z.number(), transcript: z.string(), provider: z.literal("Vultr"), model: z.string() }),
  run: async ({ id, audioBase64 }, ctx) => {
    const view = await readDecision(id, humanOnly(ctx));
    requireSponsoredAi();
    try { return { id, version: view.version, transcript: await transcribeBrief(audioBase64, ctx?.signal), provider: "Vultr" as const, model: VULTR_ASR_MODEL }; }
    catch (error) { return domainFailure(error); }
  },
});
