export const SHORTLIST_MIGRATIONS = [{
  name: "shortlist_initial",
  version: 1,
  sql: "CREATE TABLE IF NOT EXISTS shortlist_decisions (id TEXT PRIMARY KEY, owner_email TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, state JSONB NOT NULL, updated_at TEXT NOT NULL); CREATE INDEX IF NOT EXISTS shortlist_owner_updated ON shortlist_decisions(owner_email, updated_at); CREATE TABLE IF NOT EXISTS shortlist_events (id TEXT PRIMARY KEY, decision_id TEXT NOT NULL REFERENCES shortlist_decisions(id), owner_email TEXT NOT NULL, version INTEGER NOT NULL, kind TEXT NOT NULL, actor TEXT NOT NULL, summary TEXT NOT NULL, previous_winner TEXT, next_winner TEXT, before_state JSONB NOT NULL, created_at TEXT NOT NULL); CREATE UNIQUE INDEX IF NOT EXISTS shortlist_event_version ON shortlist_events(decision_id, version); CREATE INDEX IF NOT EXISTS shortlist_events_owner ON shortlist_events(owner_email, decision_id); CREATE TABLE IF NOT EXISTS shortlist_ai_budgets (id TEXT PRIMARY KEY, used INTEGER NOT NULL DEFAULT 0);",
}, {
  name: "shortlist_budget_scope",
  version: 2,
  sql: "ALTER TABLE shortlist_ai_budgets ADD COLUMN IF NOT EXISTS owner_email TEXT; UPDATE shortlist_ai_budgets SET owner_email = CASE WHEN id LIKE 'global:%' THEN '__shortlist_sponsored_system__' ELSE regexp_replace(id, ':[0-9]{4}-[0-9]{2}-[0-9]{2}$', '') END WHERE owner_email IS NULL; ALTER TABLE shortlist_ai_budgets ALTER COLUMN owner_email SET NOT NULL;",
}];
