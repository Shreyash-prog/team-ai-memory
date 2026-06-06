import { Hono } from 'hono';

const app = new Hono();

app.get('/health', (c) =>
  c.json({ ok: true, version: '0.0.1', timestamp: new Date().toISOString() })
);

export default app;
