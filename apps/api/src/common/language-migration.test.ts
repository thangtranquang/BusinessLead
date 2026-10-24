import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// TC-29.1, 29.2, 29.8 / DT-22. The database checks (migrate diff, deploy on a populated database) are procedure 6.4 in the QA document.
const PRISMA = path.resolve(__dirname, "../../../../packages/database/prisma");
const MIGRATIONS = path.join(PRISMA, "migrations");
const LAST_BEFORE = "20261014010000_message_attachments";
// later features add their own migrations; this test only covers the language one (it is the only 20261023 migration)
const NEXT_FEATURE = "20261024";

const read = (...p: string[]) => readFileSync(path.join(...p), "utf8");
const migrationDirs = () => readdirSync(MIGRATIONS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();

test("the repository layout this test relies on exists", () => {
  assert.ok(existsSync(MIGRATIONS), MIGRATIONS);
  assert.ok(existsSync(path.join(PRISMA, "schema.prisma")));
});

test("schema.prisma: Campaign.language and MarketingBrief.language default to vietnamese (TC-29.1)", () => {
  const schema = read(PRISMA, "schema.prisma");
  const lines = schema.split(/\r?\n/).filter((l) => /^\s*language\s+String\b/.test(l));
  assert.equal(lines.length, 2, lines.join("\n"));
  for (const l of lines) assert.match(l, /@default\("vietnamese"\)/);
  assert.ok(!/language\s+String[^\n]*@default\("indonesian"\)/.test(schema), "no @default(\"indonesian\") may remain for language");
});

test("one new migration, later than message_attachments, containing only the two SET DEFAULT statements (TC-29.2, DT-22)", () => {
  const added = migrationDirs().filter((d) => d > LAST_BEFORE && d < NEXT_FEATURE);
  assert.equal(added.length, 1, `expected exactly one migration after ${LAST_BEFORE}, got ${added.join(", ")}`);
  assert.match(added[0], /^20261023\d{6}_[a-z0-9_]+$/);
  const sql = read(MIGRATIONS, added[0], "migration.sql");
  // comments are allowed (they hold the reverse SQL); statements are what is left once they are gone
  const code = sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
  const statements = code.split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
  const allowedExtra = statements.filter((s) => /^SET (LOCAL )?lock_timeout = '\d+s'$/i.test(s));
  const real = statements.filter((s) => !allowedExtra.includes(s)).sort();
  assert.deepEqual(real, [
    `ALTER TABLE "campaigns" ALTER COLUMN "language" SET DEFAULT 'vietnamese'`,
    `ALTER TABLE "marketing_briefs" ALTER COLUMN "language" SET DEFAULT 'vietnamese'`,
  ]);
  assert.ok(allowedExtra.length <= 1);
  for (const forbidden of [/\bUPDATE\b/i, /\bDELETE\b/i, /\bINSERT\b/i, /\bDROP\b/i, /\bCREATE\b/i, /\bTYPE\b/i, /\bNOT NULL\b/i]) {
    assert.ok(!forbidden.test(code), `forbidden statement ${forbidden} in the executable SQL`);
  }
});

test("the earlier migrations still carry DEFAULT 'indonesian': history is not edited (TC-29.8)", () => {
  for (const dir of ["20260630000000_init", "20261011020000_marketing_brief"]) {
    assert.match(read(MIGRATIONS, dir, "migration.sql"), /DEFAULT 'indonesian'/, dir);
  }
});
