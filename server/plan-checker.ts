import { createHash } from "node:crypto";
import { FIELD_KEYS, type DecisionState, type PlanVerification, type PurchasePlan, type Quote } from "../shared/types.ts";

export const PLAN_CHECKER = "shortlist-independent-integer-checker-v1";
function dateValid(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(value + "T12:00:00Z");
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}
function evidenceValid(quote: Quote): boolean {
  return FIELD_KEYS.every(key => {
    const fact = quote.fields[key];
    if (fact.origin === "manual") return typeof fact.note === "string" && fact.note.trim().length >= 3;
    if (fact.origin !== "source" || !fact.evidence) return false;
    const cite = fact.evidence;
    return Number.isSafeInteger(cite.start) && Number.isSafeInteger(cite.end) && cite.start >= 0 && cite.end > cite.start && cite.end <= quote.source.length && quote.source.slice(cite.start, cite.end) === cite.text;
  }) && quote.exclusions.every(exclusion => {
    const cite = exclusion.evidence;
    return Number.isSafeInteger(cite.start) && Number.isSafeInteger(cite.end) && cite.start >= 0 && cite.end > cite.start && cite.end <= quote.source.length && quote.source.slice(cite.start, cite.end) === cite.text;
  });
}

// A separate implementation from quote ranking. Recompute integer arithmetic
// with BigInt and check the selected plan against the actual saved inputs.
export function checkPurchasePlan(state: DecisionState, plan: Pick<PurchasePlan, "quoteId" | "supplier" | "quantity" | "currency" | "unitMinor" | "shippingMinor" | "taxMinor" | "totalMinor" | "deliveryDate">): PlanVerification {
  const quote = state.quotes.find(item => item.id === plan.quoteId);
  const checks: PlanVerification["checks"] = [];
  const add = (id: string, label: string, ok: boolean) => checks.push({ id, label, ok });
  if (!quote) return { checker: PLAN_CHECKER, passed: false, totalMinor: null, checks: [{ id: "supplier", label: "Supplier quote exists", ok: false }] };
  const values = [quote.fields.quantity.value, quote.fields.unitMinor.value, quote.fields.shippingMinor.value, quote.fields.taxMinor.value];
  const validNumbers = values.every(value => typeof value === "number" && Number.isSafeInteger(value) && value >= 0) && Number(values[0]) > 0;
  let totalMinor: number | null = null;
  if (validNumbers) {
    const [quantity, unit, shipping, tax] = values.map(value => BigInt(Number(value)));
    const total = quantity! * unit! + shipping! + tax!;
    if (total <= BigInt(Number.MAX_SAFE_INTEGER)) totalMinor = Number(total);
  }
  const req = state.requirements;
  add("source", "Original quote fingerprint matches", createHash("sha256").update(quote.source).digest("hex") === quote.sourceHash);
  add("evidence", "Source excerpts and recorded corrections are present", evidenceValid(quote));
  add("numbers", "Amounts and quantity use exact integers", validNumbers && totalMinor !== null);
  add("arithmetic", "Total independently recalculated", totalMinor !== null && totalMinor === plan.totalMinor && quote.fields.unitMinor.value === plan.unitMinor && quote.fields.shippingMinor.value === plan.shippingMinor && quote.fields.taxMinor.value === plan.taxMinor);
  add("supplier", "Plan names the current supplier", plan.supplier === quote.supplier);
  add("quantity", "Quantity matches your requirement", quote.fields.quantity.value === req.quantity && plan.quantity === req.quantity);
  add("currency", "Currency matches your budget", ["USD", "EUR", "GBP"].includes(req.currency) && quote.fields.currency.value === req.currency && plan.currency === req.currency);
  add("budget", "Complete cost fits your budget", Number.isSafeInteger(req.budgetMinor) && req.budgetMinor >= 0 && totalMinor !== null && totalMinor <= req.budgetMinor);
  add("delivery", "Delivery fits your deadline", dateValid(req.deliveryBy) && dateValid(quote.fields.deliveryDate.value) && plan.deliveryDate === quote.fields.deliveryDate.value && plan.deliveryDate <= req.deliveryBy);
  add("terms", "Supplier exclusions have been reviewed", quote.termsReviewed === true);
  return { checker: PLAN_CHECKER, passed: checks.every(check => check.ok), totalMinor, checks };
}
