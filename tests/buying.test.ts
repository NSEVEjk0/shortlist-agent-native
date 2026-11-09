import test from "node:test";
import assert from "node:assert/strict";
import { approvePurchasePlan, approvedPurchasePlan, assertCurrentPlan, checkAgentMutation, invalidatePurchasePlan, permissionsFor, preparePurchasePlan, updatePermissions, workableOptions } from "../server/buying.ts";
import { checkPurchasePlan } from "../server/plan-checker.ts";
import { changeQuote, correctField, sampleDecision, withRequirements } from "../server/domain.ts";

test("a real quoted total is independently checked; a one-cent altered plan is rejected", () => {
  const state = preparePurchasePlan(sampleDecision(), "harbor", 2);
  const plan = assertCurrentPlan(state);
  assert.equal(plan.totalMinor, 59500);
  assert.equal(plan.verification.totalMinor, 59500);
  assert.equal(plan.verification.passed, true);
  const changed = checkPurchasePlan(state, { ...plan, totalMinor: plan.totalMinor + 1 });
  assert.equal(changed.passed, false);
  assert.equal(changed.checks.find(item => item.id === "arithmetic")?.ok, false);
});

test("the independent checker rejects source tampering, missing evidence and unsupported requirements", () => {
  const state = preparePurchasePlan(sampleDecision(), "harbor", 2);
  const plan = assertCurrentPlan(state);
  const altered = structuredClone(state);
  altered.quotes.find(q => q.id === "harbor")!.source += "\nChanged terms";
  assert.equal(checkPurchasePlan(altered, plan).passed, false);
  const uncited = structuredClone(state);
  uncited.quotes.find(q => q.id === "harbor")!.fields.unitMinor.evidence = null;
  assert.equal(checkPurchasePlan(uncited, plan).passed, false);
  assert.equal(checkPurchasePlan(withRequirements(state, { quantity: 101 }), plan).passed, false);
  assert.equal(checkPurchasePlan(withRequirements(state, { budgetMinor: 59000 }), plan).passed, false);
  assert.equal(checkPurchasePlan(withRequirements(state, { currency: "GBP" }), plan).passed, false);
});

test("approval binds the exact plan and prepared revision; another plan cannot replay it", () => {
  const first = preparePurchasePlan(sampleDecision(), "harbor", 2);
  const plan = assertCurrentPlan(first);
  assert.throws(() => approvePurchasePlan(first, "0".repeat(64), 2, true));
  assert.throws(() => approvePurchasePlan(first, plan.fingerprint, 1, true));
  assert.throws(() => approvePurchasePlan(first, plan.fingerprint, 2, false));
  assert.throws(() => approvedPurchasePlan(first));
  const approved = approvePurchasePlan(first, plan.fingerprint, 2, true);
  assert.equal(approvedPurchasePlan(approved).status, "approved");
  const second = preparePurchasePlan(sampleDecision(), "harbor", 3);
  assert.throws(() => approvePurchasePlan(second, plan.fingerprint, 3, true));
  assert.throws(() => approvePurchasePlan(approved, plan.fingerprint, 2, true));
});

test("changed costs, locked delivery, mandate and permissions all invalidate a reviewed plan", () => {
  const prepared = preparePurchasePlan(sampleDecision(), "harbor", 2);
  const plan = assertCurrentPlan(prepared);
  const approved = approvePurchasePlan(prepared, plan.fingerprint, 2, true);
  const variations = [
    withRequirements(approved, { budgetMinor: 70000 }),
    changeQuote(approved, "harbor", q => correctField(q, "shippingMinor", 8100, "Supplier updated shipping")),
    changeQuote(approved, "harbor", q => correctField(q, "deliveryDate", "2026-11-13", "Supplier confirmed delivery")),
    updatePermissions(approved, { ...permissionsFor(approved).allowed, draftPlans: false }),
  ];
  for (const changed of variations) assert.throws(() => approvedPurchasePlan(changed));
  const restored = invalidatePurchasePlan(structuredClone(approved));
  assert.equal(restored.purchasePlan?.status, "outdated");
  assert.equal(restored.purchasePlan?.approval, null);
  assert.throws(() => approvedPurchasePlan(restored));
});

test("revoked and stale permissions block writes while quote comparisons remain useful", () => {
  const state = sampleDecision();
  assert.doesNotThrow(() => checkAgentMutation(state, "extraction", 1));
  assert.throws(() => checkAgentMutation(state, "requirements", 1));
  assert.throws(() => checkAgentMutation(state, "extraction", undefined));
  const revoked = updatePermissions(state, { extractFacts: false, addQuotes: false, draftPlans: false, changeRequirements: false });
  assert.throws(() => checkAgentMutation(revoked, "extraction", 1));
  assert.throws(() => checkAgentMutation(revoked, "extraction", 2));
  assert.equal(workableOptions(revoked).filter(option => option.eligible).length, 3);
  const narrowed = updatePermissions(state, { ...permissionsFor(state).allowed, addQuotes: false });
  assert.throws(() => checkAgentMutation(narrowed, "extraction", 1));
  assert.doesNotThrow(() => checkAgentMutation(narrowed, "extraction", 2));
  assert.throws(() => checkAgentMutation(narrowed, "plan_approved", 2));
});

test("workable options calculate precise negotiation targets and delivery changes", () => {
  const delayed = changeQuote(sampleDecision(), "cedar", quote => correctField(quote, "deliveryDate", "2026-11-18", "Supplier confirmed the delay"));
  const state = withRequirements(delayed, { budgetMinor: 59000 });
  const options = workableOptions(state);
  const harbor = options.find(item => item.quoteId === "harbor")!;
  assert.equal(harbor.extraBudgetMinor, 500);
  assert.equal(harbor.maximumUnitMinor, 510);
  assert.match(harbor.questions, /\$5\.10 or less/);
  assert.match(harbor.questions, /currently stated shipping and tax unchanged/);
  assert.equal(options.find(item => item.quoteId === "cedar")?.lateDays, 4);
  assert.match(options.find(item => item.quoteId === "cedar")!.questions, /2026-11-14/);
  assert.equal(workableOptions(withRequirements(state, { currency: "GBP" })).find(item => item.quoteId === "harbor")!.maximumUnitMinor, null);
  assert.equal(workableOptions(withRequirements(state, { quantity: 95 })).find(item => item.quoteId === "harbor")!.maximumUnitMinor, null);
});

test("unknown facts produce actionable questions and block purchase approval", () => {
  const state = sampleDecision();
  state.quotes[0]!.fields.taxMinor.value = null;
  state.quotes[0]!.termsReviewed = false;
  const option = workableOptions(state).find(item => item.quoteId === "cedar")!;
  assert.equal(option.eligible, false);
  assert.equal(option.totalMinor, null);
  assert.ok(option.missing.length >= 2);
  assert.throws(() => preparePurchasePlan(state, "cedar", 2));
});
