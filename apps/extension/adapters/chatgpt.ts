import type { ExchangeTurn } from '@team-ai-memory/shared';
import type { PlatformAdapter } from './types';

/**
 * ChatGPT DOM selectors.
 *
 * Verified against chatgpt.com on 2026-06-07 using the stable
 * `data-message-author-role` attribute that ChatGPT places on each turn — this
 * has been the most durable hook across ChatGPT's frequent DOM churn. If
 * scraping breaks, re-inspect a user and an assistant message and update these.
 *
 * NOTE: selectors below were written against ChatGPT's known structure but were
 * not re-validated against a live logged-in session in CI (no ChatGPT account
 * available there) — see the unit test (`chatgpt.test.ts`) which exercises the
 * parser against a representative DOM fixture.
 */
const SELECTORS = {
  /** Each conversation turn. Role is read from the attribute value. */
  message: '[data-message-author-role]',
  roleAttr: 'data-message-author-role',
  /** Code blocks inside a message. The <code> child holds the raw code. */
  pre: 'pre',
  code: 'code',
} as const;

/** Extract clean text from one message element, preserving code blocks as
 * fenced markdown and dropping UI chrome (e.g. "Copy code" buttons). Pure
 * w.r.t. the element's owner document, so it works under any DOM (incl. tests). */
function extractMessageText(el: Element): string {
  const doc = el.ownerDocument;
  const clone = el.cloneNode(true) as Element;

  // Replace each <pre> with a fenced block built from its <code> text. The
  // language header / copy button live outside <code>, so they're dropped.
  for (const pre of Array.from(clone.querySelectorAll(SELECTORS.pre))) {
    const code = pre.querySelector(SELECTORS.code);
    const raw = (code?.textContent ?? pre.textContent ?? '').replace(/\s+$/, '');
    pre.replaceWith(doc.createTextNode(`\n\n\`\`\`\n${raw}\n\`\`\`\n\n`));
  }

  // Remove interactive chrome that would otherwise pollute the text.
  for (const btn of Array.from(clone.querySelectorAll('button'))) {
    btn.remove();
  }

  const text = clone.textContent ?? '';
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

/** Parse all conversation turns from a root node. Pure and DOM-agnostic, so the
 * unit test can pass a fixture document. */
export function parseConversation(root: ParentNode): ExchangeTurn[] {
  const nodes = Array.from(root.querySelectorAll(SELECTORS.message));
  const turns: ExchangeTurn[] = [];
  for (const el of nodes) {
    const role = el.getAttribute(SELECTORS.roleAttr);
    if (role !== 'user' && role !== 'assistant') continue; // skip system/tool turns
    const content = extractMessageText(el);
    if (content) turns.push({ role, content });
  }
  return turns;
}

/** Find the scrollable ancestor of the first message so we can load history. */
function findScrollContainer(): HTMLElement | null {
  const first = document.querySelector<HTMLElement>(SELECTORS.message);
  let node: HTMLElement | null = first?.parentElement ?? null;
  while (node) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/** Scroll to the top repeatedly so ChatGPT loads earlier messages, until the
 * message count stops growing (or we hit a safety cap). */
async function loadEarlierMessages(): Promise<void> {
  const container = findScrollContainer();
  const scrollTarget: { scrollTo: (opts: { top: number }) => void } = container ?? window;
  let previous = -1;
  for (let i = 0; i < 12; i++) {
    const count = document.querySelectorAll(SELECTORS.message).length;
    if (count === previous) break;
    previous = count;
    scrollTarget.scrollTo({ top: 0 });
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
}

export const chatgptAdapter: PlatformAdapter = {
  platform: 'chatgpt',
  matches: (url) =>
    url.startsWith('https://chatgpt.com/') || url.startsWith('https://chat.openai.com/'),
  canCapture: true,
  canInject: false, // injection (M3); capture-only in M1

  scrapeConversation: async () => {
    await loadEarlierMessages();
    return parseConversation(document);
  },

  injectPrimer: async () => ({
    success: false,
    error: 'Injection into ChatGPT is not implemented yet (planned for M3).',
  }),
};
