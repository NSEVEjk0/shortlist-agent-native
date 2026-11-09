import { runMigrations } from "@agent-native/core/db";
import { SHORTLIST_MIGRATIONS } from "../db/migrations.ts";

export default runMigrations(SHORTLIST_MIGRATIONS, { table: "shortlist_migrations" });
