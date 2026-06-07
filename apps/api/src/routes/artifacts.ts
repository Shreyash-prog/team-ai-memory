import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import { ArtifactDetailSchema, ListArtifactsResponseSchema } from '@team-ai-memory/shared';
import type { ArtifactSummary } from '@team-ai-memory/shared';
import type { Env } from '../env';
import { createDb } from '../db/client';
import { memoryArtifacts, users } from '../db/schema';

// M1: no auth. Real session + workspace-membership checks land in M2. The
// endpoints filter strictly by the workspaceId query/path inputs.

const ListQuerySchema = z.object({
  workspaceId: z.string().uuid(),
  q: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

const ParamSchema = z.object({ id: z.string().uuid() });

const summaryColumns = {
  id: memoryArtifacts.id,
  workspaceId: memoryArtifacts.workspaceId,
  sourcePlatform: memoryArtifacts.sourcePlatform,
  title: memoryArtifacts.title,
  summaryLine: memoryArtifacts.summaryLine,
  createdAt: memoryArtifacts.createdAt,
  creatorId: users.id,
  creatorName: users.name,
  creatorEmail: users.email,
} as const;

type SummaryRow = {
  id: string;
  workspaceId: string;
  sourcePlatform: ArtifactSummary['sourcePlatform'];
  title: string;
  summaryLine: string;
  createdAt: Date;
  creatorId: string;
  creatorName: string | null;
  creatorEmail: string;
};

function toSummary(row: SummaryRow): ArtifactSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    createdBy: {
      id: row.creatorId,
      name: row.creatorName ?? 'Unknown',
      email: row.creatorEmail,
    },
    sourcePlatform: row.sourcePlatform,
    title: row.title,
    summaryLine: row.summaryLine,
    createdAt: row.createdAt.toISOString(),
  };
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}__${id}`).toString('base64url');
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const idx = decoded.lastIndexOf('__');
    if (idx === -1) return null;
    const createdAt = new Date(decoded.slice(0, idx));
    const id = decoded.slice(idx + 2);
    if (Number.isNaN(createdAt.getTime()) || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

export const artifactsRouter = new Hono<{ Bindings: Env }>()
  // GET /artifacts?workspaceId=&q=&limit=&cursor=
  .get('/', zValidator('query', ListQuerySchema), async (c) => {
    const { workspaceId, q, limit, cursor } = c.req.valid('query');
    const db = createDb(c.env.DATABASE_URL);

    if (q) {
      // Full-text search via the tsvector column (T02 FTS migration), ranked.
      // search_vector isn't in the Drizzle schema (added by raw SQL migration),
      // so it's referenced via sql fragments. Search returns a single ranked
      // page in M1 (rank-keyset pagination deferred).
      const match = sql`search_vector @@ plainto_tsquery('english', ${q})`;
      const rows = await db
        .select(summaryColumns)
        .from(memoryArtifacts)
        .innerJoin(users, eq(memoryArtifacts.createdBy, users.id))
        .where(and(eq(memoryArtifacts.workspaceId, workspaceId), match))
        .orderBy(
          desc(sql`ts_rank(search_vector, plainto_tsquery('english', ${q}))`),
          desc(memoryArtifacts.createdAt)
        )
        .limit(limit);

      const body = ListArtifactsResponseSchema.parse({
        artifacts: rows.map(toSummary),
        nextCursor: null,
      });
      return c.json(body, 200);
    }

    // Plain listing, newest first, with keyset cursor pagination.
    const decoded = cursor ? decodeCursor(cursor) : null;
    const keyset = decoded
      ? or(
          lt(memoryArtifacts.createdAt, decoded.createdAt),
          and(eq(memoryArtifacts.createdAt, decoded.createdAt), lt(memoryArtifacts.id, decoded.id))
        )
      : undefined;

    const rows = await db
      .select(summaryColumns)
      .from(memoryArtifacts)
      .innerJoin(users, eq(memoryArtifacts.createdBy, users.id))
      .where(keyset ? and(eq(memoryArtifacts.workspaceId, workspaceId), keyset) : eq(memoryArtifacts.workspaceId, workspaceId))
      .orderBy(desc(memoryArtifacts.createdAt), desc(memoryArtifacts.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;

    const body = ListArtifactsResponseSchema.parse({
      artifacts: page.map(toSummary),
      nextCursor,
    });
    return c.json(body, 200);
  })
  // GET /artifacts/:id
  .get('/:id', zValidator('param', ParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const db = createDb(c.env.DATABASE_URL);

    const [row] = await db
      .select({
        ...summaryColumns,
        primer: memoryArtifacts.primerMarkdown,
        ir: memoryArtifacts.ir,
      })
      .from(memoryArtifacts)
      .innerJoin(users, eq(memoryArtifacts.createdBy, users.id))
      .where(eq(memoryArtifacts.id, id))
      .limit(1);

    if (!row) {
      return c.json({ error: 'not_found', message: 'Artifact not found.' }, 404);
    }

    const body = ArtifactDetailSchema.parse({
      ...toSummary(row),
      primer: row.primer,
      ir: row.ir,
    });
    return c.json(body, 200);
  });
