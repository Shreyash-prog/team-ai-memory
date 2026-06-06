import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { IRSchema } from '@team-ai-memory/shared';
import type { ExchangeTurn } from '@team-ai-memory/shared';
import { AnthropicProvider } from './anthropic';

// vitest does not auto-load `.env.local`; load it so the real-API test can find
// ANTHROPIC_API_KEY (set in apps/api/.env.local) without baking it into config.
const envLocal = new URL('../../../.env.local', import.meta.url);
if (existsSync(envLocal)) {
  for (const line of readFileSync(envLocal, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (match && process.env[match[1]!] === undefined) {
      process.env[match[1]!] = match[2]!.replace(/^["']|["']$/g, '');
    }
  }
}

const apiKey = process.env.ANTHROPIC_API_KEY;

// A 10-turn synthetic conversation: a user debugging a Next.js deployment issue.
const CONVERSATION: ExchangeTurn[] = [
  { role: 'user', content: 'My Next.js 14 app builds fine locally but the Vercel deploy fails. The build log says "Error: Environment variable DATABASE_URL is not defined" during `next build`.' },
  { role: 'assistant', content: 'That error means DATABASE_URL is read at build time. Is it being accessed at module top-level or inside a server component that runs during static generation?' },
  { role: 'user', content: 'It is used in a `lib/db.ts` that creates a Drizzle client at module top-level, and that file is imported by a page using `export const dynamic = "force-static"`.' },
  { role: 'assistant', content: 'Right — force-static makes the page render at build time, so the top-level client creation runs then and needs the env var. First, add DATABASE_URL to the Vercel project env vars for the Production and Preview environments.' },
  { role: 'user', content: 'I added it in the Vercel dashboard but the build still fails. I tried prefixing it as NEXT_PUBLIC_DATABASE_URL too and that did not help either.' },
  { role: 'assistant', content: 'Do not use NEXT_PUBLIC_ for a database URL — that would expose your DB credentials to the browser. Remove that. After adding the env var in the dashboard you must trigger a fresh deploy; existing builds will not pick it up retroactively.' },
  { role: 'user', content: 'Okay I removed the NEXT_PUBLIC one. I redeployed and it got further, but now it fails with a connection timeout to Neon during the build.' },
  { role: 'assistant', content: 'Building static pages against a live DB is fragile. Better to not hit the DB at build time: change the page from force-static to dynamic rendering with `export const dynamic = "force-dynamic"`, or lazily create the Drizzle client inside the request handler instead of at module top-level.' },
  { role: 'user', content: 'I switched to lazily creating the client inside the route handler and set the page to force-dynamic. The build passes now and the page loads in production.' },
  { role: 'assistant', content: 'Great. To summarize: keep DATABASE_URL as a server-only env var in Vercel, never NEXT_PUBLIC, and avoid touching the DB during static generation by rendering dynamically or instantiating the client per-request.' },
];

describe('AnthropicProvider.extract (real Anthropic API)', () => {
  it.skipIf(!apiKey)(
    'extracts an IR that validates against IRSchema',
    async () => {
      const provider = new AnthropicProvider({ apiKey: apiKey! });

      const { ir, truncated } = await provider.extract({
        conversation: CONVERSATION,
        sourcePlatform: 'chatgpt',
      });

      // Pretty-print so the extraction output is visible in the test log / PR.
      // eslint-disable-next-line no-console
      console.log('Extracted IR:\n' + JSON.stringify(ir, null, 2));

      // The returned IR must validate against the shared schema.
      const parsed = IRSchema.safeParse(ir);
      expect(parsed.success).toBe(true);

      expect(ir.source.platform).toBe('chatgpt');
      expect(ir.factualState.length).toBeGreaterThan(0);
      expect(ir.lastExchange.length).toBeGreaterThan(0);
      expect(ir.lastExchange.length).toBeLessThanOrEqual(4);
      expect(truncated).toBe(false);
    },
    30_000
  );
});
