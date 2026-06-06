# Setup Guide — Team AI Memory

**Status:** Draft v0.1
**Audience:** You, the developer, on a fresh macOS machine. This is a linear checklist — work top to bottom.
**Time budget:** One focused evening (≈2.5 hours), plus 30–60 minutes the next day for account verifications.
**Outcome:** Dev tools installed, all accounts created, secrets in hand, monorepo initialized with skeleton code, Claude Code configured, "hello world" API + web app deployed to Cloudflare, first PR merged.

This guide assumes you have already read `team-spec.md` and `architecture.md`. If you haven't, stop and read those first — they explain *why* this stack, which this guide takes for granted.

A note on commands: every block fenced as `bash` is meant to be run literally. Replace placeholder values (anything in `<angle-brackets>`) before running.

A note on accounts: the order matters. Some services depend on others (e.g., your Resend domain needs DNS records that require a real domain, but for v1 we use Resend's test domain). I've ordered things to minimize blocking.

---

## Part 1 — Local development tools (≈30 min)

### 1.1 Install Homebrew

Homebrew is the package manager for macOS. Most other tools come through it.

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

When it finishes, follow the on-screen instructions to add Homebrew to your PATH (usually two `echo` commands it gives you). Then verify:

```bash
brew --version
```

### 1.2 Install Node.js via fnm

`fnm` (Fast Node Manager) is the modern alternative to `nvm`. It's faster, works well on macOS, and lets you switch Node versions per project.

```bash
brew install fnm
```

Add fnm to your shell. If you use zsh (the macOS default), append to `~/.zshrc`:

```bash
echo 'eval "$(fnm env --use-on-cd)"' >> ~/.zshrc
source ~/.zshrc
```

Install the latest LTS Node:

```bash
fnm install --lts
fnm use lts-latest
fnm default lts-latest
node --version    # Should print v22.x or higher
```

### 1.3 Install pnpm

We use pnpm for the monorepo. Don't use npm or yarn for this project.

```bash
brew install pnpm
pnpm --version    # Should print 9.x or higher
```

### 1.4 Install Git, configure identity

Git is preinstalled on macOS. If you've already configured git on this machine, you can verify your current config and skip ahead:

```bash
git --version
git config --global --list   # confirm user.name and user.email are set
```

If git is fresh on this machine, configure your identity:

```bash
git config --global user.name "Shreyash Kalal"
git config --global user.email "myobssk1998@gmail.com"
git config --global init.defaultBranch main
git config --global pull.rebase false
```

### 1.5 Install VS Code

Either via Homebrew or by downloading from code.visualstudio.com:

```bash
brew install --cask visual-studio-code
```

Install these extensions (you can do this later if preferred):

- ESLint (`dbaeumer.vscode-eslint`)
- Prettier (`esbenp.prettier-vscode`)
- Tailwind CSS IntelliSense (`bradlc.vscode-tailwindcss`)
- Drizzle ORM schema visualizer (`rphlmr.vscode-drizzle-orm`) — optional; the primary Drizzle UI is `drizzle-kit studio`, run separately

### 1.6 Install Claude Code

Claude Code is Anthropic's terminal-native agentic coding tool. It's bundled with your Claude Max subscription.

```bash
npm install -g @anthropic-ai/claude-code
```

After install, sign in. Claude Code will open a browser window for the OAuth flow against your Claude Max account.

```bash
claude
```

The first run drops you into a session in your current directory. Type `/exit` to quit for now — we'll come back to it after the repo is initialized.

### 1.7 Install Wrangler (Cloudflare CLI)

We'll install Wrangler as a dev dependency in the API workspace later, but having it globally is convenient for one-off commands.

```bash
npm install -g wrangler
wrangler --version
```

### 1.8 Verify the toolchain

Quick sanity check:

```bash
brew --version && node --version && pnpm --version && git --version && wrangler --version && claude --version
```

If any of those error, fix that before moving on. You're done with Part 1.

---

## Part 2 — External accounts (≈45 min, plus wait time)

We need accounts at: GitHub (you have this), Cloudflare, Neon, Resend, Anthropic, Sentry, and PostHog. Most are free, none require a credit card for the POC tier we're using. Some have small first-time onboarding friction; I've flagged the gotchas.

For each: create the account, generate the key/token we need, and save it somewhere safe (a password manager or a temporary `.env.local.draft` file). **Do not put any key into git.**

### 2.1 GitHub

You already have an account. Create a new repo:

- Go to github.com/new
- Name: `team-ai-memory` (or whatever you prefer)
- Public repo (chosen deliberately — gets free unlimited GitHub Actions minutes and lets you share the code with cofounders, investors, or hires later)
- Do **not** initialize with a README, .gitignore, or license — we'll add ours
- Create

Note the SSH URL: `git@github.com:<your-username>/team-ai-memory.git`. We'll use it in Part 3.

If you haven't set up SSH keys for GitHub before, do that now: github.com/settings/keys → New SSH key, paste your `~/.ssh/id_ed25519.pub` (generate with `ssh-keygen -t ed25519` if missing).

**Public-repo hygiene note:** Because the repo is public, never commit any file that contains secrets — `.env`, `.env.local`, anything ending in `.local`, any file with API keys. Our `.gitignore` from Part 3 already excludes these patterns, and all production secrets live in Cloudflare Worker secrets (not in the repo). If you ever do leak a key, revoke it immediately at the provider's dashboard rather than trying to rewrite git history — bots scrape new commits for keys within minutes.

### 2.2 Cloudflare

- cloudflare.com → Sign up. Free account.
- Verify your email.
- Once in the dashboard, note your Account ID (in the right sidebar of any zone, or under "Account Home").
- We'll come back here to deploy. No key generation needed yet — Wrangler handles auth via OAuth in Part 3.

### 2.3 Neon (Postgres)

- neon.tech → Sign up with GitHub for the smoothest flow.
- Create a project: name it `team-ai-memory`, region closest to you (US East is fine for most of North America).
- Once created, you land on a page showing the connection string. It looks like `postgresql://<user>:<pass>@<host>/<db>?sslmode=require`.
- Save the connection string. We'll call this `DATABASE_URL`.

**Gotcha:** Neon's free tier auto-pauses inactive projects after a few days. The first request after pause has ~1 second latency. Acceptable for dev; just know it.

### 2.4 Resend (email)

- resend.com → Sign up.
- Generate an API key: API Keys → Create. Name it `team-ai-memory-dev`. Permission: Sending access. Save the key — we'll call this `RESEND_API_KEY`.
- For dev, you'll use Resend's testing sender (`onboarding@resend.dev`). It only delivers to email addresses you've verified, which means your own — that's fine for the POC.
- For prod (later, when we have a real domain), we add and verify a domain. For now, skip the domain step.

### 2.5 Anthropic API

- console.anthropic.com → Sign in with the account that holds your API credits.
- Settings → API Keys → Create Key. Name it `team-ai-memory-dev`. Save as `ANTHROPIC_API_KEY`.
- Verify your credit balance on the Billing tab so we know what we're working with.

### 2.6 Sentry (errors)

- sentry.io → Sign up.
- Create a new organization (just for this project).
- Create a project: Platform = `JavaScript / Browser` for the web app. Name it `team-ai-memory-web`. Save the DSN.
- Create another project: Platform = `JavaScript / Browser` for the extension. Name it `team-ai-memory-extension`. Save the DSN.
- Create another project: Platform = `JavaScript / Cloudflare Workers`. Name it `team-ai-memory-api`. Save the DSN.

We'll wire these in during Milestone 1, not now.

### 2.7 PostHog (product analytics)

PostHog tracks which features actually get used (captures, searches, invites, etc.). Unlike Sentry (errors), PostHog records *events* — purposeful product usage. We'll emit events during Milestone 2; this section just creates the account and grabs the key.

**Step-by-step:**

1. Go to **posthog.com** and click "Get started — Free."
2. Sign up with GitHub (recommended for consistency with your other accounts).
3. **Pick a region** when prompted — **US Cloud** unless you have a specific reason for EU. This isn't easily reversible; decide once. US is fine for our target market.
4. PostHog will walk you through creating an **Organization** and **Project**:
   - Organization: any name (e.g., your name or `Team AI Memory`).
   - Project: `team-ai-memory`.
   - Primary use case: pick **Product Analytics**.
5. PostHog tries to walk you through installing the SDK in your app. **Skip this onboarding wizard** — we have no app to instrument yet. Click "Skip" or navigate away to any page in the sidebar.
6. **Find your project API key:** click **Settings** (gear icon, usually bottom-left) → **Project** sub-nav → look for **Project API Key**. The value starts with `phc_` followed by a long string. Save as `POSTHOG_KEY`.
7. **Find your API host on the same Settings page.** It'll be one of:
   - `https://us.i.posthog.com` (US Cloud)
   - `https://eu.i.posthog.com` (EU Cloud)
   Save as `POSTHOG_HOST`.

**Settings to adjust now (before you forget):**

- **Settings → Project → Autocapture:** turn **off**. We want intentional named events, not noisy auto-tracking.
- **Settings → Project → Session Replay:** turn **off**. Video-like recordings of user sessions are a privacy concern for a product handling AI conversation context. Can be enabled later if specifically needed.

We'll wire PostHog into the apps in Milestone 2 (Task M2-T10). The key and host are all we need from this step.

### 2.8 Inventory check

You should now have, saved somewhere safe:

- GitHub: SSH key configured, empty public repo exists
- Cloudflare: account created, account ID noted
- Neon: `DATABASE_URL` (connection string with credentials)
- Resend: `RESEND_API_KEY`
- Anthropic: `ANTHROPIC_API_KEY`
- Sentry: three DSNs (web, extension, api)
- PostHog: `POSTHOG_KEY` (starts with `phc_`) and `POSTHOG_HOST` (US or EU URL)

Plus one value we'll generate in Part 3: `BETTER_AUTH_SECRET` (a random string).

Done with Part 2.

---

## Part 3 — Initialize the repo (≈45 min)

This part creates the monorepo skeleton. We do it manually rather than scaffolding from a template, because the architecture doc specifies the exact layout we want.

### 3.1 Clone the empty repo

```bash
cd ~/code   # or wherever you keep projects; make the dir if needed
git clone git@github.com:<your-username>/team-ai-memory.git
cd team-ai-memory
```

### 3.2 Root package files

Create `package.json`:

```bash
cat > package.json <<'EOF'
{
  "name": "team-ai-memory",
  "private": true,
  "version": "0.0.1",
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "dev:api": "pnpm -F api dev",
    "dev:web": "pnpm -F web dev",
    "dev:ext": "pnpm -F extension dev",
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck",
    "lint": "pnpm -r lint",
    "test": "pnpm -r test",
    "db:generate": "pnpm -F api db:generate",
    "db:migrate": "pnpm -F api db:migrate"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/node": "^22.0.0"
  }
}
EOF
```

Create `pnpm-workspace.yaml`:

```bash
cat > pnpm-workspace.yaml <<'EOF'
packages:
  - apps/*
  - packages/*
EOF
```

Create `tsconfig.base.json`:

```bash
cat > tsconfig.base.json <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "forceConsistentCasingInFileNames": true,
    "useDefineForClassFields": true
  }
}
EOF
```

Create `.gitignore`:

```bash
cat > .gitignore <<'EOF'
node_modules/
dist/
.output/
.wxt/
.wrangler/
.env
.env.local
.env.*.local
*.log
.DS_Store
.turbo/
coverage/
EOF
```

Create a starter README:

```bash
cat > README.md <<'EOF'
# Team AI Memory

A team's collective AI memory across ChatGPT, Claude, and Gemini.

See `docs/team-spec.md` and `docs/architecture.md` for the design.
See `docs/setup.md` for first-time setup and `docs/build-plan.md` for the build sequence.
EOF
```

### 3.3 Copy in the docs

Put the spec, architecture, and this setup guide into `docs/`. You should already have these files from our earlier work. Move them into the repo:

```bash
mkdir -p docs
# Copy team-spec.md, architecture.md, and setup.md into docs/
# (Adjust the source paths as needed.)
```

### 3.4 Create directory skeletons

```bash
mkdir -p apps/api/src/{routes,db,lib,middleware}
mkdir -p apps/api/src/lib/llm
mkdir -p apps/web/src/{routes,components,lib}
mkdir -p apps/extension/{entrypoints,lib,adapters}
mkdir -p apps/extension/entrypoints/{popup,content}
mkdir -p packages/shared/src
mkdir -p .github/workflows
```

### 3.5 Shared package

Create `packages/shared/package.json`:

```bash
cat > packages/shared/package.json <<'EOF'
{
  "name": "@team-ai-memory/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0"
  }
}
EOF
```

Create `packages/shared/tsconfig.json`:

```bash
cat > packages/shared/tsconfig.json <<'EOF'
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist"
  },
  "include": ["src/**/*"]
}
EOF
```

Create `packages/shared/src/index.ts` as a placeholder export:

```bash
cat > packages/shared/src/index.ts <<'EOF'
// Re-exports for the shared package.
// The full schemas (ir.ts, api.ts, platforms.ts) are added during Milestone 1.
export const SHARED_PACKAGE_VERSION = '0.0.1' as const;
EOF
```

### 3.6 API skeleton

Create `apps/api/package.json`:

```bash
cat > apps/api/package.json <<'EOF'
{
  "name": "api",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "build": "wrangler deploy --dry-run --outdir dist",
    "typecheck": "tsc --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate"
  },
  "dependencies": {
    "@team-ai-memory/shared": "workspace:*",
    "hono": "^4.6.0",
    "drizzle-orm": "^0.36.0",
    "@neondatabase/serverless": "^0.10.0",
    "better-auth": "^1.0.0",
    "resend": "^4.0.0",
    "zod": "^3.23.0",
    "@hono/zod-validator": "^0.4.0"
  },
  "devDependencies": {
    "wrangler": "^3.90.0",
    "typescript": "^5.6.0",
    "drizzle-kit": "^0.28.0",
    "@cloudflare/workers-types": "^4.20241200.0"
  }
}
EOF
```

Create `apps/api/tsconfig.json`:

```bash
cat > apps/api/tsconfig.json <<'EOF'
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["@cloudflare/workers-types", "node"]
  },
  "include": ["src/**/*"]
}
EOF
```

Create `apps/api/wrangler.toml`:

```bash
cat > apps/api/wrangler.toml <<'EOF'
name = "team-ai-memory-api"
main = "src/index.ts"
compatibility_date = "2025-01-01"
compatibility_flags = ["nodejs_compat"]

# Secrets are set via `wrangler secret put <NAME>`, not here.
# Public env vars (URLs, IDs) go here:
# [vars]
# WEB_APP_URL = "https://team-ai-memory.pages.dev"
EOF
```

Create a minimal `apps/api/src/index.ts` so we have something to deploy:

```bash
cat > apps/api/src/index.ts <<'EOF'
import { Hono } from 'hono';

const app = new Hono();

app.get('/health', (c) =>
  c.json({ ok: true, version: '0.0.1', timestamp: new Date().toISOString() })
);

export default app;
EOF
```

### 3.7 Web app skeleton

Create `apps/web/package.json`:

```bash
cat > apps/web/package.json <<'EOF'
{
  "name": "web",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@team-ai-memory/shared": "workspace:*",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@tanstack/react-router": "^1.81.0",
    "@tanstack/react-query": "^5.59.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^6.0.0",
    "typescript": "^5.6.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "@tanstack/router-plugin": "^1.81.0"
  }
}
EOF
```

Create `apps/web/tsconfig.json`:

```bash
cat > apps/web/tsconfig.json <<'EOF'
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "types": ["vite/client"]
  },
  "include": ["src/**/*"]
}
EOF
```

Create a minimal `apps/web/index.html`:

```bash
cat > apps/web/index.html <<'EOF'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Team AI Memory</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
EOF
```

Create `apps/web/vite.config.ts`:

```bash
cat > apps/web/vite.config.ts <<'EOF'
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
EOF
```

Create a smoke-test entry, `apps/web/src/main.tsx`:

```bash
cat > apps/web/src/main.tsx <<'EOF'
import React from 'react';
import ReactDOM from 'react-dom/client';

const App = () => (
  <div style={{ padding: 32, fontFamily: 'system-ui' }}>
    <h1>Team AI Memory</h1>
    <p>Skeleton up. Milestone 1 starts soon.</p>
  </div>
);

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
EOF
```

Tailwind, TanStack Router proper setup, and shadcn/ui all get layered in during Milestone 1 — for now we just need a deployable page.

### 3.8 Extension skeleton

Create `apps/extension/package.json`:

```bash
cat > apps/extension/package.json <<'EOF'
{
  "name": "extension",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wxt",
    "build": "wxt build",
    "zip": "wxt zip",
    "postinstall": "wxt prepare",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@team-ai-memory/shared": "workspace:*",
    "preact": "^10.25.0"
  },
  "devDependencies": {
    "wxt": "^0.20.0",
    "typescript": "^5.6.0",
    "@types/chrome": "^0.0.280"
  }
}
EOF
```

Create `apps/extension/tsconfig.json`:

```bash
cat > apps/extension/tsconfig.json <<'EOF'
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "types": ["chrome"]
  },
  "include": ["entrypoints/**/*", "lib/**/*", "adapters/**/*", ".wxt/wxt.d.ts"]
}
EOF
```

Create `apps/extension/wxt.config.ts`:

```bash
cat > apps/extension/wxt.config.ts <<'EOF'
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
EOF
```

Create a minimal background entrypoint, `apps/extension/entrypoints/background.ts`:

```bash
cat > apps/extension/entrypoints/background.ts <<'EOF'
export default defineBackground(() => {
  console.log('Team AI Memory extension loaded');
});
EOF
```

### 3.9 Install everything

```bash
pnpm install
```

This will take a couple of minutes the first time. When it finishes, run a typecheck across the whole workspace to make sure the skeleton compiles:

```bash
pnpm typecheck
```

If any errors come up, fix them now. The skeleton should be clean.

### 3.10 First commit and push

```bash
git add .
git commit -m "chore: initialize monorepo skeleton"
git push -u origin main
```

You should see the repo populated on GitHub. Done with Part 3.

---

## Part 4 — First deploys (≈30 min)

We want the API and web app deployed to Cloudflare so we know the loop closes before any feature work starts. Even a "hello world" deploy verifies that the secrets, build configs, and routing all work — finding those bugs in Milestone 1 is much more painful than finding them now.

### 4.1 Sign in to Wrangler

```bash
wrangler login
```

This opens a browser, authenticates against your Cloudflare account, and stores credentials locally.

### 4.2 Deploy the API skeleton

From the repo root:

```bash
pnpm -F api run deploy
```

Note: `pnpm run deploy` (explicit) rather than `pnpm deploy` — pnpm reserves `deploy` as a built-in command, so without `run` it tries to interpret it differently and errors out. This applies everywhere we invoke our `deploy` script.

Wrangler will create the Worker named `team-ai-memory-api` on first run. When it finishes, it prints the deployed URL: something like `https://team-ai-memory-api.<your-subdomain>.workers.dev`.

Verify the health endpoint:

```bash
curl https://team-ai-memory-api.shreyashkalalwork.workers.dev/health
```

You should see `{"ok":true,"version":"0.0.1","timestamp":"..."}`. Save this URL — we'll need it for the web app.

### 4.3 Set API secrets

We don't have any code that uses them yet, but we set them now so we don't forget. Run each, paste the value when prompted:

```bash
cd apps/api
wrangler secret put DATABASE_URL
wrangler secret put BETTER_AUTH_SECRET
wrangler secret put RESEND_API_KEY
wrangler secret put ANTHROPIC_API_KEY
cd ../..
```

For `BETTER_AUTH_SECRET`, generate a fresh random value:

```bash
openssl rand -base64 32
```

Copy the output and paste it as the secret value.

### 4.4 Deploy the web app to Cloudflare Pages

The web app deploys via Cloudflare Pages's GitHub integration, not via Wrangler. Set it up once via the dashboard:

- dash.cloudflare.com → Workers & Pages → Create application → Pages → Connect to Git
- Select the `team-ai-memory` repo
- Configure build:
  - **Framework preset:** None
  - **Build command:** `pnpm install --frozen-lockfile && pnpm -F web build`
  - **Build output directory:** `apps/web/dist`
  - **Root directory:** `/` (the repo root)
- Environment variables:
  - `VITE_API_BASE_URL` = the API URL from step 4.2
  - `NODE_VERSION` = `22`
- Save and deploy.

The first build takes a couple of minutes. When it finishes, you get a URL like `https://team-ai-memory.pages.dev`.

Visit it. You should see the smoke-test "Team AI Memory — Skeleton up" page.

### 4.5 Add the web app URL back to the API

The API needs to know the web app URL for CORS. Set it as a public env var in `apps/api/wrangler.toml`:

Edit `apps/api/wrangler.toml` and add:

```toml
[vars]
WEB_APP_URL = "https://team-ai-memory.pages.dev"
```

Redeploy:

```bash
pnpm -F api run deploy
```

---

## Part 5 — Wire Claude Code into the project (≈15 min)

Claude Code does dramatically better work when the project has a clear `CLAUDE.md` at the repo root that tells it about the codebase. We create one now.

### 5.1 Create CLAUDE.md

```bash
cat > CLAUDE.md <<'EOF'
# Project context for Claude Code

This is **Team AI Memory** — a B2B SaaS that gives small AI-native teams a shared, searchable memory across ChatGPT, Claude, and Gemini conversations.

**Read first, in order:** `docs/team-spec.md`, `docs/architecture.md`, `docs/build-plan.md`.
Those documents are authoritative; do not deviate from them without explicit instruction.

## Stack
- pnpm monorepo, TypeScript end-to-end
- Frontend: Vite + React + TanStack Router + TanStack Query + Tailwind + shadcn/ui
- Extension: WXT + Preact + Tailwind, Manifest V3, Chromium-only
- Backend: Hono on Cloudflare Workers
- Database: Neon Postgres via Drizzle ORM
- Auth: Better Auth (magic links) + Resend
- LLM: Anthropic Claude Haiku via the Messages API (single provider for v1; abstraction layer preserved for future providers)
- Shared types live in `packages/shared/`

## Conventions
- Strict TypeScript everywhere; no `any`.
- Zod schemas for any data crossing a boundary (API request/response, IR, stored JSON).
- Drizzle for all DB queries; no raw SQL except for the FTS migration.
- All new code goes behind a feature branch and PR — no commits straight to `main`.
- One concern per PR.
- Conventional Commits for commit messages (`feat:`, `fix:`, `chore:`, `docs:`).

## Where things live
- API endpoints: `apps/api/src/routes/`
- DB schema: `apps/api/src/db/schema.ts`
- Shared schemas: `packages/shared/src/`
- Web routes: `apps/web/src/routes/`
- Extension entrypoints: `apps/extension/entrypoints/`
- Platform adapters: `apps/extension/adapters/`

## What to avoid
- Don't introduce new dependencies without asking (the stack is intentional).
- Don't add tests for trivial code; do add tests for extraction, rendering, and permission middleware.
- Don't change the data model without updating the architecture doc.
- Don't reach into one app's directory from another app — go through `packages/shared/`.
EOF
```

Commit it:

```bash
git add CLAUDE.md
git commit -m "docs: add CLAUDE.md for Claude Code context"
git push
```

### 5.2 Verify Claude Code reads the project

From the repo root:

```bash
claude
```

Once in the session, ask: "Read CLAUDE.md and tell me what this project is." Claude Code should respond with an accurate summary. If it doesn't, the path may be wrong — `CLAUDE.md` must be at the repo root.

Exit with `/exit`.

### 5.3 Set up the PR workflow

We use trunk-based development with feature branches. The first PR is a tiny one to verify the workflow:

```bash
git checkout -b chore/verify-pr-workflow
echo "" >> README.md
git commit -am "chore: verify PR workflow"
git push -u origin chore/verify-pr-workflow
```

On GitHub, open a PR from `chore/verify-pr-workflow` to `main`. Cloudflare Pages should auto-create a preview deployment — find the link in the PR's checks/comments.

Merge the PR. Delete the branch. From now on, every feature and fix goes through this same loop.

---

## Part 6 — Final verification

Before you close the laptop, verify the full state:

1. `pnpm typecheck` from the repo root passes.
2. `https://team-ai-memory-api.<your-subdomain>.workers.dev/health` returns `{"ok":true,...}`.
3. `https://team-ai-memory.pages.dev` shows the skeleton page.
4. All secrets are set in Cloudflare (`wrangler secret list` in `apps/api/`).
5. The `chore/verify-pr-workflow` PR was merged successfully via the auto-deploy preview flow.
6. `CLAUDE.md` is in the repo root and Claude Code reads it correctly.

If any of those don't work, fix them before starting Milestone 1. The next phase (the build plan) assumes all six.

---

## Common gotchas

A few things that tend to bite first-time setup. Recorded here so you can search for them later.

- **pnpm "workspace not found" errors:** usually means `pnpm-workspace.yaml` doesn't match the actual `apps/*` and `packages/*` structure. Verify the file is at the repo root and has the right indentation.
- **Wrangler "no account" errors:** run `wrangler logout` then `wrangler login` again. The first OAuth flow sometimes doesn't stick.
- **Cloudflare Pages build fails on first run:** most often this is the build command not finding pnpm. Adding `NODE_VERSION=22` as an env var usually fixes it. If not, set `PRE_BUILD_COMMAND=npm install -g pnpm@9.15.0`.
- **`workspace:*` dependency not resolving:** make sure you ran `pnpm install` from the repo root, not inside an app directory.
- **TypeScript errors about Cloudflare globals (`KVNamespace`, etc.):** ensure `@cloudflare/workers-types` is in `apps/api/package.json` and listed in the `types` array of `apps/api/tsconfig.json`.
- **`ERR_PNPM_INVALID_DEPLOY_TARGET — This command requires one parameter` when running `pnpm -F api deploy`:** `deploy` is a reserved pnpm built-in command name. Use `pnpm -F api run deploy` (with the explicit `run`) to invoke our `deploy` script in `package.json`. Other script names (`dev`, `build`, `typecheck`, `test`) are not reserved, so `pnpm -F api dev` still works without `run`.
- **TypeScript error: "Cannot find type definition file for 'wxt/client'":** WXT does *not* expose its types under that name — that's a common confusion. WXT generates a types file at `apps/extension/.wxt/wxt.d.ts` when `wxt prepare` runs. Reference it by including the file in your tsconfig's `include` array (`".wxt/wxt.d.ts"`), not via the `types` array. If you see this error on a fresh install, the `.wxt/` directory may not exist yet — run `pnpm -F extension exec wxt prepare`. The `postinstall` script in `apps/extension/package.json` should make this automatic going forward.
- **Neon connection errors from Worker:** make sure `DATABASE_URL` ends with `?sslmode=require` and that you used the *pooled* connection string from Neon's dashboard (it'll have `-pooler` in the host).
- **Resend rejecting emails:** for the dev sender `onboarding@resend.dev`, only verified recipient addresses receive mail. Add your own email under Resend's "Verified Emails" if you don't see test messages.
- **Claude Code can't find the project context:** `CLAUDE.md` must be at the repo root. Subdirectory `CLAUDE.md` files are also read but only when working in that directory.

---

## When you're done

You're ready for `build-plan.md`. Open it and start Milestone 1. From this point forward, every coding session begins with:

1. Pull latest from `main`
2. Create a feature branch
3. Open Claude Code, hand it the task from the build plan
4. Test locally, push, open PR, verify preview deploy
5. Merge, delete branch

That's the loop. Welcome to the build.
