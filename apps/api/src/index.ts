import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './env';
import { extractRouter } from './routes/extract';
import { artifactsRouter } from './routes/artifacts';

const app = new Hono<{ Bindings: Env }>();

// CORS for the browser-based web app (architecture §11). Allows local dev, the
// production Pages site, and per-PR Pages preview subdomains. Non-browser
// callers (no Origin header) are unaffected.
app.use(
  '*',
  cors({
    origin: (origin) => {
      if (!origin) return origin;
      if (origin === 'http://localhost:5173' || origin === 'http://localhost:4173') return origin;
      if (origin === 'https://team-ai-memory.pages.dev') return origin;
      if (/^https:\/\/[a-z0-9-]+\.team-ai-memory\.pages\.dev$/.test(origin)) return origin;
      return null;
    },
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
);

app.get('/health', (c) =>
  c.json({ ok: true, version: '0.0.1', timestamp: new Date().toISOString() })
);

app.route('/extract', extractRouter);
app.route('/artifacts', artifactsRouter);

export default app;
