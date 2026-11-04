import { defineActionErrors } from "@agent-native/core/action";
export const decisionErrors = defineActionErrors("unauthenticated", "human_only", "not_found", "stale_version", "stale_source", "invalid_evidence", "unsupported_value", "invalid_field", "invalid_source", "invalid_requirements", "no_change", "quote_limit", "undo_unavailable");
