# Milestone 1 — Task Prompts for Claude Code

**Audience:** You (Shreyash), copy-pasting these prompts into Claude Code one at a time.
**Companion docs:** `team-spec.md`, `architecture.md`, `build-plan.md`, `setup.md`. Claude Code should read these before starting any task.
**Goal of Milestone 1:** Single-user end-to-end skeleton — capture from ChatGPT, see in web app, inject into Claude. Proves the architecture works.

---

## How to use this document

For each task below:

1. Copy the **entire** task block (from the `### Task` heading down to the next `---` divider).
2. Paste it into a fresh Claude Code session, started from the repo root.
3. Claude Code will read the project context, do the work, run the embedded verification, commit on a feature branch, push, and open a PR.
4. Claude Code returns a final message summarizing what it did. Save that message.
5. Look at the task's **Review classification:**
   - **Auto-merge OK** — verify the Cloudflare Pages preview deploy succeeded, scroll through the diff on GitHub (5 min sanity read), merge the PR, delete the branch, sync local main. Move to next task.
   - **Needs review** — paste me (the planner Claude) Claude Code's final message + the PR URL + a one-line description of the preview-deploy state. I review and approve or request changes.
6. After every merge, regardless of review classification: `git checkout main && git pull && git branch -d <branch>`.

Once all 11 tasks are merged, run the milestone-end checklist at the bottom of this document.

---

## Standing rules for Claude Code (applies to every task)

These rules are repeated in every prompt as a reminder, but stating them once here as well:

- Read `CLAUDE.md`, `docs/team-spec.md`, `docs/architecture.md`, and `docs/build-plan.md` before doing anything else, unless they're already in your context.
- Work on a feature branch, never `main`. Branch naming: `feat/<task-id>-<short-slug>` or `chore/<task-id>-<short-slug>`.
- One concern per PR. If you find yourself needing to do something the task didn't ask for, stop and flag it in the PR description rather than scope-creeping.
- Strict TypeScript. No `any`. Zod schemas validate everything that crosses a boundary.
- Run the embedded verification before opening the PR. If verification fails, fix it and re-run before opening the PR — don't open a broken PR.
- Use Conventional Commits for the commit message.
- After committing and pushing, open the PR with a clear description that includes the verification output (test output, curl output, screenshots if relevant).
- The PR description must include a "Verification" section showing the actual output of the embedded checks.

---

## Task M1-T01 — Define the IR and API schemas in the shared package

**Review classification:** Auto-merge OK

**Description:**

Implement the Zod schemas in `packages/shared/src/` as specified in `docs/architecture.md` §3 (Sections 3.1, 3.2, 3.3). This is mechanically copying the Zod definitions from the architecture doc into three files and re-exporting them. Do not add new schemas not specified in the doc. Do not modify existing schemas.

**Files to create or modify:**

- `packages/shared/src/ir.ts` — exactly the schemas in architecture doc §3.1 (`PlatformSchema`, `IRSchema`, `RejectedPathSchema`, `ExchangeTurnSchema`, and inferred types `Platform`, `IR`, `RejectedPath`).
- `packages/shared/src/api.ts` — exactly the schemas in architecture doc §3.2 (Extract request/response, Artifact summary/detail, list-artifacts request/response, Team/Workspace, invite request, create-workspace request, and all inferred types).
- `packages/shared/src/platforms.ts` — exactly the `PlatformAdapter` interface in architecture doc §3.3.
- `packages/shared/src/index.ts` — re-export everything from `ir.ts`, `api.ts`, `platforms.ts`.

**Verification (run before opening PR):**

```bash
# 1. Typecheck the shared package
pnpm -F @team-ai-memory/shared typecheck

# 2. Typecheck the whole monorepo (since other workspaces import from shared)
pnpm typecheck

# 3. Sanity-check the schemas by importing them into a scratch file and parsing a fixture.
# Create packages/shared/src/_sanity-check.ts with this content (and DELETE after running):
cat > packages/shared/src/_sanity-check.ts <<'EOF'
import { IRSchema, ExtractRequestSchema } from './index';

const sampleIR = {
  version: '1' as const,
  capturedAt: new Date().toISOString(),
  source: { platform: 'chatgpt' as const, inferredTopic: 'test' },
  factualState: ['fact 1'],
  openThreads: [],
  rejectedPaths: [],
  preferences: [],
  constraints: [],
  lastExchange: [{ role: 'user' as const, content: 'hello' }],
};

const irResult = IRSchema.safeParse(sampleIR);
if (!irResult.success) {
  console.error('IR schema validation FAILED:', irResult.error);
  process.exit(1);
}

const extractReq = {
  workspaceId: '00000000-0000-0000-0000-000000000000',
  conversation: [{ role: 'user' as const, content: 'hi' }],
  sourcePlatform: 'chatgpt' as const,
};

const extractResult = ExtractRequestSchema.safeParse(extractReq);
if (!extractResult.success) {
  console.error('ExtractRequest schema validation FAILED:', extractResult.error);
  process.exit(1);
}

console.log('Schemas parse correctly.');
EOF

# Run the sanity check
pnpm -F @team-ai-memory/shared exec tsx src/_sanity-check.ts

# Delete the sanity-check file
rm packages/shared/src/_sanity-check.ts
```

(If `tsx` isn't available, install it as a dev dep in the shared package: `pnpm -F @team-ai-memory/shared add -D tsx`.)

**PR description should include:**

- Output of `pnpm typecheck` showing all four workspaces pass.
- Output of the sanity-check script showing "Schemas parse correctly."

---

## Task M1-T02 — Database schema and first migration

**Review classification:** Needs review

**Description:**

Set up Drizzle ORM in the API workspace and create the database schema and first migration as specified in `docs/architecture.md` §4.

For Milestone 1, we only need the `memory_artifacts` table and a stub `users` table (Better Auth's full table set comes in M2). Add the Postgres full-text search column and GIN index via a separate raw SQL migration.

**Files to create or modify:**

- `apps/api/drizzle.config.ts` — Drizzle Kit config pointing to the schema file, the migrations dir, and using `DATABASE_URL` from `.env.local` for local migration runs.
- `apps/api/src/db/schema.ts` — Drizzle schema for `users` (stub: id, email, name, createdAt) and `memory_artifacts` (per architecture §4.1) plus the platform `pgEnum`.
- `apps/api/src/db/client.ts` — exports `createDb(databaseUrl: string)` returning a Drizzle client over the Neon HTTP driver, per architecture §4.3.
- `apps/api/src/db/migrations/0001_initial.sql` — Drizzle-generated migration for the two tables.
- `apps/api/src/db/migrations/0002_artifacts_fts.sql` — manual migration adding the `search_vector` generated column and GIN index per architecture §4.2.
- `apps/api/package.json` — add dev deps (`drizzle-kit`, `drizzle-orm`, `@neondatabase/serverless`), add scripts `db:generate`, `db:migrate`, `db:studio`.
- `apps/api/.env.local.example` — template file documenting the env vars needed for local dev (DATABASE_URL).

**Important:**

- Do NOT commit `.env.local` (gitignored already).
- The `users` table here is a stub for M1. M2 will replace it with the Better Auth-managed version. Add a comment in the schema noting this.
- Generate the initial migration with `pnpm -F api run db:generate`. Apply it with `pnpm -F api run db:migrate`. Both should succeed against Neon.

**Verification (run before opening PR):**

```bash
# 1. Make sure DATABASE_URL is in apps/api/.env.local for local dev
# (User: you should already have this from setup. If not, paste your Neon connection string.)

# 2. Generate the migration
pnpm -F api run db:generate

# 3. Apply migrations to Neon
pnpm -F api run db:migrate

# 4. Apply the manual FTS migration (since Drizzle Kit won't generate it)
# Use psql or Drizzle Studio to run the contents of 0002_artifacts_fts.sql.
# Or add a node script that runs it; whichever is cleaner.

# 5. Verify the tables exist by listing them
pnpm -F api exec drizzle-kit introspect

# 6. Sanity insert + select
# Add a tiny script src/db/_smoke.ts that inserts one memory_artifacts row and selects it back.
# Run it, confirm the row round-trips. Delete the script after.

# 7. Typecheck
pnpm typecheck
```

**PR description should include:**

- Output confirming `db:generate` succeeded.
- Output confirming `db:migrate` succeeded.
- Output of the smoke test showing insert/select round-trip.
- Note about FTS migration: how you applied it (and confirmation that the GIN index exists, via a `\d memory_artifacts` query or equivalent).
- Confirmation that `pnpm typecheck` passes.

**Why this is "needs review":** Drizzle has subtle gotchas with Postgres enums, generated columns, and the Neon HTTP driver. I want eyes on the first DB PR.

---

## Task M1-T03 — LLM provider abstraction + Anthropic implementation + extraction prompt v1

**Review classification:** Needs review

**Description:**

Implement the `LLMProvider` interface and the Anthropic implementation per `docs/architecture.md` §5.5. This is the most architecturally important code in M1 — the extraction engine — so write it carefully.

The prompt v1 is your responsibility to draft. It should target the five context layers from `docs/team-spec.md` §6.1 (factual state, open threads, rejected paths, preferences, constraints) plus the `lastExchange` for pickup continuity. The prompt should instruct the model to return JSON validating against `IRSchema`. Use Anthropic's tool-use feature for structured output (define a tool whose input schema matches the IR JSON shape).

**Files to create or modify:**

- `apps/api/src/lib/llm/types.ts` — the `LLMProvider` interface from architecture §5.5.
- `apps/api/src/lib/llm/anthropic.ts` — implementation using `@anthropic-ai/sdk`. Use the current Haiku model — look up the latest model ID on docs.anthropic.com (don't hardcode an out-of-date name from memory).
- `apps/api/src/lib/llm/prompts/extract-v1.ts` — the system prompt + tool definition. Export a `getExtractionPrompt(sourcePlatform: Platform)` function and a `getExtractionTool()` function that returns the Anthropic tool spec derived from `IRSchema`.
- `apps/api/src/lib/llm/anthropic.test.ts` — Vitest unit tests against a fixed sample conversation. The test should:
  - Set up a real Anthropic API call (not a mock) using the API key from `apps/api/.env.local`.
  - Pass a 10-turn synthetic conversation about, say, "user debugging a Next.js deployment issue."
  - Assert the returned IR validates against `IRSchema`.
  - Assert `factualState` and `lastExchange` are non-empty.
  - Mark the test as skipped if `ANTHROPIC_API_KEY` env var isn't set, so CI doesn't fail on missing secrets.
- `apps/api/package.json` — add `@anthropic-ai/sdk` as a dep, and `vitest` + `@types/node` as dev deps if not present. Add a `test` script: `"test": "vitest run"`.

**Error handling Claude Code must implement:**

- On Zod validation failure of the returned IR, retry once with the validation error as a follow-up message to the model.
- On second validation failure, throw a typed error.
- On 429 or 5xx from Anthropic, throw a typed error for the route to translate to an HTTP response.

**Verification (run before opening PR):**

```bash
# 1. Make sure ANTHROPIC_API_KEY is in apps/api/.env.local
# (You set this in setup. If not, paste your sk-ant-... key into apps/api/.env.local.)

# 2. Run the unit test (this DOES hit the real Anthropic API; it'll cost a few cents)
pnpm -F api test

# 3. Typecheck the whole monorepo
pnpm typecheck
```

**PR description should include:**

- Output of `pnpm -F api test` showing the test passed against the real Anthropic API.
- A pretty-printed example IR from the test run (so I can see what the extraction looks like).
- The text of the prompt v1 (or a link to the file).
- Confirmation that the implementation handles 429, 5xx, and validation failures as specified.

**Why this is "needs review":** This is the core IP. I want to read the prompt and the IR output before this hits main.

---

## Task M1-T04 — Prompt eval harness with 10 real chats

**Review classification:** Needs review

**Description:**

Build a CLI eval harness that runs the Anthropic extraction against a fixture set of real chat transcripts, per `docs/build-plan.md` Task M1-T04 and `docs/architecture.md` §10.

The harness is a Node CLI that loads JSON fixtures, runs extraction on each, and produces a markdown report. The report goes in `apps/api/src/eval/results/baseline.md`.

**Files to create or modify:**

- `apps/api/src/eval/fixtures/` — 10 anonymized real chats as JSON files. Schema: `{ name: string, description: string, conversation: ExchangeTurn[] }`. **Action for the developer (you, Shreyash):** before running this prompt, export 10 real chats from ChatGPT/Claude/Gemini, anonymize them (replace names, companies, anything sensitive), and save them as JSON in this directory. If you don't have 10 real chats handy, Claude Code can generate 10 plausible synthetic conversations covering different domains (debugging, drafting, brainstorming, planning, etc.) — flag this to me in the PR if you go this route.
- `apps/api/src/eval/run.ts` — CLI entrypoint. For each fixture, runs extraction, collects the IR + latency + token usage + cost estimate.
- `apps/api/src/eval/report.ts` — renders the collected results to markdown.
- `apps/api/src/eval/results/baseline.md` — the actual rendered report, committed to the repo.
- `apps/api/package.json` — add `eval` script: `"eval": "tsx src/eval/run.ts"`.

The report should include, per fixture:
- Fixture name and description.
- Latency (ms) and approximate cost ($).
- The extracted IR pretty-printed.
- A brief author's-eye assessment (2-3 sentences) of what the extraction got right and what it missed. This part is qualitative — Claude Code writes its honest take.

**Verification (run before opening PR):**

```bash
# 1. Make sure ANTHROPIC_API_KEY is in apps/api/.env.local

# 2. Run the eval
pnpm -F api run eval

# 3. Open the report and read through it
open apps/api/src/eval/results/baseline.md   # or `cat` it
```

**PR description should include:**

- Confirmation that the eval ran against all 10 fixtures.
- A summary line: total latency, total cost, any fixtures where extraction visibly failed or produced poor output.
- Note whether fixtures are real-anonymized or synthetic.
- A link to the committed `baseline.md` report.

**Why this is "needs review":** I want to read the baseline report and confirm extraction quality is good enough to move forward. If the prompt has obvious blind spots, we'll iterate before continuing.

---

## Task M1-T05 — Render IR to markdown primer (Standard length)

**Review classification:** Auto-merge OK

**Description:**

Implement `renderPrimer(ir: IR): string` per `docs/team-spec.md` §6.4 (continuous-user framing, ~400 words target) and `docs/architecture.md` §6.

The renderer is a pure function. Given the same IR, returns the same markdown. Uses the "continuous-user framing" — written in the user's voice as a recap, not as the AI's memory.

**Files to create or modify:**

- `apps/api/src/lib/render.ts` — exports `renderPrimer(ir: IR): string`.
- `apps/api/src/lib/render.test.ts` — Vitest tests covering: empty arrays render gracefully (no empty sections shown), full IR renders all sections, output is valid markdown, output is within target length range (300-500 words for Standard).

**The primer structure:**

The primer should read like a natural user recap. Approximate template:

```
Quick recap before we keep going:

I'm working on [inferredTopic]. Here's where we are:

- [factualState items as a natural list]

[Open threads section, only if non-empty]
A few things still open: [openThreads as natural prose]

[Rejected paths section, only if non-empty]
We tried [tried] but [whyFailed] — so let's not go back there.

[Preferences section, only if non-empty]
A few preferences to keep in mind: [preferences].

[Constraints section, only if non-empty]
Constraints: [constraints].

Picking up where we left off: [last exchange recap]
```

The renderer should be smart about omitting empty sections (no "We tried" header followed by nothing) and natural-feeling prose, not a rigid template.

**Verification (run before opening PR):**

```bash
# 1. Run the renderer tests
pnpm -F api test -- render

# 2. Pipe one of the eval baseline IRs through the renderer and eyeball the output
# Add src/lib/_render-eyeball.ts that imports a fixture IR (from src/eval/results/),
# renders it, and prints the result. Run with tsx. Delete after.

# 3. Typecheck
pnpm typecheck
```

**PR description should include:**

- Test output showing the suite passes.
- Example rendered primer pasted into the PR description (so I can read what the output looks like).
- Word count of the example output (should be ~300-500).

---

## Task M1-T06 — POST /extract endpoint (placeholder auth)

**Review classification:** Needs review

**Description:**

Implement the `POST /extract` route per `docs/architecture.md` §5.4 and §5.2. For Milestone 1, skip real auth: accept a request with a hardcoded placeholder `workspaceId` and a hardcoded fake `userId` (e.g., the string `"m1-placeholder-user"`).

Add the user-existence stub: in `db:migrate` or as a seed script, ensure a row exists in `users` with that placeholder ID so foreign-key constraints don't blow up. Same for a placeholder workspace row in `memory_artifacts.workspaceId` — actually, since we don't have a workspaces table yet in M1, the `memory_artifacts` table has `workspaceId` as a plain `uuid` column without a foreign-key constraint until M2 adds the workspaces table. Confirm this matches the M1 schema we created in T02.

**Files to create or modify:**

- `apps/api/src/routes/extract.ts` — the Hono route, validating with `ExtractRequestSchema`, calling extraction, rendering primer, persisting via Drizzle, returning `ExtractResponseSchema`-shaped JSON.
- `apps/api/src/lib/extract.ts` — orchestration glue: calls the Anthropic provider, on Zod validation retry, etc.
- `apps/api/src/index.ts` — mount the route.
- `apps/api/src/lib/seed.ts` (new) — script that ensures the placeholder user exists. Run as part of the verification.

**Verification (run before opening PR):**

```bash
# 1. Seed the placeholder user
pnpm -F api exec tsx src/lib/seed.ts

# 2. Run the dev server
pnpm -F api dev &
sleep 5

# 3. POST to /extract with a sample conversation
curl -X POST http://localhost:8787/extract \
  -H "Content-Type: application/json" \
  -d '{
    "workspaceId": "00000000-0000-0000-0000-000000000001",
    "conversation": [
      {"role": "user", "content": "Help me debug a Next.js hydration error"},
      {"role": "assistant", "content": "Sure — can you paste the error?"},
      {"role": "user", "content": "Error: Hydration failed because the server rendered HTML didn'\''t match the client"}
    ],
    "sourcePlatform": "chatgpt"
  }'

# 4. Verify the response matches ExtractResponseSchema:
#    - status 200
#    - body has artifactId, title, summaryLine, primer, ir, meta
#    - primer is non-empty markdown
#    - ir validates against IRSchema

# 5. Verify the artifact persisted to the database
pnpm -F api exec drizzle-kit studio
# Visually confirm there's a row in memory_artifacts

# 6. Deploy and test against prod
pnpm -F api run deploy
curl -X POST https://team-ai-memory-api.<your-subdomain>.workers.dev/extract \
  -H "Content-Type: application/json" \
  -d '<same body>'

# 7. Stop the dev server
kill %1
```

**PR description should include:**

- curl output from the local request.
- curl output from the prod request.
- Drizzle Studio screenshot (or row dump) showing the artifact persisted.
- Confirmation that latency was under 6 seconds for a typical 20-turn conversation (sanity check).

**Why this is "needs review":** First end-to-end flow that touches every layer (validation, LLM, render, persist). Worth a careful look before continuing.

---

## Task M1-T07 — GET /artifacts endpoints (placeholder auth)

**Review classification:** Auto-merge OK

**Description:**

Add `GET /artifacts/:id` and `GET /artifacts?workspaceId=<id>&q=<query>` endpoints per `docs/architecture.md` §5.2. Same M1 auth caveat as T06 — placeholder user/workspace IDs.

The list endpoint supports full-text search via Postgres tsvector. Use the `search_vector` column from the FTS migration in T02.

**Files to create or modify:**

- `apps/api/src/routes/artifacts.ts` — the two endpoints.
- `apps/api/src/index.ts` — mount the route.
- Response shapes match `ArtifactSummarySchema` / `ArtifactDetailSchema` / `ListArtifactsResponseSchema` from the shared package.

**Verification (run before opening PR):**

```bash
# Assumes the placeholder workspace already has at least one artifact from T06 testing.

# 1. Local dev server
pnpm -F api dev &
sleep 5

# 2. List artifacts
curl "http://localhost:8787/artifacts?workspaceId=00000000-0000-0000-0000-000000000001"

# 3. Search artifacts with a relevant query
curl "http://localhost:8787/artifacts?workspaceId=00000000-0000-0000-0000-000000000001&q=hydration"

# 4. Get artifact detail
ARTIFACT_ID=$(curl -s "http://localhost:8787/artifacts?workspaceId=00000000-0000-0000-0000-000000000001" | jq -r '.artifacts[0].id')
curl "http://localhost:8787/artifacts/$ARTIFACT_ID"

# 5. Validate response shapes against the schema
# (Claude Code: write a small script that fetches and validates with Zod.)

# 6. Deploy and verify prod
pnpm -F api run deploy
# Repeat steps 2-4 against the prod URL.

kill %1
```

**PR description should include:**

- curl outputs from list, search, and detail.
- Confirmation that responses validate against the shared Zod schemas.

---

## Task M1-T08 — Web app: artifact list and detail pages (no auth)

**Review classification:** Needs review

**Description:**

Replace the placeholder Vite + React skeleton with a real two-page interface using TanStack Router and TanStack Query, per `docs/architecture.md` §7. Install Tailwind, configure shadcn/ui, and use a few shadcn components (Card, Input, Button) for basic styling.

For M1 there's no auth and no workspace switcher — the app reads from the placeholder workspace ID hardcoded in a constants file.

**Files to create or modify:**

- `apps/web/tailwind.config.ts` — Tailwind config with the shadcn-recommended setup.
- `apps/web/postcss.config.js` — PostCSS config for Tailwind.
- `apps/web/src/index.css` — Tailwind base/components/utilities + shadcn CSS variables.
- `apps/web/components.json` — shadcn CLI config.
- `apps/web/src/components/ui/` — shadcn components installed via CLI: `button`, `card`, `input`. Use `pnpm dlx shadcn@latest add button card input` from the apps/web directory.
- `apps/web/src/routes/__root.tsx` — TanStack Router root layout.
- `apps/web/src/routes/index.tsx` — artifact list page (search input + list of cards).
- `apps/web/src/routes/artifacts.$id.tsx` — artifact detail page (primer rendered as markdown + collapsible IR sections).
- `apps/web/src/router.tsx` — router setup.
- `apps/web/src/main.tsx` — wires QueryClientProvider and RouterProvider.
- `apps/web/src/lib/api.ts` — typed API client (fetch wrapper) using the shared Zod schemas for response validation.
- `apps/web/src/lib/constants.ts` — exports the placeholder workspace ID.
- `apps/web/src/lib/queries.ts` — TanStack Query hooks: `useArtifacts(query?)`, `useArtifact(id)`.
- `apps/web/package.json` — add `@tanstack/react-router`, `@tanstack/react-query`, `react-markdown`, Tailwind deps. Add `@tanstack/router-plugin` to dev deps.
- `apps/web/vite.config.ts` — add the TanStack Router plugin.

**Verification (run before opening PR):**

```bash
# 1. Dev server
pnpm -F web dev &
sleep 5

# 2. Open localhost:5173 in browser (or use a headless check)
# Verify:
#   - List page shows the artifact(s) from the placeholder workspace
#   - Search input filters results
#   - Clicking a card navigates to /artifacts/<id>
#   - Detail page shows primer rendered as markdown
#   - Detail page shows IR sections (factualState, openThreads, etc.) below

# 3. Build for production
pnpm -F web build

# 4. Typecheck
pnpm typecheck

# 5. Push and confirm Cloudflare Pages preview deploy succeeds
# (The PR opens a preview at <pr-hash>.team-ai-memory.pages.dev; open it in browser, verify same behavior as localhost.)

kill %1
```

**PR description should include:**

- Screenshots of the list page (with at least one artifact) and the detail page from the preview deploy.
- `pnpm typecheck` passing.
- `pnpm -F web build` succeeding without warnings.
- A note about any styling rough edges that we'll polish in M3 — not a v1 problem.

**Why this is "needs review":** First user-facing UI. Worth a careful look at the data flow, the styling baseline, and the routing setup.

---

## Task M1-T09 — Extension: ChatGPT capture (placeholder auth)

**Review classification:** Needs review

**Description:**

Build the ChatGPT capture flow per `docs/architecture.md` §8 and `docs/build-plan.md` M1-T09.

The extension's popup, when opened on a ChatGPT page, scrapes the conversation from the DOM, POSTs to the deployed `/extract` endpoint with the placeholder workspace ID, and shows a success toast.

For M1 there's no auth and no workspace picker — captures go to a single hardcoded workspace ID. We add the picker in M2.

**Files to create or modify:**

- `apps/extension/adapters/types.ts` — re-export `PlatformAdapter` from `@team-ai-memory/shared/platforms`.
- `apps/extension/adapters/chatgpt.ts` — implements the `PlatformAdapter` interface for chatgpt.com / chat.openai.com. The `scrapeConversation` method must walk the DOM and produce `ExchangeTurn[]` correctly distinguishing user vs assistant. Handle code blocks (preserve as ``` fences). Handle the "load earlier messages" case by scrolling to the top first if not all messages are visible.
- `apps/extension/adapters/index.ts` — `getAdapterForUrl(url): PlatformAdapter | null`.
- `apps/extension/entrypoints/content/chatgpt.content.ts` — content script that runs on chatgpt.com pages. Exposes a message handler that responds to `{ type: 'SCRAPE' }` from the popup with the scraped conversation.
- `apps/extension/entrypoints/popup/main.tsx` and `apps/extension/entrypoints/popup/App.tsx` — Preact popup. Two states: "on a capturable page" (shows Capture button) and "not on a capturable page" (shows a hint).
- `apps/extension/lib/api.ts` — extension-side API client posting to the deployed Worker.
- `apps/extension/lib/messaging.ts` — typed wrapper around `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage`.
- `apps/extension/lib/constants.ts` — placeholder workspace ID, API base URL.

**Discovering the ChatGPT DOM selectors:**

ChatGPT's DOM changes periodically. Find current selectors by:
- Opening chatgpt.com in Chrome
- Right-clicking on a user message → Inspect → finding the stable selector for `[data-message-author-role="user"]` or whatever the current attribute is
- Same for assistant messages
- Same for the chat container

Document the selectors as constants at the top of `chatgpt.ts` with a comment about when they were verified.

**Verification (run before opening PR):**

```bash
# 1. Build the extension
pnpm -F extension build

# 2. Load it as unpacked extension in Chrome
# - Open chrome://extensions
# - Enable Developer Mode
# - Click "Load unpacked"
# - Select apps/extension/.output/chrome-mv3

# 3. Test the capture flow
# - Go to chatgpt.com and have a short test conversation (3-5 turns)
# - Click the extension's toolbar icon
# - Confirm the popup shows the Capture button
# - Click Capture
# - Wait for the toast
# - Open the web app preview URL (or localhost:5173) and confirm the captured artifact appears in the list
# - Click the artifact and confirm the primer reads reasonably

# 4. Typecheck
pnpm typecheck
```

**PR description should include:**

- Screen recording (Loom or QuickTime) of the full capture flow: ChatGPT conversation → click extension → see success toast → see artifact in web app.
- The DOM selectors used for ChatGPT, with a note about when they were verified working.
- Any edge cases not yet handled (e.g., very long conversations, image messages — flag them as known limitations for later milestones).

**Why this is "needs review":** First piece of code that touches a third-party site we don't control. I want to look at the selector strategy and the scraping logic before this lands.

---

## Task M1-T10 — Extension: Claude injection (placeholder auth)

**Review classification:** Needs review

**Description:**

Build the Claude injection flow per `docs/architecture.md` §8 and `docs/build-plan.md` M1-T10.

When the user clicks the extension on a claude.ai page, the popup shows a list of recent artifacts from the placeholder workspace (fetched from the deployed API). Selecting one fetches the primer and injects it into Claude's input box using native-setter input simulation (since React-controlled inputs won't accept naive `.value =` assignment).

**Files to create or modify:**

- `apps/extension/adapters/claude.ts` — implements `PlatformAdapter` for claude.ai. `canCapture` is `false` in M1; `canInject` is `true`. The `injectPrimer(text)` method must work against Claude's React-controlled input.
- `apps/extension/adapters/index.ts` — register the Claude adapter.
- `apps/extension/entrypoints/content/claude.content.ts` — content script for claude.ai. Responds to `{ type: 'INJECT', text: string }` messages by calling the adapter's `injectPrimer`.
- `apps/extension/entrypoints/popup/App.tsx` — add a third popup mode: "on an injectable page" (shows artifact picker + Inject button per selected artifact).
- `apps/extension/lib/api.ts` — add `listArtifacts()` and `getArtifact(id)` methods.

**The "native setter" trick for React inputs:**

React stores its own internal `value` in a fiber node, and overrides the input's native setter. To inject text that React will pick up, you must call the *original* native setter, then dispatch an `input` event so React's onChange handler fires. Boilerplate:

```typescript
const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLTextAreaElement.prototype,
  'value'
)!.set!;

nativeInputValueSetter.call(textarea, text);
textarea.dispatchEvent(new Event('input', { bubbles: true }));
```

Adjust if Claude uses ProseMirror (which it does in some versions) — for ProseMirror you may need a different injection approach (focus + execCommand('insertText') or directly manipulating the editor's state). Find the current Claude input element type during implementation and document what you used.

**Verification (run before opening PR):**

```bash
# 1. Build the extension
pnpm -F extension build

# 2. Reload it in chrome://extensions (or load fresh)

# 3. Test the injection flow
# - Go to claude.ai and start a fresh conversation
# - Click the extension toolbar icon
# - Confirm the popup shows the artifact list (from the test artifact created in T09 or T06)
# - Click an artifact
# - Confirm the primer text appears in Claude's input box
# - Confirm the text is editable (not just visually present — React state was updated)
# - Press Enter; Claude should respond as if the recap were a normal user message

# 4. Verify the end-to-end demo
# - Capture from ChatGPT → see in web app → inject into Claude → Claude continues the conversation coherently

# 5. Typecheck
pnpm typecheck
```

**PR description should include:**

- Screen recording of the full end-to-end loop: ChatGPT capture → web app appearance → Claude injection → Claude continuation.
- A note about what input element type Claude uses (textarea vs ProseMirror) and what injection method worked.
- Any failure modes encountered (so future-us knows where the fragile points are).

**Why this is "needs review":** Closes the loop. Worth a careful look at the injection technique because that's the area most likely to break with future Claude UI updates.

---

## Task M1-T11 — Milestone 1 retro and architecture-doc updates

**Review classification:** Needs review

**Description:**

With the M1 loop closed, write a short retro and update the docs to reflect reality.

**Files to create or modify:**

- `docs/m1-retro.md` — new file. Sections: "what surprised us," "what the eval taught us about the extraction prompt," "what we'd change in the architecture," "what M1 actually took (time + token cost)," "what's deferred to M1.5 / known limitations going into M2."
- `docs/architecture.md` — modify any sections where reality drifted from the doc. Don't pretend the doc was always right; explicitly note in a commit comment what changed.
- `docs/team-spec.md` — same. Honest updates.
- `docs/m1-prompts.md` — annotate this document (the prompts file) with one-line notes per task: what went easy, what went hard. Useful when we write the M2 prompts.

**Verification (run before opening PR):**

The retro is judgment work, not testable. Open the PR and ping me directly — I'll read the retro carefully before approving.

Also: **record a 60-90 second screen capture of the full M1 demo** (ChatGPT capture → web app → Claude injection → Claude continuing the conversation). Embed the link in `m1-retro.md`. This becomes the artifact you can show friendlies/investors as proof the architecture works, and the baseline against which M2 and M3 are measured.

**PR description should include:**

- Link to the screen recording.
- A bulleted list of things the doc updates address (so I can scan and approve quickly).
- A one-paragraph "what I learned" reflection — what you'd tell a future founder building this kind of product.

**Why this is "needs review":** Closing the milestone properly is more important than any individual task. I want a real conversation about what M1 taught us before we charge into M2.

---

## Milestone 1 end-of-milestone checklist

Once all 11 PRs are merged, run through this checklist before declaring M1 complete:

- [ ] `pnpm typecheck` passes across all four workspaces.
- [ ] `pnpm -F api test` passes (extraction + render tests).
- [ ] The deployed Worker's `/health`, `/extract`, `/artifacts`, `/artifacts/:id` endpoints all respond correctly.
- [ ] The deployed web app (team-ai-memory.pages.dev) shows artifacts from the placeholder workspace.
- [ ] The extension, loaded unpacked, can capture from ChatGPT and inject into Claude.
- [ ] The 60-90 second demo recording exists.
- [ ] The retro doc is committed.
- [ ] Architecture and spec docs reflect reality.
- [ ] No outstanding PRs against `main`.
- [ ] No untracked or uncommitted changes in your local working tree.

When all green, ping me — we'll talk about M2 (real auth, real teams, real workspaces) before the next batch of prompts.

---

*End of M1 prompts. ~3,800 words. Estimated 2-3 calendar weeks of evening work to complete all 11 tasks.*
