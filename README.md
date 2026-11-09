# Shortlist

**Turn a buying brief and supplier quotes into a checked purchase plan.**

Shortlist helps small operations teams decide which supplier to use. Speak or type what you need, add the original quotes, and compare complete costs and delivery. The buying agent extracts facts with exact source excerpts while keeping the corrections you lock. If an offer falls short, Shortlist works out the price, delivery or missing details that would make it fit. You review an independently checked plan, approve its exact version, and download the purchase packet.

[Open Shortlist](https://shortlist-buying.vercel.app/home) · [Watch the workflow](https://clips.agent-native.com/share/3pTj7nJHMTOV) · [Source](https://github.com/NSEVEjk0/shortlist-agent-native) · [Guided tour](https://shortlist-buying.vercel.app/tour/)

The [public Clips demonstration](https://clips.agent-native.com/share/3pTj7nJHMTOV) follows the actual app from the voice brief to the approved purchase packet. It also shows changed shipping clearing approval, undo keeping that approval cleared, and revocation leaving comparisons available. The brief and quotes are fictional; transcription, agent actions, speech and saved changes are actual Vultr and application calls. Vultr supplies the narration. Model waiting time is shortened and disclosed in the film. The same final video is available on the [demo page](https://shortlist-buying.vercel.app/demo/) and as a [downloadable MP4](https://shortlist-buying.vercel.app/demo/shortlist-demo.mp4).

## From the brief to the purchase packet

1. **Explain the purchase.** Create your private workspace. Speak or type the budget, quantity, currency and delivery date. Vultr transcribes the recording and proposes requirements; you review and save them.
2. **Bring the quotes.** Paste supplier text or CSV. The agent reads the original and saves stated prices, shipping, tax, quantities, currency, delivery and exclusions with exact supporting excerpts. Unknown terms remain visible.
3. **Keep what you know.** Correct a date or amount, record why, and lock it. Replacing the original source invalidates old extraction while preserving your locked corrections.
4. **Find a workable offer.** Compare complete totals and delivery. See precise shortfalls, delivery improvements, missing information and unit-price targets. Copy a supplier-question draft to request a revised written quote.
5. **Prepare the plan.** Choose an eligible quote. A separate checker recomputes the cost with BigInt and checks source fingerprints, excerpts, corrections, quantity, currency, budget, delivery and reviewed exclusions.
6. **Approve the exact decision.** Review the supplier, complete cost, delivery and exclusions. Approval belongs to the exact plan and prepared revision. Quote, requirement or permission changes clear it; undo cannot restore an old approval.
7. **Take the result with you.** Download the approved purchase packet with the plan, checks, original quotes and corrections. Hear the current decision with Vultr voice.
8. **Control the agent.** Allow or revoke extraction, quote addition, plan preparation and requirement changes. Revoking writes leaves reading, comparison and question drafts available.

## A concrete buying problem

You need 100 workshop kits by November 14 with a $650 complete budget. Three fictional quotes illustrate the workflow:

| Supplier | Complete quoted total | Delivery |
| --- | --- | --- |
| Cedar Print | $575 | November 13, 2026 |
| Harbor Studio | $595 | November 12, 2026 |
| Rushline | $625 | November 9, 2026 |

Cedar initially fits best. The supplier confirms a delay, so the buyer corrects delivery to November 18 and locks the date. Harbor becomes the recommendation. When the budget drops to $590, no quote fits every requirement.

Shortlist gives the buyer a useful next step: Harbor needs a **$5 complete-price reduction**. With $80 shipping and stated $0 tax unchanged, its unit price must be **$5.10 or less**. Cedar needs delivery **four days earlier**. The drafts ask for those changes and confirmation of all final charges. Requirements stay as the buyer reviewed them.

## Why Agent-Native matters

The person and agent work through the same registered actions and PostgreSQL state. The agent sees the current decision and selected quote, and its saved work appears in the comparison the buyer is using. Human corrections, permissions and approval stay in workspace controls.

| Shared capability | Implementation |
| --- | --- |
| Current screen and complete original quote | [view-screen](actions/view-screen.ts), [get-quote](actions/get-quote.ts) |
| Cited extraction that preserves locks | [apply-extraction](actions/apply-extraction.ts), [domain rules](server/domain.ts) |
| Workable options and supplier drafts | [inspect-options](actions/inspect-options.ts), [buying logic](server/buying.ts) |
| Independently checked plan and exact approval | [plan checker](server/plan-checker.ts), [prepare](actions/prepare-purchase-plan.ts), [approve](actions/approve-purchase-plan.ts) |
| Versioned permissions on agent, MCP and A2A surfaces | [permissions](actions/set-agent-permissions.ts), [transaction store](server/store.ts) |
| Vultr voice and reviewed requirements | [voice actions](server/voice.ts), [voice interface](app/components/VoiceBrief.tsx) |
| Reviewed purchase packet | [export-purchase-plan](actions/export-purchase-plan.ts) |

Every write locks the aggregate row, checks the expected version, saves its event and state in one transaction, and returns a receipt checked against the committed row. Permission versions reject work started before revocation. Restoring content advances both the decision version and permission epoch.

The framework's **0.223.0** default scaffold provides chat, authentication, navigation context, action dispatch and shared data. The comparison, buying domain, protected corrections, plan checks, permissions and Vultr voice integration were developed for Shortlist during the hackathon window. The public tour uses fictional preset states generated by the same domain engine; it accepts no private quotes and makes no model calls.

## Technology and hosting

- **Agent-Native core/toolkit 0.223.0** for the shared UI and agent action surface.
- **Vultr Serverless Inference**: DeepSeek V4.1 Flash for the buying agent and brief parsing, Qwen3 ASR for transcription, and Qwen3 TTS with Ryan voice for spoken explanations.
- **React 19, React Router, TypeScript, Vite and Nitro** for the interface and Node server.
- **PostgreSQL, Drizzle and Zod** for private state, transactions and action validation.
- **BigInt and SHA-256 fingerprints** for independent arithmetic, current-source checks and exact-plan approval.
- **Vercel** for the public address, downloadable media and source archive. The Node app remains behind the existing Vultr HTTPS gateway and encrypted SSH tunnel, with PostgreSQL on its private listener.

The app pins Vultr's endpoint, models and deployment key, with no provider fallback. Audio, brief text and supplier material needed for a model request are sent to Vultr. Credentials stay on the server. Broad framework tools and agent code execution are disabled for this buying workflow.

## Run and verify

Use Node 22.22 or newer. Install the lockfile with `npm ci --no-audit --no-fund`, copy `.env.example` to `.env`, and set a stable `BETTER_AUTH_SECRET`. Local development supports PGlite; hosted deployments use persistent PostgreSQL. Set `VULTR_INFERENCE_API_KEY` and `SHORTLIST_SPONSORED_AI=true` for voice and agent requests. Run `npm run dev`, create an account and open the example or bring your own quotes.

The upgrade passed **21 domain/voice checks**, **12 PostgreSQL storage checks in an isolated schema**, typecheck, doctor on the clean release, and **four browser checks** including actual Vultr microphone transcription, brief parsing, saved agent extraction and playable speech. Browser verification also covers a delayed first-session chat handoff, stable workspace scope, approval replay, stale-plan invalidation, downloads, reload, source highlighting, undo and mobile layout. The [recording checks](https://shortlist-buying.vercel.app/demo/recording.json) describe the complete demonstrated workflow.

```sh
npm run test:domain
npm run test:contract -- --env-file /path/to/private-postgres.env
npm run typecheck
npm run agent-native:doctor
npm run build
npm run test:browser
```

The contract runner creates a fresh schema, applies the application's actual migrations, checks storage behavior and removes its schema. It does not change application tables or production services. The [verification workflow](.github/workflows/verify.yml) uses a separate PostgreSQL instance for framework migrations and application/browser checks. Live voice checks require the explicit `--live-ai` flag and a disclosed synthetic WAV fixture.

The workflow accepts pasted supplier text or CSV and compares stated currencies without conversion. Citations prove exact source spans; they do not authenticate supplier documents or guarantee interpretation. Human corrections retain their reason. Supplier questions and the purchase packet give the buyer reviewed material to use with the supplier.

MIT. See [entry preparation](SUBMISSION.md) for the official Builder.io rules, development disclosure and demonstration requirements.
