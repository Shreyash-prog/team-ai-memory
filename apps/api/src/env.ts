/** Worker bindings. Secrets come from Wrangler secrets in prod and `.dev.vars`
 * locally; public vars come from `[vars]` in wrangler.toml. */
export interface Env {
  DATABASE_URL: string;
  ANTHROPIC_API_KEY: string;
  WEB_APP_URL: string;
}
