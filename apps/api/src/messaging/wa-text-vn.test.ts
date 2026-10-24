import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReferrals } from "./wa-text";
import { HOSTILE_MS_LARGE, assertLinear } from "../common/hostile-limits";

// TC-VM-10.11, 10.12, S.1 (wa-text). Invented numbers only.
const phones = (text: string, market?: "ID" | "VN") => parseReferrals(text, market).map((r) => r.phone);

test("Vietnamese numbers in text are extracted for a VN campaign (TC-VM-10.11)", () => {
  assert.deepEqual(phones("Lien he 0901234567", "VN"), ["0901234567"]);
  assert.deepEqual(phones("Lien he +84901234567", "VN"), ["+84901234567"]);
  assert.deepEqual(phones("Lien he 84901234567", "VN"), ["84901234567"]);
  assert.deepEqual(phones("Lien he 0351234567", "VN"), ["0351234567"]);
  assert.deepEqual(phones("Lien he 0201234567", "VN"), []);
  assert.deepEqual(phones("Lien he 123456789", "VN"), []);
  assert.deepEqual(phones("Lien he 09012345678", "VN"), []);
});

test("Indonesian matches are unchanged under both markets (TC-VM-10.11)", () => {
  for (const text of ["Hubungi 0812-3456-789", "kontak: 628123456789", "Hubungi +62 812 3456 789", "x+0812-3456-789", "12 0812-3456-789"]) {
    assert.deepEqual(parseReferrals(text, "VN"), parseReferrals(text));
    assert.deepEqual(parseReferrals(text, "ID"), parseReferrals(text));
  }
  assert.deepEqual(phones("Hubungi 0812-3456-789 dan 0901234567", "VN"), ["0812-3456-789", "0901234567"]);
});

test("without a market the extractor behaves as before (snapshot compatibility)", () => {
  assert.deepEqual(phones("Hubungi 0901234567"), []);
  assert.deepEqual(phones("Hubungi 84901234567", "ID"), []);
});

test("hostile text and the 4,000 character slice (TC-VM-10.12, S.1)", () => {
  assert.deepEqual(phones("a".repeat(4001) + " 0901234567", "VN"), []);
  assert.deepEqual(phones("a".repeat(3980) + " 0901234567", "VN"), ["0901234567"]);
  const makers = [(n: number) => "0".repeat(n), (n: number) => "+84".repeat(n), (n: number) => "+84 ".repeat(n), (n: number) => "09".repeat(n), (n: number) => "0 ".repeat(n)];
  for (const make of makers) {
    assertLinear((s) => parseReferrals(s, "VN"), make);
    const t0 = performance.now();
    parseReferrals(make(100_000), "VN");
    assert.ok(performance.now() - t0 < HOSTILE_MS_LARGE);
  }
  const t0 = performance.now();
  parseReferrals("0".repeat(10 * 1024 * 1024), "VN");
  assert.ok(performance.now() - t0 < HOSTILE_MS_LARGE);
});
