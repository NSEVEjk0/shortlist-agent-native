import test from "node:test";
import assert from "node:assert/strict";
import { applyExtraction, changeQuote, correctField, DecisionError, excerpt, newQuote, recommend, replaceSource, sampleDecision, stateHash, validDate, withRequirements } from "../server/domain.ts";
import { moneyInput } from "../shared/format.ts";
import type { DecisionState, Extraction } from "../shared/types.ts";

function quoteAt(state: DecisionState, index: number) { const quote = state.quotes[index]; assert.ok(quote); return quote; }

test("state fingerprints survive reordered JSON object properties without ignoring content or array order", () => {
  const original = sampleDecision();
  const reordered = JSON.parse(JSON.stringify(original, (_key, value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) return Object.fromEntries(Object.entries(value).reverse());
    return value;
  })) as DecisionState;
  assert.deepEqual(reordered, original);
  assert.notEqual(JSON.stringify(reordered), JSON.stringify(original));
  assert.equal(stateHash(reordered), stateHash(original));
  assert.notEqual(stateHash(withRequirements(original, { budgetMinor: 59000 })), stateHash(original));
  const editedSource = structuredClone(original);
  quoteAt(editedSource, 0).source += "\n";
  assert.notEqual(stateHash(editedSource), stateHash(original));
  const reorderedQuotes = structuredClone(original);
  reorderedQuotes.quotes.reverse();
  assert.notEqual(stateHash(reorderedQuotes), stateHash(original));
});

test("a complete decision changes supplier as constraints change while a human correction survives", () => {
  let state = sampleDecision();
  assert.equal(recommend(state).winner?.id, "cedar");
  state = changeQuote(state, "cedar", q => correctField(q, "deliveryDate", "2026-11-18", "Supplier confirmed the delay"));
  assert.equal(recommend(state).winner?.id, "harbor");
  const cedar = quoteAt(state, 0);
  const reapplied = applyExtraction(cedar, cedar.sourceHash, { fields: { deliveryDate: { value: "2026-11-13", evidence: excerpt(cedar.source, "Delivery: November 13, 2026") } }, exclusions: cedar.exclusions, termsReviewed: true });
  assert.deepEqual(reapplied.preserved, ["deliveryDate"]);
  assert.equal(reapplied.quote.fields.deliveryDate.value, "2026-11-18");
  state = withRequirements(state, { budgetMinor: 59000 });
  assert.equal(recommend(state).winner, null);
  state = withRequirements(state, { budgetMinor: 65000, deliveryBy: "2026-11-10" });
  assert.equal(recommend(state).winner?.id, "rushline");
  assert.equal(quoteAt(state, 0).fields.deliveryDate.locked, true);
});

test("exact minor-unit arithmetic includes shipping and tax", () => {
  const state = sampleDecision();
  assert.deepEqual(recommend(state).assessments.map(q => q.totalMinor), [57500, 59500, 62500]);
  assert.equal(moneyInput("0.29"), 29);
  assert.equal(moneyInput("100.1"), 10010);
  assert.throws(() => moneyInput("1.005"));
});

test("a mismatched source or made-up citation cannot enter a recommendation", () => {
  const q = quoteAt(sampleDecision(), 0);
  const extraction: Extraction = { fields: { unitMinor: { value: 540, evidence: excerpt(q.source, "Unit price: $5.40 USD") } }, exclusions: [], termsReviewed: true };
  assert.throws(() => applyExtraction(q, "old-revision", extraction), (e: unknown) => e instanceof DecisionError && e.code === "stale_source");
  extraction.fields.unitMinor!.evidence.text = "Unit price: $0.01 USD";
  assert.throws(() => applyExtraction(q, q.sourceHash, extraction), (e: unknown) => e instanceof DecisionError && e.code === "invalid_evidence");
  extraction.fields.unitMinor!.evidence = excerpt(q.source, "Unit price: $5.40 USD");
  extraction.fields.unitMinor!.value = 1;
  assert.throws(() => applyExtraction(q, q.sourceHash, extraction), (e: unknown) => e instanceof DecisionError && e.code === "unsupported_value");
});

test("unknown, different-currency, unreviewed and incorrectly sized quotes are ineligible", () => {
  const state = sampleDecision();
  state.quotes = [newQuote("Unclear supplier", "Price is negotiable")];
  assert.equal(recommend(state).winner, null);
  state.quotes = [quoteAt(sampleDecision(), 0)];
  quoteAt(state, 0).fields.currency.value = "EUR";
  assert.equal(recommend(state).winner, null);
  quoteAt(state, 0).fields.currency.value = "USD";
  quoteAt(state, 0).fields.quantity.value = 10;
  assert.equal(recommend(state).winner, null);
  quoteAt(state, 0).fields.quantity.value = 100;
  quoteAt(state, 0).termsReviewed = false;
  assert.equal(recommend(state).winner, null);
});

test("a revised source invalidates extracted values and preserves explicitly locked corrections", () => {
  const q = correctField(quoteAt(sampleDecision(), 0), "deliveryDate", "2026-11-18", "Confirmed by supplier");
  const next = replaceSource(q, "Revised quote: $10 per unit");
  assert.notEqual(next.sourceHash, q.sourceHash);
  assert.equal(next.fields.unitMinor.value, null);
  assert.equal(next.fields.deliveryDate.value, "2026-11-18");
  assert.equal(next.termsReviewed, false);
  assert.deepEqual(next.exclusions, []);
});

test("calendar validation rejects rollover dates and money rejects unsafe amounts", () => {
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("2028-02-29"), true);
  assert.throws(() => withRequirements(sampleDecision(), { budgetMinor: -1 }));
  assert.throws(() => correctField(quoteAt(sampleDecision(), 0), "unitMinor", 1.1, "Corrected"));
});

test("sorting is deterministic when equally priced quotes arrive on different dates", () => {
  const state = sampleDecision();
  state.quotes[1] = correctField(quoteAt(state, 1), "shippingMinor", 6000, "Supplier reduced shipping");
  assert.equal(recommend(state).winner?.id, "harbor");
});
