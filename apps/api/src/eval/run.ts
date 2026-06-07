import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { ExchangeTurnSchema, IRSchema, PlatformSchema } from '@team-ai-memory/shared';
import type { IR, Platform } from '@team-ai-memory/shared';
import {
  EXTRACTION_TOOL_NAME,
  getExtractionPrompt,
  getExtractionTool,
} from '../lib/llm/prompts/extract-v1';
import { renderReport, type EvalResult, type EvalUsage, type ReportData } from './report';

const MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 2048;

// Claude Haiku 4.5 pricing, USD per 1M tokens (see model catalog).
const RATES = { input: 1.0, output: 5.0, cacheRead: 0.1, cacheWrite: 1.25 } as const;

const FixtureSchema = z.object({
  name: z.string(),
  description: z.string(),
  sourcePlatform: PlatformSchema.optional(),
  conversation: z.array(ExchangeTurnSchema).min(1),
});
type Fixture = z.infer<typeof FixtureSchema>;

/**
 * Author's-eye assessments, keyed by fixture filename. Filled in after the
 * first eval run by reading the cached results, then `--render-only` re-renders
 * the report with them (no new API calls, so numbers and IRs stay stable).
 */
// Assessments reflect the prompt v1.1 run (see this file's git history for the
// v1 baseline these were updated from).
const ASSESSMENTS: Record<string, string> = {
  '01-debug-flaky-test.json':
    'Still strong: all three genuinely-tried fixes (raise timeout, retryTimes, fake timers) are captured as well-formed {tried, whyFailed} objects, and the shared-instance root cause lands in factualState with the reset() follow-up as an openThread. The single constraint restates the windowing mechanism rather than a forward-looking rule — minor.',
  '02-research-state-mgmt.json':
    'Captures the two real rejections (RTK, MobX) with their specific reasons and the decided TanStack-Query + Zustand stack. Constraints are now phrased as forward-looking requirements (server-data handling, mid-level team) rather than duplicated facts — cleaner than the v1 run, though some conceptual overlap with factualState remains.',
  '03-pivot-trip-to-resume.json':
    'Pivot handled correctly — the IR is entirely about the resume thread, no trip-logistics leakage. rejectedPaths is now correctly empty: v1 had logged the "don\'t put travel on the resume" advice as a rejected path, and the v1.1 guidance (advice/discussion is not a tried-and-abandoned approach) drops it.',
  '04-pivot-css-to-auth.json':
    'Pivot handled cleanly; the CSS thread is dropped and the auth token-refresh race plus single-flight fix are captured precisely, with accurate openThreads. rejectedPaths is a single focused, well-shaped entry (proactive-refresh-as-primary). The noisy non-preference "preference" from v1 is gone.',
  '05-unresolved-pricing.json':
    'Best openThreads result — every genuine unresolved question (founder alignment, representative data, variance-vs-quotable-price) is captured without inventing a decision. rejectedPaths tightened from three to two well-formed entries (per-seat, single quoted number); dropping the borderline "tiers from 6-partner data" item is reasonable.',
  '06-unresolved-plot.json':
    'Fixed — the v1 hard failure (rejectedPaths returned as strings) is gone: extraction succeeds on the first call with properly-shaped {tried, whyFailed} objects, and openThreads captures the undecided endings. The two rejectedPaths (co-ownership ending, object-as-thread) are borderline since they were discussed rather than literally "tried," but they are correctly shaped and reasoned — the shape-robustness goal is met.',
  '07-implicit-email-tone.json':
    'Implicit extraction remains strong — unstated tone rules surface as preferences and the unspoken Thursday/board-meeting deadline as constraints. rejectedPaths is now empty: v1 wrongly logged four email draft-iterations as rejected paths, and v1.1 correctly treats successive edits of the same draft as refinement, not rejection.',
  '08-implicit-api-choice.json':
    'Excellent implicit-constraint extraction (10KB bundle limit, UTC storage, TS-first preferences). rejectedPaths keeps moment.js (genuinely rejected) but also logs "date-fns/Day.js for formatting," which is borderline — those were discussed and passed over rather than tried — so a trace of over-eagerness remains here, much reduced from v1.',
  '09-happy-postgres-index.json':
    'Clean baseline, and the key win: rejectedPaths is now empty (v1 produced two, one self-annotated "not rejected"). openThreads correctly empty and the jsonb_path_ops + fastupdate decision captured. The over-extraction on this fixture is resolved.',
  '10-happy-blog-outline.json':
    'Faithful outline capture, and like 09 the over-population is gone — rejectedPaths is now empty (v1 had logged the two outline revisions as rejected paths). openThreads minimal, constraints reasonable.',
};

function loadEnvLocal(url: URL): void {
  if (!existsSync(url)) return;
  for (const line of readFileSync(url, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (match && process.env[match[1]!] === undefined) {
      process.env[match[1]!] = match[2]!.replace(/^["']|["']$/g, '');
    }
  }
}

function computeCost(u: EvalUsage): number {
  return (
    (u.inputTokens * RATES.input +
      u.outputTokens * RATES.output +
      u.cacheReadInputTokens * RATES.cacheRead +
      u.cacheCreationInputTokens * RATES.cacheWrite) /
    1_000_000
  );
}

// Mirrors AnthropicProvider's transcript + IR assembly so the eval measures the
// production prompt/tool. The provider additionally retries once on validation
// failure; the eval uses a single call and reports any failure instead.
function renderTranscript(conversation: Fixture['conversation']): string {
  const body = conversation
    .map((turn) => `${turn.role === 'user' ? 'USER' : 'ASSISTANT'}: ${turn.content}`)
    .join('\n\n');
  return `Conversation transcript (chronological, most recent last):\n\n${body}`;
}

function assembleIR(
  modelInput: unknown,
  platform: Platform,
  capturedAt: string
): Record<string, unknown> {
  const input = (modelInput ?? {}) as Record<string, unknown>;
  return {
    version: '1',
    capturedAt,
    source: { platform, inferredTopic: input['inferredTopic'] },
    factualState: input['factualState'],
    openThreads: input['openThreads'],
    rejectedPaths: input['rejectedPaths'],
    preferences: input['preferences'],
    constraints: input['constraints'],
    lastExchange: input['lastExchange'],
  };
}

async function extractOne(
  client: Anthropic,
  fixture: Fixture
): Promise<{ ir: IR | null; usage: EvalUsage; error?: string }> {
  const platform = fixture.sourcePlatform ?? 'chatgpt';
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: getExtractionPrompt(platform),
    tools: [getExtractionTool()],
    tool_choice: { type: 'tool', name: EXTRACTION_TOOL_NAME },
    messages: [{ role: 'user', content: renderTranscript(fixture.conversation) }],
  });

  const usage: EvalUsage = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
  };

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock =>
      block.type === 'tool_use' && block.name === EXTRACTION_TOOL_NAME
  );
  if (!toolUse) {
    return { ir: null, usage, error: 'Model returned no tool_use block' };
  }

  const parsed = IRSchema.safeParse(
    assembleIR(toolUse.input, platform, new Date().toISOString())
  );
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    return { ir: null, usage, error: `IR failed schema validation: ${detail}` };
  }
  return { ir: parsed.data, usage };
}

const ZERO_USAGE: EvalUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
};

async function main(): Promise<void> {
  const here = new URL('./', import.meta.url);
  const fixturesDir = new URL('fixtures/', here);
  const jsonPath = new URL('results/baseline.json', here);
  const mdPath = new URL('results/baseline.md', here);

  // Re-render the committed report from cached results — no API calls. Used to
  // fold in the author's assessments after a run.
  if (process.argv.includes('--render-only')) {
    const data = JSON.parse(readFileSync(jsonPath, 'utf8')) as ReportData;
    await writeFile(mdPath, renderReport(data, ASSESSMENTS));
    console.log('Re-rendered results/baseline.md from cached results (no API calls).');
    return;
  }

  loadEnvLocal(new URL('../../.env.local', here));
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY is not set (expected in apps/api/.env.local).');
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });
  const files = (await readdir(fixturesDir)).filter((f) => f.endsWith('.json')).sort();
  if (files.length === 0) {
    console.error('No fixtures found in', fixturesDir.pathname);
    process.exit(1);
  }

  const results: EvalResult[] = [];
  for (const file of files) {
    const raw = JSON.parse(await readFile(new URL(file, fixturesDir), 'utf8')) as unknown;
    const fixture = FixtureSchema.parse(raw);
    process.stdout.write(`Running ${file} ... `);

    const start = performance.now();
    let result: EvalResult;
    try {
      const { ir, usage, error } = await extractOne(client, fixture);
      const latencyMs = Math.round(performance.now() - start);
      result = {
        fixtureFile: file,
        name: fixture.name,
        description: fixture.description,
        turns: fixture.conversation.length,
        latencyMs,
        usage,
        costUsd: computeCost(usage),
        ir,
        error,
      };
    } catch (err) {
      const latencyMs = Math.round(performance.now() - start);
      result = {
        fixtureFile: file,
        name: fixture.name,
        description: fixture.description,
        turns: fixture.conversation.length,
        latencyMs,
        usage: ZERO_USAGE,
        costUsd: 0,
        ir: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
    results.push(result);
    console.log(`${result.ir ? 'ok' : 'FAILED'} — ${result.latencyMs}ms, $${result.costUsd.toFixed(4)}`);
  }

  const data: ReportData = {
    generatedAt: new Date().toISOString(),
    model: MODEL,
    results,
  };
  await writeFile(jsonPath, JSON.stringify(data, null, 2) + '\n');
  await writeFile(mdPath, renderReport(data, ASSESSMENTS));

  const totalCost = results.reduce((s, r) => s + r.costUsd, 0);
  const failures = results.filter((r) => r.ir === null).length;
  console.log(
    `\nDone: ${results.length} fixtures, ${failures} failure(s), total $${totalCost.toFixed(4)}.`
  );
  console.log('Wrote results/baseline.json and results/baseline.md');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
