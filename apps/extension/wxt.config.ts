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
    ],
  },
});
