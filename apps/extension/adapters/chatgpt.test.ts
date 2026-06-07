// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { IRSchema } from '@team-ai-memory/shared';
import { parseConversation } from './chatgpt';

// A representative slice of ChatGPT's DOM: turns tagged with
// data-message-author-role, an assistant turn containing a fenced code block
// (with the language-header + "Copy code" button chrome ChatGPT renders), and a
// non-user/assistant role that must be skipped.
const FIXTURE = `
  <div data-message-author-role="user">
    <div class="whitespace-pre-wrap">How do I reverse a list in Python?</div>
  </div>
  <div data-message-author-role="assistant">
    <div class="markdown prose">
      <p>Use slicing:</p>
      <pre>
        <div class="code-header">python<button>Copy code</button></div>
        <code class="language-python">nums = [1, 2, 3]\nprint(nums[::-1])</code>
      </pre>
      <p>That prints the reversed list.</p>
    </div>
  </div>
  <div data-message-author-role="tool">
    <div>internal tool output that should be ignored</div>
  </div>
  <div data-message-author-role="user">
    <div class="whitespace-pre-wrap">Thanks!</div>
  </div>
`;

describe('parseConversation (ChatGPT)', () => {
  it('extracts ordered user/assistant turns, skipping other roles', () => {
    document.body.innerHTML = FIXTURE;
    const turns = parseConversation(document);

    expect(turns.map((t) => t.role)).toEqual(['user', 'assistant', 'user']);
    expect(turns[0]?.content).toBe('How do I reverse a list in Python?');
    expect(turns[2]?.content).toBe('Thanks!');
  });

  it('preserves code blocks as fenced markdown and drops UI chrome', () => {
    document.body.innerHTML = FIXTURE;
    const assistant = parseConversation(document)[1];

    expect(assistant?.content).toContain('```');
    expect(assistant?.content).toContain('nums = [1, 2, 3]');
    expect(assistant?.content).toContain('print(nums[::-1])');
    // The copy button / language header must not leak into the text.
    expect(assistant?.content).not.toContain('Copy code');
    expect(assistant?.content).toContain('Use slicing:');
    expect(assistant?.content).toContain('That prints the reversed list.');
  });

  it('produces turns that satisfy the IR lastExchange shape', () => {
    document.body.innerHTML = FIXTURE;
    const turns = parseConversation(document);
    // The IR's lastExchange is ExchangeTurn[] (max 4); the scraped turns must fit.
    const ir = {
      version: '1' as const,
      capturedAt: new Date().toISOString(),
      source: { platform: 'chatgpt' as const, inferredTopic: 'reversing lists' },
      factualState: ['discussed list reversal'],
      openThreads: [],
      rejectedPaths: [],
      preferences: [],
      constraints: [],
      lastExchange: turns.slice(-4),
    };
    expect(IRSchema.safeParse(ir).success).toBe(true);
  });

  it('returns an empty array when no messages are present', () => {
    document.body.innerHTML = '<div>nothing here</div>';
    expect(parseConversation(document)).toEqual([]);
  });
});
