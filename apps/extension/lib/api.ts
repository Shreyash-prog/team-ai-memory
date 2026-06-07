import { ExtractResponseSchema } from '@team-ai-memory/shared';
import type { ExchangeTurn, ExtractResponse, Platform } from '@team-ai-memory/shared';
import { API_BASE_URL, PLACEHOLDER_WORKSPACE_ID } from './constants';

/**
 * POST a scraped conversation to the deployed Worker's /extract endpoint.
 * Runs from the popup (an extension page), which has host_permissions for the
 * Worker — so the cross-origin fetch bypasses CORS.
 */
export async function postExtract(input: {
  conversation: ExchangeTurn[];
  sourcePlatform: Platform;
}): Promise<ExtractResponse> {
  const res = await fetch(`${API_BASE_URL}/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workspaceId: PLACEHOLDER_WORKSPACE_ID,
      conversation: input.conversation,
      sourcePlatform: input.sourcePlatform,
    }),
  });

  if (!res.ok) {
    throw new Error(`Capture failed (HTTP ${res.status})`);
  }
  return ExtractResponseSchema.parse(await res.json());
}
