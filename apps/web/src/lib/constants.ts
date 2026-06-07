// M1 has no auth or workspace switcher: the web app reads from a single
// hardcoded placeholder workspace (matches the API's M1 placeholder). Replaced
// by real workspace selection in M2.
export const PLACEHOLDER_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

// The API Worker. Override via VITE_API_BASE_URL (e.g. localhost:8787 for a
// local `wrangler dev`); defaults to the deployed Worker so the Pages preview
// works without dashboard config.
export const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL ??
  'https://team-ai-memory-api.shreyashkalalwork.workers.dev';
