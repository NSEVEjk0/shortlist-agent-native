import { createHash, randomUUID } from "node:crypto";
import { FIELD_KEYS, type DecisionState, type Evidence, type Extraction, type FieldKey, type FieldValue, type Quote, type QuoteAssessment, type QuoteField, type Recommendation, type Requirements } from "../shared/types.ts";

export class DecisionError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}
function reject(code: string, message: string): never { throw new DecisionError(code, message); }
export const sourceHash = (source: string) => createHash("sha256").update(source).digest("hex");
export const stateHash = (state: DecisionState) => sourceHash(JSON.stringify(state));
const unknown = (): QuoteField => ({ value: null, locked: false, origin: "unknown", evidence: null, note: null });

export function validDate(date: unknown): date is string {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(date + "T12:00:00Z");
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date;
}

export function validateRequirements(value: Requirements) {
  if (!Number.isSafeInteger(value.budgetMinor) || value.budgetMinor < 0 || value.budgetMinor > 100_000_000) reject("invalid_requirements", "Budget must be between zero and one million currency units.");
  if (!Number.isSafeInteger(value.quantity) || value.quantity < 1 || value.quantity > 100_000) reject("invalid_requirements", "Quantity must be a whole number between 1 and 100,000.");
  if (!["USD", "EUR", "GBP"].includes(value.currency)) reject("invalid_requirements", "Choose USD, EUR or GBP. Currency conversion is not performed.");
  if (!validDate(value.deliveryBy)) reject("invalid_requirements", "Delivery deadline must be a valid calendar date in YYYY-MM-DD format.");
}

function validateField(key: FieldKey, value: FieldValue) {
  if (value === null) return;
  if (key === "deliveryDate") {
    if (!validDate(value)) reject("invalid_field", "Use a valid delivery date in YYYY-MM-DD format.");
  } else if (key === "currency") {
    if (!["USD", "EUR", "GBP"].includes(String(value))) reject("invalid_field", "Supported currencies are USD, EUR and GBP.");
  } else if (!Number.isSafeInteger(value) || Number(value) < (key === "quantity" ? 1 : 0) || Number(value) > (key === "quantity" ? 100_000 : 100_000_000)) {
    reject("invalid_field", "Use a nonnegative whole number in minor currency units, or a positive quantity.");
  }
}

export function newQuote(supplier: string, source: string, id: string = randomUUID()): Quote {
  if (!supplier.trim() || supplier.length > 120) reject("invalid_source", "A supplier name is required, up to 120 characters.");
  if (!source.trim() || source.length > 12_000) reject("invalid_source", "Quote text must contain between 1 and 12,000 characters.");
  return { id, supplier: supplier.trim(), source, sourceHash: sourceHash(source), fields: Object.fromEntries(FIELD_KEYS.map(key => [key, unknown()])) as Quote["fields"], exclusions: [], termsReviewed: false };
}

export function assertEvidence(source: string, evidence: Evidence) {
  if (!Number.isSafeInteger(evidence.start) || !Number.isSafeInteger(evidence.end) || evidence.start < 0 || evidence.end <= evidence.start || evidence.end > source.length || evidence.text.length > 1_000 || source.slice(evidence.start, evidence.end) !== evidence.text) {
    reject("invalid_evidence", "The cited text does not match the original quote. Read the current source and use exact character offsets.");
  }
}

function semanticEvidence(key: FieldKey, value: FieldValue, text: string) {
  if (value === null) return;
  if (key === "deliveryDate") {
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const [year, month, day] = String(value).split("-");
    const monthName = months[Number(month) - 1];
    if (!monthName) reject("invalid_field", "The delivery month is not valid.");
    const alternative = monthName + " " + Number(day) + ", " + year;
    if (!text.includes(String(value)) && !text.includes(alternative)) reject("unsupported_value", "The cited text must explicitly contain the delivery date.");
  } else if (key === "currency") {
    const symbols: Record<string, string> = { USD: "$", EUR: "€", GBP: "£" };
    const symbol = symbols[String(value)];
    if (!symbol) reject("invalid_field", "Unsupported currency.");
    if (!text.includes(String(value)) && !text.includes(symbol)) reject("unsupported_value", "The cited text must identify the currency.");
  } else if (key === "quantity") {
    const numbers: string[] = text.match(/\b\d+\b/g) ?? [];
    if (!numbers.includes(String(value))) reject("unsupported_value", "The cited text must explicitly contain the quantity.");
  } else {
    const amounts = [...text.matchAll(/(?:^|[^\d.])(\d{1,7}(?:\.\d{1,2})?)(?![\d.])/g)].map(match => {
      const digits = match[1];
      if (!digits) reject("invalid_evidence", "The cited amount could not be read.");
      const [whole, fraction = ""] = digits.split(".");
      return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    });
    const explicitZero = value === 0 && /\b(free|included|no tax|tax included)\b/i.test(text);
    if (!amounts.includes(Number(value)) && !explicitZero) reject("unsupported_value", "The quoted amount must match the value. Store currency amounts as integer cents.");
  }
}

export function applyExtraction(quote: Quote, expectedSourceHash: string, extraction: Extraction) {
  if (expectedSourceHash !== quote.sourceHash) reject("stale_source", "The quote changed while the agent was reading it. Read the new quote before applying an extraction.");
  const next = structuredClone(quote);
  const preserved: FieldKey[] = [];
  for (const key of FIELD_KEYS) {
    const proposed = extraction.fields[key];
    if (!proposed) continue;
    validateField(key, proposed.value);
    assertEvidence(quote.source, proposed.evidence);
    semanticEvidence(key, proposed.value, proposed.evidence.text);
    if (quote.fields[key].locked) { preserved.push(key); continue; }
    next.fields[key] = { value: proposed.value, locked: false, origin: "source", evidence: proposed.evidence, note: null };
  }
  if (extraction.exclusions.length > 12) reject("invalid_evidence", "A quote can have at most 12 exclusions.");
  for (const exclusion of extraction.exclusions) {
    assertEvidence(quote.source, exclusion.evidence);
    if (!exclusion.text.trim() || exclusion.text.length > 300) reject("invalid_evidence", "Each exclusion needs a concise description.");
  }
  next.exclusions = structuredClone(extraction.exclusions);
  next.termsReviewed = extraction.termsReviewed;
  return { quote: next, preserved };
}

export function correctField(quote: Quote, key: FieldKey, value: FieldValue, note: string, locked = true): Quote {
  if (!FIELD_KEYS.includes(key)) reject("invalid_field", "Unknown quote field.");
  validateField(key, value);
  if (note.trim().length < 3 || note.length > 300) reject("invalid_field", "Add a short reason for the correction.");
  const next = structuredClone(quote);
  next.fields[key] = { value, locked, origin: "manual", evidence: null, note: note.trim() };
  return next;
}

export function replaceSource(quote: Quote, source: string): Quote {
  const next = newQuote(quote.supplier, source, quote.id);
  for (const key of FIELD_KEYS) if (quote.fields[key].locked) next.fields[key] = structuredClone(quote.fields[key]);
  return next;
}

export function assessQuote(quote: Quote, requirements: Requirements): QuoteAssessment {
  const { fields } = quote;
  const reasons: string[] = [];
  const warnings: string[] = [];
  const numeric = (key: FieldKey) => typeof fields[key].value === "number" ? fields[key].value as number : null;
  const quantity = numeric("quantity");
  const unit = numeric("unitMinor");
  const shipping = numeric("shippingMinor");
  const tax = numeric("taxMinor");
  const delivery = typeof fields.deliveryDate.value === "string" ? fields.deliveryDate.value : null;
  const rawTotal = quantity !== null && unit !== null && shipping !== null && tax !== null ? quantity * unit + shipping + tax : null;
  const totalMinor = rawTotal !== null && Number.isSafeInteger(rawTotal) ? rawTotal : null;
  if (totalMinor === null) reasons.push("Total cost is not confirmed");
  if (fields.currency.value !== requirements.currency) reasons.push(fields.currency.value === null ? "Currency is not confirmed" : "Different currency");
  if (quantity !== requirements.quantity) reasons.push(quantity === null ? "Quantity is not confirmed" : "Quoted quantity differs from your requirement");
  if (!delivery) reasons.push("Delivery is not confirmed");
  else if (delivery > requirements.deliveryBy) reasons.push("Arrives after your deadline");
  if (totalMinor !== null && totalMinor > requirements.budgetMinor) reasons.push("Over your budget");
  if (!quote.termsReviewed) reasons.push("Exclusions have not been reviewed");
  if (quote.exclusions.length) warnings.push(...quote.exclusions.map(item => item.text));
  if (FIELD_KEYS.some(key => fields[key].origin === "manual")) warnings.push("Includes your manual corrections");
  return { id: quote.id, supplier: quote.supplier, totalMinor, deliveryDate: delivery, eligible: reasons.length === 0, reasons, warnings };
}

export function recommend(state: DecisionState): Recommendation {
  validateRequirements(state.requirements);
  const assessments = state.quotes.map(quote => assessQuote(quote, state.requirements));
  const feasible = assessments.filter(item => item.eligible).sort((a, b) => {
    const cost = (a.totalMinor ?? 0) - (b.totalMinor ?? 0);
    return cost || (a.deliveryDate ?? "").localeCompare(b.deliveryDate ?? "") || a.id.localeCompare(b.id);
  });
  return { winner: feasible[0] ?? null, assessments };
}

export function withRequirements(state: DecisionState, patch: { [K in keyof Requirements]?: Requirements[K] | undefined }): DecisionState {
  const defined = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as Partial<Requirements>;
  const requirements = { ...state.requirements, ...defined };
  validateRequirements(requirements);
  return { ...structuredClone(state), requirements };
}

export function changeQuote(state: DecisionState, id: string, change: (quote: Quote) => Quote): DecisionState {
  const index = state.quotes.findIndex(quote => quote.id === id);
  if (index === -1) reject("not_found", "That supplier quote no longer exists.");
  const next = structuredClone(state);
  const quote = next.quotes[index];
  if (!quote) reject("not_found", "That supplier quote no longer exists.");
  next.quotes[index] = change(quote);
  return next;
}

export function excerpt(source: string, text: string): Evidence {
  const start = source.indexOf(text);
  if (start < 0) reject("invalid_evidence", "The requested example excerpt was not found.");
  return { start, end: start + text.length, text };
}

export function sampleDecision(): DecisionState {
  const samples = [
    { id: "cedar", supplier: "Cedar Print", source: "Cedar Print — supplier quote\nQuantity: 100 units\nUnit price: $5.40 USD\nShipping: $35.00 USD\nTax: $0.00 USD\nDelivery: November 13, 2026\nExclusions: design services are not included.", unit: 540, shipping: 3500, date: "2026-11-13" },
    { id: "harbor", supplier: "Harbor Studio", source: "Harbor Studio — supplier quote\nQuantity: 100 units\nUnit price: $5.15 USD\nShipping: $80.00 USD\nTax: $0.00 USD\nDelivery: November 12, 2026\nExclusions: design services are not included.", unit: 515, shipping: 8000, date: "2026-11-12" },
    { id: "rushline", supplier: "Rushline", source: "Rushline — supplier quote\nQuantity: 100 units\nUnit price: $6.25 USD\nShipping: free\nTax: $0.00 USD\nDelivery: November 9, 2026\nExclusions: design services are not included.", unit: 625, shipping: 0, date: "2026-11-09" },
  ];
  const quotes = samples.map(sample => {
    const quote = newQuote(sample.supplier, sample.source, sample.id);
    const values: Record<FieldKey, FieldValue> = { quantity: 100, unitMinor: sample.unit, shippingMinor: sample.shipping, taxMinor: 0, currency: "USD", deliveryDate: sample.date };
    const lines = sample.source.split("\n");
    const line = (index: number): string => {
      const value = lines[index];
      if (!value) reject("invalid_evidence", "The example quote is incomplete.");
      return value;
    };
    const evidenceLines: Record<FieldKey, string> = { quantity: line(1), unitMinor: line(2), shippingMinor: line(3), taxMinor: line(4), currency: line(2), deliveryDate: line(5) };
    return applyExtraction(quote, quote.sourceHash, {
      fields: Object.fromEntries(FIELD_KEYS.map(key => [key, { value: values[key], evidence: excerpt(sample.source, evidenceLines[key]) }])) as Extraction["fields"],
      exclusions: [{ text: "Design services are not included", evidence: excerpt(sample.source, line(6)) }],
      termsReviewed: true,
    }).quote;
  });
  return { title: "Workshop welcome kits", requirements: { budgetMinor: 65000, quantity: 100, currency: "USD", deliveryBy: "2026-11-14" }, quotes };
}

export function emptyDecision(title: string): DecisionState {
  if (!title.trim() || title.length > 160) reject("invalid_requirements", "Give your decision a title, up to 160 characters.");
  return { title: title.trim(), requirements: { budgetMinor: 65000, quantity: 100, currency: "USD", deliveryBy: "2026-11-14" }, quotes: [] };
}
