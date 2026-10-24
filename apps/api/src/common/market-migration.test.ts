import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// TC-VM-18.1, 18.2, 18.8, 18.11. The database checks (deploy chain, migrate diff, negative control) are the scratch-database runbook.
const PRISMA = path.resolve(__dirname, "../../../../packages/database/prisma");
const MIGRATIONS = path.join(PRISMA, "migrations");
const LAST_BEFORE = "20261023000000_language_default_vietnamese";
const NAME = "20261024000000_campaign_market";

const read = (...p: string[]) => readFileSync(path.join(...p), "utf8");

test("the repository layout this test relies on exists", () => {
  assert.ok(existsSync(path.join(MIGRATIONS, NAME, "migration.sql")));
});

test("schema.prisma: Campaign.market is String @default(\"ID\") and no other model has one (TC-VM-18.8)", () => {
  const schema = read(PRISMA, "schema.prisma");
  const lines = schema.split(/\r?\n/).filter((l) => /^\s*market\s+/.test(l));
  assert.equal(lines.length, 1, lines.join("\n"));
  assert.match(lines[0], /^\s*market\s+String\s+@default\("ID"\)\s*$/);
  const model = /model Campaign \{[\s\S]*?\n\}/.exec(schema);
  assert.ok(model && /\n\s*market\s+String\s+@default\("ID"\)/.test(model[0]), "market belongs to Campaign");
});

test("exactly one migration after the language one, containing only the ADD COLUMN (TC-VM-18.1)", () => {
  const added = readdirSync(MIGRATIONS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort().filter((d) => d > LAST_BEFORE);
  assert.deepEqual(added, [NAME]);
  const sql = read(MIGRATIONS, NAME, "migration.sql");
  const code = sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
  const statements = code.split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
  assert.deepEqual(statements, [`ALTER TABLE "campaigns" ADD COLUMN "market" TEXT NOT NULL DEFAULT 'ID'`]);
  for (const forbidden of [/\bUPDATE\b/i, /\bDELETE\b/i, /\bINSERT\b/i, /\bDROP\b/i, /\bINDEX\b/i, /\bCHECK\b/i, /\bCREATE\b/i]) {
    assert.ok(!forbidden.test(code), `forbidden statement ${forbidden} in the executable SQL`);
  }
});

test("the reverse SQL is kept as a comment (TC-VM-18.2)", () => {
  assert.ok(read(MIGRATIONS, NAME, "migration.sql").includes(`-- reverse: ALTER TABLE "campaigns" DROP COLUMN "market";`));
});
