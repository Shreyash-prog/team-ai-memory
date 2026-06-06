-- 0002_artifacts_fts.sql  (architecture.md §4.2)
--
-- MANUAL migration. Drizzle Kit does not generate tsvector columns / GIN
-- indexes, so this is not tracked in meta/_journal.json and is NOT applied by
-- `drizzle-kit migrate`. Apply it separately (psql / Drizzle Studio / a one-off
-- node script) after the initial migration. It is idempotent.
--
-- Queries: `search_vector @@ plainto_tsquery('english', $1)`, ranked with
-- `ts_rank`.

ALTER TABLE memory_artifacts
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(summary_line, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(primer_markdown, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS memory_artifacts_search_idx
  ON memory_artifacts USING GIN(search_vector);
