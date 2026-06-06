import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit does not auto-load `.env.local`, so for local migration runs we
// load it ourselves. Real secrets live in `.env.local` (gitignored); see
// `.env.local.example` for the template.
const envLocal = new URL('.env.local', import.meta.url);
if (existsSync(envLocal)) {
  for (const line of readFileSync(envLocal, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
