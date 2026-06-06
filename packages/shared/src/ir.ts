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
export type ExchangeTurn = z.infer<typeof ExchangeTurnSchema>;
