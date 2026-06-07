// Content script for ChatGPT pages. Responds to the popup's SCRAPE request with
// the scraped conversation.
//
// Path note: WXT only detects content-script entrypoints at the top level of
// `entrypoints/` (or `entrypoints/<name>.content/index.ts`), not nested under
// `entrypoints/content/`, so this lives here rather than the build-plan's
// suggested `entrypoints/content/chatgpt.content.ts`.
import { getAdapterForUrl } from '../adapters';
import { onScrape } from '../lib/messaging';

export default defineContentScript({
  matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
  main() {
    onScrape(async () => {
      const adapter = getAdapterForUrl(location.href);
      if (!adapter || !adapter.canCapture) {
        throw new Error('This page is not capturable.');
      }
      const conversation = await adapter.scrapeConversation();
      if (conversation.length === 0) {
        throw new Error('No conversation found on this page.');
      }
      return conversation;
    });
  },
});
