import { runAuthGuard } from "@agent-native/core/server";
import { getOrgContext } from "@agent-native/core/org";
import { defineEventHandler } from "h3";

export default defineEventHandler(async (event) => {
  const response = await runAuthGuard(event);
  if (response !== undefined) return response;

  // Resolve the normal framework scope before the first private page hydrates.
  // Otherwise opening chat can initialize the organization after the query
  // cache has bound to personal scope, unmounting the pending submission.
  // The SDK keeps authentication, membership and explicit personal scope intact.
  if (
    ["GET", "HEAD"].includes(event.req.method) &&
    /^\/(?:home|agent|settings|database|access-requests)(?:\/|\.data|$)/.test(event.url.pathname)
  ) {
    await getOrgContext(event);
  }
});
