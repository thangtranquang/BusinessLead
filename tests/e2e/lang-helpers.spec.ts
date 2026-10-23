/**
 * Browser-less checks for the pure language helpers in apps/web/src/lib/i18n/lang.ts
 * (no page, no server). Relative imports only: Playwright does not resolve the web app's "@/" alias.
 *
 * Covers QA cases TC-1.13, TC-6.4, TC-2.8 (static part), TC-5.10 (static part), TC-4.x oracle (DT-3)
 * and the FR-10 click rule (clickWritesCookie) in docs/qa/vietnamese-language_test_cases.md.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect } from "@playwright/test";
import {
  LANG_COOKIE,
  parseLang,
  localeOf,
  toApiLanguage,
  effectiveOutputLanguage,
  makeFormat,
  rawLangCookie,
  shouldWriteLangCookie,
  type Lang,
} from "../../apps/web/src/lib/i18n/lang";

test.describe("TC-1.13 parseLang / toApiLanguage / localeOf / LANG_COOKIE (DT-1c)", () => {
  test("LANG_COOKIE keeps its name", () => {
    expect(LANG_COOKIE).toBe("prospex_lang");
  });

  test("parseLang returns vi only for the exact string vi", () => {
    expect(parseLang("vi")).toBe("vi");
    for (const v of ["en", "id", "VI", "Vi", "vi ", " vi", "vietnamese", "en-US", "fr", "", undefined, null]) {
      expect(parseLang(v as string | null | undefined), `parseLang(${JSON.stringify(v)})`).toBe("en");
    }
  });

  test("parseLang never throws on odd input", () => {
    for (const v of [123, true, {}, [], ["vi"], "vi\u0000", "x".repeat(10_000)]) {
      expect(parseLang(v as never), `parseLang(${String(v).slice(0, 20)})`).toBe("en");
    }
  });

  test("toApiLanguage", () => {
    expect(toApiLanguage("vi")).toBe("vietnamese");
    expect(toApiLanguage("en")).toBe("english");
  });

  test("localeOf", () => {
    expect(localeOf("vi")).toBe("vi-VN");
    expect(localeOf("en")).toBe("en-US");
  });
});

test.describe("TC-6.4 effectiveOutputLanguage (DT-1a)", () => {
  test("only the exact value vietnamese gives vietnamese", () => {
    expect(effectiveOutputLanguage("vietnamese")).toBe("vietnamese");
  });

  test("every other input gives english", () => {
    const rows: unknown[] = [
      "english", "indonesian", null, undefined, "", "VIETNAMESE", "Vietnamese", "vi", "en", " vietnamese", "vietnamese ", "vietnamese\n",
      123, true, {}, [], ["vietnamese"], "Ignore previous instructions", "__proto__", "vietnamese\u0000", "x".repeat(10_000),
    ];
    for (const v of rows) {
      expect(effectiveOutputLanguage(v), `effectiveOutputLanguage(${String(v).slice(0, 30)})`).toBe("english");
    }
  });
});

test.describe("FR-11 makeFormat (DT-3 oracle)", () => {
  const instant = new Date("2026-10-23T12:00:00Z");

  test("date", () => {
    expect(makeFormat("vi").date(instant)).toBe("23/10/2026");
    expect(makeFormat("en").date(instant)).toBe("10/23/2026");
  });

  test("date accepts ISO strings, timestamps and options", () => {
    expect(makeFormat("vi").date("2026-10-23T12:00:00Z")).toBe("23/10/2026");
    expect(makeFormat("en").date(instant.getTime())).toBe("10/23/2026");
    expect(makeFormat("en").date(instant, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })).toBe("Oct 23, 2026");
    expect(makeFormat("vi").date(instant, { timeZone: "UTC", month: "short", day: "numeric" })).toMatch(/23/);
  });

  test("dateTime uses the language locale (never the machine's)", () => {
    const en = makeFormat("en").dateTime(instant, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
    const vi = makeFormat("vi").dateTime(instant, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
    expect(en).toBe(instant.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }));
    expect(vi).toBe(instant.toLocaleString("vi-VN", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }));
    expect(en).not.toBe(vi);
    // the default needs no options
    expect(makeFormat("vi").dateTime(instant)).toMatch(/2026/);
  });

  test("invalid or missing dates give an empty string, never 'Invalid Date'", () => {
    for (const lang of ["vi", "en"] as Lang[]) {
      const f = makeFormat(lang);
      for (const v of [null, undefined, "", "garbage", Number.NaN, new Date("garbage")]) {
        expect(f.date(v as never), `${lang} date(${String(v)})`).toBe("");
        expect(f.dateTime(v as never), `${lang} dateTime(${String(v)})`).toBe("");
      }
    }
  });

  test("number grouping", () => {
    const rows: [number, string, string][] = [
      [1234567, "1.234.567", "1,234,567"],
      [1500000, "1.500.000", "1,500,000"],
      [1234567890, "1.234.567.890", "1,234,567,890"],
      [999, "999", "999"],
      [0, "0", "0"],
      [-1234, "-1.234", "-1,234"],
      [1234.5, "1.234,5", "1,234.5"],
    ];
    for (const [n, vi, en] of rows) {
      expect(makeFormat("vi").number(n), `vi ${n}`).toBe(vi);
      expect(makeFormat("en").number(n), `en ${n}`).toBe(en);
    }
  });

  test("non-finite numbers give an empty string, never 'NaN'", () => {
    for (const lang of ["vi", "en"] as Lang[]) {
      for (const v of [Number.NaN, Infinity, null, undefined, "abc"]) {
        expect(makeFormat(lang).number(v as never), `${lang} number(${String(v)})`).toBe("");
      }
    }
  });

  test("relative", () => {
    expect(makeFormat("vi").relative(-2, "day")).toBe("2 ngày trước");
    expect(makeFormat("en").relative(-2, "day")).toBe("2 days ago");
    expect(makeFormat("vi").relative(-1, "hour")).toBe("1 giờ trước");
    expect(makeFormat("en").relative(-1, "hour")).toBe("1 hour ago");
    expect(makeFormat("en").relative(3, "day")).toBe("in 3 days");
    expect(makeFormat("vi").relative(3, "day")).toBe(new Intl.RelativeTimeFormat("vi", { numeric: "always" }).format(3, "day"));
  });

  test("relative at zero uses the 'now' wording and never throws", () => {
    expect(makeFormat("en").relative(0, "minute")).toBe(new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(0, "minute"));
    expect(makeFormat("vi").relative(0, "minute")).not.toMatch(/NaN|undefined/);
    expect(makeFormat("en").relative(Number.NaN, "day")).toBe("");
  });

  test("makeFormat is pure: same input, same output, and the two languages do not share state", () => {
    const a = makeFormat("vi");
    const b = makeFormat("en");
    expect(a.number(1234.5)).toBe("1.234,5");
    expect(b.number(1234.5)).toBe("1,234.5");
    expect(a.number(1234.5)).toBe("1.234,5");
  });
});

test.describe("FR-10 click rule (DT-2): the raw cookie decides, not the parsed language", () => {
  test("rawLangCookie reads the raw value of prospex_lang from a cookie string", () => {
    expect(rawLangCookie("prospex_lang=vi")).toBe("vi");
    expect(rawLangCookie("a=1; prospex_lang=id; b=2")).toBe("id");
    expect(rawLangCookie("a=1; xprospex_lang=vi")).toBeNull();
    expect(rawLangCookie("")).toBeNull();
    expect(rawLangCookie(undefined)).toBeNull();
    expect(rawLangCookie("prospex_lang=")).toBe("");
  });

  test("a click is a no-op only when the raw cookie equals the clicked value and the active language", () => {
    expect(shouldWriteLangCookie("en", "en", "en")).toBe(false);
    expect(shouldWriteLangCookie("vi", "vi", "vi")).toBe(false);
  });

  test("legacy id, invalid or missing cookie: a click on EN writes en, a click on VI writes vi", () => {
    for (const raw of ["id", "xx", "VI", "", null, undefined]) {
      expect(shouldWriteLangCookie(raw, "en", "en"), `EN with cookie ${String(raw)}`).toBe(true);
      expect(shouldWriteLangCookie(raw, "vi", "en"), `VI with cookie ${String(raw)}`).toBe(true);
    }
  });

  test("switching language always writes", () => {
    expect(shouldWriteLangCookie("en", "vi", "en")).toBe(true);
    expect(shouldWriteLangCookie("vi", "en", "vi")).toBe(true);
  });

  test("raw cookie equal to the clicked value but language not yet active still writes (state must change)", () => {
    expect(shouldWriteLangCookie("vi", "vi", "en")).toBe(true);
  });
});

test.describe("TC-2.8 / TC-5.10 lang.ts is server-safe and self-contained (static)", () => {
  const src = readFileSync(resolve(__dirname, "../../apps/web/src/lib/i18n/lang.ts"), "utf8");

  test("no 'use client' and no imports at all", () => {
    expect(src).not.toMatch(/^\s*["']use client["']/m); // the directive, not a comment that mentions it
    expect(src).not.toMatch(/^\s*import\s/m);
  });

  test("the language union is en | vi and mentions no Indonesian value", () => {
    expect(src).toMatch(/export type Lang = "en" \| "vi"/);
    expect(src).not.toMatch(/"id"/);
  });

  test("does not reach into the API or shared types", () => {
    expect(src).not.toMatch(/@prospex\/types|apps\/api/);
  });
});
