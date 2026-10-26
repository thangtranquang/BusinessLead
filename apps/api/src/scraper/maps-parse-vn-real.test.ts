import test from "node:test";
import assert from "node:assert/strict";
import { parseCard, type RawCard } from "./maps-parse";

/**
 * Card shapes observed on a REAL Vietnamese Google Maps results page (hl=vi, vi-VN), with INVENTED names, streets and numbers.
 * What the real page showed: the rating label reads "5,0 sao"; the info row reads "Category · Address" with the address
 * usually WITHOUT a street word ("· Điện Biên Phủ", "· 311 D5 Khu Xyz", a plus code); the hours row is
 * "Đang mở cửa · Đóng cửa vào 17:00 · +84 …" and carries the phone number.
 */
function card(over: Partial<RawCard>): RawCard {
  return { name: "Công ty TNHH Mẫu Một", ariaSao: "5,0 sao", ratingText: "5,0", hrefs: [], ...over } as RawCard;
}

test("address is the second segment of the Category · Address row, even without a street word", () => {
  const c = parseCard(
    card({
      rows: ["5,0", "Công ty xuất nhập khẩu · Điện Biên PhủĐang mở cửa · Đóng cửa vào 17:00 · +84 900 000 001", "Công ty xuất nhập khẩu · Điện Biên Phủ", "Đang mở cửa · Đóng cửa vào 17:00 · +84 900 000 001"],
      spans: ["Công ty TNHH Mẫu Một", "5,0", "Công ty xuất nhập khẩu", "· Điện Biên Phủ", "·", "Điện Biên Phủ", "Đang mở cửa · Đóng cửa vào 17:00", "Đang mở cửa", "· +84 900 000 001", "+84 900 000 001"],
    }),
    "VN",
  );
  assert.equal(c.category, "Công ty xuất nhập khẩu");
  assert.equal(c.address, "Điện Biên Phủ");
  assert.equal(c.phone, "84900000001");
  assert.equal(c.rating, "5.0");
});

test("a numbered address and a plus-code address are kept as the address", () => {
  const a = parseCard(card({ rows: ["Văn phòng công ty · 202Bis Điện Biên Phủ", "Đang mở cửa · Đóng cửa vào 17:00 · +84 28 0000 0002"], spans: ["+84 28 0000 0002"] }), "VN");
  assert.equal(a.address, "202Bis Điện Biên Phủ");
  const b = parseCard(card({ rows: ["Trung tâm đào tạo · QPG2+757 City", "Mở cả ngày · +84 900 000 003"], spans: ["+84 900 000 003"] }), "VN");
  assert.equal(b.address, "QPG2+757 City");
});

test("the category, a name containing 'thành phố' or 'KCN', and the hours are never the address (regression: 'phố' in 'thành phố')", () => {
  const c = parseCard(
    card({
      name: "Văn phòng KCN và Chế xuất thành phố Mẫu",
      rows: ["Văn phòng chính quyền thành phố", "Đang mở cửa · Đóng cửa vào 17:00 · +84 28 0000 0004"],
      spans: ["Văn phòng KCN và Chế xuất thành phố Mẫu", "Văn phòng chính quyền thành phố", "Hiệp Hội Các Doanh Nghiệp Kcn Mẫu", "+84 28 0000 0004"],
    }),
    "VN",
  );
  assert.equal(c.address, "");
});

test("a row with hours or a phone as its second segment is not an address", () => {
  const c = parseCard(card({ rows: ["Công ty logistics · Đang mở cửa", "Công ty logistics · +84 900 000 005"], spans: [] }), "VN");
  assert.equal(c.address, "");
});

test("icon glyphs (private-use characters) are never an address", () => {
  const icon = String.fromCharCode(0xf54a);
  const only = parseCard(card({ rows: [`Công ty · ${icon}`], spans: [] }), "VN");
  assert.equal(only.address, "");
  const mixed = parseCard(card({ rows: [`Công ty · ${icon}35 Nguyễn Bỉnh Khiêm`], spans: [] }), "VN");
  assert.equal(mixed.address, "35 Nguyễn Bỉnh Khiêm");
});

test("a card with no address row stays valid and invents nothing", () => {
  const c = parseCard(card({ rows: ["Chưa có bài đánh giá", "Công ty"], spans: ["Công ty"] }), "VN");
  assert.equal(c.address, "");
  assert.equal(c.category, "Công ty");
});

test("Indonesian cards keep their address reading (regression)", () => {
  const c = parseCard(
    { name: "Toko Mawar", ariaStar: "4.5 stars 120 Reviews", ratingText: "4.5", rows: ["Toko bunga · Jl. Mawar No. 3", "Buka · 08.00"], spans: ["Jl. Mawar No. 3", "0812 0000 0006"], hrefs: [] } as RawCard,
    "ID",
  );
  assert.equal(c.address, "Jl. Mawar No. 3");
});
