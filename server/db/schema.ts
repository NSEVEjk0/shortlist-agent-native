import { index, integer, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import type { DecisionState } from "../../shared/types.ts";

export const decisions = pgTable("shortlist_decisions", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  version: integer("version").notNull().default(1),
  state: jsonb("state").$type<DecisionState>().notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [index("shortlist_owner_updated").on(table.ownerEmail, table.updatedAt)]);

export const decisionEvents = pgTable("shortlist_events", {
  id: text("id").primaryKey(),
  decisionId: text("decision_id").notNull().references(() => decisions.id),
  ownerEmail: text("owner_email").notNull(),
  version: integer("version").notNull(),
  kind: text("kind").notNull(),
  actor: text("actor").$type<"human" | "agent">().notNull(),
  summary: text("summary").notNull(),
  previousWinner: text("previous_winner"),
  nextWinner: text("next_winner"),
  beforeState: jsonb("before_state").$type<DecisionState>().notNull(),
  createdAt: text("created_at").notNull(),
}, table => [uniqueIndex("shortlist_event_version").on(table.decisionId, table.version), index("shortlist_events_owner").on(table.ownerEmail, table.decisionId)]);

export const aiBudgets = pgTable("shortlist_ai_budgets", {
  id: text("id").primaryKey(),
  used: integer("used").notNull().default(0),
});
