import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { idSchema } from "../server/action-schemas.ts";
import { decisionErrors } from "../server/action-errors.ts";
import { domainFailure, humanOnly, readDecision, requireSponsoredAi } from "../server/store.ts";
import { decisionExplanation, speakDecision } from "../server/voice.ts";
import { VULTR_SPEECH_MODEL } from "../server/vultr.ts";

export default defineAction({
  description: "Read the current comparison or checked purchase plan aloud with Vultr voice. Speech cannot change facts, permissions or approval.",
  agentTool: false, mcpTool: false, readOnly: true, http: { method: "POST" }, errors: decisionErrors,
  schema: z.object({ id: idSchema }),
  outputSchema: z.object({ id: z.string(), version: z.number(), text: z.string(), audioBase64: z.string(), mimeType: z.literal("audio/wav"), provider: z.literal("Vultr"), model: z.string() }),
  run: async ({ id }, ctx) => {
    const view = await readDecision(id, humanOnly(ctx));
    requireSponsoredAi();
    const text = decisionExplanation(view);
    try { return { id, version: view.version, text, audioBase64: await speakDecision(text, ctx?.signal), mimeType: "audio/wav" as const, provider: "Vultr" as const, model: VULTR_SPEECH_MODEL }; }
    catch (error) { return domainFailure(error); }
  },
});
