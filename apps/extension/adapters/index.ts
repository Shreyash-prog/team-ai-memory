import type { PlatformAdapter } from './types';
import { chatgptAdapter } from './chatgpt';

// v1 ships the ChatGPT adapter; Claude/Gemini are added in later milestones.
const adapters: PlatformAdapter[] = [chatgptAdapter];

export function getAdapterForUrl(url: string): PlatformAdapter | null {
  return adapters.find((adapter) => adapter.matches(url)) ?? null;
}
