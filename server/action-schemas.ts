import { z } from "zod";
export const idSchema = z.string().min(1).max(100).describe("Private decision workspace ID");
export const quoteIdSchema = z.string().min(1).max(100).describe("Supplier quote ID inside this workspace");
export const versionSchema = z.number().int().positive().describe("Current workspace version from get-decision; stale versions are rejected");
export const permissionVersionSchema = z.number().int().positive().optional().describe("For agent changes, current permissions.version from get-decision; stale or missing permission versions are rejected");
export const evidenceSchema = z.object({
  start: z.number().int().min(0).describe("Zero-based UTF-16 start character offset in the original source"),
  end: z.number().int().positive().describe("Exclusive UTF-16 end character offset in the original source"),
  text: z.string().min(1).max(1000).describe("Exact source substring between start and end, without paraphrasing"),
});
export const fieldValueSchema = z.union([z.number().int().min(0), z.string().max(100), z.null()]);
export const quoteFieldSchema = z.object({ value: fieldValueSchema, locked: z.boolean(), origin: z.enum(["source", "manual", "unknown"]), evidence: evidenceSchema.nullable(), note: z.string().nullable() });
export const fieldsSchema = z.object({ quantity: quoteFieldSchema, unitMinor: quoteFieldSchema, shippingMinor: quoteFieldSchema, taxMinor: quoteFieldSchema, currency: quoteFieldSchema, deliveryDate: quoteFieldSchema });
export const exclusionsSchema = z.array(z.object({ text: z.string().min(1).max(300).describe("Concise exclusion stated by the supplier"), evidence: evidenceSchema })).max(12);
export const quoteSchema = z.object({ id: z.string(), supplier: z.string(), source: z.string(), sourceHash: z.string(), fields: fieldsSchema, exclusions: exclusionsSchema, termsReviewed: z.boolean() });
export const requirementsSchema = z.object({
  budgetMinor: z.number().int().min(0).max(100000000).describe("Total maximum budget in integer minor units: 65000 means USD 650.00"),
  quantity: z.number().int().min(1).max(100000).describe("Required exact number of units"),
  currency: z.enum(["USD", "EUR", "GBP"]).describe("Required currency, without conversion"),
  deliveryBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Last acceptable delivery date, YYYY-MM-DD"),
});
export const permissionsSchema = z.object({ version: z.number().int().positive(), allowed: z.object({ extractFacts: z.boolean(), addQuotes: z.boolean(), draftPlans: z.boolean(), changeRequirements: z.boolean() }) });
export const verificationSchema = z.object({ checker: z.string(), passed: z.boolean(), totalMinor: z.number().nullable(), checks: z.array(z.object({ id: z.string(), label: z.string(), ok: z.boolean() })) });
export const planSchema = z.object({
  id: z.string(), fingerprint: z.string().length(64), inputHash: z.string().length(64), preparedVersion: z.number().int().positive(), preparedAt: z.string(), quoteId: z.string(), supplier: z.string(),
  quantity: z.number().int().positive(), currency: z.enum(["USD", "EUR", "GBP"]), unitMinor: z.number().int().min(0), shippingMinor: z.number().int().min(0), taxMinor: z.number().int().min(0), totalMinor: z.number().int().min(0), deliveryDate: z.string(),
  verification: verificationSchema, status: z.enum(["ready", "approved", "outdated"]), approval: z.object({ fingerprint: z.string().length(64), reviewedVersion: z.number().int().positive(), approvedAt: z.string() }).nullable(),
});
export const stateSchema = z.object({ title: z.string(), requirements: requirementsSchema, quotes: z.array(quoteSchema), agentPermissions: permissionsSchema.optional(), purchasePlan: planSchema.optional() });
export const optionSchema = z.object({ quoteId: z.string(), supplier: z.string(), totalMinor: z.number().nullable(), eligible: z.boolean(), extraBudgetMinor: z.number().nullable(), lateDays: z.number().nullable(), maximumUnitMinor: z.number().nullable(), missing: z.array(z.string()), changes: z.array(z.string()), questions: z.string() });
export const assessmentSchema = z.object({ id: z.string(), supplier: z.string(), totalMinor: z.number().nullable(), deliveryDate: z.string().nullable(), eligible: z.boolean(), reasons: z.array(z.string()), warnings: z.array(z.string()) });
export const eventSchema = z.object({ id: z.string(), version: z.number(), kind: z.string(), actor: z.enum(["human", "agent"]), summary: z.string(), previousWinner: z.string().nullable(), nextWinner: z.string().nullable(), createdAt: z.string() });
export const viewSchema = z.object({ id: z.string(), version: z.number(), state: stateSchema, updatedAt: z.string(), recommendation: z.object({ winner: assessmentSchema.nullable(), assessments: z.array(assessmentSchema) }), events: z.array(eventSchema), permissions: permissionsSchema, options: z.array(optionSchema) });
export const receiptSchema = z.object({ changed: z.boolean(), verified: z.boolean(), subject: z.string(), summary: z.string(), checks: z.array(z.object({ id: z.string(), ok: z.boolean() })) });
export const mutationSchema = viewSchema.extend({ _receipt: receiptSchema });
