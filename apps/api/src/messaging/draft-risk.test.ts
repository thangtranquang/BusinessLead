import test from "node:test";
import assert from "node:assert/strict";
import { HOSTILE_MS_LARGE, assertLinear } from "../common/hostile-limits";
import { RISK_RULES, draftRisks } from "./draft-risk";

const VI = "vietnamese" as const;
const EN = "english" as const;
const nfd = (s: string) => s.normalize("NFD");

test("TC-16.4: discount words are flagged unless the knowledge base has the word", () => {
  for (const w of ["giảm giá", "khuyến mãi", "ưu đãi", "miễn phí", "hoàn tiền"]) {
    const draft = `Dạ, bên em đang có ${w} cho anh/chị ạ.`;
    assert.ok(draftRisks(draft, [], VI).includes("discount"), w);
    assert.ok(draftRisks(nfd(draft), [], VI).includes("discount"), `NFD ${w}`);
    assert.ok(!draftRisks(draft, [`Chính sách: ${w} cho khách mới`], VI).includes("discount"), `known ${w}`);
  }
});

test("TC-16.5: bank details keep their risk id", () => {
  for (const w of ["số tài khoản", "chuyển khoản", "Vietcombank", "tài khoản ngân hàng"]) assert.deepEqual(draftRisks(`Anh/chị gửi ${w} giúp em nhé.`, [], VI), ["bank details"], w);
  assert.deepEqual(draftRisks("Dạ em xin gửi số tài khoản.", ["Số tài khoản của công ty: 0000"], VI), []);
});

test("TC-16.6: an amount of money is a price; a star count, a review count, a year and a phone number are not", () => {
  for (const amount of ["500.000đ", "500.000 ₫", "500000 VND", "2 triệu", "300 nghìn", "300 ngàn", "VNĐ 200", "1,5 triệu", "5k"]) {
    assert.ok(draftRisks(`Gói này chỉ ${amount} mỗi tháng.`, [], VI).includes("price"), amount);
  }
  for (const text of ["Quán có 5 sao", "Quán có 120 đánh giá", "Từ năm 2026", "Gọi số 0000 000 000 nhé"]) assert.ok(!draftRisks(text, [], VI).includes("price"), text);
  assert.ok(!draftRisks("Gói này chỉ 2.000.000đ mỗi tháng.", ["Gói tháng: 2.000.000đ"], VI).includes("price"));
});

test("TC-10.11 / DT-13 C10: price and discount are flagged; a knowledge base that has them silences them", () => {
  const c10 = "Xin chào anh/chị, em là Minh Anh đến từ Công ty Mẫu. Gói website chỉ từ 2.000.000đ, giảm giá 20% tuần này. Anh/chị có muốn xem không?";
  const first = draftRisks(c10, [], VI);
  assert.ok(first.includes("price") && first.includes("discount"), first.join());
  const second = draftRisks(c10, ["Gói website từ 2.000.000đ", "Có giảm giá 20% cho khách mới"], VI);
  assert.ok(!second.includes("price") && !second.includes("discount") && !second.includes("percentage"), second.join());
});

test("TC-16.7: reading meaning into a rating is flagged as an assumption", () => {
  assert.deepEqual(draftRisks("Với 120 đánh giá tuyệt vời thì chắc quán rất đông khách.", [], VI), ["assumption"]);
  assert.deepEqual(draftRisks("Quán có 120 đánh giá trên Google Maps.", [], VI), []);
});

test("honorific: a guessed single-gender address is flagged, a legitimate one is not", () => {
  for (const t of ["Xin chào anh, em là Minh Anh.", "Em thấy quán của anh có nhiều đánh giá tốt.", "Ông cần dịch vụ này không?", "Chào bà, em ở Công ty Mẫu.", "Mày có muốn mua không?", "Tao gửi báo giá nhé."]) {
    assert.ok(draftRisks(t, [], VI).includes("honorific"), t);
  }
  for (const t of ["Xin chào anh/chị, em là Minh Anh.", "Xin chào chị Lan, em là Minh Anh.", "Em muốn gặp ông chủ quán.", "Em là Minh Anh đến từ Công ty Mẫu.", "Anh em mình cùng làm."]) {
    assert.ok(!draftRisks(t, [], VI).includes("honorific"), t);
  }
  // a risk the knowledge base cannot excuse
  assert.ok(draftRisks("Xin chào anh, em là Minh Anh.", ["anh"], VI).includes("honorific"));
});

test("a good Vietnamese outreach has no risk (DT-13 C1, C3)", () => {
  assert.deepEqual(draftRisks("Xin chào anh/chị, em là Minh Anh đến từ Công ty Mẫu. Anh/chị có muốn xem mẫu lịch hẹn qua WhatsApp không ạ?", [], VI), []);
  assert.deepEqual(draftRisks("Dạ, em nhắn lại để hỏi anh/chị đã xem thông tin em gửi hôm trước chưa ạ?", [], VI), []);
});

test("links, emails and percentages are flagged in every language", () => {
  assert.deepEqual(draftRisks("Visit https://example.com or write to a@example.com for 90% off", [], EN).sort(), ["email", "link", "percentage"]);
  assert.deepEqual(draftRisks("Xem https://example.com hoặc viết thư a@example.com", [], VI).sort(), ["email", "link"]);
  assert.deepEqual(draftRisks("Xem https://example.com", ["https://example.com"], VI), []);
});

test("English drafts are judged by English rules only: no Indonesian rule and no honorific rule", () => {
  assert.deepEqual(draftRisks("Transfer ke rekening BCA saya", [], EN), []);
  assert.deepEqual(draftRisks("Dapat diskon dan gratis ongkir", [], EN), []);
  assert.deepEqual(draftRisks("Hello Bapak, Ibu and sir", [], EN), []);
  assert.deepEqual(draftRisks("We offer a discount on the first month", [], EN), ["discount"]);
  assert.deepEqual(draftRisks("Plans start at $199 per month", [], EN), ["price"]);
  assert.deepEqual(draftRisks("Wire transfer to our bank account", [], EN), ["bank details"]);
  assert.deepEqual(draftRisks("Rating 5.0 shows that customers trust you", [], EN), ["assumption"]);
  assert.deepEqual(draftRisks("Hi, I help local shops manage bookings.", [], EN), []);
});

test("Vietnamese text is not judged by the English rules, and the Indonesian words flag nothing", () => {
  assert.deepEqual(draftRisks("Transfer ke rekening BCA saya, diskon besar", [], VI), []);
});

test("the table is frozen, holds the same risk ids for both languages and is indexed with a normalised language", () => {
  assert.ok(Object.isFrozen(RISK_RULES));
  assert.deepEqual(Object.keys(RISK_RULES).sort(), ["english", "vietnamese"]);
  assert.deepEqual(RISK_RULES.vietnamese.map((r) => r.id), ["link", "email", "percentage", "discount", "bank details", "price", "assumption", "honorific"]);
  assert.deepEqual(RISK_RULES.english.map((r) => r.id).filter((id) => id !== "honorific"), ["link", "email", "percentage", "discount", "bank details", "price", "assumption"]);
  // a legacy or hostile language value reads as English and never reaches a prototype member
  assert.deepEqual(draftRisks("Visit https://example.com", [], "indonesian" as never), ["link"]);
  assert.deepEqual(draftRisks("Visit https://example.com", [], "__proto__" as never), ["link"]);
});

test("hostile drafts of 5,000 characters stay within the large limit", () => {
  for (const make of [(n: number) => "<".repeat(n), (n: number) => "a".repeat(n), (n: number) => "Ơ".repeat(n), (n: number) => "giảm giá ".repeat(Math.ceil(n / 9)).slice(0, n), (n: number) => "chắc ".repeat(Math.ceil(n / 5)).slice(0, n), (n: number) => "1".repeat(n)]) {
    const r = assertLinear((s) => draftRisks(s, [], VI), make);
    assert.ok(r.large < HOSTILE_MS_LARGE, String(r.large));
    const e = assertLinear((s) => draftRisks(s, [], EN), make);
    assert.ok(e.large < HOSTILE_MS_LARGE, String(e.large));
  }
});
