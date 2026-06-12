# Team AI Memory

Team AI Memory is a B2B SaaS that gives small, AI-native teams a shared, searchable memory across their ChatGPT, Claude, and Gemini conversations. A browser extension captures a conversation, the backend distills it into a structured **memory artifact** — the established facts, open threads, rejected approaches, preferences, and constraints — and stores it in the team's workspace. Anyone on the team can then search those artifacts on the web app, or pull one back into a fresh AI chat as a primer to continue the work. The context that normally dies in one person's chat window becomes a durable team asset.

## See it live

**https://team-ai-memory.pages.dev**

Open it and you'll land on the **Memory artifacts** list — three artifacts captured during development (a Next.js hydration-error debugging session, an API rate-limiter design discussion, and another Next.js debugging thread). Click any artifact to open its detail view: a rendered **primer** (a markdown recap of the conversation, written in your own voice to paste into a new chat) and the underlying structured **IR** — `factualState`, `openThreads`, `rejectedPaths`, `preferences`, `constraints`, and `lastExchange`. The search box runs full-text search across artifacts using Postgres `tsvector`.

A few things to be upfront about:

- This is **Milestone 1**, a single-user skeleton. There is no auth and no sign-in — everything reads from one hardcoded placeholder workspace.
- The data is **synthetic test conversations** created during development, not real user data.
- The **browser extension** (capture from ChatGPT, inject into Claude) is in progress. M1 closes when the injection task (T10) ships.

## What's built / what's coming

- **M1 — single-user end-to-end skeleton (in progress).** Shared schemas, Neon + Drizzle data model, Claude Haiku extraction with a prompt eval harness, IR-to-primer rendering, the `/extract` and `/artifacts` API, and the web list/detail UI. 9 of 11 tasks merged; the ChatGPT-capture extension (T09) is in review and Claude injection (T10) closes the milestone.
- **M2 — multi-user (next).** Better Auth magic links, real teams and workspaces, the extension "connect" auth flow and workspace picker, cross-workspace search, sensitive-content guardrails, per-user rate limits, and Sentry/PostHog wiring.
- **M3 — polish (final).** Visual polish across the web app and extension, a public landing page, Gemini support, and Chrome Web Store submission.

## For developers

- [`docs/team-spec.md`](docs/team-spec.md) — product spec and positioning.
- [`docs/architecture.md`](docs/architecture.md) — full architecture, data model, and API contracts.
- [`docs/build-plan.md`](docs/build-plan.md) — milestone-by-milestone task plan.

See [`CLAUDE.md`](CLAUDE.md) for the project context and conventions used by Claude Code.

## Tech stack

pnpm monorepo · Vite + React + TanStack on Cloudflare Pages · Hono on Cloudflare Workers · Neon Postgres + Drizzle · Anthropic Claude Haiku for extraction · WXT + Preact for the Chromium extension.
