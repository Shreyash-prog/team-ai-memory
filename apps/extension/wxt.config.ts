import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Team AI Memory',
    description: 'Your team\'s shared AI memory across ChatGPT, Claude, and Gemini.',
    permissions: ['storage', 'activeTab'],
    host_permissions: [
      'https://chatgpt.com/*',
      'https://chat.openai.com/*',
      'https://claude.ai/*',
      // The API Worker — grants the popup CORS-free fetch access to /extract.
      'https://team-ai-memory-api.shreyashkalalwork.workers.dev/*',
    ],
  },
});
