/**
 * Browser-less checks for apps/web/src/lib/market-ui.ts and the market strings (no page, no server).
 * Relative imports only. Covers TC-VM-2.3, 2.4 (helper part), 16.1, 20.2.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect } from "@playwright/test";
import { defaultMarketForUi, locationPlaceholderKey, exampleCity, nationwideKeyword, marketName } from "../../apps/web/src/lib/market-ui";
import { enAll, viAll } from "../../apps/web/src/lib/i18n/messages";

const en = enAll as Record<string, string>;
const vi = viAll as Record<string, string>;
const NEW_KEYS = [
  "camp.form.market", "camp.form.locationPhVN", "camp.form.locationHelp", "camp.market.compliance", "camp.cfg.market",
  "tpl.landline", "tpl.service", "outbox.set.ccNotice", "leads.phone.landline", "outbox.manual.service",
];
const ph = (s: string) => [...new Set(s.match(/\{[A-Za-z0-9_.]+\}/g) ?? [])].sort();

test.describe("defaultMarketForUi", () => {
  for (const [input, want] of [["vi", "VN"], ["en", "ID"], ["id", "ID"], ["", "ID"], [undefined, "ID"], ["xx", "ID"]] as const) {
    test(`${String(input)} -> ${want}`, () => expect(defaultMarketForUi(input as never)).toBe(want));
  }
});

test.describe("placeholder helpers", () => {
  test("keys, city, keyword, names", () => {
    expect(locationPlaceholderKey("ID")).toBe("camp.form.locationPh");
    expect(locationPlaceholderKey("VN")).toBe("camp.form.locationPhVN");
    expect(exampleCity("ID")).toBe("Jakarta");
    expect(exampleCity("VN")).toBe("TP.HCM");
    expect(nationwideKeyword("ID")).toBe("Seluruh Indonesia");
    expect(nationwideKeyword("VN")).toBe("Toàn quốc");
    expect(marketName("ID")).toBe("Indonesia");
    expect(marketName("VN")).toBe("Việt Nam");
  });
  test("VN placeholder text per language", () => {
    expect(en["camp.form.locationPhVN"]).toContain("Ho Chi Minh City");
    expect(vi["camp.form.locationPhVN"]).toContain("TP.HCM");
  });
});

test("market-ui.ts is pure: no 'use client', no API imports", () => {
  const src = readFileSync(resolve(__dirname, "../../apps/web/src/lib/market-ui.ts"), "utf8");
  expect(src).not.toMatch(/use client/);
  expect(src).not.toMatch(/apps\/api|@prospex\/api/);
  expect(src).not.toMatch(/from ["'](?!\.)/);
});

test.describe("compliance notice", () => {
  const e = en["camp.market.compliance"];
  const v = vi["camp.market.compliance"];
  test("english wording", () => {
    expect(e).toContain("91/2020");
    expect(e).toContain("13/2023");
    expect(e).toContain("may apply");
    expect(e).toMatch(/not legal advice/i);
    expect(e.toLowerCase()).not.toContain("compliant");
  });
  test("vietnamese wording, NFC", () => {
    expect(v).toContain("91/2020");
    expect(v).toContain("13/2023");
    expect(v).toContain("có thể áp dụng");
    expect(v.toLowerCase()).not.toContain("tuân thủ");
    expect(v).toBe(v.normalize("NFC"));
  });
});

test("new keys exist in both dictionaries with identical placeholders", () => {
  for (const k of NEW_KEYS) {
    expect(en[k], k).toBeTruthy();
    expect(vi[k], k).toBeTruthy();
    expect(ph(vi[k]), k).toEqual(ph(en[k]));
  }
  expect(ph(en["camp.form.locationHelp"])).toEqual(["{keyword}"]);
});
