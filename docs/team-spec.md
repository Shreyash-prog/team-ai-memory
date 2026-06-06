# Team AI Memory — Product Spec (POC v1)

**Status:** Draft v0.1 (replaces `chat-continuity-spec.md`)
**Goal:** A working POC, demoable to investors and small AI-native startups, built by one developer at ~5–10 hrs/week over ~12–16 calendar weeks, on a budget under $50.

---

## 1. The product in one paragraph

A team installs a browser extension. When a team member has an AI conversation (ChatGPT in v1, Claude/Gemini in v1.1) that produced useful context — a customer profile, a debugging session, a positioning draft, anything — they click the extension and capture it into one of the team's workspaces. The capture is extracted into a structured memory artifact and saved to the team's account. Later, any team member can search those artifacts on a web app, or pull one as a primer into their own AI chat to continue the work. The product turns the institutional knowledge currently disappearing into individual employees' AI chats into a shared, searchable team asset.

## 2. Who and why

**ICP:** Small AI-native startups (5–30 people). They already use multiple AI tools, will install browser extensions, decide quickly, and pay $20–50 per seat for tools that demonstrably reduce friction. They are the right beachhead because the cost of a bad team-tool decision is low for them and the value of compounding context is high.

**Primary pain we address:** AI conversations contain hard-won context — what works, what doesn't, what was rejected and why — and currently that context dies with the chat window. When the employee changes tasks, switches AIs, or leaves the company, it's gone. Teams notice this most acutely when onboarding new hires or rebuilding context that someone else already produced.

**What we are not pitching:** "Solve rate limits." That framing made sense for the individual product; for teams it's a footnote. The pitch is institutional memory across AI tools.

## 3. Core concepts and vocabulary

These are the nouns that show up everywhere; getting them right now saves rework.

- **Capture** — the act of saving an AI conversation into a workspace. Triggered by the user clicking the extension. Always opt-in per chat in v1.
- **Memory artifact** — what a capture produces. A structured object containing the extracted intermediate representation plus a rendered primer. Lives in a workspace.
- **Workspace** — a named container of memory artifacts with its own membership and permissions. The unit of sharing. A team has multiple workspaces (e.g., one per client, project, or product line).
- **Team** — the billing and admin unit. Contains one or more workspaces. Has an admin role.
- **Primer** — the markdown text rendered from a memory artifact, designed to be pasted into a new AI conversation. Continuous-user framing.
- **Injection** — the act of pulling a memory artifact's primer into a destination AI's input box.

## 4. v1 scope (what we are committing to build)

The thin slice that constitutes a real product a team would adopt:

1. A web app where a user can sign up, create a team, invite colleagues via email link, create workspaces inside the team, manage workspace membership, browse and full-text-search memory artifacts in workspaces they belong to, view a memory artifact's contents, and delete artifacts they own.
2. A Chromium browser extension that, on supported chat platforms (ChatGPT only in v1), captures the current conversation when the user clicks the toolbar icon, prompts the user to choose which of their workspaces to save into, extracts the conversation into a memory artifact via the backend, and confirms the save with a toast.
3. The same extension, on any destination chat platform with a supported adapter (ChatGPT and Claude in v1), allows the user to open a small popup, search and select a memory artifact from their workspaces, and auto-fill its primer into the destination's input box.
4. A sensitive-content warning at capture time (see §7).
5. A basic admin view showing team membership, workspace list, and seat usage.

**What is deliberately not in v1:**

- The full knowledge graph across artifacts (deferred to v2; v1 uses full-text search as the surrogate)
- Auto-suggestions of relevant memory based on what the user is typing (v1.1)
- SSO, audit logs, compliance reports (v2, gated on first enterprise interest)
- Always-on / passive capture (v2, gated on user demand)
- Claude.ai and Gemini capture adapters (v1.1; capture is ChatGPT-only at first, injection works on ChatGPT and Claude)
- Native macOS/Windows app, mobile, Firefox/Safari
- Image, file attachment, or rich-media fidelity beyond plain text
- Monetization plumbing (Stripe, billing, plan gates) — v1 is free for friendly users; we add billing only once we have signed letters of intent or paying interest

## 5. Three milestones

We sequence the build so something demo-able exists early, not all at the end:

**Milestone 1 (end of week 4):** Single-user end-to-end skeleton. No teams, no auth, no workspaces. Just: extension captures a ChatGPT conversation, backend extracts it, web app shows it, extension injects it back. One person uses the whole loop. This proves the architecture.

**Milestone 2 (end of week 8):** Multi-user with email-link auth, real teams and workspaces, invite flow, capture-into-workspace, search artifacts, sensitive-content warning. A friendly 3–5 person team could actually try it.

**Milestone 3 (end of week 12–14):** Polish for the investor demo. Claude.ai injection added, primer regeneration UI, basic admin view, second-platform capture if time permits, deployment hardening, landing page.

If we lose momentum after Milestone 1 or 2, we still have a credible artifact.

## 6. The user flows

Three flows that need to work end-to-end. Everything else in the product is in service of these.

### 6.1 The capture flow

User is in a ChatGPT conversation. They click our toolbar icon. The extension scrapes the visible conversation from the DOM and shows a small popup: a dropdown to pick a workspace (defaulting to the most recently used), a one-line auto-generated title for the capture (editable), and a Save button. On Save, the conversation is sent to the backend, extracted into a memory artifact, and stored. The popup shows a confirmation: "Saved to [Workspace]." If the extraction detects sensitive content patterns (see §7), the popup warns the user before save.

### 6.2 The injection flow

User is in any supported destination (ChatGPT or Claude in v1). They click our toolbar icon. The extension popup shows a search box and a list of recent memory artifacts from the user's workspaces. The user types to filter or scrolls to find what they want, clicks a result, and the primer auto-fills into the destination's input box. The user reviews the primer and presses Enter to send.

### 6.3 The web app flow

User opens our web app. They land in their default workspace. They see a list of memory artifacts, each showing title, source platform, captured-by, captured-at, and a short summary line. They can search across the workspace. Clicking an artifact opens its detail view: the full primer text, the underlying structured IR fields (factual state, open threads, rejected paths, etc.), metadata, and a "Copy primer" button. The left rail switches workspaces. A team menu lets admins invite people and manage workspaces.

## 7. Sensitive content handling (v1)

Q5 was flagged earlier as something we'd come back to before v1. We're committing v1 to ship with:

- A short list of regex/keyword patterns that flag captures containing common sensitive markers: salary numbers in a discussion context, mention of medical conditions, mention of specific named individuals in evaluative contexts ("my boss said..."), passwords, API keys, and similar.
- When a capture matches a pattern, the save popup shows a warning above the Save button: "This capture appears to contain sensitive content (matched: [reason]). Are you sure you want to share it with [workspace name]?" The user can save anyway or cancel.
- The warning is on the client (in the extension popup), based on a regex list shipped with the extension. No content is sent to the backend before the user confirms.
- This is **not** a full classifier and is not promised to catch everything. It is a guardrail to prevent the obvious mistakes ("oh god I just shared my salary negotiation with the team") and create a moment of friction at the right time. We say so explicitly in the warning.

A better v2 version would use the extraction LLM itself to classify sensitivity, but that would mean sending content to the backend before the user has decided to save, which we don't want at v1.

## 8. What we extract — the memory artifact

For v1 the memory artifact has two layers:

The **structured intermediate representation (IR)**, the same shape we designed in the prior architecture doc: factual state, open threads, rejected paths, preferences, constraints, last exchange. This is the artifact that future v2 features (knowledge graph, retrieval, cross-artifact synthesis) will operate on.

The **rendered primer**, a single-format structured markdown document derived from the IR. One length: ~400 words (Standard tier from the prior spec). We're dropping the Compact/Comprehensive tiers for v1 to reduce surface area; we can add them back if users ask.

## 9. Privacy posture (v1)

Stated for users as: chat content lives on the user's machine until they choose to capture. On capture, the content is sent over TLS to our backend, which calls Anthropic's API to extract structure, then stores the extracted artifact (IR + primer + metadata) in our database. The original raw conversation is not stored after extraction. Anthropic's API defaults to not using submitted data for model training, which is our normal operating state.

This posture is sufficient for friendly-team beta. Before any paid customer onboards we revisit (likely: signed customer DPA, optional regional deployment, and re-evaluating whether a provider-fallback chain is now worth its complexity).

**Single-provider risk to acknowledge:** With only Anthropic configured for v1, an Anthropic outage or rate-limit event means captures fail until it recovers. We accept this for the POC. The architecture's provider abstraction layer is intact so we can re-add OpenAI or Gemini as fallbacks if and when downtime becomes a real problem.

## 10. Technical stack summary

Full architecture details come in a separate doc once the spec is signed off; this is the headline list.

- **Browser extension:** TypeScript, WXT framework, Preact for the popup UI, Manifest V3, Chromium-only in v1.
- **Web app:** TypeScript, React, deployed on Cloudflare Pages. Likely Next.js or a simpler Vite + React Router setup; to be decided in architecture pass.
- **Backend:** TypeScript, Hono on Cloudflare Workers. Stateless. Endpoints: auth callbacks, capture/extract, list/search artifacts, workspace and team management.
- **Database:** Cloudflare D1 (free tier, SQLite at the edge) for v1. If we hit limits, migrate to Neon Postgres (also free tier). The data model is small and relational.
- **Auth:** Email magic link via a lightweight provider. Likely Better Auth or hand-rolled with Resend for email delivery. SSO is v2.
- **LLM:** Anthropic Claude Haiku (single provider for v1; the abstraction supports adding OpenAI or Gemini later as a one-file change per provider, deferred for simplicity).
- **Shared types:** Zod schemas in a `/shared` workspace.
- **Repo:** pnpm monorepo.
- **CI/CD:** GitHub Actions on push to main; deploys both the Workers backend and the Pages frontend.
- **Observability:** PostHog (product analytics, free tier) and Sentry (errors, free tier).

Out-of-pocket cost expectation: $0 for hosting and tools, ~$12 for an optional domain, $5 for Chrome Web Store registration when we publish. Total under $20 for the build itself. Claude Code usage is covered by the developer's existing Claude Max subscription. Comfortable inside the $50 ceiling.

## 11. Data model headline (full version in architecture doc)

The minimum tables:

- `users` (id, email, name, created_at)
- `teams` (id, name, created_by, created_at)
- `team_members` (team_id, user_id, role)
- `workspaces` (id, team_id, name, created_by, created_at)
- `workspace_members` (workspace_id, user_id, role)
- `memory_artifacts` (id, workspace_id, created_by, source_platform, title, ir_json, primer_markdown, summary_line, created_at)
- A full-text search index on `memory_artifacts(title, primer_markdown, summary_line)` — D1 supports FTS5.

A user belongs to one team in v1 (multi-team membership is v2). Users belong to workspaces inside their team. Memory artifacts belong to one workspace.

## 12. Success criteria

The POC is successful if:

- A friendly 3–5 person team can install the extension, capture chats over a week, and report that they searched and reused at least one teammate's captured artifact. We get qualitative feedback from at least one such team before declaring v1 done.
- The end-to-end capture-to-inject flow takes under 60 seconds for a typical chat.
- The extraction LLM, on a held-out set of 10 real chats, produces primers we rate "good enough to send without edits" at least 7 times out of 10.
- The full build comes in under the $50 ceiling.
- A live investor demo of the team flow works reliably from cold start on the demo machine.

## 13. Risks worth naming

A few that should not surprise us later:

- **Platform DOM breakage.** ChatGPT and Claude change their UI; our adapters break. Mitigation: keep adapters small and isolated, and maintain a manual copy-paste fallback in the extension.
- **Anthropic outage or credit exhaustion.** As the single LLM provider in v1, any Anthropic-side issue stops captures cold. Mitigation: per-user rate limits to make credit burn predictable, identical-input caching to reduce wasted calls, kill-switch env var, and the preserved provider abstraction so a fallback can be added quickly if downtime becomes routine.
- **Sensitive content slipping past our pattern matcher.** The v1 warning is a guardrail, not a guarantee. Mitigation: clearly communicate the limit; prioritize a real classifier for v2.
- **Demo fragility.** Live demos of multi-platform flows on someone else's network with someone else's accounts often fail. Mitigation: pre-recorded demo video as backup, plus carefully prepared demo accounts.
- **The build outlasting the developer's motivation.** 12–16 weeks of evening work is a real psychological lift. Mitigation: the milestone sequencing in §5 — even Milestone 1 alone is a real artifact.

## 14. Open items resolved here and items still open

Resolved into this spec: capture model (opt-in per chat), unit of memory (per-workspace), where the product lives (co-equal extension + web app), front door (yes, minimal), shared-account handling (per-browser-session, no dedup), knowledge graph (deferred to v2, full-text search in v1), v1 scope sign-off (the slice in §4), sensitive content (§7).

Still open: monetization model and price points (defer until Milestone 2); SSO / compliance (defer until first paying interest); the exact email auth provider and React framework (resolve in architecture doc); whether to ship a landing page in v1 or after (lean: yes in v1, marketing matters for the demo).

---

*End of spec v0.1. The companion architecture doc will be produced once this spec is signed off.*
