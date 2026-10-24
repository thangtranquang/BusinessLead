import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { classifyRawPhone, phoneKind, vnDigits, type Market } from "./market";
import { HOSTILE_MS_LARGE, assertLinear } from "./hostile-limits";

// TC-VM-11.1 to 11.9, S.1 (phoneKind, classifyRawPhone, vnDigits). Invented numbers only.

test("phoneKind VN mobile (TC-VM-11.1)", () => {
  for (const n of ["84351234567", "84561234567", "84701234567", "84811234567", "84901234567"]) assert.equal(phoneKind(n, "VN"), "mobile", n);
});

test("phoneKind VN landline (TC-VM-11.2)", () => {
  for (const n of ["842838221234", "842438221234", "842251234567", "84283822123"]) assert.equal(phoneKind(n, "VN"), "landline", n);
});

test("phoneKind VN service and unknown (TC-VM-11.4)", () => {
  assert.equal(phoneKind("841800123456", "VN"), "service");
  assert.equal(phoneKind("841900123456", "VN"), "service");
  for (const n of ["84401234567", "84601234567", "84121234567", "8490123456", "849012345678", "84"]) assert.equal(phoneKind(n, "VN"), "unknown", n);
});

test("phoneKind international under VN is unknown (TC-VM-11.5)", () => {
  for (const n of ["6561234567", "14155550100", "62812000000001"]) assert.equal(phoneKind(n, "VN"), "unknown", n);
});

test("phoneKind ID is always unknown (TC-VM-11.6)", () => {
  for (const n of ["628123456789", "62215551234", "84901234567", "842838221234"]) assert.equal(phoneKind(n, "ID"), "unknown", n);
});

test("phoneKind garbage input never throws (TC-VM-11.7)", () => {
  for (const v of [null, undefined, "", "abc", 123, {}] as unknown[]) assert.equal(phoneKind(v as string, "VN"), "unknown");
  assert.equal(phoneKind("84901234567", undefined as unknown as Market), "unknown");
  assert.equal(phoneKind("84901234567", "XX" as Market), "unknown");
});

test("classifyRawPhone VN (TC-VM-11.3)", () => {
  assert.equal(classifyRawPhone("1900 1234", "VN"), "service");
  assert.equal(classifyRawPhone("1800 1234", "VN"), "service");
  assert.equal(classifyRawPhone("1800 123 456", "VN"), "service");
  assert.equal(classifyRawPhone("0901234567", "VN"), "mobile");
  assert.equal(classifyRawPhone("+84 90 123 4567", "VN"), "mobile");
  assert.equal(classifyRawPhone("(028) 3822 1234", "VN"), "landline");
  assert.equal(classifyRawPhone("+65 6123 4567", "VN"), "unknown");
  assert.equal(classifyRawPhone("090123456", "VN"), "unknown");
  for (const bad of ["", "   ", "abc", "12345", "090", "+", "x".repeat(65)]) assert.equal(classifyRawPhone(bad, "VN"), "invalid", JSON.stringify(bad));
});

test("classifyRawPhone ID has no kinds: unknown or invalid", () => {
  assert.equal(classifyRawPhone("0812-3456-789", "ID"), "unknown");
  assert.equal(classifyRawPhone("1900 1234", "ID"), "unknown");
  assert.equal(classifyRawPhone("12345", "ID"), "invalid");
  assert.equal(classifyRawPhone("", "ID"), "invalid");
});

test("vnDigits is the shared VN normaliser", () => {
  assert.equal(vnDigits("090 123 4567"), "84901234567");
  assert.equal(vnDigits("1900 1234"), null);
  assert.equal(vnDigits("x".repeat(65)), null);
});

test("hostile inputs stay within the limits (TC-VM-11.8, S.1)", () => {
  const huge = "0".repeat(10 * 1024 * 1024);
  for (const fn of [(s: string) => classifyRawPhone(s, "VN"), (s: string) => phoneKind(s, "VN"), vnDigits]) {
    const t0 = performance.now();
    fn(huge);
    fn("0".repeat(20_000));
    fn("(".repeat(20_000));
    assert.ok(performance.now() - t0 < HOSTILE_MS_LARGE);
  }
  const makers = [
    (n: number) => "0".repeat(n),
    (n: number) => "(".repeat(n),
    (n: number) => " ".repeat(n),
    (n: number) => ".".repeat(n),
    (n: number) => "+84 " + "0".repeat(n),
    (n: number) => "٠ab".repeat(n),
  ];
  for (const make of makers) {
    assertLinear((s) => classifyRawPhone(s, "VN"), make);
    assertLinear((s) => phoneKind(s, "VN"), make);
    assertLinear(vnDigits, make);
  }
  assert.equal(classifyRawPhone(huge, "VN"), "invalid");
});

test("common/market.ts imports nothing from messaging, scraper or leads", () => {
  const src = readFileSync(path.join(__dirname, "market.ts"), "utf8");
  assert.doesNotMatch(src, /from\s+["']\.\.\/(messaging|scraper|leads)/);
});
