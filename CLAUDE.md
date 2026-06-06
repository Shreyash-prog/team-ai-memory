# Project context for Claude Code

This is **Team AI Memory** — a B2B SaaS that gives small AI-native teams a shared, searchable memory across ChatGPT, Claude, and Gemini conversations.

**Read first, in order:** `docs/team-spec.md`, `docs/architecture.md`, `docs/build-plan.md`.
Those documents are authoritative; do not deviate from them without explicit instruction.

## Stack
- pnpm monorepo, TypeScript end-to-end
- Frontend: Vite + React + TanStack Router + TanStack Query + Tailwind + shadcn/ui
- Extension: WXT + Preact + Tailwind, Manifest V3, Chromium-only
- Backend: Hono on Cloudflare Workers
- Database: Neon Postgres via Drizzle ORM
- Auth: Better Auth (magic links) + Resend
- LLM: Anthropic Claude Haiku via the Messages API (single provider for v1; abstraction layer preserved for future providers)
- Shared types live in `packages/shared/`

## Conventions
- Strict TypeScript everywhere; no `any`.
- Zod schemas for any data crossing a boundary (API request/response, IR, stored JSON).
- Drizzle for all DB queries; no raw SQL except for the FTS migration.
- All new code goes behind a feature branch and PR — no commits straight to `main`.
- One concern per PR.
- Conventional Commits for commit messages (`feat:`, `fix:`, `chore:`, `docs:`).

## Where things live
- API endpoints: `apps/api/src/routes/`
- DB schema: `apps/api/src/db/schema.ts`
- Shared schemas: `packages/shared/src/`
- Web routes: `apps/web/src/routes/`
- Extension entrypoints: `apps/extension/entrypoints/`
- Platform adapters: `apps/extension/adapters/`

## What to avoid
- Don't introduce new dependencies without asking (the stack is intentional).
- Don't add tests for trivial code; do add tests for extraction, rendering, and permission middleware.
- Don't change the data model without updating the architecture doc.
- Don't reach into one app's directory from another app — go through `packages/shared/`.
