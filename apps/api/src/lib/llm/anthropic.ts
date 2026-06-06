import Anthropic from '@anthropic-ai/sdk';
import { IRSchema } from '@team-ai-memory/shared';
import type { IR, ExtractRequest, Platform } from '@team-ai-memory/shared';
import type { ZodError } from 'zod';
import {
  EXTRACTION_TOOL_NAME,
  getExtractionPrompt,
  getExtractionTool,
} from './prompts/extract-v1';
import {
  IRValidationError,
  LLMRateLimitError,
  LLMServiceError,
  type LLMProvider,
} from './types';

const DEFAULT_MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 2048;

type ExtractInput = {
  conversation: ExtractRequest['conversation'];
  sourcePlatform: ExtractRequest['sourcePlatform'];
};

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(opts: { apiKey: string; model?: string }) {
    this.client = new Anthropic({ apiKey: opts.apiKey });
    this.model = opts.model ?? DEFAULT_MODEL;
  }

  async extract(input: ExtractInput): Promise<{ ir: IR; truncated: boolean }> {
    const system = getExtractionPrompt(input.sourcePlatform);
    const tool = getExtractionTool();
    const capturedAt = new Date().toISOString();

    // Attempt 0: the transcript. Attempt 1 (retry): same transcript + the
    // model's bad tool call + a tool_result describing the validation error.
    let messages: Anthropic.MessageParam[] = [
      { role: 'user', content: renderTranscript(input.conversation) },
    ];
    let lastError: ZodError | undefined;

    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await this.callMessages(system, tool, messages);

      const toolUse = response.content.find(
        (block): block is Anthropic.ToolUseBlock =>
          block.type === 'tool_use' && block.name === EXTRACTION_TOOL_NAME
      );
      if (!toolUse) {
        // Forced tool_choice should guarantee a tool_use block; if it's
        // missing the response is unusable.
        throw new LLMServiceError('Model did not return the expected tool call');
      }

      const candidate = assembleIR(toolUse.input, input.sourcePlatform, capturedAt);
      const parsed = IRSchema.safeParse(candidate);
      if (parsed.success) {
        return { ir: parsed.data, truncated: response.stop_reason === 'max_tokens' };
      }

      lastError = parsed.error;
      if (attempt === 0) {
        // Feed the validation error back so the model can correct itself.
        messages = [
          messages[0]!,
          { role: 'assistant', content: response.content },
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: toolUse.id,
                is_error: true,
                content: `Your \`${EXTRACTION_TOOL_NAME}\` call failed validation:\n${formatZodError(parsed.error)}\nCall \`${EXTRACTION_TOOL_NAME}\` again with corrected data.`,
              },
            ],
          },
        ];
      }
    }

    throw new IRValidationError(
      'Extraction failed IR schema validation after one retry',
      { cause: lastError }
    );
  }

  private async callMessages(
    system: string,
    tool: Anthropic.Tool,
    messages: Anthropic.MessageParam[]
  ): Promise<Anthropic.Message> {
    try {
      return await this.client.messages.create({
        model: this.model,
        max_tokens: MAX_TOKENS,
        system,
        tools: [tool],
        tool_choice: { type: 'tool', name: EXTRACTION_TOOL_NAME },
        messages,
      });
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) {
        throw new LLMRateLimitError(undefined, { cause: err });
      }
      if (err instanceof Anthropic.APIError && typeof err.status === 'number' && err.status >= 500) {
        throw new LLMServiceError('LLM provider returned a server error', {
          status: err.status,
          cause: err,
        });
      }
      // Other API errors (400/401/403) and network failures: surface as a
      // service error so the route never leaks a raw provider exception.
      throw new LLMServiceError('LLM provider request failed', { cause: err });
    }
  }
}

/** Render the conversation into a single transcript for the model to analyze. */
function renderTranscript(conversation: ExtractInput['conversation']): string {
  const body = conversation
    .map((turn) => `${turn.role === 'user' ? 'USER' : 'ASSISTANT'}: ${turn.content}`)
    .join('\n\n');
  return `Conversation transcript (chronological, most recent last):\n\n${body}`;
}

/**
 * Combine the model-supplied fields with the server-authoritative ones into a
 * candidate IR. Returned as `unknown` shape on purpose — `IRSchema.safeParse`
 * is the validation boundary.
 */
function assembleIR(
  modelInput: unknown,
  sourcePlatform: Platform,
  capturedAt: string
): Record<string, unknown> {
  const input = (modelInput ?? {}) as Record<string, unknown>;
  return {
    version: '1',
    capturedAt,
    source: { platform: sourcePlatform, inferredTopic: input['inferredTopic'] },
    factualState: input['factualState'],
    openThreads: input['openThreads'],
    rejectedPaths: input['rejectedPaths'],
    preferences: input['preferences'],
    constraints: input['constraints'],
    lastExchange: input['lastExchange'],
  };
}

function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => `- ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
}
