import type { ExchangeTurn, Platform } from './ir';

export interface PlatformAdapter {
  platform: Platform;
  /** URL patterns this adapter handles. */
  matches: (url: string) => boolean;
  /** True if we can capture FROM this platform. */
  canCapture: boolean;
  /** True if we can inject INTO this platform. */
  canInject: boolean;
  /** Scrape the visible conversation from the page. */
  scrapeConversation: () => Promise<ExchangeTurn[]>;
  /** Inject text into the platform's chat input. */
  injectPrimer: (text: string) => Promise<{ success: boolean; error?: string }>;
}
