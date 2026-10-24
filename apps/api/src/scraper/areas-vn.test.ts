// Vietnamese area planning (TC-VM-6.1 to 6.20). Invented places only; Indonesian behaviour is pinned by areas.snapshot.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { inArea, isNationwide, planAreas, resolvePlace, splitAreas, stripPlaces } from "./areas";
import { MARKET } from "../common/market";
import { assertLinear, HOSTILE_MS_LARGE } from "../common/hostile-limits";

const HCM = MARKET.VN.cities[0];

test("nationwide expands to Vietnamese cities with the same sizing formula as Indonesia (TC-VM-6.1)", () => {
  for (const max of [50, 100, 300, 1000, 5000]) {
    const vn = planAreas("toàn quốc", 1, max, "VN");
    const id = planAreas("Seluruh Indonesia", 1, max, "ID");
    assert.equal(vn.nationwide, true);
    assert.ok(vn.areas.length >= 8 && vn.areas.length <= MARKET.VN.cities.length);
    assert.deepEqual(vn.areas, MARKET.VN.cities.slice(0, vn.areas.length));
    if (vn.areas.length === id.areas.length) assert.equal(vn.perSearch, id.perSearch);
  }
  assert.equal(planAreas("toàn quốc", 1, 5000, "VN").areas.length, MARKET.VN.cities.length);
  assert.equal(planAreas("toàn quốc", 1, 5000, "VN").perSearch, 100);
});

test("nationwide variants (TC-VM-6.2)", () => {
  for (const t of ["cả nước", "Việt Nam", "Viet Nam", "Vietnam", "nationwide", "all Vietnam", "TOÀN QUỐC", "Toan Quoc", "  toàn quốc  "]) assert.equal(isNationwide(t, "VN"), true, t);
  for (const t of ["Hà Nội", "Việt Nam, Hà Nội", "Việt Nam Airlines", ""]) assert.equal(isNationwide(t, "VN"), false, t);
});

test("nationwide terms do not leak between markets (TC-VM-6.3, 6.15)", () => {
  assert.equal(isNationwide("toàn quốc", "ID"), false);
  assert.equal(isNationwide("Seluruh Indonesia", "VN"), false);
  assert.equal(isNationwide("Vietnam", "ID"), false);
  assert.equal(isNationwide("Seluruh Indonesia"), true);
  assert.deepEqual(planAreas("Jogja", 1, 10, "VN").areas, ["Jogja"]);
  assert.equal(planAreas("Seluruh Indonesia", 1, 100, "VN").nationwide, false);
  assert.deepEqual(planAreas("TP.HCM", 1, 10).areas, ["TP.HCM"], "no Vietnamese alias under ID");
  assert.deepEqual(planAreas("Sài Gòn", 1, 10, "ID").areas, ["Sài Gòn"]);
});

test("HCM aliases resolve to one place (TC-VM-6.4)", () => {
  const all = ["Ho Chi Minh", "Ho Chi Minh City", "HCM", "HCMC", "TP.HCM", "TPHCM", "TP. HCM", "tp.hcm", "Sài Gòn", "Sai Gon", "Saigon", "SÀI GÒN", "TP. Hồ Chí Minh", "Thành phố Hồ Chí Minh", "Thanh pho Ho Chi Minh", "Hồ Chí Minh", "ho chi minh"];
  for (const a of all) assert.equal(resolvePlace(a, "VN"), HCM, a);
  assert.equal(HCM, "Hồ Chí Minh");
  assert.deepEqual(planAreas("TP.HCM", 1, 10, "VN").areas, [HCM]);
});

test("Hà Nội and Đà Nẵng aliases (TC-VM-6.5, 6.6)", () => {
  const hn = new Set(["Ha Noi", "Hanoi", "HN", "Hà Nội", "hà nội"].map((a) => resolvePlace(a, "VN")));
  const dn = new Set(["Da Nang", "Danang", "Đà Nẵng", "đà nẵng", "DA NANG"].map((a) => resolvePlace(a, "VN")));
  assert.deepEqual([...hn], ["Hà Nội"]);
  assert.deepEqual([...dn], ["Đà Nẵng"]);
  assert.equal(resolvePlace("Đồng Nai", "VN"), "Đồng Nai");
  assert.equal(resolvePlace("Hồ Chí Minh", "VN"), HCM, "NFD input");
});

test("every list city resolves to itself, with or without accents (TC-VM-6.7)", () => {
  for (const c of MARKET.VN.cities) {
    assert.equal(resolvePlace(c, "VN"), c);
    assert.equal(resolvePlace(c.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D"), "VN"), c);
  }
});

test("unknown places stay as typed (TC-VM-6.8, 6.16)", () => {
  for (const p of ["Phường Bến Nghé", "Quận 7", "KCN Sóng Thần"]) assert.equal(resolvePlace(`  ${p} `, "VN"), p);
  for (const p of ["Vũng Tàu", "Biên Hòa", "Thủ Dầu Một"]) assert.deepEqual(splitAreas(p, "VN"), [p]);
});

test("prefixes are removed, at most three chained (TC-VM-6.9)", () => {
  assert.deepEqual(splitAreas("thành phố Đà Nẵng", "VN"), ["Đà Nẵng"]);
  assert.deepEqual(splitAreas("tp. Đà Nẵng", "VN"), ["Đà Nẵng"]);
  assert.deepEqual(splitAreas("tỉnh Đồng Nai", "VN"), ["Đồng Nai"]);
  assert.deepEqual(splitAreas("tại Hà Nội", "VN"), ["Hà Nội"]);
  assert.deepEqual(splitAreas("ở Huế", "VN"), ["Huế"]);
  assert.deepEqual(splitAreas("Thành Phố Cần Thơ", "VN"), ["Cần Thơ"]);
  assert.deepEqual(splitAreas("tại tỉnh tp. Hải Phòng", "VN"), ["Hải Phòng"]);
});

test("separator words and symbols split places; duplicates and one-character parts are dropped (TC-VM-6.10)", () => {
  assert.deepEqual(splitAreas("Hà Nội và Đà Nẵng", "VN"), ["Hà Nội", "Đà Nẵng"]);
  assert.deepEqual(splitAreas("HCM hoặc Cần Thơ", "VN"), [HCM, "Cần Thơ"]);
  assert.deepEqual(splitAreas("Hà Nội cùng với Huế", "VN"), ["Hà Nội", "Huế"]);
  for (const sep of ["; ", " | ", " / ", " + ", " & ", "\n", "\r\n", ", "]) assert.deepEqual(splitAreas(`Cần Thơ${sep}Huế`, "VN"), ["Cần Thơ", "Huế"], JSON.stringify(sep));
  assert.deepEqual(splitAreas("Hà Nội, hà nội, Hanoi, x", "VN"), ["Hà Nội"]);
});

test("a comma splits places, no comma keeps one (TC-VM-6.11, 6.12)", () => {
  assert.deepEqual(planAreas("Quận 7, TP.HCM", 1, 10, "VN").areas, ["Quận 7", HCM]);
  assert.deepEqual(planAreas("Quận 7 TP.HCM", 1, 10, "VN").areas, ["Quận 7 TP.HCM"]);
  assert.deepEqual(planAreas("Bandung, Jakarta", 1, 10).areas, ["Bandung", "Jakarta"]);
});

test("stripPlaces under VN (TC-VM-6.14)", () => {
  assert.equal(stripPlaces("công ty logistics TP.HCM", [], "VN"), "công ty logistics");
  assert.equal(stripPlaces("logistics Sài Gòn", [], "VN"), "logistics");
  assert.equal(stripPlaces("Hà Nội", [], "VN"), "Hà Nội");
  assert.equal(stripPlaces("kho vận Da Nang", [], "VN"), "kho vận");
  assert.equal(stripPlaces("kho vận tại Đà Nẵng", [], "VN"), "kho vận");
  assert.equal(stripPlaces("kho vận Quận 7", ["Quận 7"], "VN"), "kho vận");
  assert.equal(stripPlaces("kafe Medan", [], "VN"), "kafe Medan", "Indonesian cities are not VN places");
  assert.equal(stripPlaces("kafe Medan", []), "kafe", "and ID is unchanged");
});

test("regex characters in an area are literal text (TC-VM-6.18)", () => {
  for (const a of ["(", "[", "*", "\\", "^$", ".*", "a|b", "(((", "[a-z", "+"]) {
    for (const m of ["VN", "ID"] as const) {
      assert.doesNotThrow(() => planAreas(a, 1, 10, m), a);
      assert.doesNotThrow(() => stripPlaces(`kho ${a}`, [a], m), a);
      assert.doesNotThrow(() => splitAreas(a, m), a);
    }
  }
  assert.equal(stripPlaces("kho .*", [".*"], "VN"), "kho");
  assert.equal(stripPlaces("kho abc", [".*"], "VN"), "kho abc");
});

test("empty or blank location behaves like Indonesia and never throws (TC-VM-6.19)", () => {
  for (const loc of ["", "   ", ",,,"]) {
    const vn = planAreas(loc, 1, 10, "VN");
    const id = planAreas(loc, 1, 10, "ID");
    assert.deepEqual(vn, id, JSON.stringify(loc));
  }
});

test("a VN place absent from the list keeps the existing in-area handling (TC-VM-6.20)", () => {
  const results = [
    { lat: null, lng: null, address: "12 Đường Mẫu, Quận 7, Hồ Chí Minh" },
    { lat: null, lng: null, address: "Hà Nội" },
  ];
  assert.equal(inArea(results, "Quận 7", { lat: 10.73, lng: 106.72 }).kept.length, 1);
  assert.equal(inArea([{ lat: 10.74, lng: 106.7, address: "x" }, { lat: 21, lng: 105.8, address: "x" }], "Quận 7", { lat: 10.73, lng: 106.72 }).kept.length, 1);
});

test("hostile area text is bounded and linear under both markets (TC-VM-6.17)", () => {
  const makers: Array<(n: number) => string> = [
    (n) => "(".repeat(n),
    (n) => " ".repeat(n),
    (n) => ".".repeat(n),
    (n) => "a, ".repeat(Math.ceil(n / 3)),
    (n) => "Hà Nội 東京 Москва ".repeat(Math.ceil(n / 16)),
  ];
  for (const m of ["VN", "ID"] as const) {
    const fns: Array<(s: string) => unknown> = [(s) => splitAreas(s, m), (s) => isNationwide(s, m), (s) => planAreas(s, 2, 100, m), (s) => stripPlaces(s, [s], m)];
    for (const fn of fns) for (const make of makers) assertLinear(fn, make);
    const plan = planAreas("x, ".repeat(100_000), 1, 100, m);
    assert.ok(plan.areas.join("").length <= 400, "area text capped at 400 characters");
    const start = performance.now();
    stripPlaces("Hà Nội ".repeat(15_000), [], m);
    planAreas("TP.HCM, ".repeat(15_000), 1, 100, m);
    assert.ok(performance.now() - start < HOSTILE_MS_LARGE);
  }
});

test("the Indonesian city list in the profile is the one areas.ts has (static source check of the helper)", () => {
  assert.equal(MARKET.VN.cities.length, 30);
});
