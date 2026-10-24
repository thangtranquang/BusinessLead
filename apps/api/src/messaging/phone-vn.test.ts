import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { ValidationPipe } from "@nestjs/common";
import { normalizePhone, normalizePhoneFor } from "./phone";
import { HOSTILE_MS_LARGE, HOSTILE_MS_SMALL, assertLinear } from "../common/hostile-limits";
import { ManualDto } from "./messaging.controller";
import { ReferralDto } from "../leads/leads.controller";

// TC-VM-9.1 to 9.21 (unit part). Invented numbers only.
const VN = (raw: string | null | undefined) => normalizePhoneFor(raw as string, "VN");

test("nine mobile shapes (TC-VM-9.1)", () => {
  for (const raw of ["0901234567", "090 123 4567", "090.123.4567", "090-123-4567", "+84 90 123 4567", "0084901234567", "0084 901234567", "84901234567", "+84 (0) 90 123 4567", "+84 090 123 4567"]) {
    assert.equal(VN(raw), "84901234567", raw);
  }
});

test("extra punctuation (TC-VM-9.2)", () => {
  for (const raw of ["(0)901234567", "(090) 123 4567", "090 1234 567", "+84-90-123-4567", "  0901234567  ", "0901 234 567"]) assert.equal(VN(raw), "84901234567", raw);
});

test("mobile prefixes (TC-VM-9.3)", () => {
  for (const [local, intl] of [["0351234567", "84351234567"], ["0561234567", "84561234567"], ["0701234567", "84701234567"], ["0811234567", "84811234567"], ["0901234567", "84901234567"]]) {
    assert.equal(VN(local), intl);
    assert.equal(VN("+" + intl), intl);
  }
});

test("landlines (TC-VM-9.4)", () => {
  for (const raw of ["(028) 3822 1234", "028 3822 1234", "+84 28 3822 1234", "02838221234", "028.3822.1234"]) assert.equal(VN(raw), "842838221234", raw);
  assert.equal(VN("(024) 3822 1234"), "842438221234");
});

test("service numbers are null under VN (TC-VM-9.5)", () => {
  for (const raw of ["1800 1234", "1900 1234", "1800 123 456", "1900-1234", "+84 1900 1234", "01900 1234"]) assert.equal(VN(raw), null, raw);
});

test("too short, empty, garbage (TC-VM-9.6)", () => {
  for (const raw of ["12345", "", "   ", null, undefined, "0", "090", "+84", "+"]) assert.equal(VN(raw), null, String(raw));
});

test("odd national lengths normalise (looser 8..15 bound; kind is unknown) (TC-VM-9.7, 9.8)", () => {
  assert.equal(VN("090123456"), "8490123456");
  assert.equal(VN("09012345678"), "849012345678");
  assert.equal(VN("02838221"), "842838221");
  assert.equal(VN("0283822123456"), "84283822123456");
  assert.equal(VN("+123456789012345"), "123456789012345");
  assert.equal(VN("+1234567890123456"), null);
});

test("letters are stripped as for ID (TC-VM-9.9, GAP-6)", () => {
  assert.equal(VN("0901 ABC 567"), "84901567".length >= 8 ? "84901567" : null);
  assert.equal(VN("090123456a"), "8490123456");
  assert.equal(VN("0901234567x12"), "8490123456712");
});

test("bare national numbers and 84 plus trunk zero (TC-VM-9.10, 9.11, GAP-3)", () => {
  assert.equal(VN("901234567"), "84901234567");
  assert.equal(VN("351234567"), "84351234567");
  assert.equal(VN("812345678"), "84812345678");
  assert.equal(VN("401234567"), "401234567"); // kept as written: treated like any other number given without a plus
  assert.equal(VN("84 0901234567"), "84901234567");
  assert.equal(VN("840901234567"), "84901234567");
});

test("international numbers are kept (TC-VM-9.12, 9.13, 9.19)", () => {
  assert.equal(VN("+62 812 0000 0001"), "6281200000001"); // 13 digits: the QA table's 62812000000001 has one digit too many
  assert.equal(VN("+62 812 0000 00001"), "62812000000001");
  assert.equal(VN("+65 6123 4567"), "6561234567");
  assert.equal(VN("+1 415 555 0100"), "14155550100");
  assert.equal(VN("+44 20 7946 0958"), "442079460958");
  assert.equal(VN("+1234567"), null);
  assert.equal(VN("+12345678"), "12345678");
  assert.equal(normalizePhoneFor("+84 90 123 4567", "ID"), "84901234567");
});

test("64-character cap on the VN path only (TC-VM-9.14, GAP-1)", () => {
  const pad = (n: number) => "0901234567" + " ".repeat(n - 10);
  assert.equal(pad(64).length, 64);
  assert.equal(VN(pad(64)), "84901234567");
  assert.equal(VN(pad(65)), null);
  assert.equal(normalizePhoneFor("0812" + " ".repeat(80) + "3456789", "ID"), "628123456789");
});

test("unicode digits are not converted (TC-VM-9.15)", () => {
  assert.equal(VN(String.fromCharCode(1632, 1641, 1632, 1633, 1634, 1635, 1636, 1637, 1638, 1639)), null);
  assert.equal(VN(String.fromCharCode(65296, 65305, 65296, 65297, 65298, 65299, 65300, 65301, 65302, 65303)), null);
  assert.equal(VN(String.fromCharCode(2406, 2415, 2406, 2407, 2408, 2409, 2410, 2411, 2412, 2413)), null);
});

test("hostile phone strings: cap before regex (TC-VM-9.16, S.1)", () => {
  for (const huge of ["0".repeat(10 * 1024 * 1024), "0".repeat(20_000), "(".repeat(100_000), "+84 " + "0".repeat(100_000), " ".repeat(10 * 1024 * 1024)]) {
    const t0 = performance.now();
    assert.equal(VN(huge), null);
    assert.ok(performance.now() - t0 < HOSTILE_MS_LARGE);
  }
  const makers = [(n: number) => "0".repeat(n), (n: number) => "(".repeat(n), (n: number) => ".".repeat(n), (n: number) => "+84 " + "0".repeat(n), (n: number) => "٠ab".repeat(n)];
  for (const make of makers) assertLinear(VN, make);
  const t1 = performance.now();
  VN("0".repeat(64));
  assert.ok(performance.now() - t1 < HOSTILE_MS_SMALL);
});

test("ID results unchanged and normalizePhone delegates for 84 (TC-VM-9.17, 9.18)", () => {
  for (const raw of ["0812-3456-789", "+62 812 3456 7890", "812345678", "021 5551234", "84901234567", "0901234567"]) {
    assert.equal(normalizePhoneFor(raw, "ID"), normalizePhone(raw, "62"));
    assert.equal(normalizePhoneFor(raw, "ID"), normalizePhone(raw));
  }
  assert.equal(normalizePhoneFor("84901234567", "ID"), "6284901234567");
  // normalizePhone(raw, "84") stays the legacy generic rule (the S1 snapshot pins C02, C06, C09); only normalizePhoneFor applies the VN rules
  assert.equal(normalizePhone("812345678", "84"), "812345678");
  assert.equal(normalizePhone("1900 1234", "84"), "19001234");
  assert.equal(normalizePhone("0901234567"), "62901234567");
});

test("manual-number DTOs accept 64 and reject 65 characters for both markets (TC-VM-9.20, S.12)", async () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });
  const cases: Array<[new () => object, Record<string, unknown>]> = [[ManualDto, { body: "Xin chao" }], [ReferralDto, {}]];
  for (const [metatype, rest] of cases) {
    const ok = "0901234567" + " ".repeat(54);
    await pipe.transform({ ...rest, phone: ok }, { type: "body", metatype });
    for (const bad of [ok + " ", "0".repeat(1024 * 1024)]) {
      const t0 = performance.now();
      await assert.rejects(pipe.transform({ ...rest, phone: bad }, { type: "body", metatype }));
      assert.ok(performance.now() - t0 < HOSTILE_MS_LARGE);
    }
  }
});
