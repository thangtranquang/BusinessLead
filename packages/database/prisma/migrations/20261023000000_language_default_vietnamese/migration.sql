-- Output language: new campaigns and marketing briefs default to Vietnamese instead of Indonesian.
--
-- Only the two column defaults change. No row is rewritten: existing rows keep their stored value ('indonesian' or
-- 'english'), and the API reads any value other than 'vietnamese' as English, so nothing is migrated and nothing is
-- written in a language the owner did not choose. On PostgreSQL 16 changing a default is a catalog-only change
-- (no table rewrite, no long lock).
--
-- Reverse (restores the previous defaults; again touches no row):
--   ALTER TABLE "campaigns" ALTER COLUMN "language" SET DEFAULT 'indonesian';
--   ALTER TABLE "marketing_briefs" ALTER COLUMN "language" SET DEFAULT 'indonesian';

-- If a long transaction holds a lock on either table, fail fast instead of queueing every other query behind it.
SET LOCAL lock_timeout = '5s';

ALTER TABLE "campaigns" ALTER COLUMN "language" SET DEFAULT 'vietnamese';
ALTER TABLE "marketing_briefs" ALTER COLUMN "language" SET DEFAULT 'vietnamese';
