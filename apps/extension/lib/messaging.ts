import type { ExchangeTurn } from '@team-ai-memory/shared';

// Typed wrapper around the popup ↔ content-script message channel.

export type ScrapeRequest = { type: 'SCRAPE' };

export type ScrapeResponse =
  | { ok: true; conversation: ExchangeTurn[] }
  | { ok: false; error: string };

/** Popup → content script: ask the active tab to scrape its conversation. */
export async function requestScrape(tabId: number): Promise<ScrapeResponse> {
  try {
    const res = (await chrome.tabs.sendMessage(tabId, {
      type: 'SCRAPE',
    } satisfies ScrapeRequest)) as ScrapeResponse | undefined;
    if (!res) {
      return { ok: false, error: 'No response from the page. Try reloading the tab.' };
    }
    return res;
  } catch {
    // Usually means no content script on this tab (wrong page, or needs reload
    // after the extension was (re)installed).
    return {
      ok: false,
      error: 'Could not reach the page. Open a ChatGPT conversation and reload the tab.',
    };
  }
}

/** Content script: register the handler that answers SCRAPE requests. */
export function onScrape(handler: () => Promise<ExchangeTurn[]>): void {
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!isScrapeRequest(message)) return undefined;
    handler()
      .then((conversation) => sendResponse({ ok: true, conversation } satisfies ScrapeResponse))
      .catch((err) =>
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        } satisfies ScrapeResponse)
      );
    return true; // keep the channel open for the async response
  });
}

function isScrapeRequest(message: unknown): message is ScrapeRequest {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'SCRAPE'
  );
}
