// Indonesian regression snapshot — must not change in the Vietnam market feature.
// Expected values were recorded by running the code as it was BEFORE any market change; invented data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cellKey, normalizeProvince, regionFromNominatim, type NominatimAddress } from "./geo";

test("regionFromNominatim (TC-VM-5.10, TC-VM-5.15 old arity)", () => {
  const rows: Array<[string, NominatimAddress, { province: string | null; regency: string | null; district: string | null } | null]> = [
  ["Jawa Barat / Bandung / Coblong", { country_code: "id", state: "Jawa Barat", city: "Bandung", city_district: "Coblong" }, { province: "Jawa Barat", regency: "Bandung", district: "Coblong" }],
  ["Jakarta special case", { country_code: "id", state: "DKI Jakarta", city: "Jakarta Selatan", city_district: "Kebayoran Baru", suburb: "Senayan" }, { province: "DKI Jakarta", regency: "Kebayoran Baru", district: "Senayan" }],
  ["Jakarta, no state, city says Jakarta", { country_code: "id", city: "Jakarta Pusat", city_district: "Gambir", suburb: "Gambir" }, { province: "DKI Jakarta", regency: "Gambir", district: null }],
  ["Jakarta suburb equals regency", { country_code: "id", state: "Jakarta", city_district: "Jakarta Timur", suburb: "Jakarta Timur" }, { province: "DKI Jakarta", regency: "Jakarta Timur", district: null }],
  ["Jakarta county fallback", { country_code: "id", state: "Daerah Khusus Ibukota Jakarta", county: "Jakarta Barat", district: "Kalideres" }, { province: "DKI Jakarta", regency: "Jakarta Barat", district: "Kalideres" }],
  ["Yogyakarta special case", { country_code: "id", state: "Daerah Istimewa Yogyakarta", city: "Yogyakarta", city_district: "Gondokusuman" }, { province: "DI Yogyakarta", regency: "Yogyakarta", district: "Gondokusuman" }],
  ["county fallback", { country_code: "id", state: "Jawa Tengah", county: "Kabupaten Klaten" }, { province: "Jawa Tengah", regency: "Kabupaten Klaten", district: null }],
  ["regency fallback", { country_code: "id", province: "Bali", regency: "Badung", district: "Kuta" }, { province: "Bali", regency: "Badung", district: "Kuta" }],
  ["municipality fallback", { country_code: "id", state: "Sumatera Utara", municipality: "Medan" }, { province: "Sumatera Utara", regency: "Medan", district: null }],
  ["town fallback", { country_code: "id", state: "Jawa Timur", town: "Batu" }, { province: "Jawa Timur", regency: "Batu", district: null }],
  ["province prefix removed", { country_code: "id", state: "Provinsi Banten", city: "Serang" }, { province: "Banten", regency: "Serang", district: null }],
  ["missing country_code passes today", { state: "Jawa Barat", city: "Bogor" }, { province: "Jawa Barat", regency: "Bogor", district: null }],
  ["uppercase country code", { country_code: "ID", state: "Jawa Barat", city: "Bogor" }, { province: "Jawa Barat", regency: "Bogor", district: null }],
  ["country ke", { country_code: "ke", state: "Nairobi", city: "Nairobi" }, null],
  ["country sg", { country_code: "sg", city: "Singapore" }, null],
  ["country vn (null under ID rules today)", { country_code: "vn", state: "Ha Noi", city: "Ha Noi" }, null],
  ["empty address", {  }, null],
  ["only country_code id", { country_code: "id" }, null],
  ["whitespace and long names", { country_code: "id", state: "  Jawa   Barat  ", city: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB" }, { province: "Jawa Barat", regency: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", district: null }],
  ["district over city_district", { country_code: "id", state: "Jawa Barat", city: "Bandung", district: "Cicendo", city_district: "Coblong" }, { province: "Jawa Barat", regency: "Bandung", district: "Cicendo" }],
  ];
  for (const [label, address, expected] of rows) assert.deepEqual(regionFromNominatim(address), expected, label);
  assert.equal(regionFromNominatim(undefined), null);
});

test("normalizeProvince (TC-VM-5.11)", () => {
  const rows: Array<[string | null, string | null]> = [
  ["DKI Jakarta", "DKI Jakarta"],
  ["Daerah Istimewa Yogyakarta", "DI Yogyakarta"],
  ["Jakarta", "DKI Jakarta"],
  ["Daerah Khusus Ibukota Jakarta", "DKI Jakarta"],
  ["Provinsi Jawa Barat", "Jawa Barat"],
  ["provinsi bali", "bali"],
  ["Jawa Barat", "Jawa Barat"],
  ["DI Yogyakarta", "DI Yogyakarta"],
  ["Yogyakarta", "DI Yogyakarta"],
  ["", null],
  [null, null],
  ];
  for (const [input, expected] of rows) assert.equal(normalizeProvince(input), expected, JSON.stringify(input));
});

test("cellKey (TC-VM-5.11)", () => {
  const rows: Array<[number, number, string]> = [
  [-6.2088, 106.8456, "-6.210,106.845"],
  [-6.9175, 107.6191, "-6.915,107.620"],
  [0, 0, "0.000,0.000"],
  [-6.2088, 106.8476, "-6.210,106.850"],
  [-6.2088, 106.8486, "-6.210,106.850"],
  [-33.8688, 151.2093, "-33.870,151.210"],
  [-6.2, 106.8, "-6.200,106.800"],
  ];
  for (const [lat, lng, expected] of rows) assert.equal(cellKey(lat, lng), expected, `${lat},${lng}`);
});
