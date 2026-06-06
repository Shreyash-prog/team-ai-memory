import type { IR, ExtractRequest } from '@team-ai-memory/shared';

/**
 * The contract every LLM provider must satisfy. v1 ships a single
 * implementation (Anthropic Claude Haiku), but the seam is kept so OpenAI /
 * Gemini can be added later as one-file additions. See architecture.md §5.5.
 */
export interface LLMProvider {
  name: string;
  /** Run extraction; returns the IR (caller may re-validate). */
  extract(input: {
    conversation: ExtractRequest['conversation'];
    sourcePlatform: ExtractRequest['sourcePlatform'];
  }): Promise<{ ir: IR; truncated: boolean }>;
}

// ===== Typed errors =====
//
// The /extract route translates these into HTTP responses:
//   LLMRateLimitError → 429, LLMServiceError → 502/503, IRValidationError → 502.

/** Base class for all extraction-layer failures. */
export class LLMError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'LLMError';
  }
}

/** Anthropic returned 429 (rate limited). Retryable upstream. */
export class LLMRateLimitError extends LLMError {
  constructor(message = 'LLM provider rate limited', options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'LLMRateLimitError';
  }
}

/** Anthropic returned a 5xx / overloaded error, or an otherwise-unusable response. */
export class LLMServiceError extends LLMError {
  readonly status?: number;
  constructor(
    message = 'LLM provider service error',
    options?: { status?: number; cause?: unknown }
  ) {
    super(message, { cause: options?.cause });
    this.name = 'LLMServiceError';
    this.status = options?.status;
  }
}

/** The model's output failed IR schema validation even after one corrective retry. */
export class IRValidationError extends LLMError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'IRValidationError';
  }
}
