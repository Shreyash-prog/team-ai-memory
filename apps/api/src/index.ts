import { Hono } from 'hono';
import type { Env } from './env';
import { extractRouter } from './routes/extract';
import { artifactsRouter } from './routes/artifacts';

const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) =>
  c.json({ ok: true, version: '0.0.1', timestamp: new Date().toISOString() })
);

app.route('/extract', extractRouter);
app.route('/artifacts', artifactsRouter);

export default app;
