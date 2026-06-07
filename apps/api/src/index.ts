import { Hono } from 'hono';
import type { Env } from './env';
import { extractRouter } from './routes/extract';

const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) =>
  c.json({ ok: true, version: '0.0.1', timestamp: new Date().toISOString() })
);

app.route('/extract', extractRouter);

export default app;
