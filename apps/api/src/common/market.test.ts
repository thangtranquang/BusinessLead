import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_MARKET, MARKET, MARKETS, initialTimezone, mapsHl, normalizeMarket, toMarket } from "./market";
import { fold } from "./text";

// TC-VM-1.1 to 1.7, 15.9

const EXACT_ID_CITIES = [
  "Jakarta", "Surabaya", "Bandung", "Medan", "Semarang", "Makassar", "Palembang", "Tangerang", "Depok", "Bekasi",
  "Bogor", "Yogyakarta", "Malang", "Denpasar", "Batam", "Pekanbaru", "Bandar Lampung", "Padang", "Balikpapan", "Samarinda",
  "Banjarmasin", "Pontianak", "Surakarta", "Manado", "Cirebon", "Jambi", "Sidoarjo", "Serang", "Mataram", "Kediri",
  "Jember", "Purwokerto", "Tasikmalaya", "Sukabumi", "Cilegon", "Karawang", "Magelang", "Pekalongan", "Tegal", "Kudus",
  "Banyuwangi", "Madiun", "Probolinggo", "Pasuruan", "Mojokerto", "Blitar", "Salatiga", "Gresik", "Lampung", "Palu",
  "Kendari", "Ambon", "Jayapura", "Kupang", "Bengkulu", "Pangkalpinang", "Tanjungpinang", "Banda Aceh", "Lhokseumawe", "Pematangsiantar",
  "Binjai", "Padang Panjang", "Bukittinggi", "Dumai", "Palangkaraya", "Tarakan", "Singaraja", "Gianyar", "Klaten", "Sleman",
];

const INPUTS: [string, unknown][] = [
  ["VN", "VN"], ["ID", "ID"], ["vn", "vn"], ["Vn", "Vn"], ["XX", "XX"], ["null", null], ["undefined", undefined], ["empty", ""],
  ["1", 1], ["['VN']", ["VN"]], ["{}", {}], ["10k", "V".repeat(10_240)], ["VN padded", "VN "], ["true", true],
];

test("MARKETS is the frozen pair ID, VN and the default is ID (TC-VM-1.1)", () => {
  assert.deepEqual([...MARKETS], ["ID", "VN"]);
  assert.ok(Object.isFrozen(MARKETS));
  assert.equal(DEFAULT_MARKET, "ID");
});

test("normalizeMarket: VN only for the exact string VN, never throws (TC-VM-1.2)", () => {
  for (const [label, v] of INPUTS) {
    assert.equal(normalizeMarket(v), v === "VN" ? "VN" : "ID", label);
  }
});

test("toMarket returns the two exact values and throws for everything else (TC-VM-1.3)", () => {
  for (const [label, v] of INPUTS) {
    if (v === "VN" || v === "ID") assert.equal(toMarket(v), v, label);
    else assert.throws(() => toMarket(v), label);
  }
});

test("the thrown message never echoes the rejected value", () => {
  assert.throws(() => toMarket("SECRET-TOKEN-1234"), (e: Error) => !e.message.includes("SECRET-TOKEN-1234"));
});

test("profile registry is exhaustive, frozen and carries the right constants (TC-VM-1.4)", () => {
  assert.deepEqual(Object.keys(MARKET), [...MARKETS]);
  assert.ok(Object.isFrozen(MARKET) && Object.isFrozen(MARKET.ID) && Object.isFrozen(MARKET.VN));
  const id = MARKET.ID;
  assert.equal(id.callingCode, "62");
  assert.equal(id.mapsLocale, "id-ID");
  assert.equal(id.timezone, "Asia/Jakarta");
  assert.equal(id.nominatimCountry, "id");
  assert.equal(id.regionSuffix, "Indonesia");
  assert.ok(id.bareMobileLead instanceof RegExp && id.bareMobileLead.test("8123456789") && !id.bareMobileLead.test("0812345678"));
  const vn = MARKET.VN;
  assert.equal(vn.callingCode, "84");
  assert.equal(vn.mapsLocale, "vi-VN");
  assert.equal(vn.timezone, "Asia/Ho_Chi_Minh");
  assert.equal(vn.nominatimCountry, "vn");
  assert.equal(vn.regionSuffix, "Việt Nam");
  assert.equal(vn.bareMobileLead, null);
  assert.deepEqual(vn.mapCenter, { lat: 10.7769, lng: 106.7009 });
});

test("the ID profile equals the pre-feature literals (TC-VM-1.5)", () => {
  assert.deepEqual([...MARKET.ID.cities], EXACT_ID_CITIES);
  assert.equal(MARKET.ID.cities.length, 70);
  assert.deepEqual(MARKET.ID.mapCenter, { lat: -6.2088, lng: 106.8456 });
  assert.ok(Object.isFrozen(MARKET.ID.cities) && Object.isFrozen(MARKET.ID.mapCenter));
});

test("VN cities are ordered, unique after folding, NFC and name the big markets; nationwide terms exist (TC-VM-1.6)", () => {
  const cities = MARKET.VN.cities;
  assert.ok(cities.length >= 8);
  assert.equal(new Set(cities.map((c) => fold(c))).size, cities.length, "no duplicates");
  for (const c of cities) assert.equal(c, c.normalize("NFC"), c);
  assert.equal(cities[0], "Hồ Chí Minh");
  assert.equal(cities[1], "Hà Nội");
  assert.ok(cities.includes("Đà Nẵng"));
  assert.ok(MARKET.VN.nationwideTerms.length > 0);
  for (const t of MARKET.VN.nationwideTerms) assert.equal(t, t.toLowerCase());
  for (const t of ["toàn quốc", "việt nam", "cả nước"]) assert.ok(MARKET.VN.nationwideTerms.includes(t), t);
  assert.ok(Object.isFrozen(MARKET.VN.cities) && Object.isFrozen(MARKET.VN.nationwideTerms));
});

test("common/market.ts imports nothing from scraper, leads or messaging (TC-VM-1.7)", () => {
  const src = readFileSync(path.join(__dirname, "market.ts"), "utf8");
  const imports = src.split(/\r?\n/).filter((l) => /^\s*(import|export)\b.*\bfrom\b/.test(l));
  for (const l of imports) assert.ok(!/(scraper|leads|messaging)\//.test(l), l);
});

test("mapsHl follows the market", () => {
  assert.equal(mapsHl("ID"), "id");
  assert.equal(mapsHl("VN"), "vi");
});

test("initialTimezone: VN gives Ho Chi Minh, ID and anything else gives Jakarta (TC-VM-15.9)", () => {
  assert.equal(initialTimezone("VN"), "Asia/Ho_Chi_Minh");
  for (const v of ["ID", "XX", null, undefined, "", 1, ["VN"], "vn"]) assert.equal(initialTimezone(v), "Asia/Jakarta");
});
