// M1: no auth, no workspace picker — captures go to a single hardcoded
// workspace (matches the API/web placeholder). Workspace selection lands in M2.
export const PLACEHOLDER_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

// The deployed API Worker. Override at build time via WXT_API_BASE_URL.
export const API_BASE_URL: string =
  import.meta.env.WXT_API_BASE_URL ??
  'https://team-ai-memory-api.shreyashkalalwork.workers.dev';
