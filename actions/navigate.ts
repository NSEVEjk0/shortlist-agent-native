import { randomUUID } from "node:crypto";
import { defineAction } from "@agent-native/core/action";
import { writeAppStateForCurrentTab } from "@agent-native/core/application-state";
import { z } from "zod";
import { requireOwner } from "../server/store.ts";

export default defineAction({
  description: "Open the Shortlist workspace or a specific decision and supplier without leaving this application.",
  schema: z.object({
    id: z.string().optional().describe("Decision ID to open"),
    quoteId: z.string().optional().describe("Optional supplier quote ID to select"),
  }),
  outputSchema: z.object({ path: z.string(), message: z.string() }),
  http: false,
  run: async ({ id, quoteId }, ctx) => {
    requireOwner(ctx);
    const query = new URLSearchParams();
    if (id) query.set("decision", id);
    if (quoteId) query.set("quote", quoteId);
    const path = "/home" + (query.size ? "?" + query.toString() : "");
    await writeAppStateForCurrentTab("navigate", { path, _writeId: randomUUID() });
    return { path, message: "Opened the requested workspace" };
  },
});
