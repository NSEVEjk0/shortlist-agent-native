# Shortlist

**Choose a supplier with the facts, sources and your corrections in one place.**

Shortlist compares supplier quotes against a budget, quantity, currency and delivery deadline. You can inspect where a fact came from, correct a supplier's date, lock that correction and change the requirements without restarting the decision. The buying agent uses the same actions and PostgreSQL state as the interface.

## A decision you can try

The public [product tour](https://shortlist-buying.vercel.app) uses five preset fictional states recorded by the same domain engine as the private workspace. It includes source inspection, a locked correction, a source refresh, changed constraints, undo of a tour step and an example evidence export. It does not invoke a model or persist a user workspace. `npm run build:tour -- --check` verifies those committed snapshots against the engine; `npm run test:tour` checks the browser flow.

The disclosed example contains three fictional quotes for 100 workshop kits:

| Supplier | Total, including shipping and stated tax | Delivery |
| --- | --- | --- |
| Cedar Print | $575 | November 13, 2026 |
| Harbor Studio | $595 | November 12, 2026 |
| Rushline | $625 | November 9, 2026 |

Start under a $650 budget with November 14 delivery. Cedar is selected. Correct Cedar's date to November 18 and lock it; Harbor becomes the recommendation. Lower the budget to $590; no suitable offer meets all requirements. With a $650 budget and November 10 deadline, Rushline is selected. The locked correction survives.

Select a source-linked fact to highlight its exact quote excerpt. Undo the most recent change or export the decision with its source evidence.

## Why this is useful

- Supplier quotes present costs and dates differently. Shortlist brings them into a common comparison while preserving the original text.
- A fact learned by a person can matter more than an old quote. Corrections keep their reason and can be protected from later agent extraction.
- Requirements change. The recommendation, rejection reasons and decision trail update together.
- An uncertain answer is actionable. Unknown tax, quantity, currency, delivery or unreviewed exclusions prevents an offer being selected.

## Agent-Native integration

Created from the official default scaffold with core/toolkit **0.223.0**, inspected against source revision **f34b2ff2da31192a5a6ce372f33e65a6a9e1dc11**.

Domain operations are registered with defineAction and use the framework's validation, authorization and transport. The interface calls useActionQuery/useActionMutation; the framework agent orchestrates those same actions. Navigation exposes the selected decision and supplier. AI controls hand off to the existing agent sidebar. No duplicate JSON CRUD API or separate AI-only state store is used.

Writes lock the aggregate row, reject stale versions, update state and insert an event in one transaction. Replacing quote text invalidates old extraction. Undo restores content at a new version. Human correction/lock controls are unavailable to agent tools.

## Run and verify

Node 22.22 or newer is required.

1. Install dependencies with npm install.
2. Copy .env.example to .env and generate a stable BETTER_AUTH_SECRET. For local development, PGlite is supported. Hosted deployments require persistent PostgreSQL.
3. Run npm run dev. Open the URL, create an account and try the example.
4. Configure a supported model connection through the framework settings. Quote text and conversation leave the app for that connected provider when the agent runs.

For an isolated PostgreSQL test database, run npm run migrate:production, npm test, npm run typecheck, npm run agent-native:doctor, npm run build and npm run test:browser. The verification workflow performs these checks and retains screenshots/traces on failure. npm run test:domain needs no database or provider key.

The sponsored agent is disabled by default. When an operator enables it, the server requires per-user and global daily turn allowances. Code execution and broad framework tools are disabled for this buying workflow.

## Deployment

The production deployment needs DATABASE_URL for persistent PostgreSQL and BETTER_AUTH_SECRET for stable sessions. Apply migrations before promotion. The framework's documented Vercel build uses NITRO_PRESET=vercel; Node/Docker hosting is also supported.

The separate public tour deploys only the contents of `preview/`, with its nested Vercel configuration. That static configuration is not a deployment of the Agent-Native application. Production database/model connection and a public Clips recording are still required for the contest entry.

Build and integration verification status is recorded by GitHub Actions. A public Builder.io Clips recording is an additional contest requirement; a repository or deployment alone does not complete the entry.

## Practical scope

The first workflow accepts pasted text or CSV. Currency conversion, PDF extraction, purchasing and supplier messaging are outside this version. Exact citations verify that evidence exists in the source; they do not prove a natural-language interpretation is correct. Manual corrections are buyer assertions. Review the source and supplier terms before making a purchase.

MIT. The application scaffold comes from Builder.io's MIT-licensed Agent-Native project; application behavior was developed for Shortlist during the hackathon window.
