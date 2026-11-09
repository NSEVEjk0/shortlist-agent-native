import { randomUUID } from "node:crypto";
import { AGENT_CAPABILITIES, FIELD_KEYS, type AgentCapability, type AgentPermissions, type DecisionState, type PurchasePlan, type WorkableOption } from "../shared/types.ts";
import { FIELD_LABELS, money } from "../shared/format.ts";
import { assessQuote, contentHash, DecisionError, validDate } from "./domain.ts";
import { checkPurchasePlan } from "./plan-checker.ts";

export function permissionsFor(state: DecisionState): AgentPermissions {
  return state.agentPermissions ?? { version: 1, allowed: { extractFacts: true, addQuotes: true, draftPlans: true, changeRequirements: false } };
}
const capabilities: Record<string, AgentCapability> = { extraction: "extractFacts", quote_added: "addQuotes", plan_prepared: "draftPlans", requirements: "changeRequirements" };
export function checkAgentMutation(state: DecisionState, kind: string, permissionVersion: number | undefined) {
  const permissions = permissionsFor(state);
  if (permissionVersion !== permissions.version) throw new DecisionError("stale_permission", "Your agent permissions changed. Read the current workspace before acting again.");
  const capability = capabilities[kind];
  if (!capability || !permissions.allowed[capability]) throw new DecisionError("permission_denied", "This change is outside the agent's current permissions. You can still read and compare the quotes.");
}
export function updatePermissions(state: DecisionState, allowed: AgentPermissions["allowed"]): DecisionState {
  if (AGENT_CAPABILITIES.some(key => typeof allowed[key] !== "boolean")) throw new DecisionError("permission_denied", "Choose the changes you want the agent to make.");
  return { ...structuredClone(state), agentPermissions: { version: permissionsFor(state).version + 1, allowed: { ...allowed } } };
}
export function buyingInputHash(state: DecisionState): string {
  return contentHash({ title: state.title, requirements: state.requirements, quotes: state.quotes, permissions: permissionsFor(state) });
}
function planFingerprint(plan: PurchasePlan): string {
  const { fingerprint: _fingerprint, status: _status, approval: _approval, ...content } = plan;
  return contentHash(content);
}
export function preparePurchasePlan(state: DecisionState, quoteId: string, nextVersion: number, now = new Date().toISOString()): DecisionState {
  const quote = state.quotes.find(item => item.id === quoteId);
  if (!quote) throw new DecisionError("not_found", "Choose a current supplier quote.");
  const assessed = assessQuote(quote, state.requirements);
  if (!assessed.eligible || assessed.totalMinor === null || !assessed.deliveryDate) throw new DecisionError("verification_failed", "This quote needs changes before a purchase plan can be prepared: " + assessed.reasons.join("; "));
  const plan: PurchasePlan = {
    id: randomUUID(), fingerprint: "", inputHash: buyingInputHash(state), preparedVersion: nextVersion, preparedAt: now,
    quoteId, supplier: quote.supplier, quantity: state.requirements.quantity, currency: state.requirements.currency,
    unitMinor: Number(quote.fields.unitMinor.value), shippingMinor: Number(quote.fields.shippingMinor.value), taxMinor: Number(quote.fields.taxMinor.value),
    totalMinor: assessed.totalMinor, deliveryDate: assessed.deliveryDate,
    verification: { checker: "", passed: false, totalMinor: null, checks: [] }, status: "ready", approval: null,
  };
  plan.verification = checkPurchasePlan(state, plan);
  if (!plan.verification.passed) throw new DecisionError("verification_failed", "The independent plan checks did not pass. Review the current quote and requirements.");
  plan.fingerprint = planFingerprint(plan);
  return { ...structuredClone(state), purchasePlan: plan };
}
export function assertCurrentPlan(state: DecisionState): PurchasePlan {
  const plan = state.purchasePlan;
  if (!plan) throw new DecisionError("plan_unavailable", "Prepare a purchase plan first.");
  if (plan.status === "outdated" || plan.inputHash !== buyingInputHash(state) || plan.fingerprint !== planFingerprint(plan)) throw new DecisionError("stale_plan", "The quote, requirements or permissions changed. Prepare a fresh plan before approval or export.");
  const checked = checkPurchasePlan(state, plan);
  if (!checked.passed || contentHash(checked) !== contentHash(plan.verification)) throw new DecisionError("verification_failed", "The purchase plan no longer passes its independent checks.");
  return plan;
}
export function approvePurchasePlan(state: DecisionState, fingerprint: string, reviewedVersion: number, confirmed: boolean, now = new Date().toISOString()): DecisionState {
  if (confirmed !== true) throw new DecisionError("invalid_approval", "Review the exact supplier, cost, delivery and terms before approving.");
  const plan = assertCurrentPlan(state);
  if (plan.status !== "ready" || fingerprint !== plan.fingerprint || reviewedVersion !== plan.preparedVersion) throw new DecisionError("invalid_approval", "This approval does not match the current plan and review version.");
  return { ...structuredClone(state), purchasePlan: { ...plan, status: "approved", approval: { fingerprint, reviewedVersion, approvedAt: now } } };
}
export function invalidatePurchasePlan(state: DecisionState): DecisionState {
  if (!state.purchasePlan) return state;
  return { ...state, purchasePlan: { ...state.purchasePlan, status: "outdated", approval: null } };
}
export function approvedPurchasePlan(state: DecisionState): PurchasePlan {
  const plan = assertCurrentPlan(state);
  if (plan.status !== "approved" || plan.approval?.fingerprint !== plan.fingerprint || plan.approval.reviewedVersion !== plan.preparedVersion) throw new DecisionError("approval_required", "Approve the reviewed plan before downloading its purchase packet.");
  return plan;
}

export function workableOptions(state: DecisionState): WorkableOption[] {
  const req = state.requirements;
  return state.quotes.map(quote => {
    const assessed = assessQuote(quote, req);
    const sameCurrency = quote.fields.currency.value === req.currency;
    const missing: string[] = FIELD_KEYS.filter(key => quote.fields[key].value === null).map(key => FIELD_LABELS[key]);
    if (!quote.termsReviewed) missing.push("Review of supplier exclusions");
    const extraBudgetMinor = sameCurrency && assessed.totalMinor !== null ? Math.max(0, assessed.totalMinor - req.budgetMinor) : null;
    const delivery = assessed.deliveryDate;
    const lateDays = validDate(delivery) ? Math.max(0, Math.round((Date.parse(delivery + "T12:00:00Z") - Date.parse(req.deliveryBy + "T12:00:00Z")) / 86_400_000)) : null;
    const shipping = quote.fields.shippingMinor.value;
    const tax = quote.fields.taxMinor.value;
    const available = typeof shipping === "number" && typeof tax === "number" ? req.budgetMinor - shipping - tax : -1;
    const maximumUnitMinor = sameCurrency && quote.fields.quantity.value === req.quantity && available >= 0 ? Math.floor(available / req.quantity) : null;
    const changes: string[] = [];
    if (extraBudgetMinor) changes.push("Reduce the total by " + money(extraBudgetMinor, req.currency) + " or review a budget of " + money(assessed.totalMinor, req.currency) + ".");
    if (lateDays) changes.push("Confirm delivery " + lateDays + " day" + (lateDays === 1 ? "" : "s") + " earlier, by " + req.deliveryBy + ".");
    if (quote.fields.currency.value !== null && !sameCurrency) changes.push("Request a quote in " + req.currency + ".");
    if (quote.fields.quantity.value !== null && quote.fields.quantity.value !== req.quantity) changes.push("Request a price for exactly " + req.quantity + " units.");
    if (missing.length) changes.push("Confirm: " + missing.join(", ") + ".");
    if (!changes.length) changes.push("This quote meets your reviewed requirements.");
    const lines = ["Hello " + quote.supplier + ",", "", "We need " + req.quantity + " units, delivered by " + req.deliveryBy + ", with a complete budget of " + money(req.budgetMinor, req.currency) + "."];
    if (sameCurrency && assessed.totalMinor !== null) lines.push("Your current quote totals " + money(assessed.totalMinor, req.currency) + " using the stated unit price, shipping and tax.");
    if (extraBudgetMinor) {
      lines.push("Can you provide a revised quote at or below " + money(req.budgetMinor, req.currency) + " in total?");
      if (maximumUnitMinor !== null) lines.push("With the currently stated shipping and tax unchanged, the unit price would need to be " + money(maximumUnitMinor, req.currency) + " or less. Please confirm any changes to those charges.");
    }
    if (lateDays || delivery === null) lines.push("Can you confirm delivery by " + req.deliveryBy + "?");
    if (!sameCurrency) lines.push("Please provide the quote in " + req.currency + ".");
    if (quote.fields.quantity.value !== req.quantity) lines.push("Please confirm the price applies to exactly " + req.quantity + " units.");
    if (missing.length) lines.push("Please confirm these missing details: " + missing.join(", ") + ".");
    lines.push("Please include the final unit price, shipping, tax, delivery date and any exclusions in the written quote.");
    if (quote.exclusions.length) lines.push("We have noted these stated exclusions: " + quote.exclusions.map(item => item.text).join("; ") + ".");
    lines.push("", "Thank you.");
    return { quoteId: quote.id, supplier: quote.supplier, totalMinor: assessed.totalMinor, eligible: assessed.eligible, extraBudgetMinor, lateDays, maximumUnitMinor, missing, changes, questions: lines.join("\n") };
  });
}
