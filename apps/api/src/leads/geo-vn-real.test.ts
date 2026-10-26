import test from "node:test";
import assert from "node:assert/strict";
import { regionFromAddress, regionFromNominatimVN } from "./geo";

/**
 * Shape returned by the real Nominatim for a Ho Chi Minh City point (reverse, zoom 14, accept-language=vi):
 * there is NO `state` key. After the 2025 reform the city is the province-level unit and arrives as `city`,
 * the ward as `suburb`. (A public place address; no business data.)
 */
const HCM_REAL = { suburb: "Phường Tân Sơn", city: "Thành phố Hồ Chí Minh", "ISO3166-2-lvl4": "VN-SG", postcode: "72126", country: "Việt Nam", country_code: "vn" };

test("a Vietnamese address with the province-level unit in `city` (no `state`) gets its province", () => {
  const r = regionFromAddress(HCM_REAL);
  assert.equal(r?.province, "Hồ Chí Minh");
  assert.equal(r?.district, "Phường Tân Sơn");
  assert.equal(r?.regency, null);
});

test("`state` still wins over `city` when both are present", () => {
  assert.equal(regionFromNominatimVN({ state: "Tỉnh Đồng Nai", city: "Thành phố Biên Hòa" })?.province, "Đồng Nai");
});

test("`province` is accepted too, and a missing province-level unit still yields the ward", () => {
  assert.equal(regionFromNominatimVN({ province: "Thành phố Hà Nội" })?.province, "Hà Nội");
  const r = regionFromNominatimVN({ suburb: "Phường Mẫu" });
  assert.equal(r?.province, null);
  assert.equal(r?.district, "Phường Mẫu");
});

test("a non-Vietnamese code never reaches the VN mapper", () => {
  assert.equal(regionFromAddress({ ...HCM_REAL, country_code: "kh" }), null);
});
