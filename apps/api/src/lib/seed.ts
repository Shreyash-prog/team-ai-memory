// Ensures the M1 placeholder user row exists so memory_artifacts.created_by
// (a uuid FK to users.id) resolves before real auth lands in M2.
// Run: pnpm -F api exec tsx src/lib/seed.ts
import { existsSync, readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { createDb } from '../db/client';
import { users } from '../db/schema';
import { PLACEHOLDER_USER_ID } from './placeholders';

const PLACEHOLDER_EMAIL = 'm1-placeholder@team-ai-memory.local';
const PLACEHOLDER_NAME = 'M1 Placeholder User';

function loadEnvLocal(url: URL): void {
  if (!existsSync(url)) return;
  for (const line of readFileSync(url, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (match && process.env[match[1]!] === undefined) {
      process.env[match[1]!] = match[2]!.replace(/^["']|["']$/g, '');
    }
  }
}

export async function ensurePlaceholderUser(databaseUrl: string): Promise<void> {
  const db = createDb(databaseUrl);
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, PLACEHOLDER_USER_ID));

  if (existing.length > 0) {
    console.log(`Placeholder user ${PLACEHOLDER_USER_ID} already exists.`);
    return;
  }

  await db.insert(users).values({
    id: PLACEHOLDER_USER_ID,
    email: PLACEHOLDER_EMAIL,
    name: PLACEHOLDER_NAME,
  });
  console.log(`Seeded placeholder user ${PLACEHOLDER_USER_ID}.`);
}

async function main(): Promise<void> {
  loadEnvLocal(new URL('../../.env.local', import.meta.url));
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set (expected in apps/api/.env.local).');
    process.exit(1);
  }
  await ensurePlaceholderUser(databaseUrl);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
