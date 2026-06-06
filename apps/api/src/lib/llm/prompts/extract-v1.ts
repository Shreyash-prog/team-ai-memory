import type Anthropic from '@anthropic-ai/sdk';
import type { Platform } from '@team-ai-memory/shared';

/**
 * Extraction prompt v1.
 *
 * Targets the five context layers from the team spec (factual state, open
 * threads, rejected paths, preferences, constraints) plus `lastExchange` for
 * pickup continuity and a short `inferredTopic`. The model returns its output
 * by calling the {@link getExtractionTool} tool; the caller assembles the full
 * IR (adding the server-authoritative `version`, `capturedAt`, and
 * `source.platform`) and validates it against `IRSchema`.
 */

const PLATFORM_LABEL: Record<Platform, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
};

/** The tool name the model must call. Exported so the provider can force it. */
export const EXTRACTION_TOOL_NAME = 'record_memory';

export function getExtractionPrompt(sourcePlatform: Platform): string {
  const platform = PLATFORM_LABEL[sourcePlatform];
  return `You extract durable, shareable memory from an AI chat conversation so that a teammate who was not present can pick the work up and continue it without re-reading the whole thread.

The conversation below was captured from ${platform}. Read the entire conversation, then call the \`${EXTRACTION_TOOL_NAME}\` tool exactly once to record what you extracted.

Extract these layers:

- inferredTopic: a short (3–8 word) description of what this conversation was about. Concrete and specific, not generic.
- factualState: the established facts and the current state of the work — decisions made, things built or agreed, values/names/identifiers that matter. Each item one self-contained statement.
- openThreads: unresolved questions, pending decisions, and concrete next steps still in play. What a teammate would need to act on next.
- rejectedPaths: approaches that were tried and abandoned. For each, record what was tried and why it failed, so the teammate doesn't repeat it.
- preferences: stated preferences the user expressed — tools, libraries, style, conventions, ways of working.
- constraints: hard requirements, limits, deadlines, or non-negotiables that govern the work.
- lastExchange: the final up to 4 turns of the conversation, verbatim, in chronological order (oldest first), so the handoff has immediate context for where the thread left off.

Rules:
- Preserve specifics: names, numbers, versions, file paths, error messages, decisions. These are what make the memory useful.
- Do not invent or infer beyond what the conversation supports. If a layer has nothing, return an empty array for it — never fabricate filler.
- Be concise. Each array item is a single fact or thread, not a paragraph.
- factualState should never be empty for a substantive conversation; if you truly cannot find any, return an empty array rather than padding.`;
}

/**
 * The tool whose input schema mirrors the model-supplied portion of the IR
 * (everything except the server-authoritative `version` / `capturedAt` /
 * `source.platform`). The assembled object is validated against `IRSchema` at
 * runtime, so any drift between this schema and `IRSchema` is caught there and
 * in the unit test.
 */
export function getExtractionTool(): Anthropic.Tool {
  return {
    name: EXTRACTION_TOOL_NAME,
    description:
      'Record the structured memory extracted from the conversation. Call exactly once with every field populated (use empty arrays for layers with no content).',
    input_schema: {
      type: 'object',
      properties: {
        inferredTopic: {
          type: 'string',
          description: 'Short (3–8 word) topic describing what the conversation was about.',
        },
        factualState: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Established facts and current state of the work: decisions, things built, key values/names.',
        },
        openThreads: {
          type: 'array',
          items: { type: 'string' },
          description: 'Unresolved questions, pending decisions, and next steps still in play.',
        },
        rejectedPaths: {
          type: 'array',
          description: 'Approaches that were tried and abandoned, each with why it failed.',
          items: {
            type: 'object',
            properties: {
              tried: { type: 'string', description: 'What was attempted.' },
              whyFailed: { type: 'string', description: 'Why it did not work.' },
            },
            required: ['tried', 'whyFailed'],
            additionalProperties: false,
          },
        },
        preferences: {
          type: 'array',
          items: { type: 'string' },
          description: 'Stated preferences: tools, libraries, style, conventions, ways of working.',
        },
        constraints: {
          type: 'array',
          items: { type: 'string' },
          description: 'Hard requirements, limits, deadlines, or non-negotiables.',
        },
        lastExchange: {
          type: 'array',
          maxItems: 4,
          description:
            'The final up to 4 turns of the conversation, verbatim, oldest first.',
          items: {
            type: 'object',
            properties: {
              role: { type: 'string', enum: ['user', 'assistant'] },
              content: { type: 'string' },
            },
            required: ['role', 'content'],
            additionalProperties: false,
          },
        },
      },
      required: [
        'inferredTopic',
        'factualState',
        'openThreads',
        'rejectedPaths',
        'preferences',
        'constraints',
        'lastExchange',
      ],
      additionalProperties: false,
    },
  };
}
