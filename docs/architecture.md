# Team AI Memory — Architecture (POC v1)

**Status:** Draft v0.1 (replaces the old `architecture.md`, which described the individual product)
**Companion docs:** `team-spec.md` (product spec), `setup.md` (next), `build-plan.md` (after that)
**Audience:** The developer (you), Claude Code (which will read this before writing any code), future contributors.

This document is intentionally code-heavy. It includes Drizzle schemas, type definitions, and API shapes so that Claude Code has concrete artifacts to read rather than just prose. If something is ambiguous in this doc, that's a bug — please flag and we'll fix it before any code is written.

---

## 1. System overview

Four deployed components plus three external services.

```
                                                    ┌──────────────────┐
                                                    │  Anthropic API   │
                                                    │  (Claude Haiku)  │
                                                    └────────▲─────────┘
                                                             │
   ┌────────────────────┐         ┌─────────────────────┐    │
   │                    │ HTTPS   │                     │────┘
   │  Browser Extension │◄───────►│  Hono on Workers    │
   │  (WXT + Preact)    │ + cookie│  (api.<domain>)     │────► Neon Postgres
   │                    │ session │                     │      (via Drizzle)
   └─────────▲──────────┘         └──────────▲──────────┘
             │                               │
             │ (same auth session)           │
             │                               │
   ┌─────────▼──────────┐         ┌──────────▼──────────┐
   │                    │ HTTPS   │                     │
   │  Web App           │◄───────►│  Hono on Workers    │
   │  (Vite + React)    │ + cookie│  (same backend)     │────► Resend (email)
   │  Cloudflare Pages  │ session │                     │
   └────────────────────┘         └─────────────────────┘
```

A single Hono-on-Workers backend serves both the web app and the extension. They share authentication via the same session cookie issued by Better Auth. The backend talks to Neon Postgres for application data, Anthropic's API for extraction, and Resend for sending magic-link emails.

No background queue, no Redis, no separate workers. v1 keeps it stateless and synchronous.

## 2. The monorepo

We use a pnpm workspaces monorepo. Single repository, multiple packages, shared types and utilities.

```
team-ai-memory/
├── apps/
│   ├── web/                    # Vite + React + TanStack Router
│   │   ├── src/
│   │   │   ├── routes/         # File-based routes via TanStack Router
│   │   │   ├── components/     # shadcn/ui + app-specific components
│   │   │   ├── lib/            # API client, auth client, utilities
│   │   │   ├── main.tsx
│   │   │   └── router.tsx
│   │   ├── index.html
│   │   ├── tailwind.config.ts
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   ├── extension/              # WXT + Preact extension
│   │   ├── entrypoints/
│   │   │   ├── background.ts   # Service worker
│   │   │   ├── popup/          # Toolbar popup (Preact)
│   │   │   └── content/        # Per-platform content scripts
│   │   │       ├── chatgpt.content.ts
│   │   │       └── claude.content.ts
│   │   ├── lib/                # Extension-specific utilities
│   │   ├── adapters/           # Platform-specific scrape/inject logic
│   │   │   ├── types.ts
│   │   │   ├── chatgpt.ts
│   │   │   └── claude.ts
│   │   ├── wxt.config.ts
│   │   └── package.json
│   │
│   └── api/                    # Hono on Cloudflare Workers
│       ├── src/
│       │   ├── routes/         # Hono route handlers
│       │   │   ├── auth.ts     # Better Auth handler mount
│       │   │   ├── teams.ts
│       │   │   ├── workspaces.ts
│       │   │   ├── artifacts.ts
│       │   │   └── extract.ts
│       │   ├── db/
│       │   │   ├── schema.ts   # Drizzle schema definitions
│       │   │   ├── client.ts   # Drizzle client setup
│       │   │   └── migrations/ # Drizzle migrations
│       │   ├── lib/
│       │   │   ├── auth.ts     # Better Auth config
│       │   │   ├── llm/        # LLM provider abstraction (keep abstraction for future flexibility)
│       │   │   │   ├── types.ts
│       │   │   │   └── anthropic.ts
│       │   │   ├── render.ts   # IR → markdown primer renderer
│       │   │   └── extract.ts  # Extraction orchestration
│       │   ├── middleware/
│       │   │   ├── auth.ts     # Require-session middleware
│       │   │   └── workspace.ts # Workspace permission middleware
│       │   └── index.ts        # Hono app, route mounting
│       ├── wrangler.toml
│       └── package.json
│
├── packages/
│   └── shared/                 # Shared types, schemas, validation
│       ├── src/
│       │   ├── ir.ts           # IR Zod schema (single source of truth)
│       │   ├── api.ts          # Request/response Zod schemas
│       │   ├── platforms.ts    # Platform enum, adapter contract types
│       │   └── index.ts
│       └── package.json
│
├── package.json                # Root, defines workspaces
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .gitignore
├── README.md
└── docs/
    ├── team-spec.md
    ├── architecture.md         # This document
    ├── setup.md
    └── build-plan.md
```

Three apps plus one shared package. The shared package is the boundary across which types flow. Apps depend on `@team-ai-memory/shared` via the workspace protocol; they never reach into each other.

## 3. The shared package

This is the contract. Both extension and web app depend on it; the API uses it for request/response validation.

### 3.1 The Intermediate Representation (IR)

`packages/shared/src/ir.ts`:

```typescript
import { z } from 'zod';

export const PlatformSchema = z.enum(['chatgpt', 'claude', 'gemini']);
export type Platform = z.infer<typeof PlatformSchema>;

export const RejectedPathSchema = z.object({
  tried: z.string(),
  whyFailed: z.string(),
});

export const ExchangeTurnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});

export const IRSchema = z.object({
  version: z.literal('1'),
  capturedAt: z.string().datetime(),
  source: z.object({
    platform: PlatformSchema,
    inferredTopic: z.string(),
  }),
  factualState: z.array(z.string()),
  openThreads: z.array(z.string()),
  rejectedPaths: z.array(RejectedPathSchema),
  preferences: z.array(z.string()),
  constraints: z.array(z.string()),
  lastExchange: z.array(ExchangeTurnSchema).max(4),
});

export type IR = z.infer<typeof IRSchema>;
export type RejectedPath = z.infer<typeof RejectedPathSchema>;
```

### 3.2 The API contracts

`packages/shared/src/api.ts`:

```typescript
import { z } from 'zod';
import { IRSchema, PlatformSchema, ExchangeTurnSchema } from './ir';

// ===== Capture / Extract =====

export const ExtractRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  conversation: z.array(ExchangeTurnSchema).min(1),
  sourcePlatform: PlatformSchema,
  userProvidedTitle: z.string().min(1).max(200).optional(),
});

export const ExtractResponseSchema = z.object({
  artifactId: z.string().uuid(),
  title: z.string(),
  summaryLine: z.string(),
  primer: z.string(),
  ir: IRSchema,
  meta: z.object({
    latencyMs: z.number(),
    provider: z.string(),
    truncated: z.boolean(),
  }),
});

export type ExtractRequest = z.infer<typeof ExtractRequestSchema>;
export type ExtractResponse = z.infer<typeof ExtractResponseSchema>;

// ===== Artifacts =====

export const ArtifactSummarySchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  createdBy: z.object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string().email(),
  }),
  sourcePlatform: PlatformSchema,
  title: z.string(),
  summaryLine: z.string(),
  createdAt: z.string().datetime(),
});

export const ArtifactDetailSchema = ArtifactSummarySchema.extend({
  primer: z.string(),
  ir: IRSchema,
});

export const ListArtifactsRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  query: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export const ListArtifactsResponseSchema = z.object({
  artifacts: z.array(ArtifactSummarySchema),
  nextCursor: z.string().nullable(),
});

export type ArtifactSummary = z.infer<typeof ArtifactSummarySchema>;
export type ArtifactDetail = z.infer<typeof ArtifactDetailSchema>;

// ===== Teams & Workspaces =====

export const WorkspaceSchema = z.object({
  id: z.string().uuid(),
  teamId: z.string().uuid(),
  name: z.string(),
  createdAt: z.string().datetime(),
});

export const TeamSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  createdAt: z.string().datetime(),
});

export const CreateWorkspaceRequestSchema = z.object({
  teamId: z.string().uuid(),
  name: z.string().min(1).max(100),
});

export const InviteMemberRequestSchema = z.object({
  teamId: z.string().uuid(),
  email: z.string().email(),
  workspaceIds: z.array(z.string().uuid()).optional(),
});

export type Workspace = z.infer<typeof WorkspaceSchema>;
export type Team = z.infer<typeof TeamSchema>;
```

### 3.3 Platform adapter contract

`packages/shared/src/platforms.ts`:

```typescript
import type { ExchangeTurn, Platform } from './ir';

export interface PlatformAdapter {
  platform: Platform;
  /** URL patterns this adapter handles. */
  matches: (url: string) => boolean;
  /** True if we can capture FROM this platform. */
  canCapture: boolean;
  /** True if we can inject INTO this platform. */
  canInject: boolean;
  /** Scrape the visible conversation from the page. */
  scrapeConversation: () => Promise<ExchangeTurn[]>;
  /** Inject text into the platform's chat input. */
  injectPrimer: (text: string) => Promise<{ success: boolean; error?: string }>;
}
```

The actual implementations live in the extension's `adapters/` directory; they import this contract type from `@team-ai-memory/shared`.

## 4. The database (Neon Postgres + Drizzle)

### 4.1 Schema

`apps/api/src/db/schema.ts`:

```typescript
import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  pgEnum,
  unique,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ===== Enums =====

export const platformEnum = pgEnum('platform', ['chatgpt', 'claude', 'gemini']);
export const teamRoleEnum = pgEnum('team_role', ['owner', 'admin', 'member']);
export const workspaceRoleEnum = pgEnum('workspace_role', ['admin', 'member']);

// ===== Users (managed by Better Auth) =====

// Better Auth creates and manages the users, sessions, and accounts tables.
// We reference users by id from our app tables. The schema below is what
// Better Auth's drizzle adapter expects.

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('email_verified'),
  name: text('name'),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Better Auth also creates `sessions`, `accounts`, and `verification_tokens` —
// we let its CLI generate those. They're shown here for completeness in the
// architecture doc but defined automatically.

// ===== Teams =====

export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const teamMembers = pgTable(
  'team_members',
  {
    teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: teamRoleEnum('role').notNull().default('member'),
    joinedAt: timestamp('joined_at').notNull().defaultNow(),
  },
  (t) => ({
    pk: unique().on(t.teamId, t.userId),
    teamIdx: index('team_members_team_idx').on(t.teamId),
    userIdx: index('team_members_user_idx').on(t.userId),
  })
);

// ===== Workspaces =====

export const workspaces = pgTable(
  'workspaces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    teamIdx: index('workspaces_team_idx').on(t.teamId),
  })
);

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: workspaceRoleEnum('role').notNull().default('member'),
    joinedAt: timestamp('joined_at').notNull().defaultNow(),
  },
  (t) => ({
    pk: unique().on(t.workspaceId, t.userId),
    workspaceIdx: index('workspace_members_workspace_idx').on(t.workspaceId),
    userIdx: index('workspace_members_user_idx').on(t.userId),
  })
);

// ===== Memory artifacts =====

export const memoryArtifacts = pgTable(
  'memory_artifacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    sourcePlatform: platformEnum('source_platform').notNull(),
    title: text('title').notNull(),
    summaryLine: text('summary_line').notNull(),
    primerMarkdown: text('primer_markdown').notNull(),
    ir: jsonb('ir').notNull(),               // IR JSON, validated by Zod at write time
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    workspaceIdx: index('memory_artifacts_workspace_idx').on(t.workspaceId),
    createdAtIdx: index('memory_artifacts_created_at_idx').on(t.createdAt),
    // Postgres FTS index on title + summaryLine + primerMarkdown is created
    // in a separate migration (Drizzle doesn't generate tsvector indexes yet).
  })
);

// ===== Team invites =====

export const teamInvites = pgTable(
  'team_invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    token: text('token').notNull().unique(),
    invitedBy: uuid('invited_by').notNull().references(() => users.id),
    expiresAt: timestamp('expires_at').notNull(),
    acceptedAt: timestamp('accepted_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: index('team_invites_email_idx').on(t.email),
    tokenIdx: index('team_invites_token_idx').on(t.token),
  })
);

// ===== Relations =====

export const usersRelations = relations(users, ({ many }) => ({
  teamMemberships: many(teamMembers),
  workspaceMemberships: many(workspaceMembers),
  createdArtifacts: many(memoryArtifacts),
}));

export const teamsRelations = relations(teams, ({ many }) => ({
  members: many(teamMembers),
  workspaces: many(workspaces),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  team: one(teams, {
    fields: [workspaces.teamId],
    references: [teams.id],
  }),
  members: many(workspaceMembers),
  artifacts: many(memoryArtifacts),
}));

export const memoryArtifactsRelations = relations(memoryArtifacts, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [memoryArtifacts.workspaceId],
    references: [workspaces.id],
  }),
  creator: one(users, {
    fields: [memoryArtifacts.createdBy],
    references: [users.id],
  }),
}));
```

### 4.2 Full-text search

Postgres full-text search via a manual migration. Drizzle doesn't yet generate `tsvector` indexes natively, so we add one as a raw SQL migration:

```sql
-- migrations/0002_artifacts_fts.sql
ALTER TABLE memory_artifacts
  ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(summary_line, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(primer_markdown, '')), 'C')
  ) STORED;

CREATE INDEX memory_artifacts_search_idx
  ON memory_artifacts USING GIN(search_vector);
```

Queries use `search_vector @@ plainto_tsquery('english', $1)` and rank with `ts_rank`. Good enough for v1; we can layer in `pgvector` for semantic search in v2.

### 4.3 Drizzle client setup

`apps/api/src/db/client.ts`:

```typescript
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

export function createDb(databaseUrl: string) {
  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
}

export type Db = ReturnType<typeof createDb>;
```

The Neon HTTP driver works cleanly from Cloudflare Workers — no pooling concerns, no long-lived connections, no edge-runtime gotchas.

## 5. The backend API

### 5.1 Hono app entry

`apps/api/src/index.ts`:

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authRouter } from './routes/auth';
import { teamsRouter } from './routes/teams';
import { workspacesRouter } from './routes/workspaces';
import { artifactsRouter } from './routes/artifacts';
import { extractRouter } from './routes/extract';

export interface Env {
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  RESEND_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  WEB_APP_URL: string;
  EXTENSION_IDS: string;   // Comma-separated chrome-extension://<id>
  SENTRY_DSN?: string;
  POSTHOG_KEY?: string;
}

const app = new Hono<{ Bindings: Env }>();

app.use(
  '*',
  cors({
    origin: (origin, c) => {
      const allowed = [c.env.WEB_APP_URL, ...c.env.EXTENSION_IDS.split(',')];
      return allowed.includes(origin) ? origin : null;
    },
    credentials: true,
  })
);

app.route('/auth', authRouter);
app.route('/teams', teamsRouter);
app.route('/workspaces', workspacesRouter);
app.route('/artifacts', artifactsRouter);
app.route('/extract', extractRouter);

app.get('/health', (c) => c.json({ ok: true }));

export default app;
```

### 5.2 Endpoint surface

The complete v1 endpoint list. Every endpoint that mutates or reads requires a valid Better Auth session except for the `/auth/*` mount and `/health`.

```
POST   /auth/*                               (Better Auth handler)
GET    /health

GET    /teams/me                             List teams the current user is in
POST   /teams                                Create a team (owner = caller)
GET    /teams/:teamId                        Team detail
GET    /teams/:teamId/members                List team members
POST   /teams/:teamId/invites                Invite by email
POST   /teams/invites/:token/accept          Accept an invite (called by invitee)

GET    /workspaces/:workspaceId              Workspace detail
GET    /teams/:teamId/workspaces             List workspaces the user can see in this team
POST   /workspaces                           Create workspace
GET    /workspaces/:workspaceId/members      List workspace members
POST   /workspaces/:workspaceId/members      Add a team member to this workspace
DELETE /workspaces/:workspaceId/members/:userId   Remove a member from this workspace

GET    /workspaces/:workspaceId/artifacts    List/search artifacts
GET    /artifacts/:artifactId                Get artifact detail
DELETE /artifacts/:artifactId                Delete (creator or workspace admin only)

POST   /extract                              Capture + extract a chat into a workspace
```

### 5.3 Permission model

Two layers of permissions. Both implemented as Hono middleware.

**Team membership** — required to do anything in a team. Stored in `team_members`. Roles: `owner`, `admin`, `member`. Only `owner`/`admin` can invite or remove members.

**Workspace membership** — required to read/write artifacts in a workspace. Stored in `workspace_members`. Roles: `admin` (can manage workspace membership) and `member` (can read/write artifacts). Workspace admins must also be team admins or the team owner.

A user can be a team member without being in any workspace. They simply see no artifacts until a workspace admin adds them.

Permission middleware example, `apps/api/src/middleware/workspace.ts`:

```typescript
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { eq, and } from 'drizzle-orm';
import { workspaceMembers } from '../db/schema';
import type { Db } from '../db/client';

type WorkspaceContext = {
  workspaceMember: {
    workspaceId: string;
    userId: string;
    role: 'admin' | 'member';
  };
};

export const requireWorkspaceMember = createMiddleware<{
  Variables: WorkspaceContext;
}>(async (c, next) => {
  const userId = c.get('userId');           // set by auth middleware upstream
  const workspaceId = c.req.param('workspaceId');
  const db = c.get('db') as Db;

  if (!userId || !workspaceId) {
    throw new HTTPException(403, { message: 'Forbidden' });
  }

  const [member] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId)
      )
    )
    .limit(1);

  if (!member) {
    throw new HTTPException(403, { message: 'Not a member of this workspace' });
  }

  c.set('workspaceMember', member);
  await next();
});
```

### 5.4 The extraction route

This is the heart of the backend. Sketch:

```typescript
// apps/api/src/routes/extract.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { ExtractRequestSchema, ExtractResponseSchema } from '@team-ai-memory/shared';
import { requireSession } from '../middleware/auth';
import { extractConversation } from '../lib/extract';
import { renderPrimer } from '../lib/render';
import { memoryArtifacts } from '../db/schema';

export const extractRouter = new Hono<{ Bindings: Env }>()
  .use('*', requireSession)
  .post('/', zValidator('json', ExtractRequestSchema), async (c) => {
    const start = Date.now();
    const body = c.req.valid('json');
    const userId = c.get('userId');
    const db = c.get('db');

    // 1. Verify the user is a member of the target workspace.
    await assertWorkspaceMember(db, body.workspaceId, userId);

    // 2. Call Anthropic for extraction.
    const { ir, provider, truncated } = await extractConversation({
      conversation: body.conversation,
      sourcePlatform: body.sourcePlatform,
      apiKeys: {
        anthropic: c.env.ANTHROPIC_API_KEY,
      },
    });

    // 3. Render the primer.
    const primer = renderPrimer(ir);

    // 4. Persist.
    const title = body.userProvidedTitle || ir.source.inferredTopic;
    const summaryLine = makeSummaryLine(ir);
    const [artifact] = await db
      .insert(memoryArtifacts)
      .values({
        workspaceId: body.workspaceId,
        createdBy: userId,
        sourcePlatform: body.sourcePlatform,
        title,
        summaryLine,
        primerMarkdown: primer,
        ir,
      })
      .returning();

    // 5. Return.
    return c.json({
      artifactId: artifact.id,
      title,
      summaryLine,
      primer,
      ir,
      meta: {
        latencyMs: Date.now() - start,
        provider,
        truncated,
      },
    });
  });
```

### 5.5 LLM provider abstraction

`apps/api/src/lib/llm/types.ts`:

```typescript
import type { IR } from '@team-ai-memory/shared';
import type { ExtractRequest } from '@team-ai-memory/shared';

export interface LLMProvider {
  name: string;
  /** Run extraction; returns the IR (caller validates). */
  extract(input: {
    conversation: ExtractRequest['conversation'];
    sourcePlatform: ExtractRequest['sourcePlatform'];
  }): Promise<{ ir: IR; truncated: boolean }>;
}
```

`apps/api/src/lib/llm/anthropic.ts` implements this against the Anthropic Messages API (`claude-haiku-4-5` by default) with tool-use for structured output. The IR Zod schema is converted into a tool definition; Anthropic returns a structured `tool_use` response that's validated against the schema before being returned.

The single-provider orchestration in `lib/extract.ts` is straightforward: call Anthropic. On a Zod validation failure, retry once with the validation error in the prompt as a hint. On second validation failure, throw. On a 429 (rate limit) or 5xx, throw a typed error so the route can return an appropriate response code to the client. No fallback chain in v1.

**Why keep the abstraction with one implementation?** It documents what a provider needs to do, makes the Anthropic code testable in isolation by mocking the interface, and leaves a clean seam for adding OpenAI or Gemini back later (a one-file addition per provider plus updating the orchestrator). The cost of keeping it is essentially zero.

## 6. Authentication

Better Auth handles users, sessions, and magic-link emails. We mount it at `/auth/*`.

### 6.1 Better Auth config

`apps/api/src/lib/auth.ts`:

```typescript
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins';
import { Resend } from 'resend';
import { createDb } from '../db/client';

export function createAuth(env: Env) {
  const db = createDb(env.DATABASE_URL);
  const resend = new Resend(env.RESEND_API_KEY);

  return betterAuth({
    database: drizzleAdapter(db, { provider: 'pg' }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.WEB_APP_URL, ...env.EXTENSION_IDS.split(',')],
    plugins: [
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          await resend.emails.send({
            from: 'Team AI Memory <noreply@<our-domain>>',
            to: email,
            subject: 'Sign in to Team AI Memory',
            html: renderMagicLinkEmail({ url }),
          });
        },
      }),
    ],
    session: {
      cookieCache: { enabled: true, maxAge: 60 * 60 * 24 * 7 }, // 7 days
    },
  });
}
```

### 6.2 The web app ↔ extension auth question

This is the part that's genuinely tricky and worth understanding before any code is written.

The web app authenticates normally: user visits, requests a magic link, clicks it, gets a session cookie scoped to our backend domain. Browser sends the cookie on subsequent fetches. Done.

The extension is harder. Service workers can make fetches, but cookie handling in cross-origin contexts is constrained. Two viable approaches:

**Approach A — extension piggybacks on the web app session.** The user signs in on our web app first. We expose a small endpoint, `GET /auth/extension-token`, which returns a long-lived bearer token tied to that session. The extension stores the token in `chrome.storage.local` and sends it as an `Authorization: Bearer <token>` header on every backend call. The extension never handles cookies.

**Approach B — extension does its own auth flow.** Extension opens a tab to our web app for sign-in, listens for a redirect via the chrome.identity API, captures a token. More complex, more friction at first-run.

**We pick Approach A.** The first-run extension experience is "open the web app and sign in, then come back here." On sign-in, the web app shows a "Connect extension" button that calls `/auth/extension-token` and posts the result to the extension via `chrome.runtime.sendMessage`. The extension stores it. Clean.

The bearer token is a UUID stored in a new `extension_tokens` table (not shown in the schema sketch above — we add it during Milestone 2 when we build auth):

```typescript
export const extensionTokens = pgTable('extension_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  label: text('label'),                       // e.g. "MacBook Pro Chrome"
  createdAt: timestamp('created_at').notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at'),
  revokedAt: timestamp('revoked_at'),
});
```

The auth middleware in the backend checks: (a) a Better Auth session cookie, or (b) a valid extension token in `Authorization: Bearer`. Either gets you authenticated as the user.

## 7. The web app

Vite + React + TanStack Router. File-based routes.

### 7.1 Route structure

```
apps/web/src/routes/
├── __root.tsx              # Layout shell (sidebar, top bar)
├── index.tsx               # Landing redirects to /app if signed in, /sign-in otherwise
├── sign-in.tsx             # Magic-link request form
├── auth.callback.tsx       # Handle magic-link callback, set session
├── app/                    # Authenticated routes
│   ├── __layout.tsx        # Sidebar (workspace list, settings link)
│   ├── index.tsx           # Redirects to default workspace
│   ├── workspaces.$id.tsx  # Workspace detail (artifact list + search)
│   ├── artifacts.$id.tsx   # Artifact detail (primer + IR)
│   ├── team.tsx            # Team admin (members, invites)
│   └── settings.tsx        # User settings, extension connection
└── invite.$token.tsx       # Accept-invite landing
```

TanStack Router validates loader data, handles search params type-safely, and integrates with TanStack Query for data fetching with built-in caching.

### 7.2 Data fetching pattern

API calls go through a typed client built on top of `fetch`. Every response is Zod-parsed against the shared schemas before reaching components:

```typescript
// apps/web/src/lib/api.ts
import {
  ArtifactSummarySchema,
  ListArtifactsResponseSchema,
  type ArtifactSummary,
} from '@team-ai-memory/shared';

async function fetchArtifacts(params: {
  workspaceId: string;
  query?: string;
}): Promise<ArtifactSummary[]> {
  const url = new URL(`/workspaces/${params.workspaceId}/artifacts`, API_BASE_URL);
  if (params.query) url.searchParams.set('q', params.query);

  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const json = await res.json();

  return ListArtifactsResponseSchema.parse(json).artifacts;
}
```

TanStack Query wraps these in hooks (`useArtifacts`, `useArtifact`, etc.) with consistent cache keys.

### 7.3 Styling

Tailwind CSS with the shadcn/ui CLI used to drop components into `apps/web/src/components/ui/`. We own the component code; no version pinning issues.

Theming: light + dark mode via Tailwind's `class` strategy. We pick a sober palette before the investor demo; a default shadcn theme is fine for build.

## 8. The browser extension

WXT + Preact + Tailwind. Manifest V3. Chromium-only in v1.

### 8.1 Entrypoints

WXT auto-generates the manifest from files in `entrypoints/`:

- `entrypoints/background.ts` — service worker. Holds the API client, the active bearer token, and message routing between content scripts and the popup.
- `entrypoints/popup/` — Preact app rendered when the toolbar icon is clicked. Two states: "sign-in needed" (links to web app) and "signed in" (search artifacts, capture current page, inject selected).
- `entrypoints/content/chatgpt.content.ts` and `entrypoints/content/claude.content.ts` — per-platform content scripts that know how to scrape and inject for each platform.

### 8.2 Per-platform adapters

Each adapter is a module implementing the `PlatformAdapter` interface from the shared package. v1 ships two:

```typescript
// apps/extension/adapters/chatgpt.ts
import type { PlatformAdapter } from '@team-ai-memory/shared';

export const chatgptAdapter: PlatformAdapter = {
  platform: 'chatgpt',
  matches: (url) =>
    url.startsWith('https://chatgpt.com/') ||
    url.startsWith('https://chat.openai.com/'),
  canCapture: true,
  canInject: true,

  scrapeConversation: async () => {
    // 1. Find the message container (CSS selector per ChatGPT's current DOM)
    // 2. Walk children, classifying each as user or assistant by class signature
    // 3. Extract text content, preserving code blocks as ``` fences
    // 4. Handle "load earlier messages" by scrolling to top if needed
    // Returns ordered ExchangeTurn[]
    // ...
  },

  injectPrimer: async (text) => {
    // 1. Find the ProseMirror input element
    // 2. Use native setter + dispatchEvent to insert text into React-controlled input
    // 3. Focus the element
    // Returns { success: true } or { success: false, error }
    // ...
  },
};
```

The Claude adapter is similar; selectors and React-input-injection trick differ.

A registry in `adapters/index.ts` exports both and a `getAdapterForUrl(url)` helper used by content scripts and the popup.

### 8.3 The capture flow, end to end

1. User clicks the extension toolbar icon on a ChatGPT page.
2. Popup loads. It asks the background service worker: "is the active tab capturable?" Background queries the content script on that tab: "are you on a chat page?" Content script asks its adapter and responds yes/no.
3. If yes, the popup renders the "Capture" UI: workspace dropdown (loaded via API call to `/teams/me`-derived workspace list, cached), optional title field, sensitive-content warning area (initially empty), Save button.
4. As the user opens the popup, content script also runs `scrapeConversation()` and sends the result to the popup. While the user is choosing a workspace, the popup runs the sensitive-content regex check client-side on the scraped content. If matches, warning appears.
5. On Save, popup calls `POST /extract` with the conversation, workspace, and optional title. Loading spinner.
6. Backend extracts, persists, returns the artifact. Popup shows success toast: "Saved to [Workspace]" with a link to view in the web app.

### 8.4 The injection flow, end to end

1. User clicks the toolbar icon on a destination page (ChatGPT or Claude).
2. Popup detects it's on an injectable platform. Shows artifact picker: search box + list of recent artifacts from the user's workspaces (fetched via `/workspaces/.../artifacts`, with a flat "recent across all my workspaces" backend endpoint added if needed in v1).
3. User selects an artifact. Popup calls `GET /artifacts/:id` to get the full primer.
4. Popup sends a `{ type: 'INJECT', text: primer }` message to the active tab's content script.
5. Content script's adapter runs `injectPrimer(text)`. Returns success or error to popup.
6. Popup closes. User reviews the auto-filled primer in the destination's input, hits Enter.

### 8.5 Sensitive-content check (client-side)

A list of regex patterns shipped with the extension, matched against the scraped conversation text before the user clicks Save:

```typescript
// apps/extension/lib/sensitive-content.ts
type Match = { pattern: string; description: string };

const PATTERNS: Array<{ regex: RegExp; description: string }> = [
  { regex: /\b(salary|comp(ensation)?|pay)\s.{0,40}\$\s*[\d,]+/i, description: 'salary or compensation figure' },
  { regex: /\b(medical|diagnos(is|ed)|prescrib(ed|ing)|symptom)\b/i, description: 'medical content' },
  { regex: /\b(api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]/i, description: 'API key or secret' },
  { regex: /-----BEGIN [A-Z ]+ KEY-----/, description: 'private key block' },
  { regex: /\bsk-[A-Za-z0-9]{20,}\b/, description: 'API token (sk- prefix)' },
  // ... extend during Milestone 2 based on real captures we see in friendly beta
];

export function checkSensitiveContent(text: string): Match[] {
  return PATTERNS
    .filter(({ regex }) => regex.test(text))
    .map(({ description }) => ({ pattern: description, description }));
}
```

The popup displays each matched pattern category to the user before Save. The list is conservative and explicitly not exhaustive; the warning text says so.

## 9. Deployment

### 9.1 Topology

- **Backend (`api`):** Cloudflare Worker. Deployed via `wrangler deploy` from CI. URL pattern: `<project-name>-api.workers.dev`. Secrets (DB URL, API keys, auth secret, Resend key) live in Wrangler secrets, set via `wrangler secret put` once per env.
- **Web app (`web`):** Cloudflare Pages. Built with Vite, output `dist/`. URL: `<project-name>.pages.dev`. Env var: `VITE_API_BASE_URL` pointing at the Worker URL.
- **Extension (`extension`):** Built locally and uploaded to Chrome Web Store. During development, loaded as unpacked extension. URL not applicable.
- **Database:** Neon project, single Postgres database, single branch in v1 (no preview branching needed yet).
- **Email:** Resend account with one verified sending domain (when we have a real domain) or the default Resend testing domain in early dev.

### 9.2 Environments

For v1 we have two:

- **Dev (local):** `localhost:5173` for web, `localhost:8787` for API (via `wrangler dev`), local builds for extension. Talks to a Neon dev branch.
- **Prod (Cloudflare):** `<project>.pages.dev`, `<project>-api.workers.dev`. Talks to the main Neon database.

Staging is deferred — auto-deploy preview URLs on Pages and Workers give us per-PR previews that are good enough for now.

### 9.3 CI/CD

GitHub Actions, `.github/workflows/`:

- `ci.yml` — on every PR: lint, typecheck, unit tests, build all apps.
- `deploy-api.yml` — on push to `main` that touches `apps/api/**` or `packages/shared/**`: deploy the worker via Wrangler.
- `deploy-web.yml` — on push to `main` that touches `apps/web/**` or `packages/shared/**`: handled automatically by Cloudflare Pages's GitHub integration (set up in setup.md).
- `release-extension.yml` — manual trigger: build the extension, zip the output, attach to a GitHub release. (Chrome Web Store upload is manual in v1.)

Drizzle migrations run separately, not in CI, to avoid surprise schema changes during deploy. Run `pnpm db:migrate` locally before deploys that need schema changes.

## 10. Observability and operations

- **Sentry:** error tracking for all three apps. SDKs in extension, web, and API. Source maps uploaded for the web and extension on build.
- **PostHog:** product analytics. Events: capture started, capture succeeded, capture failed, injection started, injection succeeded, workspace created, member invited, member joined, artifact viewed, artifact searched. No content payloads — metadata only.
- **Cloudflare dashboard:** request volume, error rate, latency for the Worker.
- **Logs:** `console.log` in Workers writes to `wrangler tail` and Cloudflare's dashboard logs. Structured logging via a small wrapper that JSON-stringifies fields.

No paid alerting in v1. Sentry's free email alerts cover the basics.

## 11. Security baseline

- All traffic over HTTPS (Cloudflare-terminated).
- CORS allows only the web app origin and known extension IDs.
- Session cookies: `Secure`, `HttpOnly`, `SameSite=Lax`.
- Extension bearer tokens: stored only in `chrome.storage.local`, never in DOM-accessible storage.
- Sensitive content classification happens client-side in the extension — content is only sent to the backend after the user explicitly clicks Save.
- API rate limits per-user (counter in a small KV namespace, or a simple Postgres counter): 100 captures/day per user as a guardrail against runaway loops.
- Secrets in Cloudflare Worker secrets, GitHub Actions secrets, and local `.env` files (gitignored). The repo never contains secrets.
- All cross-origin endpoints validate the Origin header against the allowed list before processing.

## 12. Cost guardrails

Free tiers we're depending on, with current limits and our planned mitigations:

- **Neon free tier:** 3 GB storage, ~100 hours of compute/month. Storage is plenty for thousands of artifacts (JSON IRs are small). Compute is the variable; with HTTP driver and infrequent queries, we expect to stay well under.
- **Cloudflare Workers free tier:** 100K requests/day. We will not approach this.
- **Cloudflare Pages free tier:** 500 builds/month, unlimited bandwidth, unlimited requests. Builds are the constraint; we use ~10/week.
- **Anthropic API:** burns prepaid credits; no free tier. This is our only LLM provider in v1. Mitigations: per-user 100-captures/day rate limit (catches runaway loops), identical-input caching (KV-backed; same conversation hash within 24h returns cached IR), and a kill-switch env var that disables `/extract` if credits look in danger of depleting between sessions.
- **Resend free tier:** 3,000 emails/month, 100/day. Magic-link emails only; we will not approach this.
- **PostHog free tier:** 1M events/month. Plenty.
- **Sentry free tier:** 5K errors/month. Plenty.
- **GitHub Actions:** 2,000 minutes/month on private repos, free on public. Our builds are short.

Kill-switch capability: every external dependency is wrapped such that a single env var (`DISABLED_<SERVICE>=1`) bypasses or short-circuits it. Useful if a free tier is unexpectedly burning out mid-week.

## 13. Decisions log (so future-us doesn't re-litigate)

| Decision | Choice | Rationale |
|---|---|---|
| Web framework | Vite + React + TanStack Router | Backend is separate Workers app; Next.js's strengths (SSR, API routes) are wasted |
| Database | Neon Postgres | Future-proof for pgvector (v2 semantic search), mature Drizzle support |
| ORM | Drizzle | Current TypeScript-Postgres standard; type-safe SQL-shaped queries |
| Auth | Better Auth + magic links | Self-hosted, no per-MAU pricing, clean Hono fit |
| Email | Resend | Generous free tier, clean API |
| Extension framework | WXT + Preact | Most actively maintained in 2026, smaller bundles than Plasmo |
| Backend framework | Hono on Workers | Fast cold starts, free tier, single language stack |
| Components | shadcn/ui | Own the code, no version pinning, battle-tested |
| Server state | TanStack Query | Pairs natively with TanStack Router |
| Styling | Tailwind | Standard, fast iteration |
| Monorepo | pnpm workspaces | Lightweight, great DX, no Turborepo overhead needed at this size |
| Web/extension auth | Bearer token via "connect extension" flow | Avoids cross-origin cookie complexity |
| FTS | Postgres tsvector | Built-in, free, sufficient for v1 |
| Length tiers | Drop Compact/Comprehensive, only Standard | Reduce surface area; add back if users ask |
| Knowledge graph | Deferred to v2 | Premature for the POC |
| LLM provider | Anthropic Claude Haiku (single provider v1) | Simplest configuration; one provider to monitor, one API surface to learn. Provider abstraction preserved so OpenAI/Gemini can be re-added later. |
| Default LLM model size | Claude Haiku (smallest tier) | Extraction is structured-output, not creative; smaller models are sufficient and 10x cheaper than larger tiers |
| Resilience to provider outage | Accepted as POC risk | When Anthropic is down, captures fail. Friendly-team beta tolerance is acceptable; revisit before paying customers. |

## 14. What this architecture does not handle (and that's deliberate)

- Multi-team membership for a single user (one team per user in v1).
- Workspace-level public/private visibility — every member of a workspace sees all its artifacts equally.
- Per-artifact ACLs.
- Real-time collaboration (no live cursors, no presence).
- Mobile / Firefox / Safari.
- SSO, SAML, SCIM.
- Image, attachment, or rich-media fidelity.
- Compliance reports, audit logs.
- Always-on / passive capture.
- Semantic search via embeddings (v2 — pgvector is ready when we are).
- Stripe / billing plumbing.
- Custom domain (free `.pages.dev` and `.workers.dev` until we monetize).

## 15. Open items that the setup guide and build plan will resolve

- The exact selectors for ChatGPT and Claude DOM scraping (will be researched and added in Milestone 1 of the build plan).
- The exact extraction prompt v1 (will be drafted and iterated on against a corpus of 10 real chats during Milestone 1).
- The exact magic-link email template (will be designed during Milestone 2 setup).
- Whether the landing page (the public, unauthenticated marketing page) is built in v1 or after — leaning yes, to be confirmed in the build plan.

---

*End of architecture v0.1. Once signed off, the setup guide is next.*
