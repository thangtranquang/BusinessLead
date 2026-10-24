-- Campaign market: which country a campaign sells in (ID = Indonesia, VN = Vietnam).
--
-- One new column with a constant default, so every existing row reads 'ID' and nothing is rewritten by hand. On PostgreSQL 11+
-- adding a column with a constant default is a catalog-only change (no table rewrite). No index, no CHECK, no other table.
--
-- Reverse (drops the column; nothing else depends on it):
-- reverse: ALTER TABLE "campaigns" DROP COLUMN "market";

ALTER TABLE "campaigns" ADD COLUMN "market" TEXT NOT NULL DEFAULT 'ID';
