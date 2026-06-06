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
const ASSESSMENTS: Record<string, string> = {
  '01-debug-flaky-test.json':
    'Excellent on the target layer: all three rejected fixes (raise timeout, retryTimes, fake timers) are captured with accurate `tried`/`whyFailed`, and the real root cause (shared module-level instance) lands cleanly in factualState. The reset() follow-up is correctly an openThread. Minor: the lone constraint ("stable across 50+ CI runs") is really the verification bar restated, not a stated constraint.',
  '02-research-state-mgmt.json':
    'Strong rejectedPaths — RTK and MobX are captured with the specific, accurate reasons given (boilerplate; observable unfamiliarity), which is the critical signal. The decided stack and URL-as-source-of-truth detail are preserved well. Weakness: facts leak into constraints (team size, "80% server data" appear as both factualState and constraints), so those two layers overlap.',
  '03-pivot-trip-to-resume.json':
    'Handled the pivot correctly — the IR is entirely about the resume thread, with no leakage of the abandoned Lisbon trip logistics; the only travel reference (quarterly Lisbon on-site) is legitimately part of the job. inferredTopic nails the post-pivot focus. Slightly generous: "don\'t put travel on the resume" is logged as a rejectedPath when it\'s really advice, not a tried-and-failed approach.',
  '04-pivot-css-to-auth.json':
    'Pivot handled cleanly: the CSS thread is fully dropped and the auth token-refresh race condition is captured precisely, including the concurrent-401 root cause and the single-flight fix. openThreads (implement single-flight, verify in staging, consider proactive refresh) are exactly right. One noise item: a "preference" that admits no preference was stated — that entry should have been omitted.',
  '05-unresolved-pricing.json':
    'Best demonstration of the openThreads layer — it captures every genuine unresolved question (founder alignment on simplicity-vs-margin, lack of representative usage data, the variance-vs-quotable-price tension) without inventing a decision the conversation never reached. rejectedPaths (per-seat, single quoted number, tiers from 6-partner data) are accurate too. Mild overlap between openThreads and constraints.',
  '06-unresolved-plot.json':
    'The one hard failure: the model returned `rejectedPaths` as plain strings instead of `{tried, whyFailed}` objects, so the IR failed schema validation. This is the eval\'s most useful finding — on a creative brainstorm where the "rejected" items (discarded endings) are loosely shaped, the single-shot prompt mis-shapes that layer. In production AnthropicProvider retries once with the validation error fed back, which would very likely correct it; the eval uses a single call by design to expose the raw first attempt. Suggests tightening the tool/prompt around rejectedPaths item shape.',
  '07-implicit-email-tone.json':
    'Strong implicit extraction: the unstated tone rules (no emoji/exclamation, direct, get-to-the-point) surface as preferences and the unspoken deadline (Thursday EOD, before the Friday board meeting, team hears it first) surfaces as constraints — none were labeled as such in the chat. Interesting and defensible: it modeled the rejected draft iterations (celebratory tone, vague phrasing, etc.) as rejectedPaths, which is a reasonable reading of editing churn.',
  '08-implicit-api-choice.json':
    'Alongside 07, the best implicit-constraint result: the 10KB bundle limit and the fully-typed requirement are lifted into constraints, and minimize-deps / prefer-native / TS-first into preferences — all from indirect phrasing, never stated as "my constraint is." rejectedPaths (moment.js; a library just for local formatting) are accurate. No notable misses.',
  '09-happy-postgres-index.json':
    'Clean and accurate on a baseline conversation; openThreads correctly empty and the jsonb_path_ops + fastupdate decision captured precisely. The one wrinkle is mild over-extraction: it lists two rejectedPaths on a fixture designed to have none, and even self-annotates one as "Not rejected, but suboptimal." B-tree is a fair rejection; the "standard GIN" entry is a stretch — a signal the prompt is slightly eager to populate rejectedPaths.',
  '10-happy-blog-outline.json':
    'Faithful baseline extraction: the finalized 7-section outline, the 5-weeks→8-days hook, and the metrics-woven-per-week decision are all captured correctly, with openThreads minimal. Like 09, it frames the two revision decisions (generic hook, metrics placement) as rejectedPaths — defensible here since the user explicitly changed both, but consistent with the broader tendency to read any discarded option as a rejected path.',
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
