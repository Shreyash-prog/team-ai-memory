# Build Plan — Team AI Memory

**Status:** Draft v0.1
**Audience:** You (the developer), and Claude Code via task-by-task handoff.
**Predecessors:** `team-spec.md`, `architecture.md`, `setup.md` — all assumed complete and signed off.
**Approach:** Three milestones, each a real demoable artifact. Tasks sized to a single evening (~2 hours) or a single Claude Code handoff.

This document is for execution. Every task is scoped, has a definition of done, and lists the files it touches. When you sit down for an evening session, open this doc, pick the next unstarted task, and either do it yourself or hand the task block to Claude Code.

---

## 0. How to use this document

Each task block has a fixed structure:

```
### Task M1-T07 — Title of the task

**Description:** What this task accomplishes, in one short paragraph.

**Files:** apps/api/src/routes/foo.ts (new), apps/api/src/db/schema.ts (modify)

**Done when:**
- Concrete acceptance criterion 1
- Concrete acceptance criterion 2

**Depends on:** M1-T03, M1-T05
```

The task ID (e.g., `M1-T07`) names the milestone (M1, M2, M3) and the task number within it. The ordering is the *suggested* order; deviations within a milestone are fine if dependencies are respected.

When handing a task to Claude Code, copy the entire block including the headings — Claude Code uses the structured format. Then add any additional context relevant to the moment, like "focus on the happy path; we'll add error handling next."

After each task: commit on a feature branch, push, open a PR, verify preview deploy, merge. Never commit to main directly.

---

## 1. Milestone 1 — Single-user end-to-end skeleton

**Target:** End of week 4 (calendar weeks, at 5-10 hrs/week).
**Goal:** One person can capture a ChatGPT conversation in their browser, see it extracted and saved on the web app, and inject it as a primer back into a Claude.ai chat. No teams, no auth, no workspaces — just the loop. This proves the architecture works.
**Demo state:** You sit at your laptop, run through the flow once, and it works. Not yet showable to a third party.

### Task M1-T01 — Shared package: define the IR and API schemas

**Description:** Implement the Zod schemas for the Intermediate Representation, the API request/response shapes, and the platform adapter contract. These are exactly the schemas specified in `architecture.md` §3.1, §3.2, §3.3. This task creates the shared contract that every other module in the project depends on.

**Files:** `packages/shared/src/ir.ts` (new), `packages/shared/src/api.ts` (new), `packages/shared/src/platforms.ts` (new), `packages/shared/src/index.ts` (modify to re-export everything).

**Done when:**
- `pnpm typecheck` from the repo root passes with no errors.
- All schemas import cleanly from `@team-ai-memory/shared` in a scratch test file.
- The IR schema validates a hand-written example IR object.

**Depends on:** Setup complete (Part 6 verified).

---

### Task M1-T02 — Database schema and first migration

**Description:** Add the Drizzle schema definitions for v1 from `architecture.md` §4.1. For Milestone 1 we only need the `memory_artifacts` table and a stub `users` table — the team/workspace tables come in Milestone 2. Also add the full-text-search migration as a raw SQL file. Generate the first migration via `pnpm db:generate`, then apply it against the Neon dev branch.

**Files:** `apps/api/src/db/schema.ts` (new), `apps/api/drizzle.config.ts` (new), `apps/api/src/db/client.ts` (new), `apps/api/src/db/migrations/*` (auto-generated).

**Done when:**
- `pnpm db:generate` produces a migration file without errors.
- `pnpm db:migrate` applies it cleanly to the Neon database.
- Connecting to the database via the Neon dashboard shows the `memory_artifacts` table with all columns, plus the `search_vector` column from the FTS migration.
- A scratch script can insert and select a row.

**Depends on:** M1-T01.

---

### Task M1-T03 — LLM provider abstraction + Anthropic implementation

**Description:** Build the `LLMProvider` interface (kept generic so we can add OpenAI/Gemini later without refactoring) and implement the Anthropic provider against `claude-haiku-4-5` using tool-use for structured output. The provider takes a conversation and source platform, returns a parsed IR. The extraction prompt v1 lives in this file as a string constant — we'll iterate on it during M1-T04.

Error handling: on Zod validation failure, retry once with the validation error included as a hint; on second failure, throw. On 429 or 5xx, throw a typed error so the route can return an appropriate response to the client.

**Files:** `apps/api/src/lib/llm/types.ts` (new), `apps/api/src/lib/llm/anthropic.ts` (new), `apps/api/src/lib/llm/prompts/extract-v1.ts` (new), `apps/api/src/lib/llm/anthropic.test.ts` (new).

**Done when:**
- A unit test (Vitest) extracts an IR from a fixed 10-turn sample conversation and validates it against `IRSchema` with no errors.
- The extracted IR has non-empty `factualState` and `lastExchange` arrays.
- The provider handles a malformed-JSON response by retrying once with the validation error in the prompt.
- A test that mocks Anthropic returning 429 verifies the typed error surfaces correctly.

**Depends on:** M1-T01.

---

### Task M1-T04 — Prompt eval harness with 10 real chats

**Description:** Build a small CLI eval (`pnpm -F api eval`) that runs the Anthropic provider against a fixture set of 10 real chat transcripts (sourced from your own and friends' ChatGPT/Claude history, anonymized). Output is a markdown report showing the IR per chat, plus quality observations: IR completeness across the five layers, schema validity, latency, cost estimate per call. This is the harness we'll re-run as we iterate on the extraction prompt.

This task replaces what was originally a multi-provider comparison eval — we now have one provider, so the eval focuses on prompt quality. Build the harness in a way that an additional provider could be plugged in later (loop over a list of providers) so re-adding OpenAI or Gemini in the future would extend, not rewrite, the eval.

**Files:** `apps/api/src/eval/run.ts` (new), `apps/api/src/eval/fixtures/*.json` (10 files, manually populated), `apps/api/src/eval/report.ts` (new), `apps/api/src/eval/results/baseline.md` (committed output).

**Done when:**
- `pnpm -F api eval` runs the provider against all 10 fixtures and produces a markdown report.
- Report is committed to the repo.
- You read the report and identify at least three concrete issues with the extraction prompt v1. Open follow-up issues or notes for prompt iteration in `apps/api/src/lib/llm/prompts/`.

**Depends on:** M1-T03.

---

### Task M1-T05 — Render IR to markdown primer (Standard length)

**Description:** Implement `renderPrimer(ir: IR): string` per `architecture.md` (continuous-user framing, ~400 words). Single length tier ("Standard") for v1. The renderer is pure — given the same IR, produces the same output.

**Files:** `apps/api/src/lib/render.ts` (new), `apps/api/src/lib/render.test.ts` (new).

**Done when:**
- Unit tests cover: empty arrays render gracefully, full IR renders all sections, output is valid markdown.
- A primer rendered from the M1-T04 baseline IRs reads naturally as a recap when pasted into a Claude or ChatGPT conversation (manual eyeballing — judgment call, but document it).

**Depends on:** M1-T01.

---

### Task M1-T06 — POST /extract endpoint (no auth yet)

**Description:** Wire up the `/extract` route in Hono. For Milestone 1 it accepts a request with a placeholder workspace ID and a hardcoded user ID (we'll add real auth in M2). Validates input with the shared schema, calls the LLM orchestrator, renders the primer, persists the artifact to `memory_artifacts`, returns the response.

**Files:** `apps/api/src/routes/extract.ts` (new), `apps/api/src/lib/extract.ts` (new, the orchestration glue), `apps/api/src/index.ts` (modify to mount the route).

**Done when:**
- A `curl` POST to the deployed `/extract` endpoint with a sample conversation returns a valid response matching `ExtractResponseSchema`.
- The artifact appears in the database via a `SELECT` query.
- Latency from request to response is under 6 seconds for a typical 20-turn conversation (sanity check, not a hard SLA).

**Depends on:** M1-T02, M1-T03, M1-T05.

---

### Task M1-T07 — GET endpoints for artifacts (no auth yet)

**Description:** Add `GET /artifacts/:id` and `GET /artifacts?workspaceId=<placeholder>&q=<query>` endpoints. The list endpoint supports full-text search via `tsvector @@ plainto_tsquery`. Same auth caveat as M1-T06.

**Files:** `apps/api/src/routes/artifacts.ts` (new), `apps/api/src/index.ts` (modify).

**Done when:**
- `GET /artifacts/:id` returns the full artifact (IR + primer + metadata).
- `GET /artifacts?q=<term>` returns artifacts ranked by FTS relevance.
- Both endpoints validate the response against the shared schema before returning.

**Depends on:** M1-T06.

---

### Task M1-T08 — Web app: artifact list and detail pages (no auth)

**Description:** Replace the placeholder web app with a real two-page interface using TanStack Router. The list page shows artifacts (title, source, timestamp, summary line) with a search box. Clicking an artifact opens its detail page showing the primer (rendered markdown) and the structured IR (collapsible sections). Install Tailwind, configure shadcn/ui, and use shadcn `Card`, `Input`, and `Button` components.

**Files:** `apps/web/src/routes/__root.tsx` (new), `apps/web/src/routes/index.tsx` (modify), `apps/web/src/routes/artifacts.$id.tsx` (new), `apps/web/src/lib/api.ts` (new), `apps/web/src/main.tsx` (modify), `apps/web/tailwind.config.ts` (new), `apps/web/src/index.css` (new), `apps/web/components.json` (shadcn config), `apps/web/src/components/ui/*` (shadcn components).

**Done when:**
- The deployed Cloudflare Pages URL shows the artifact list, fed by the live API.
- Search filters results live.
- Clicking an artifact navigates to the detail page and renders the primer correctly.
- The page is styled tolerably (not pretty — that's M3).

**Depends on:** M1-T07.

---

### Task M1-T09 — Extension: ChatGPT capture (no auth)

**Description:** Build the ChatGPT content script that scrapes the visible conversation from the DOM. The popup, when opened on a ChatGPT page, displays a single "Capture" button that triggers the scrape and POSTs to the deployed `/extract` endpoint with a placeholder workspace ID. On success, shows a toast.

**Files:** `apps/extension/adapters/chatgpt.ts` (new), `apps/extension/adapters/index.ts` (new), `apps/extension/entrypoints/content/chatgpt.content.ts` (new), `apps/extension/entrypoints/popup/main.tsx` (new), `apps/extension/entrypoints/popup/App.tsx` (new), `apps/extension/lib/api.ts` (new), `apps/extension/lib/messaging.ts` (new).

**Done when:**
- Loaded unpacked in Chrome, the extension's toolbar icon shows the Capture button on a ChatGPT page.
- Clicking Capture scrapes the conversation, sends it to the API, and shows a "Saved" toast.
- The artifact appears in the web app's list within seconds.
- The scraper correctly preserves message order and distinguishes user vs assistant turns. Code blocks survive as fenced markdown.

**Depends on:** M1-T06, M1-T08.

---

### Task M1-T10 — Extension: Claude injection (no auth)

**Description:** Build the Claude content script and the popup's injection flow. On a `claude.ai` page, the popup shows a list of recent artifacts (fetched from the API). Clicking one fetches the primer, sends it to the content script, which uses native-setter input simulation to fill Claude's input box.

**Files:** `apps/extension/adapters/claude.ts` (new), `apps/extension/entrypoints/content/claude.content.ts` (new), `apps/extension/entrypoints/popup/App.tsx` (modify to handle the inject mode).

**Done when:**
- On a `claude.ai` chat page, the popup shows a list of artifacts.
- Selecting one fills the primer into Claude's input box.
- The injected text is editable (i.e., the React state is properly updated, not just the DOM).
- You complete the full demo loop: capture from ChatGPT → see in web app → inject into Claude → Claude responds coherently as a continuation.

**Depends on:** M1-T07, M1-T09.

---

### Task M1-T11 — Milestone 1 retro and architecture-doc updates

**Description:** With the loop closed, write a short retro: what surprised us, what the eval results said about extraction-prompt quality, what we'd change in the architecture, what the prompt v1 missed. Update `architecture.md` and `team-spec.md` with anything we learned. This isn't paperwork — it's how we keep the docs from rotting.

**Files:** `docs/architecture.md` (modify), `docs/team-spec.md` (modify), `docs/m1-retro.md` (new, short).

**Done when:**
- The retro doc is committed and lists at least three concrete learnings.
- Architecture and spec are updated to reflect reality, not aspiration.
- You record the Milestone 1 demo as a short screen capture (for posterity and to compare against M2/M3).

**Depends on:** M1-T10.

---

## 2. Milestone 2 — Multi-user with teams, workspaces, auth

**Target:** End of week 8.
**Goal:** A friendly 3-5 person team could install the extension, sign in, invite colleagues, create workspaces, capture chats into a chosen workspace, and search artifacts across the workspaces they belong to. Sensitive-content warning works at capture time.
**Demo state:** A small friendly team could actually try the product end to end.

### Task M2-T01 — Better Auth setup with magic links

**Description:** Add Better Auth to the API, configured with the Drizzle adapter and the magic-link plugin sending via Resend. Create the auth tables via Better Auth's CLI. Add a `/auth/*` mount in Hono.

**Files:** `apps/api/src/lib/auth.ts` (new), `apps/api/src/db/schema.ts` (modify — add Better Auth tables), `apps/api/src/db/migrations/*` (auto-generated), `apps/api/src/index.ts` (modify).

**Done when:**
- A `POST /auth/sign-in/magic-link` with an email body causes an email to arrive in your inbox.
- Clicking the magic link sets a session cookie.
- A subsequent request to `/health` includes the user's session in the request context.

**Depends on:** M1-T11.

---

### Task M2-T02 — Auth middleware for the API

**Description:** Add a `requireSession` middleware that protects routes. Apply it to all existing routes except `/health` and `/auth/*`. Errors return 401 with a clear message.

**Files:** `apps/api/src/middleware/auth.ts` (new), `apps/api/src/routes/extract.ts` (modify), `apps/api/src/routes/artifacts.ts` (modify), `apps/api/src/index.ts` (modify).

**Done when:**
- Unauthenticated requests to `/extract` return 401.
- Authenticated requests work as before, with `c.get('userId')` available in handlers.

**Depends on:** M2-T01.

---

### Task M2-T03 — Teams and workspaces tables + endpoints

**Description:** Add the `teams`, `team_members`, `workspaces`, `workspace_members`, and `team_invites` tables per `architecture.md` §4.1. Add the endpoints listed in §5.2: create team, list my teams, create workspace, list workspaces in a team, invite to team, accept invite. Permission middleware (`requireTeamMember`, `requireWorkspaceMember`) enforces access.

**Files:** `apps/api/src/db/schema.ts` (modify), `apps/api/src/db/migrations/*` (auto-generated), `apps/api/src/routes/teams.ts` (new), `apps/api/src/routes/workspaces.ts` (new), `apps/api/src/middleware/workspace.ts` (new), `apps/api/src/middleware/team.ts` (new), `apps/api/src/lib/invites.ts` (new — token generation, email sending).

**Done when:**
- Sign up flow creates a personal team owned by the new user.
- A user can create a workspace inside their team.
- Inviting an email sends a real invite link via Resend.
- Clicking the invite link (while signed in or after signing in) adds the user to the team.
- Permission middleware blocks cross-team access (verified by test).

**Depends on:** M2-T02.

---

### Task M2-T04 — Wire artifacts to workspaces

**Description:** Update the `memory_artifacts` table and endpoints so artifacts belong to a real workspace (not the placeholder from M1). Update `/extract` to require a real `workspaceId` and verify the caller is a member. Update `GET /artifacts` to scope to workspaces the user belongs to.

**Files:** `apps/api/src/routes/extract.ts` (modify), `apps/api/src/routes/artifacts.ts` (modify), migrations for any column changes (probably none — the schema already has `workspaceId`).

**Done when:**
- `POST /extract` with a workspace ID the user doesn't belong to returns 403.
- `GET /artifacts` for a workspace returns only that workspace's artifacts, scoped to membership.
- Existing M1 placeholder artifacts are migrated (manually) into a "default" workspace for testing continuity.

**Depends on:** M2-T03.

---

### Task M2-T05 — Web app: sign in, team management, workspace switcher

**Description:** Add the sign-in flow, magic-link callback handler, and the authenticated layout (sidebar with workspace switcher, settings link). Add a team-management page (invite members, view membership). Use TanStack Query for all server state.

**Files:** `apps/web/src/routes/sign-in.tsx` (new), `apps/web/src/routes/auth.callback.tsx` (new), `apps/web/src/routes/app/__layout.tsx` (new), `apps/web/src/routes/app/workspaces.$id.tsx` (new, replaces M1's index route), `apps/web/src/routes/app/team.tsx` (new), `apps/web/src/routes/invite.$token.tsx` (new), `apps/web/src/lib/auth.ts` (new), `apps/web/src/components/WorkspaceSwitcher.tsx` (new), `apps/web/src/components/Sidebar.tsx` (new).

**Done when:**
- Unauthenticated visitors are redirected to sign-in.
- Magic link arrives, clicking it signs the user in.
- The sidebar lets the user switch workspaces; the URL reflects the current workspace.
- The team page lets the user invite a teammate by email and shows pending invites.

**Depends on:** M2-T03, M2-T04.

---

### Task M2-T06 — Extension auth (bearer token via "connect extension")

**Description:** Add the `extension_tokens` table and the `/auth/extension-token` endpoint. Add a "Connect extension" button on the web app's settings page that requests a token and posts it to the extension via `chrome.runtime.sendMessage`. Update the extension's API client to use `Authorization: Bearer <token>` instead of cookies. The extension's popup, on first run, links to the web app's settings page.

**Files:** `apps/api/src/db/schema.ts` (modify), `apps/api/src/routes/auth.ts` (new — extension-token endpoint), `apps/api/src/middleware/auth.ts` (modify to accept bearer tokens), `apps/web/src/routes/app/settings.tsx` (new), `apps/extension/lib/auth.ts` (new), `apps/extension/lib/api.ts` (modify to send bearer).

**Done when:**
- After signing in to the web app and clicking "Connect extension," the extension's popup recognizes it's connected and shows the user's email.
- Extension API calls succeed with the bearer token.
- Tokens are revocable from the settings page.

**Depends on:** M2-T01, M2-T05.

---

### Task M2-T07 — Extension capture flow with workspace picker and sensitive-content warning

**Description:** Update the extension's capture flow to require workspace selection (defaulted to most recently used, stored in `chrome.storage.local`). Add the client-side sensitive-content regex check from `architecture.md` §8.5. On match, display warning above the Save button before allowing save.

**Files:** `apps/extension/lib/sensitive-content.ts` (new), `apps/extension/entrypoints/popup/App.tsx` (modify), `apps/extension/lib/api.ts` (modify to fetch user's workspaces).

**Done when:**
- The capture popup lists the user's workspaces, defaulting to the last used.
- A test conversation containing a salary mention triggers the warning.
- The warning identifies the matched pattern category.
- Saving anyway proceeds; canceling does not POST anything.

**Depends on:** M2-T04, M2-T06.

---

### Task M2-T08 — Cross-workspace artifact search

**Description:** Update the extension's injection-mode popup to search across all of the user's workspaces (not just the current one), and update the web app's search to optionally span workspaces. Add a backend endpoint `GET /artifacts?scope=mine` that returns artifacts from all workspaces the caller belongs to, ranked by relevance.

**Files:** `apps/api/src/routes/artifacts.ts` (modify), `apps/extension/entrypoints/popup/App.tsx` (modify), `apps/web/src/components/ArtifactSearch.tsx` (new or modify existing).

**Done when:**
- The extension's inject popup shows artifacts from all of the user's workspaces in a single list, with a workspace badge on each result.
- The web app's search has a "this workspace" / "all my workspaces" toggle.

**Depends on:** M2-T07.

---

### Task M2-T09 — Per-user rate limit and capture quota

**Description:** Implement the 100-captures/day-per-user limit from `architecture.md` §11. Use a small Cloudflare KV namespace (or a Postgres counter — call) to track the count, reset daily.

**Files:** `apps/api/src/middleware/rate-limit.ts` (new), `apps/api/wrangler.toml` (modify to add KV binding), `apps/api/src/routes/extract.ts` (modify to apply rate limit).

**Done when:**
- Exceeding 100 captures in 24 hours returns 429 with a clear error message.
- The counter resets at UTC midnight (or on a rolling 24-hour window — your call).

**Depends on:** M2-T04.

---

### Task M2-T10 — Sentry + PostHog wiring

**Description:** Wire Sentry SDKs into the web app, extension, and API. Wire PostHog into the web app and extension for the event list in `architecture.md` §10. No content payloads — only metadata.

**Files:** `apps/api/src/index.ts` (modify to add Sentry middleware), `apps/web/src/main.tsx` (modify), `apps/extension/entrypoints/background.ts` (modify), `.env.local` files (add DSNs and PostHog key, gitignored).

**Done when:**
- A deliberate thrown error in each app appears in its Sentry project within a minute.
- Capturing an artifact emits a `capture_succeeded` event in PostHog with workspace ID metadata only.

**Depends on:** M2-T09.

---

### Task M2-T11 — Milestone 2 retro and friendly-team beta prep

**Description:** Beta-test the product yourself with 1-2 trusted people. Iron out the rough edges of the sign-up and invite flow. Update docs. Prepare a one-page "what is this and how to try it" doc for friendly testers.

**Files:** `docs/m2-retro.md` (new), `docs/beta-tester-guide.md` (new), `docs/architecture.md` and `docs/team-spec.md` (modify with learnings).

**Done when:**
- At least one external friendly tester successfully signed up, captured a chat, and used it from another AI without your active help.
- The tester wrote down (in any form) what surprised them, what broke, and what felt unintuitive. You read it.

**Depends on:** M2-T10.

---

## 3. Milestone 3 — Polish for investor demo

**Target:** End of week 12-14.
**Goal:** A reliable, well-recorded demo that you can run live or play as a video. Real-feeling product, not a prototype.
**Demo state:** Suitable to show to a friendly angel or seed-stage VC. Not yet production-quality for paying customers — that's post-funding.

### Task M3-T01 — Visual polish across web app

**Description:** Light visual design pass on the web app. Pick a sober color palette, set up dark mode, polish typography, refine spacing. Don't over-design — investors want competent, not artistic. Time-box this to one evening; perfectionism is the enemy here.

**Files:** `apps/web/src/index.css` (modify), `apps/web/tailwind.config.ts` (modify), component-level style passes across the app.

**Done when:**
- The app doesn't look like a prototype. Side-by-side with Linear or Notion's free tier, you wouldn't be embarrassed.
- Dark mode works and is the default (looks more professional in demos).

**Depends on:** M2-T11.

---

### Task M3-T02 — Visual polish on the extension popup

**Description:** Same pass for the extension. Tailwind config shared with the web app via the shared package's design tokens. Make the popup feel tight and intentional, not afterthought.

**Files:** `apps/extension/entrypoints/popup/*` (modify), `apps/extension/style.css` or equivalent (modify).

**Done when:**
- The popup looks consistent with the web app's design language.
- Loading states are smooth (no jumpy layout shifts).

**Depends on:** M3-T01.

---

### Task M3-T03 — Landing page

**Description:** Build a single-page marketing landing page at the root of the web app domain. Hero, three feature blurbs, demo video embed, "request access" form (collects email via Resend Audiences or a simple Postgres table). Authentication routes move to `/app`.

**Files:** `apps/web/src/routes/index.tsx` (heavy modify), `apps/web/src/components/Landing/*` (new), `apps/api/src/routes/waitlist.ts` (new — captures email).

**Done when:**
- Visiting the domain shows a real-feeling landing page.
- Submitting an email adds it to a waitlist table; the user gets a confirmation email.
- The page passes Lighthouse with score ≥ 90 on Performance.

**Depends on:** M3-T01.

---

### Task M3-T04 — Demo flow rehearsal and recording

**Description:** Run through the demo flow specified in `team-spec.md` end-to-end, multiple times, until it's smooth. Record a high-quality screen capture (Loom or QuickTime) of the demo, edited to ~90 seconds. Embed in the landing page.

**Files:** `docs/demo-script.md` (new — the rehearsed talk-through), `apps/web/public/demo.mp4` or a Loom embed.

**Done when:**
- The demo runs reliably in a single take on the demo machine.
- The recorded version is embedded on the landing page.
- A friendly viewer can describe what the product does after watching it once.

**Depends on:** M3-T03.

---

### Task M3-T05 — Gemini capture adapter (deferred from M1)

**Description:** Add a Gemini content script and adapter so the extension can capture from `gemini.google.com` as well. Same shape as the ChatGPT and Claude adapters.

**Files:** `apps/extension/adapters/gemini.ts` (new), `apps/extension/entrypoints/content/gemini.content.ts` (new), `apps/extension/wxt.config.ts` (modify host permissions).

**Done when:**
- Capturing a Gemini conversation works end to end.
- The extension correctly identifies which platform the user is on across all three.

**Depends on:** M2-T11.

---

### Task M3-T06 — Admin view (basic)

**Description:** Add a simple admin view for team owners: list of team members with their join dates and capture counts, list of workspaces with artifact counts, ability to remove members. Nothing fancy — a table per resource.

**Files:** `apps/web/src/routes/app/admin.tsx` (new), `apps/api/src/routes/teams.ts` (modify — add admin endpoints).

**Done when:**
- Team owners see an Admin link in the sidebar.
- The page shows member list, workspace list, and basic counts.
- Removing a member works and revokes their access immediately.

**Depends on:** M3-T01.

---

### Task M3-T07 — Production deployment hardening

**Description:** Bring up a custom domain (optional, $12/year — your call), tighten CORS, add structured logging, set up Better Auth's production-mode flags, ensure all secrets are set in Cloudflare. Run through the entire deployment checklist one more time.

**Files:** `apps/api/wrangler.toml` (modify), `apps/api/src/lib/auth.ts` (modify), various env config.

**Done when:**
- The app deploys cleanly from a fresh CI run.
- No console errors on either app in production.
- Secrets audit: `wrangler secret list` shows exactly the expected set.
- A burst of 50 requests in a minute against `/extract` is handled gracefully (rate-limited but not crashed).

**Depends on:** M3-T06.

---

### Task M3-T08 — Chrome Web Store submission

**Description:** Publish the extension to the Chrome Web Store. Requires the $5 one-time developer fee. The first review usually takes 1-3 days; submit early in the milestone.

**Files:** Screenshots, marketing copy, privacy policy document.

**Done when:**
- The extension is listed (or in review) on the Chrome Web Store.
- The store listing has 3-5 polished screenshots and a clear description.

**Depends on:** M3-T02.

---

### Task M3-T09 — Final retro, investor materials

**Description:** Write a short investor-facing deck (or one-pager) using the demo video, the landing page, the architecture's compelling parts (multi-provider chain, team memory unit), and the spec's positioning. This isn't a fundraising kit — it's the artifact that pairs with the demo when investors ask "what is this."

**Files:** `docs/investor-onepager.md` (new), or a Figma/Google Slides deck linked from the repo.

**Done when:**
- A one-pager exists that you could send to a warm intro.
- The retro doc captures what the build process taught you about the product.

**Depends on:** M3-T08.

---

## 4. What's deliberately out of this build plan

To stay honest about scope, here's what is *not* in v1 even after Milestone 3:

- Stripe / billing plumbing. Free for everyone until we have signed interest.
- SSO / SAML / SCIM. v2 when an enterprise asks.
- Audit logs and compliance reports. v2.
- The semantic-search knowledge graph. v2 — pgvector is already provisioned in the schema design but not built.
- Always-on / passive capture. v2 once a real user asks for it.
- Mobile, Firefox, Safari. v2 minimum.
- Image, file, attachment fidelity in captures. v2.
- Auto-suggestions of relevant memory while typing. v1.1 maybe.
- A real classifier for sensitive content (vs the regex guardrail). v2.

If something here screams "I actually need that for the demo" — say so now, before we start. Adding it mid-build is much costlier.

## 5. Cadence and operating norms

A few standing agreements that will help us stay sane across 12-16 weeks of evening work:

**Every PR is small.** If a task feels like more than 200 lines of diff, split it. PRs are easier to review when they're focused, and Claude Code does better work scoped to one concern.

**Commit message format:** Conventional Commits. `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`. Helps the changelog write itself.

**One Claude Code task per session, mostly.** If you're trying to do three tasks in an evening with Claude Code, none of them will be done well. Better to do one well, push it, and stop.

**Friday is "no new feature" night.** Pick the last working day of your week (whatever it is) to *not* start new tasks. Instead: review the week's PRs, update docs, plan next week, rest. Burnout kills more side projects than bugs.

**Update the docs as you build.** When something in `architecture.md` is wrong (it will be — that's normal), fix it. When the spec changes, change it. Stale docs are worse than no docs.

**Talk to me (Claude.ai) for planning, talk to Claude Code for execution.** I'm the architect and reviewer; Claude Code is the implementer. If you're hand-debugging something Claude Code wrote and feel architectural drift, that's the signal to come back here.

---

*End of build plan v0.1. Open this doc at the start of every evening session. Pick the next task. Build the thing.*
