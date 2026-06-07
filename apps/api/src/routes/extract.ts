import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { ExtractRequestSchema, ExtractResponseSchema } from '@team-ai-memory/shared';
import type { Env } from '../env';
import { createDb } from '../db/client';
import { memoryArtifacts } from '../db/schema';
import { extractConversation, makeSummaryLine } from '../lib/extract';
import { renderPrimer } from '../lib/render';
import { PLACEHOLDER_USER_ID } from '../lib/placeholders';
import { IRValidationError, LLMRateLimitError, LLMServiceError } from '../lib/llm/types';

export const extractRouter = new Hono<{ Bindings: Env }>().post(
  '/',
  zValidator('json', ExtractRequestSchema),
  async (c) => {
    const start = Date.now();
    const body = c.req.valid('json');

    // M1: no auth. Real session + workspace-membership checks land in M2 (see
    // architecture §5.4). Every artifact is attributed to the placeholder user;
    // workspaceId is accepted as-is (memory_artifacts.workspace_id has no FK
    // until the workspaces table exists in M2).
    const db = createDb(c.env.DATABASE_URL);

    let ir;
    let provider: string;
    let truncated: boolean;
    try {
      ({ ir, provider, truncated } = await extractConversation({
        conversation: body.conversation,
        sourcePlatform: body.sourcePlatform,
        apiKeys: { anthropic: c.env.ANTHROPIC_API_KEY },
      }));
    } catch (err) {
      if (err instanceof LLMRateLimitError) {
        return c.json({ error: 'rate_limited', message: 'Extraction provider is rate limited; retry shortly.' }, 429);
      }
      if (err instanceof LLMServiceError) {
        return c.json({ error: 'provider_error', message: 'Extraction provider is unavailable.' }, 502);
      }
      if (err instanceof IRValidationError) {
        return c.json({ error: 'extraction_invalid', message: 'Could not extract a valid memory from this conversation.' }, 502);
      }
      throw err;
    }

    const primer = renderPrimer(ir);
    const title = body.userProvidedTitle || ir.source.inferredTopic;
    const summaryLine = makeSummaryLine(ir);

    const [artifact] = await db
      .insert(memoryArtifacts)
      .values({
        workspaceId: body.workspaceId,
        createdBy: PLACEHOLDER_USER_ID,
        sourcePlatform: body.sourcePlatform,
        title,
        summaryLine,
        primerMarkdown: primer,
        ir,
      })
      .returning();

    if (!artifact) {
      return c.json({ error: 'persist_failed', message: 'Failed to persist the extracted artifact.' }, 500);
    }

    const response = ExtractResponseSchema.parse({
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

    return c.json(response, 200);
  }
);
