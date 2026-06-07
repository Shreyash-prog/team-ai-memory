import { describe, expect, it } from 'vitest';
import type { IR } from '@team-ai-memory/shared';
import { IRSchema } from '@team-ai-memory/shared';
import { renderPrimer } from './render';

/** Count word-like tokens (those containing an alphanumeric character). */
function wordCount(text: string): number {
  return text.split(/\s+/).filter((t) => /[A-Za-z0-9]/.test(t)).length;
}

const BASE = {
  version: '1' as const,
  capturedAt: '2026-06-06T12:00:00.000Z',
  source: { platform: 'chatgpt' as const, inferredTopic: 'Fixing a flaky CI test' },
  factualState: [] as string[],
  openThreads: [] as string[],
  rejectedPaths: [] as { tried: string; whyFailed: string }[],
  preferences: [] as string[],
  constraints: [] as string[],
  lastExchange: [] as { role: 'user' | 'assistant'; content: string }[],
};

// A realistic Standard-length extraction, sized so the rendered primer lands in
// the 300-500 word target band.
const FULL_IR: IR = {
  ...BASE,
  source: {
    platform: 'chatgpt',
    inferredTopic: 'Fixing a flaky Jest test caused by shared module state',
  },
  factualState: [
    'The RateLimiter class uses a sliding window backed by Date.now() to track request timestamps',
    'A Jest test asserting isAllowed() is false after the budget is exhausted fails about one run in five in CI',
    'The failure is a wrong assertion value, not a timeout or a hang in the test runner',
    'The test passes reliably when run in isolation but fails far more often when the whole file runs',
    'Root cause: a single RateLimiter instance is exported at module top-level and shared across three tests',
    'Moving instantiation into a beforeEach hook produced fifty consecutive green CI runs',
  ],
  openThreads: [
    'Add a reset() method to the production RateLimiter singleton so callers can clear window state',
    'Audit the rest of the suite for other module-level singletons that leak state between tests',
  ],
  rejectedPaths: [
    {
      tried: 'Raising the test timeout from five to twenty seconds',
      whyFailed: 'The failure was a wrong value rather than a slow run, so the timeout had no effect',
    },
    {
      tried: 'Wrapping the test in jest.retryTimes(3)',
      whyFailed: 'It only masked the flake and hid the real defect from future maintainers',
    },
    {
      tried: 'Switching to jest.useFakeTimers() to control the clock',
      whyFailed: 'The failure rate actually rose across the full file, pointing away from timing',
    },
  ],
  preferences: [
    'Fix the root cause of a flake rather than masking it with retries',
    'Construct fresh fixtures per test instead of relying on shared module-level state',
  ],
  constraints: [
    'The test must stay green across at least fifty consecutive CI runs',
    'The production singleton behaviour must not change for existing callers',
  ],
  lastExchange: [
    {
      role: 'assistant',
      content:
        'That is the root cause: test order and parallelism change how many requests are already recorded, so the budget math differs run to run. Construct a fresh RateLimiter in a beforeEach.',
    },
    {
      role: 'user',
      content:
        'Moving it into beforeEach fixed it — fifty CI runs, all green. I will add a reset() too for the production singleton.',
    },
  ],
};

describe('renderPrimer', () => {
  it('omits empty sections gracefully (no dangling headers or empty bullets)', () => {
    const ir: IR = {
      ...BASE,
      factualState: ['I started sketching the onboarding email but have not finished a draft'],
    };
    const out = renderPrimer(ir);

    expect(out.startsWith('Quick recap before we keep going:')).toBe(true);
    expect(out.trimEnd().endsWith("Let's pick up from here.")).toBe(true);

    // None of the empty layers should produce a header.
    expect(out).not.toContain('still open');
    expect(out).not.toContain('ruled out');
    expect(out).not.toContain('preferences to keep in mind');
    expect(out).not.toContain('Constraints to respect');
    expect(out).not.toContain('Where we left off');

    // No empty bullets and no blank blockquotes.
    expect(out).not.toMatch(/^-\s*$/m);
    expect(out).not.toMatch(/^>\s*\*\*[^*]+:\*\*\s*$/m);
  });

  it('renders a fully-populated IR with every section present', () => {
    const out = renderPrimer(FULL_IR);

    expect(out).toContain("I'm working on fixing a flaky Jest test"); // softLowerFirst applied
    expect(out).toContain("Here's where things stand:");
    expect(out).toContain('A few things still open:');
    expect(out).toContain("Some things we've already ruled out");
    expect(out).toContain('A few preferences to keep in mind:');
    expect(out).toContain('Constraints to respect:');
    expect(out).toContain('Where we left off:');

    // Every IR item appears somewhere in the output.
    for (const item of [
      ...FULL_IR.factualState,
      ...FULL_IR.openThreads,
      ...FULL_IR.preferences,
      ...FULL_IR.constraints,
    ]) {
      expect(out).toContain(item);
    }
    for (const p of FULL_IR.rejectedPaths) {
      expect(out).toContain(p.tried);
    }
  });

  it('uses continuous-user (first-person) framing, not the AI\'s voice', () => {
    const out = renderPrimer(FULL_IR);
    expect(out).toContain("I'm working on");
    // The captured user's turn is rendered as "Me", the other side as "Assistant".
    expect(out).toContain('**Me:**');
    expect(out).toContain('**Assistant:**');
    expect(out).toContain("Let's pick up from here.");
  });

  it('produces structurally valid markdown', () => {
    const out = renderPrimer(FULL_IR);
    const lines = out.split('\n');

    // Bullet lines are well-formed list items with content.
    for (const line of lines) {
      if (line.startsWith('- ')) {
        expect(line.length).toBeGreaterThan(2);
      }
      if (line.startsWith('>')) {
        expect(line.startsWith('> ') || line === '>').toBe(true);
      }
    }

    // No header line is immediately followed by a blank line then the closing
    // (which would mean an empty section slipped through).
    expect(out).not.toContain(":\n\nLet's pick up from here.");

    // rejectedPaths phrasing follows the continuous-user template.
    expect(out).toMatch(/We tried .+, but .+ — so let's not go back there\./);
  });

  it('lands within the Standard length band (300-500 words)', () => {
    const words = wordCount(renderPrimer(FULL_IR));
    expect(words).toBeGreaterThanOrEqual(300);
    expect(words).toBeLessThanOrEqual(500);
  });

  it('is pure — identical IR yields identical output', () => {
    expect(renderPrimer(FULL_IR)).toBe(renderPrimer(FULL_IR));
  });

  it('only operates on schema-valid IRs (fixture sanity)', () => {
    expect(IRSchema.safeParse(FULL_IR).success).toBe(true);
  });
});
