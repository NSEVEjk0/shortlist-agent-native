export const FIELD_KEYS = ["quantity", "unitMinor", "shippingMinor", "taxMinor", "currency", "deliveryDate"] as const;
export type FieldKey = typeof FIELD_KEYS[number];
export type FieldValue = number | string | null;
export type Evidence = { start: number; end: number; text: string };
export type QuoteField = {
  value: FieldValue;
  locked: boolean;
  origin: "source" | "manual" | "unknown";
  evidence: Evidence | null;
  note: string | null;
};
export type Quote = {
  id: string;
  supplier: string;
  source: string;
  sourceHash: string;
  fields: Record<FieldKey, QuoteField>;
  exclusions: { text: string; evidence: Evidence }[];
  termsReviewed: boolean;
};
export type Requirements = {
  budgetMinor: number;
  quantity: number;
  currency: "USD" | "EUR" | "GBP";
  deliveryBy: string;
};
export type BuyingBrief = {
  transcript: string;
  patch: Partial<Requirements>;
  evidence: Partial<Record<keyof Requirements, string>>;
  notes: string[];
};
export type DecisionState = {
  title: string;
  requirements: Requirements;
  quotes: Quote[];
  agentPermissions?: AgentPermissions;
  purchasePlan?: PurchasePlan;
};
export const AGENT_CAPABILITIES = ["extractFacts", "addQuotes", "draftPlans", "changeRequirements"] as const;
export type AgentCapability = typeof AGENT_CAPABILITIES[number];
export type AgentPermissions = { version: number; allowed: Record<AgentCapability, boolean> };
export type PlanCheck = { id: string; label: string; ok: boolean };
export type PlanVerification = { checker: string; passed: boolean; totalMinor: number | null; checks: PlanCheck[] };
export type PurchasePlan = {
  id: string;
  fingerprint: string;
  inputHash: string;
  preparedVersion: number;
  preparedAt: string;
  quoteId: string;
  supplier: string;
  quantity: number;
  currency: Requirements["currency"];
  unitMinor: number;
  shippingMinor: number;
  taxMinor: number;
  totalMinor: number;
  deliveryDate: string;
  verification: PlanVerification;
  status: "ready" | "approved" | "outdated";
  approval: { fingerprint: string; reviewedVersion: number; approvedAt: string } | null;
};
export type WorkableOption = {
  quoteId: string;
  supplier: string;
  totalMinor: number | null;
  eligible: boolean;
  extraBudgetMinor: number | null;
  lateDays: number | null;
  maximumUnitMinor: number | null;
  missing: string[];
  changes: string[];
  questions: string;
};
export type QuoteAssessment = {
  id: string;
  supplier: string;
  totalMinor: number | null;
  deliveryDate: string | null;
  eligible: boolean;
  reasons: string[];
  warnings: string[];
};
export type Recommendation = {
  winner: QuoteAssessment | null;
  assessments: QuoteAssessment[];
};
export type Extraction = {
  fields: { [K in FieldKey]?: { value: FieldValue; evidence: Evidence } | undefined };
  exclusions: { text: string; evidence: Evidence }[];
  termsReviewed: boolean;
};
export type DecisionRecord = {
  id: string;
  version: number;
  state: DecisionState;
  updatedAt: string;
};
export type DecisionEvent = {
  id: string;
  version: number;
  kind: string;
  actor: "human" | "agent";
  summary: string;
  previousWinner: string | null;
  nextWinner: string | null;
  createdAt: string;
};
export type DecisionView = DecisionRecord & {
  recommendation: Recommendation;
  events: DecisionEvent[];
  permissions: AgentPermissions;
  options: WorkableOption[];
};
