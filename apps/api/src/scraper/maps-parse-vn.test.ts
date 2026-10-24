// Vietnamese Maps card parsing (TC-VM-4.14, 7.1 to 7.14). SIMULATED: every card here is an invented snippet written from
// documentation, never a real business and never checked against a real Vietnamese Maps page (TC-VM-7.16 is manual).
import { test } from "node:test";
import assert from "node:assert/strict";
import { FEED_FALLBACK_SELECTOR, SEARCH_BOX_SELECTOR, isEndOfList, looksLikeAddress, looksLikePhone, normalizeRating, parseBareRating, parseCard, parseReviewCount, pickCategory, toLeadPhone, type RawCard } from "./maps-parse";
import { assertLinear } from "../common/hostile-limits";

const FIXTURE: RawCard = {
  name: "Công ty Mẫu Logistics",
  ariaStar: "",
  ariaSao: "4,6 sao",
  ratingText: "",
  spans: ["4,6", "(1.234)", "Đại lý hải quan", "·", "12 Đường Mẫu, Phường Bến Nghé, Quận 1", "Mở cửa lúc 08:00", "(028) 3822 1234"],
  rows: ["4,6(1.234)", "Đại lý hải quan · 12 Đường Mẫu, Phường Bến Nghé, Quận 1", "Mở cửa lúc 08:00 · (028) 3822 1234"],
  hrefs: ["https://www.google.com/maps/place/Cong+ty+Mau/@10.77,106.70,17z/data=!3d10.7712!4d106.7001", "https://congtymau.example.com/"],
};

test("full fixture card under VN (TC-VM-7.1)", () => {
  const c = parseCard(FIXTURE, "VN");
  assert.equal(c.rating, "4.6");
  assert.equal(c.reviewCount, 1234);
  assert.equal(c.category, "Đại lý hải quan");
  assert.equal(c.address, "12 Đường Mẫu, Phường Bến Nghé, Quận 1");
  assert.equal(c.phone, "02838221234");
  assert.equal(c.website, "https://congtymau.example.com/");
  assert.equal(c.hasWebsite, true);
  assert.ok(c.referenceLink.includes("google.com/maps/place"));
});

test("rating shapes (TC-VM-7.2)", () => {
  for (const t of ["4,6", "4.6", "4,6 sao", "4.6 sao", "(4,6)"]) assert.equal(normalizeRating(t, "VN"), "4.6", t);
  assert.equal(normalizeRating("4,67"), "4.6", "the Indonesian quirk stays");
  assert.equal(normalizeRating("4,6 sao"), "4.6");
});

test("review count shapes (TC-VM-7.3)", () => {
  const rows: Array<[string, number]> = [["(1.234)", 1234], ["(1,234)", 1234], ["1.234 bài đánh giá", 1234], ["(12)", 12], ["(1.234.567)", 1234567], ["5 đánh giá", 5]];
  for (const [t, n] of rows) assert.equal(parseReviewCount(t, "VN"), n, t);
  for (const t of ["", "abc", "(abc)", "1.234", "(1.23)", "(12345678901234)"]) assert.equal(parseReviewCount(t, "VN"), null, t);
  assert.equal(parseReviewCount("(1.234)"), 1234, "ID reads the same shape as before");
});

test("a bare (4,6) is a rating, not a count (TC-VM-7.4)", () => {
  for (const t of ["(4,6)", "(4.6)"]) {
    assert.equal(parseReviewCount(t, "VN"), null);
    assert.equal(parseBareRating(t), "4.6");
  }
  const card = parseCard({ ...FIXTURE, ariaSao: "", spans: ["(4,6)"] }, "VN");
  assert.equal(card.rating, "4.6");
  assert.equal(card.reviewCount, null);
});

test("state and hours rows are never a category, only under VN (TC-VM-7.5, 7.6, 7.11)", () => {
  const states = ["Mở cửa", "Đóng cửa", "Mở cửa cả ngày", "Đóng cửa vĩnh viễn", "Tạm thời đóng cửa", "Mở cửa lúc 08:00", "Đóng cửa lúc 17:00", "Đang mở cửa", "Quảng cáo", "Mo cua", "DONG CUA", "MỞ CỬA", "Địa chỉ", "Điện thoại", "Trang web"];
  for (const s of states) {
    assert.equal(pickCategory([s], "VN"), "", s);
    assert.equal(pickCategory([s, "Đại lý hải quan · 12 Đường Mẫu"], "VN"), "Đại lý hải quan", s);
    assert.equal(pickCategory([s]), s, "Indonesia: not filtered, as before");
  }
  assert.equal(pickCategory(["Đường Mẫu, Quận 1", "Cửa hàng quà tặng · Quận 1"], "VN"), "Cửa hàng quà tặng");
  assert.equal(pickCategory(["Quán cà phê · 5 Phố Mẫu"], "VN"), "Quán cà phê");
  assert.equal(pickCategory(["Mở cửa lúc 08:00 · Đóng cửa lúc 17:00"], "VN"), "");
  assert.equal(pickCategory(["Buka", "Toko Kamera · Jl. Mawar 1"], "VN"), "Toko Kamera", "Indonesian words still skipped under VN");
});

test("an hours row is not an address (TC-VM-7.7) and Vietnamese address words are (TC-VM-7.8)", () => {
  assert.equal(looksLikeAddress("Mở cửa lúc 08:00 · Đóng cửa lúc 17:00", "VN"), false);
  for (const a of ["Đường Mẫu", "Phố Mẫu", "Số 5", "Phường 3", "Xã Mẫu", "Quận 7", "Huyện Mẫu", "KCN Mẫu", "Ngõ 12", "Hẻm 20", "Tổ 4", "Jl. Mawar No. 3", "12 Đường Mẫu, Phường Bến Nghé"]) assert.equal(looksLikeAddress(a, "VN"), true, a);
  assert.equal(looksLikeAddress("Quận 7", "ID"), false, "no Vietnamese word alters an Indonesian parse");
  assert.equal(looksLikeAddress("Jl. Mawar No. 3", "ID"), true);
});

test("phone shapes (TC-VM-7.9)", () => {
  for (const p of ["(028) 3822 1234", "0901 234 567", "+84 90 123 4567", "0901234567", "090.123.4567", "+62 812 0000 0001", "081234567890"]) assert.equal(looksLikePhone(p, "VN"), true, p);
  for (const p of ["12 Đường Mẫu", "2024", "(1.234)", "08:00", "4,6", "Mở cửa lúc 08:00"]) assert.equal(looksLikePhone(p, "VN"), false, p);
  assert.equal(looksLikePhone("(028) 3822 1234", "ID"), false, "Indonesia keeps its own rule");
  assert.equal(looksLikePhone("0812-3456-7890", "ID"), true);
});

test("end of the list and selectors (TC-VM-4.14, 7.10), SIMULATED", () => {
  assert.equal(isEndOfList("... Bạn đã xem hết danh sách ..."), true);
  assert.equal(isEndOfList("Anda telah mencapai akhir daftar"), true);
  assert.equal(isEndOfList("You've reached the end of the list"), true);
  assert.equal(isEndOfList("still scrolling"), false);
  assert.ok(FEED_FALLBACK_SELECTOR.includes("Kết quả") && FEED_FALLBACK_SELECTOR.includes("Hasil") && FEED_FALLBACK_SELECTOR.includes("Results"));
  assert.ok(SEARCH_BOX_SELECTOR.includes("Tìm kiếm trên Google Maps") && SEARCH_BOX_SELECTOR.includes("Search Google Maps"));
});

test("the same card under ID keeps the Indonesian reading; no market means ID (TC-VM-7.11)", () => {
  const id = parseCard(FIXTURE, "ID");
  assert.deepEqual(parseCard(FIXTURE), id);
  assert.equal(id.phone, "", "(028) is not an Indonesian phone shape");
  assert.equal(id.rating, "N/A", "no star label, no rating text");
  assert.equal(id.reviewCount, 1234);
  assert.equal(id.address, "");
  const indo: RawCard = { name: "Toko Kamera A", ariaStar: "4.5 stars 1,234 Reviews", ariaSao: "", ratingText: "", spans: ["Jl. Mawar No. 1", "+62 812 3456 7890"], rows: ["Toko Kamera · Jl. Mawar No. 1"], hrefs: [] };
  const c = parseCard(indo);
  assert.deepEqual([c.rating, c.reviewCount, c.address, c.phone, c.category], ["4.5", 1234, "Jl. Mawar No. 1", "081234567890", "Toko Kamera"]);
});

test("a card without a phone keeps the lead and invents nothing (TC-VM-7.12)", () => {
  const c = parseCard({ ...FIXTURE, spans: ["Đại lý hải quan"], hrefs: [] }, "VN");
  assert.equal(c.phone, "");
  assert.equal(c.website, "");
  assert.equal(c.hasWebsite, false);
  assert.equal(c.referenceLink, "");
});

test("unexpected wording degrades without throwing (TC-VM-7.13)", () => {
  for (const aria of ["Xếp hạng 4,6", "Not rated", "", "garbage ☃"]) {
    const c = parseCard({ ...FIXTURE, ariaSao: aria, spans: [], rows: [] }, "VN");
    assert.equal(c.rating, "N/A", aria);
    assert.equal(c.reviewCount, null, aria);
  }
  assert.doesNotThrow(() => parseCard({ name: "x" } as unknown as RawCard, "VN"));
  assert.equal(toLeadPhone(undefined, "VN"), "");
  assert.equal(normalizeRating(undefined, "VN"), "");
});

test("hostile card text is linear and bounded (TC-VM-7.14)", () => {
  const makers: Array<(n: number) => string> = [(n) => "<".repeat(n), (n) => "(".repeat(n), (n) => "Đường ".repeat(Math.ceil(n / 6)), (n) => "1".repeat(n), (n) => " ".repeat(n), (n) => "1.234 ".repeat(Math.ceil(n / 6))];
  const fns: Array<(s: string) => unknown> = [
    (s) => normalizeRating(s, "VN"),
    (s) => parseReviewCount(s, "VN"),
    (s) => pickCategory([s], "VN"),
    (s) => looksLikeAddress(s, "VN"),
    (s) => looksLikePhone(s, "VN"),
    (s) => toLeadPhone(s, "VN"),
    (s) => isEndOfList(s),
    (s) => parseCard({ ...FIXTURE, ariaSao: s, ratingText: s, spans: [s, s], rows: [s] }, "VN"),
  ];
  for (const fn of fns) for (const make of makers) assertLinear(fn, make);
  assert.ok(toLeadPhone("1".repeat(100_000), "VN").length <= 64, "output bounded");
});

test("VN phone text becomes digits only; Indonesia keeps the 62 to 0 rewrite", () => {
  assert.equal(toLeadPhone("+84 90 123 4567", "VN"), "84901234567");
  assert.equal(toLeadPhone("(028) 3822 1234", "VN"), "02838221234");
  assert.equal(toLeadPhone("+62 812 3456 7890", "ID"), "081234567890");
  assert.equal(toLeadPhone("+62 812 3456 7890"), "081234567890");
  assert.equal(toLeadPhone("0812-3456-7890", "ID"), "081234567890");
});
