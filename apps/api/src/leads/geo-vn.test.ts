import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cellKey, regionFromAddress, regionFromNominatim, regionFromNominatimVN } from "./geo";
import { PROVINCES_VN, PRE_MERGER_VN, normalizeProvinceVN } from "./vn-provinces";
import { geocoderLanguage, geocoderCacheKey } from "./geo.service";

// All inputs are invented stand-ins for Nominatim answers: Simulated, not checked against the live service.

test("TC-VM-6.22 dataset header cites source URL and access date", () => {
  const src = readFileSync(path.join(__dirname, "vn-provinces.ts"), "utf8");
  const header = src.slice(0, src.indexOf("export"));
  assert.match(header, /https:\/\/\S+/);
  assert.match(header, /Accessed:\s*\d{4}-\d{2}-\d{2}/);
  assert.match(header, /202\/2025\/QH15/);
  assert.match(header, /1 July 2025/);
});

test("TC-VM-6.21 dataset has 34 NFC unique entries", () => {
  assert.equal(PROVINCES_VN.length, 34);
  assert.equal(new Set(PROVINCES_VN).size, 34);
  for (const p of PROVINCES_VN) assert.equal(p, p.normalize("NFC"));
  for (const [k, v] of Object.entries(PRE_MERGER_VN)) {
    assert.equal(k, k.normalize("NFC"));
    assert.ok(PROVINCES_VN.includes(v), v);
  }
});

test("TC-VM-13.1 city province, ward and regency", () => {
  assert.deepEqual(
    regionFromAddress({ country_code: "vn", state: "Thành phố Hồ Chí Minh", city_district: "Quận 1", suburb: "Phường Bến Nghé" } as never),
    { province: "Hồ Chí Minh", regency: "Quận 1", district: "Phường Bến Nghé" },
  );
});

test("TC-VM-13.2/13.3 prefixes and unknown names", () => {
  assert.equal(regionFromNominatimVN({ state: "Tỉnh Đồng Nai" })?.province, "Đồng Nai");
  assert.equal(regionFromNominatimVN({ state: "Hà Nội" })?.province, "Hà Nội");
  assert.equal(regionFromNominatimVN({ state: "Thành phố Hà Nội" })?.province, "Hà Nội");
  assert.equal(regionFromNominatimVN({ state: "Xyz" })?.province, "Xyz");
  assert.deepEqual(regionFromNominatimVN({ suburb: "Phường Mẫu" }), { province: null, regency: null, district: "Phường Mẫu" });
  assert.equal(regionFromNominatimVN({}), null);
  assert.equal(regionFromNominatimVN(undefined), null);
});

test("TC-VM-13.4/13.5 regency", () => {
  assert.equal(regionFromNominatimVN({ state: "Tỉnh Đồng Nai" })?.regency, null);
  assert.equal(regionFromNominatimVN({ state: "Tỉnh Đồng Nai", county: "Huyện Mẫu" })?.regency, "Huyện Mẫu");
  assert.equal(regionFromNominatimVN({ state: "Tỉnh Đồng Nai", county: "Huyện Mẫu", city_district: "Quận A" })?.regency, "Quận A");
});

test("TC-VM-13.6 ward order suburb > quarter > village", () => {
  const s = { state: "Hà Nội" };
  assert.equal(regionFromNominatimVN({ ...s, suburb: "S" })?.district, "S");
  assert.equal(regionFromNominatimVN({ ...s, quarter: "Q" })?.district, "Q");
  assert.equal(regionFromNominatimVN({ ...s, village: "V" })?.district, "V");
  assert.equal(regionFromNominatimVN({ ...s, suburb: "S", quarter: "Q", village: "V" })?.district, "S");
});

test("TC-VM-13.7/13.9/13.10 dispatch by country_code", () => {
  assert.equal(regionFromAddress({ country_code: "vn", state: "Hà Nội" })?.province, "Hà Nội");
  assert.equal(regionFromAddress({ country_code: "id", state: "Jawa Tengah" })?.province, "Jawa Tengah");
  for (const cc of ["ke", "sg", "th", "VN", "vn "]) assert.equal(regionFromAddress({ country_code: cc, state: "Hà Nội" }), null, cc);
  // missing country code keeps today's (Indonesian) path
  assert.deepEqual(regionFromAddress({ state: "Tỉnh Đồng Nai" }), { province: "Tỉnh Đồng Nai", regency: null, district: null });
  // the original export keeps its ID-only behaviour
  assert.equal(regionFromNominatim({ country_code: "vn", state: "Hà Nội" }), null);
});

test("TC-VM-13.11 pre-merger names map only when verified", () => {
  assert.equal(normalizeProvinceVN("Tỉnh Bình Dương"), "Hồ Chí Minh");
  assert.equal(normalizeProvinceVN("Tỉnh Bà Rịa - Vũng Tàu"), "Hồ Chí Minh");
  assert.equal(normalizeProvinceVN("Bà Rịa-Vũng Tàu"), "Hồ Chí Minh");
  assert.equal(normalizeProvinceVN("Tỉnh Kon Tum"), "Quảng Ngãi");
  assert.equal(normalizeProvinceVN("Tỉnh Không Có"), "Không Có");
  assert.equal(normalizeProvinceVN(null), null);
});

test("TC-VM-13.12 geocoder language and cache key per market", () => {
  assert.equal(geocoderLanguage("VN"), "vi");
  assert.equal(geocoderLanguage("ID"), "id");
  assert.equal(geocoderLanguage(undefined), "id");
  assert.equal(geocoderCacheKey("VN", -6.9932, 110.4203), cellKey(-6.9932, 110.4203) + "|vi");
  assert.equal(geocoderCacheKey("ID", -6.9932, 110.4203), cellKey(-6.9932, 110.4203));
  assert.equal(cellKey(-6.9932, 110.4203), cellKey(-6.9951, 110.4189));
});

test("TC-VM-13.15 hostile address object", () => {
  const big = "Ạ".repeat(100_000);
  const t0 = Date.now();
  const r = regionFromNominatimVN({ state: big, county: big, suburb: big, city_district: big } as never);
  assert.ok(Date.now() - t0 < 1000);
  assert.ok((r?.province?.length ?? 0) <= 80 && (r?.regency?.length ?? 0) <= 80 && (r?.district?.length ?? 0) <= 80);
  assert.doesNotThrow(() => regionFromNominatimVN({ state: 5, county: {}, suburb: ["x"], quarter: null, village: true } as never));
  assert.doesNotThrow(() => regionFromNominatimVN(JSON.parse('{"__proto__":{"state":"x"},"constructor":"y","state":"Hà Nội"}')));
  assert.doesNotThrow(() => normalizeProvinceVN("constructor"));
  assert.equal(normalizeProvinceVN("constructor"), "constructor");
});
