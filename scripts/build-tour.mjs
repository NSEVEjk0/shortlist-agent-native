import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { applyExtraction, changeQuote, correctField, excerpt, recommend, sampleDecision, stateHash, withRequirements } from "../server/domain.ts";

// The public tour records the real domain engine. It does not invoke an agent,
// write a user workspace or introduce an alternate implementation of actions.
const digest = value => createHash("sha256").update(value).digest("hex");
const initial = sampleDecision();
const corrected = changeQuote(initial, "cedar", quote => correctField(quote, "deliveryDate", "2026-11-18", "Supplier confirmed delivery moved to November 18.", true));
const cedar = corrected.quotes.find(quote => quote.id === "cedar");
assert.ok(cedar);
const refresh = applyExtraction(cedar, cedar.sourceHash, {
  fields: { deliveryDate: { value: "2026-11-13", evidence: excerpt(cedar.source, "Delivery: November 13, 2026") } },
  exclusions: cedar.exclusions, termsReviewed: true,
});
assert.deepEqual(refresh.preserved, ["deliveryDate"]);
const refreshed = changeQuote(corrected, "cedar", () => refresh.quote);
const budget = withRequirements(refreshed, { budgetMinor: 59000 });
const earlier = withRequirements(budget, { budgetMinor: 65000, deliveryBy: "2026-11-10" });
const definitions = [
  { id: "compare", title: "Read the complete cost", short: "Compare", detail: "Harbor has the lowest unit price. Cedar has the lowest complete cost once shipping is included.", state: initial, change: "Three fictional quotes, with exact excerpts for each extracted fact.", operation: "sampleDecision", quote: "harbor", field: "shippingMinor" },
  { id: "correct", title: "Keep the supplier's correction", short: "Correct & lock", detail: "The supplier says Cedar will arrive on November 18. Record the reason and lock that date; Harbor now meets the requirements at the lowest total.", state: corrected, change: "Cedar delivery: Nov 13 → Nov 18. Recommendation: Cedar → Harbor.", operation: "correctField", quote: "cedar", field: "deliveryDate" },
  { id: "refresh", title: "Your correction survives a refresh", short: "Refresh source", detail: "Reapplying the date from Cedar's original quote preserves the locked correction. The old source still says November 13; your confirmed date stays November 18.", state: refreshed, change: "Source refresh preserved the locked delivery date. Harbor stays selected.", operation: "applyExtraction", quote: "cedar", field: "deliveryDate", preserved: refresh.preserved },
  { id: "budget", title: "An honest answer when nothing fits", short: "Tighten budget", detail: "At $590, Cedar is late and the other two offers exceed the budget. Shortlist leaves the decision unresolved and explains why.", state: budget, change: "Budget: $650 → $590. Recommendation: Harbor → no eligible offer.", operation: "withRequirements", quote: "harbor", field: "unitMinor" },
  { id: "deadline", title: "Choose for the new deadline", short: "Need it sooner", detail: "Restore the $650 budget and require November 10 delivery. Rushline is the only offer that meets all the requirements. Cedar's correction is still locked.", state: earlier, change: "Budget: $590 → $650. Delivery: Nov 14 → Nov 10. Recommendation: Rushline.", operation: "withRequirements", quote: "rushline", field: "deliveryDate" },
];
assert.deepEqual(definitions.map(step => recommend(step.state).winner?.id ?? null), ["cedar", "harbor", "harbor", null, "rushline"]);
const document = {
  schema: "shortlist-tour-v1", mode: "guided-fictional-domain-snapshots-no-agent",
  engine: { domainSHA256: digest(await readFile(new URL("../server/domain.ts", import.meta.url))), typesSHA256: digest(await readFile(new URL("../shared/types.ts", import.meta.url))) },
  steps: definitions.map(({ state, ...step }) => ({ ...step, state, stateSHA256: stateHash(state), recommendation: recommend(state) })),
};
const target = new URL("../preview/examples/tour.json", import.meta.url);
await mkdir(new URL(".", target), { recursive: true });
const bytes = JSON.stringify(document, null, 2) + "\n";
if (process.argv.includes("--check")) {
  assert.equal(await readFile(target, "utf8"), bytes, "The committed tour no longer matches the decision engine. Run npm run build:tour.");
  console.log("Five tour snapshots match the actual Shortlist decision engine.");
} else {
  await writeFile(target, bytes);
  console.log("Five fictional tour states recorded from the Shortlist decision engine.");
}
