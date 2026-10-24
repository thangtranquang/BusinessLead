// Maps URL and browser-context builders (TC-VM-4.1 to 4.7, 5.5 builder part, S.3). Pure: no browser, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildAreaUrl, buildSearchUrl, contextOptions } from "./maps-urls";
import { normalizeMarket } from "../common/market";

test("VN area URL names Việt Nam and asks for the Vietnamese interface (TC-VM-4.1)", () => {
  const url = buildAreaUrl("TP.HCM", "VN");
  assert.ok(url.startsWith("https://www.google.com/maps/search/"));
  const u = new URL(url);
  assert.equal(decodeURIComponent(u.pathname.replace("/maps/search/", "")), "TP.HCM, Việt Nam");
  assert.equal(u.searchParams.get("hl"), "vi");
  assert.ok(!url.includes("Indonesia") && !url.includes("hl=id"));
});

test("VN search URL: one encoded segment, coordinates, 13z, hl=vi (TC-VM-4.2)", () => {
  const url = buildSearchUrl("công ty logistics Hà Nội", 21.0278, 105.8342, "VN");
  assert.equal(url, `https://www.google.com/maps/search/${encodeURIComponent("công ty logistics Hà Nội")}/@21.0278,105.8342,13z?hl=vi`);
});

test("VN context (TC-VM-4.3)", () => {
  assert.deepEqual(contextOptions("VN"), { locale: "vi-VN", timezoneId: "Asia/Ho_Chi_Minh" });
});

test("ID builders equal what google-maps.scraper.ts built inline before (TC-VM-4.4, 5.5)", () => {
  // the two compositions below are the source text of the scraper before the market work
  const oldArea = (area: string) => `https://www.google.com/maps/search/${encodeURIComponent(`${area}, Indonesia`)}?hl=id`;
  const oldSearch = (q: string, lat: number, lng: number) => `https://www.google.com/maps/search/${encodeURIComponent(q)}/@${lat},${lng},13z?hl=id`;
  for (const area of ["Bandung", "Yogyakarta", "Kota Bogor", "Jl. Mawar & Co", "Banda Aceh"]) {
    assert.equal(buildAreaUrl(area, "ID"), oldArea(area));
    assert.equal(buildAreaUrl(area), oldArea(area), "no market argument means ID");
  }
  assert.equal(buildSearchUrl("kopi Bandung", -6.9175, 107.6191, "ID"), oldSearch("kopi Bandung", -6.9175, 107.6191));
  assert.equal(buildSearchUrl("kopi Bandung", -6.9175, 107.6191), oldSearch("kopi Bandung", -6.9175, 107.6191));
  assert.deepEqual(contextOptions("ID"), { locale: "id-ID", timezoneId: "Asia/Jakarta" });
  assert.deepEqual(contextOptions(), { locale: "id-ID", timezoneId: "Asia/Jakarta" });
});

const HOSTILE = ["a&hl=en", "a#frag", "a?x=1", "a/b", "a\nb", "a\r\nHost: evil", "ünï ç ọ̀ 越南", "%00", '"><script>', "../../x", "😀", "x".repeat(10_000), "&".repeat(500)];

test("hostile area text only ever sits percent-encoded in the path (TC-VM-4.5, S.3)", () => {
  for (const market of ["ID", "VN"] as const) {
    for (const hostile of HOSTILE) {
      for (const url of [buildAreaUrl(hostile, market), buildSearchUrl(hostile, 10.5, 106.5, market)]) {
        assert.equal(url.split("?").length, 2, "exactly one ?");
        assert.equal(url.split("#").length, 1, "no #");
        assert.equal((url.match(/hl=/g) ?? []).length, 1, "exactly one hl=");
        assert.ok(!/[\s"<>]/.test(url), "no raw space, newline or quote");
        const u = new URL(url);
        assert.equal(u.hostname, "www.google.com");
        assert.equal(u.searchParams.get("hl"), market === "VN" ? "vi" : "id");
        assert.deepEqual([...u.searchParams.keys()], ["hl"]);
        assert.equal(u.hash, "");
        const path = url.slice("https://www.google.com/maps/search/".length, url.indexOf("?"));
        assert.ok(!/[&#]/.test(path.replace(/@[-\d.,]+,13z$/, "")), "no raw & or # in the path");
      }
    }
  }
});

test("an injected market value cannot reach the URL (TC-VM-4.6)", () => {
  const injected = normalizeMarket("VN&hl=en");
  assert.equal(injected, "ID");
  assert.ok(!buildAreaUrl("Bandung", injected).includes("VN"));
  // even a caller that bypasses the types falls back to the Indonesian profile
  assert.equal(buildAreaUrl("x", "VN&hl=en" as never), buildAreaUrl("x", "ID"));
  assert.deepEqual(contextOptions("VN&hl=en" as never), contextOptions("ID"));
  assert.throws(() => buildSearchUrl("x", Number.NaN, 1, "ID"));
});

test("source: one encodeURIComponent per builder, nothing passed into the page (TC-VM-4.7, 4.12, 7.15, S.8)", () => {
  const urls = readFileSync(join(__dirname, "maps-urls.ts"), "utf8");
  assert.equal((urls.match(/encodeURIComponent\(/g) ?? []).length, 2);
  const scraper = readFileSync(join(__dirname, "google-maps.scraper.ts"), "utf8");
  const code = scraper.replace(/\/\/.*$/gm, "");
  assert.ok(!/encodeURIComponent|maps\/search/.test(code), "the scraper builds no URL itself");
  assert.ok(!code.includes("replace(/^62/"), "no Indonesian phone clean-up inside the page code");
  assert.ok(!/\$\$eval\([^)]*\),\s*(market|opts|area)/.test(code));
  assert.ok(!/evaluate\([^)]*,\s*(market|opts|area|safeQuery)\b/.test(code));
});
