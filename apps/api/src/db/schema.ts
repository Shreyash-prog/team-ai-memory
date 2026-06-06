import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ===== Enums =====

export const platformEnum = pgEnum('platform', ['chatgpt', 'claude', 'gemini']);

// ===== Users =====
//
// M1 STUB. Minimal placeholder so `memory_artifacts.created_by` has a table to
// reference. In M2 this is replaced by the full Better Auth-managed `users`
// table (adds email_verified, image, updated_at, plus the sessions / accounts /
// verification_tokens tables that Better Auth's CLI generates). See
// architecture.md §4.1.
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ===== Memory artifacts ===== (architecture.md §4.1)
export const memoryArtifacts = pgTable(
  'memory_artifacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // FK to `workspaces` is added in M2 when the workspaces table lands; for M1
    // this is an unconstrained uuid column.
    workspaceId: uuid('workspace_id').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    sourcePlatform: platformEnum('source_platform').notNull(),
    title: text('title').notNull(),
    summaryLine: text('summary_line').notNull(),
    primerMarkdown: text('primer_markdown').notNull(),
    ir: jsonb('ir').notNull(), // IR JSON, validated by Zod at write time
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    workspaceIdx: index('memory_artifacts_workspace_idx').on(t.workspaceId),
    createdAtIdx: index('memory_artifacts_created_at_idx').on(t.createdAt),
    // Postgres FTS (search_vector tsvector + GIN index) is added in the manual
    // migration 0002_artifacts_fts.sql — Drizzle doesn't generate tsvector
    // indexes. See architecture.md §4.2.
  })
);

// ===== Relations =====

export const usersRelations = relations(users, ({ many }) => ({
  createdArtifacts: many(memoryArtifacts),
}));

export const memoryArtifactsRelations = relations(memoryArtifacts, ({ one }) => ({
  creator: one(users, {
    fields: [memoryArtifacts.createdBy],
    references: [users.id],
  }),
}));
