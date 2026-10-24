// Indonesian regression snapshot — must not change in the Vietnam market feature.
// Expected values were recorded by running the code as it was BEFORE any market change; invented data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { INDONESIA_CITIES, DEFAULT_RADIUS_KM, haversineKm, inArea, isNationwide, planAreas, splitAreas, stripPlaces } from "./areas";
import { leadKey } from "./scraper.processor";

/** Inline copy of the 70 cities in their exact order (the order decides which ones a smaller nationwide campaign uses). */
const CITIES = [
  "Jakarta", "Surabaya", "Bandung", "Medan", "Semarang", "Makassar", "Palembang", "Tangerang", "Depok", "Bekasi",
  "Bogor", "Yogyakarta", "Malang", "Denpasar", "Batam", "Pekanbaru", "Bandar Lampung", "Padang", "Balikpapan", "Samarinda",
  "Banjarmasin", "Pontianak", "Surakarta", "Manado", "Cirebon", "Jambi", "Sidoarjo", "Serang", "Mataram", "Kediri",
  "Jember", "Purwokerto", "Tasikmalaya", "Sukabumi", "Cilegon", "Karawang", "Magelang", "Pekalongan", "Tegal", "Kudus",
  "Banyuwangi", "Madiun", "Probolinggo", "Pasuruan", "Mojokerto", "Blitar", "Salatiga", "Gresik", "Lampung", "Palu",
  "Kendari", "Ambon", "Jayapura", "Kupang", "Bengkulu", "Pangkalpinang", "Tanjungpinang", "Banda Aceh", "Lhokseumawe", "Pematangsiantar",
  "Binjai", "Padang Panjang", "Bukittinggi", "Dumai", "Palangkaraya", "Tarakan", "Singaraja", "Gianyar", "Klaten", "Sleman",
] as const;

test("INDONESIA_CITIES: length 70 and exact order (TC-VM-5.6)", () => {
  assert.equal(INDONESIA_CITIES.length, 70);
  assert.deepEqual([...INDONESIA_CITIES], [...CITIES]);
});

test("stripPlaces knows every PLACE_ALIASES entry and the nationwide word (TC-VM-5.6)", () => {
  const rows: Array<[string, string]> = [
  ["Jogja", "sewa kamera"],
  ["Jogjakarta", "sewa kamera"],
  ["Yogya", "sewa kamera"],
  ["DIY", "sewa kamera"],
  ["Solo", "sewa kamera"],
  ["Bali", "sewa kamera"],
  ["Jabodetabek", "sewa kamera"],
  ["Jabar", "sewa kamera"],
  ["Jateng", "sewa kamera"],
  ["Jatim", "sewa kamera"],
  ["Sumatera", "sewa kamera"],
  ["Jawa", "sewa kamera"],
  ["Kalimantan", "sewa kamera"],
  ["Sulawesi", "sewa kamera"],
  ["Papua", "sewa kamera"],
  ["Indonesia", "sewa kamera"],
  ];
  for (const [alias, expected] of rows) assert.equal(stripPlaces("sewa kamera " + alias), expected, alias);
});

test("splitAreas (TC-VM-5.7)", () => {
  const rows: Array<[string, string[]]> = [
  ["Seluruh Indonesia", ["Seluruh Indonesia"]],
  ["Jogja dan Solo", ["Jogja", "Solo"]],
  ["Medan; Batam", ["Medan", "Batam"]],
  ["yogyakarta, medan dan semarang", ["yogyakarta", "medan", "semarang"]],
  ["Solo & Jogja", ["Solo", "Jogja"]],
  ["di Bandung", ["Bandung"]],
  ["kota Surabaya", ["Surabaya"]],
  ["Kab. Sleman", ["Sleman"]],
  ["a|b/c+d", []],
  ["Jakarta\nBandung\nMedan", ["Jakarta", "Bandung", "Medan"]],
  ["Jakarta\r\nBandung", ["Jakarta", "Bandung"]],
  ["  ", []],
  ["x", []],
  ["Bandung, bandung", ["Bandung"]],
  ["Kabupaten Kota di Bandung", ["Bandung"]],
  ["Bandung serta Medan atau Solo plus Batam", ["Bandung", "Medan", "Solo", "Batam"]],
  ["Medan,, ,Batam", ["Medan", "Batam"]],
  ["Jakarta and Bandung", ["Jakarta", "Bandung"]],
  ["DAN Medan", ["DAN Medan"]],
  ["Bali", ["Bali"]],
  ];
  for (const [input, expected] of rows) assert.deepEqual(splitAreas(input), expected, JSON.stringify(input));
});

test("isNationwide (TC-VM-5.7, TC-VM-5.15 old arity)", () => {
  const rows: Array<[string, boolean]> = [
  ["Seluruh Indonesia", true],
  ["semua indonesia", true],
  ["se indonesia", true],
  ["seindonesia", true],
  ["Indonesia", true],
  ["nasional", true],
  ["all Indonesia", true],
  ["whole indonesia", true],
  ["nationwide", true],
  ["  Seluruh Indonesia  ", true],
  ["Jakarta", false],
  ["Indonesia Timur", false],
  ["Seluruh Indonesia, Medan", false],
  ["Vietnam", false],
  ];
  for (const [input, expected] of rows) assert.equal(isNationwide(input), expected, JSON.stringify(input));
});

test("planAreas (location, queryCount, maxResults) (TC-VM-5.7, TC-VM-5.15 old arity)", () => {
  const rows: Array<[string, number, number, { areas: readonly string[]; perSearch: number; nationwide: boolean }]> = [
  ["Seluruh Indonesia", 1, 100, { areas: CITIES.slice(0, 8), perSearch: 40, nationwide: true }],
  ["Seluruh Indonesia", 1, 50, { areas: CITIES.slice(0, 8), perSearch: 40, nationwide: true }],
  ["Seluruh Indonesia", 2, 300, { areas: CITIES.slice(0, 8), perSearch: 40, nationwide: true }],
  ["Seluruh Indonesia", 3, 1000, { areas: CITIES.slice(0, 14), perSearch: 40, nationwide: true }],
  ["Seluruh Indonesia", 1, 5000, { areas: CITIES.slice(0, 70), perSearch: 100, nationwide: true }],
  ["Seluruh Indonesia", 0, 100, { areas: CITIES.slice(0, 8), perSearch: 40, nationwide: true }],
  ["Seluruh Indonesia", 1, 0, { areas: CITIES.slice(0, 8), perSearch: 40, nationwide: true }],
  ["nasional", 2, 200, { areas: CITIES.slice(0, 8), perSearch: 40, nationwide: true }],
  ["Jogja dan Solo", 1, 100, { areas: ["Jogja", "Solo"], perSearch: 50, nationwide: false }],
  ["Medan; Batam", 2, 100, { areas: ["Medan", "Batam"], perSearch: 25, nationwide: false }],
  ["Jabodetabek", 1, 100, { areas: ["Jabodetabek"], perSearch: 100, nationwide: false }],
  ["Bali", 3, 90, { areas: ["Bali"], perSearch: 30, nationwide: false }],
  ["Bandung", 1, 100, { areas: ["Bandung"], perSearch: 100, nationwide: false }],
  ["Bandung", 0, 100, { areas: ["Bandung"], perSearch: 100, nationwide: false }],
  ["Bandung", 1, 0, { areas: ["Bandung"], perSearch: 1, nationwide: false }],
  ["  ", 1, 100, { areas: [""], perSearch: 100, nationwide: false }],
  ["x", 1, 100, { areas: ["x"], perSearch: 100, nationwide: false }],
  ["Jakarta, Bandung, Medan", 2, 1000, { areas: ["Jakarta", "Bandung", "Medan"], perSearch: 167, nationwide: false }],
  ];
  for (const [location, queries, max, expected] of rows) {
    const got = planAreas(location, queries, max);
    assert.deepEqual({ ...got, areas: [...got.areas] }, { ...expected, areas: [...expected.areas] }, `${JSON.stringify(location)} q=${queries} max=${max}`);
  }
  const nationwide = planAreas("Seluruh Indonesia", 1, 100);
  assert.ok(nationwide.areas.length >= 8 && nationwide.areas.length <= 70);
});

test("stripPlaces (query, typed areas) (TC-VM-5.7, TC-VM-5.15 old arity)", () => {
  const rows: Array<[string, string[], string]> = [
  ["sewa kamera Solo", ["Medan"], "sewa kamera"],
  ["toko roti di Bandung", [], "toko roti"],
  ["kopi", [], "kopi"],
  ["jasa Jakarta Selatan", [], "jasa Selatan"],
  ["sewa kamera di Jogja", [], "sewa kamera"],
  ["rental mobil Bali", ["Medan"], "rental mobil"],
  ["sewa kamera Medan", ["Medan"], "sewa kamera"],
  ["cafe Surabaya", ["Surabaya"], "cafe"],
  ["Solo", [], "Solo"],
  ["kamera Bandar Lampung", [], "kamera"],
  ["kamera Padang Panjang", [], "kamera"],
  ["kafe di Indonesia", [], "kafe"],
  ["toko bunga se Indonesia", [], "toko bunga se"],
  ["SEWA KAMERA JAKARTA", [], "SEWA KAMERA"],
  ["a.b (c) kopi Medan", ["a.b"], "(c) kopi"],
  ["bengkel Jabodetabek", [], "bengkel"],
  ["laundry DIY", [], "laundry"],
  ["laundry di", [], "laundry"],
  ["di Medan", [], "di Medan"],
  ["", [], ""],
  ];
  for (const [query, typed, expected] of rows) assert.equal(stripPlaces(query, typed), expected, JSON.stringify(query));
  assert.equal(stripPlaces("toko roti di Bandung"), "toko roti");
});

test("DEFAULT_RADIUS_KM, haversineKm and inArea (TC-VM-5.8)", () => {
  assert.equal(DEFAULT_RADIUS_KM, 50);
  const jakarta = { lat: -6.2088, lng: 106.8456 };
  const bandung = { lat: -6.9175, lng: 107.6191 };
  assert.equal(Math.round(haversineKm(jakarta, bandung)), 116);
  assert.equal(haversineKm(jakarta, jakarta), 0);
  assert.equal(haversineKm(jakarta, bandung), haversineKm(bandung, jakarta));
  const sample = [
    { name: "Toko A", lat: -6.21, lng: 106.85, address: "Jl. A, Jakarta" },
    { name: "Toko B", lat: -6.9175, lng: 107.6191, address: "Jl. B, Bandung" },
    { name: "Toko C", lat: null, lng: null, address: "Jl. C, Jakarta Selatan" },
    { name: "Toko D", lat: null, lng: null, address: "Jl. D, Bandung" },
    { name: "Toko E", lat: -6.25, lng: 107.15, address: "Jl. E, Bekasi" },
    { name: "Toko F", lat: -6.2088, lng: null as number | null, address: "Jl. F, JAKARTA" },
  ];
  const run = (area: string, radius?: number) => {
    const out = radius === undefined ? inArea(sample, area, jakarta) : inArea(sample, area, jakarta, radius);
    return { names: out.kept.map((x) => x.name), dropped: out.dropped };
  };
  assert.deepEqual(run("Jakarta"), { names: ["Toko A", "Toko C", "Toko E", "Toko F"], dropped: 2 });
  assert.deepEqual(run("Bandung"), { names: ["Toko A", "Toko D", "Toko E"], dropped: 3 });
  assert.deepEqual(run("Jakarta", 100), { names: ["Toko A", "Toko C", "Toko E", "Toko F"], dropped: 2 });
  assert.deepEqual(run("Jakarta", 5), { names: ["Toko A", "Toko C", "Toko F"], dropped: 3 });
  assert.deepEqual(run("nowhere"), { names: ["Toko A", "Toko E"], dropped: 4 });
});

test("leadKey dedupe key (TC-VM-5.4)", () => {
  const rows: Array<[string, { name: string; address: string; phone: string }, string]> = [
  ["K01", { name: "Toko Mawar", address: "Jl. A No. 1", phone: "0812-3456-789" }, "tel:628123456789"],
  ["K02", { name: "Toko Mawar", address: "Jl. A No. 1", phone: "+62 812 3456 789" }, "tel:628123456789"],
  ["K03", { name: "Toko Mawar", address: "Jl. A No. 1", phone: "0812 3456 789" }, "tel:628123456789"],
  ["K04", { name: "Toko Mawar", address: "Jl. A No. 1", phone: "1234567" }, "toko mawar|jl. a no. 1"],
  ["K05", { name: "Toko Mawar", address: "Jl. A No. 1", phone: "" }, "toko mawar|jl. a no. 1"],
  ["K06", { name: "Toko Mawar", address: "Jl. A No. 1", phone: "(021) 555 1234" }, "tel:62215551234"],
  ["K07", { name: "Toko Mawar", address: "Jl. A No. 1", phone: "+84 90 123 4567" }, "tel:84901234567"],
  ["K08", { name: "Toko Mawar", address: "Jl. A No. 1", phone: "090 123 4567" }, "tel:62901234567"],
  ["K09", { name: "TOKO MAWAR", address: "JL. A NO. 1", phone: "abc" }, "toko mawar|jl. a no. 1"],
  ["K10", { name: "Toko Mawar", address: "Jl. A No. 1", phone: "62 812 3456 789" }, "tel:628123456789"],
  ["K11", { name: "Toko Mawar", address: "Jl. A No. 1", phone: "00 62 812 3456 789" }, "tel:620628123456789"],
  ["K12", { name: "Toko Mawar", address: "Jl. A No. 1", phone: "12345678" }, "tel:12345678"],
  ];
  for (const [id, input, expected] of rows) assert.equal(leadKey(input), expected, id);
});

test("google-maps.scraper.ts still builds Indonesian searches inline (TC-VM-5.5, S1 static part)", () => {
  const source = readFileSync(join(__dirname, "google-maps.scraper.ts"), "utf8");
  for (const literal of [", Indonesia", "hl=id", "id-ID", "Asia/Jakarta", "13z"]) assert.ok(source.includes(literal), literal);
});
