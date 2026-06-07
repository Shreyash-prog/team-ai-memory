import type { ExtractRequest, IR } from '@team-ai-memory/shared';
import { AnthropicProvider } from './llm/anthropic';

/**
 * Single-provider extraction orchestration (architecture §5.5). v1 calls
 * Anthropic only. The Zod-validation retry and typed-error mapping live inside
 * AnthropicProvider.extract(), so this is thin glue; it stays the seam where a
 * fallback chain or provider selection would go later.
 */
export async function extractConversation(input: {
  conversation: ExtractRequest['conversation'];
  sourcePlatform: ExtractRequest['sourcePlatform'];
  apiKeys: { anthropic: string };
}): Promise<{ ir: IR; provider: string; truncated: boolean }> {
  const provider = new AnthropicProvider({ apiKey: input.apiKeys.anthropic });
  const { ir, truncated } = await provider.extract({
    conversation: input.conversation,
    sourcePlatform: input.sourcePlatform,
  });
  return { ir, provider: provider.name, truncated };
}

const SUMMARY_MAX = 160;

/** A one-line gist for artifact lists: the first established fact, falling back
 * to the inferred topic. Whitespace-collapsed and length-capped. */
export function makeSummaryLine(ir: IR): string {
  const source = ir.factualState[0]?.trim() || ir.source.inferredTopic.trim();
  const oneLine = source.replace(/\s+/g, ' ');
  if (oneLine.length <= SUMMARY_MAX) return oneLine;
  return oneLine.slice(0, SUMMARY_MAX - 1).trimEnd() + '…';
}
