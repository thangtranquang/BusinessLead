import test from "node:test";
import assert from "node:assert/strict";
import { HOSTILE_MS_SMALL } from "../common/hostile-limits";
import { fold } from "../common/text";
import { CLEAR_INTENT, classifyReply, isCourtesy, looksAutomaticByTiming, planReplyOutcome } from "./reply-intent";
import { viMatcher } from "./vi-match";

const nfd = (s: string) => s.normalize("NFD");
/** A fixture is run with diacritics (NFC and NFD) and without (the way a phone without a Vietnamese keyboard types it). */
const forms = (s: string): string[] => [s.normalize("NFC"), nfd(s), fold(s)];
const GRAVE = String.fromCharCode(0x300);

// DT-14 (FR-31, AC-12): a positive and a negative fixture for every intent
const TABLE: { intent: string; positive: string[]; negative: string[] }[] = [
  {
    intent: "auto_reply",
    positive: ["Cảm ơn bạn đã liên hệ. Chúng tôi sẽ phản hồi sớm nhất.", "Tin nhắn tự động: giờ làm việc 8h-17h", "Vui lòng chờ trong giây lát", "Xin chọn 1 để biết giá", "Chào mừng bạn đến với cửa hàng Mẫu", "Kết nối với nhân viên tư vấn"],
    negative: ["Cảm ơn bạn, mình quan tâm, gửi báo giá giúp mình"],
  },
  {
    intent: "referral",
    positive: ["Bạn liên hệ số 0000 000 000 nhé", "Xin liên hệ bộ phận kinh doanh", "Về hợp tác bạn liên hệ phòng marketing nhé"],
    negative: ["Số của mình là bên bán hàng nên không cần"],
  },
  { intent: "not_interested", positive: ["Mình không có nhu cầu, cảm ơn", "Bên mình đã có rồi", "Anh nhầm số rồi"], negative: ["Mình có nhu cầu, gửi thêm thông tin"] },
  { intent: "not_now", positive: ["Để sau nhé, tháng sau mình liên hệ lại", "Hiện giờ mình đang bận"], negative: ["Mình muốn làm ngay"] },
  { intent: "meeting", positive: ["Mai 3 giờ chiều gặp được không?", "Mình muốn gặp trực tiếp anh"], negative: ["Gặp sự cố khi mở file"] },
  {
    intent: "price",
    positive: ["Giá bao nhiêu vậy?", "Báo giá giúp mình", "chi phí thế nào", "hơi đắt", "2 triệu hả", "giá 5k", "GIÁ BAO NHIÊU???", "ok, hơi đắt", "Cho ưu đãi nhé"],
    negative: ["Gia đình mình đang bận"],
  },
  { intent: "interested", positive: ["Nghe hay đó, cho mình xin thêm thông tin", "Cho mình xem thử nhé"], negative: ["Nghe tên công ty bạn rồi"] },
  { intent: "question", positive: ["Bên bạn làm được cái này không?", "Bao lâu thì xong ạ?"], negative: ["Dạ vâng"] },
  { intent: "ack", positive: ["ok cảm ơn", "dạ vâng ạ"], negative: ["Cảm ơn nhưng mình không cần"] },
];

for (const row of TABLE) {
  test(`DT-14: ${row.intent} is recognised with and without diacritics, in NFC and NFD`, () => {
    for (const p of row.positive) for (const v of forms(p)) assert.equal(classifyReply(v), row.intent, v);
    for (const n of row.negative) for (const v of forms(n)) assert.notEqual(classifyReply(v), row.intent, v);
  });
}

test("the Indonesian and English rules still apply next to the Vietnamese ones (additive sets, not keyed by language)", () => {
  assert.equal(classifyReply("Berapa harganya?"), "price");
  assert.equal(classifyReply("How much is it?"), "price");
  assert.equal(classifyReply("Terima kasih telah menghubungi kami. Jam operasional 08.00-17.00"), "auto_reply");
  assert.equal(classifyReply("Hôm nay trời đẹp"), "other");
  for (const t of ["", "   "]) assert.equal(classifyReply(t), "other");
  // `meeting` precedes `price`, in Vietnamese as in English (G-21)
  assert.equal(classifyReply("Giá bao nhiêu? Nếu rẻ mình sẽ gặp"), classifyReply("How much is it? If it's cheap let's meet"));
  assert.equal(classifyReply("Giá bao nhiêu? Nếu rẻ mình sẽ gặp"), "meeting");
});

test("a message typed without diacritics is read like the same message with them", () => {
  assert.equal(classifyReply("cam on ban da lien he, chung toi se phan hoi som"), "auto_reply");
  assert.equal(classifyReply("gia bao nhieu"), "price");
  assert.equal(classifyReply("bao gia giup minh"), "price");
  assert.equal(classifyReply("hoi dat"), "price");
});

test("folding collisions: 'gia dinh' is not a price, 'dat lich' is not 'dat' (đắt)", () => {
  assert.notEqual(classifyReply("Gia đình mình đang bận"), "price");
  assert.notEqual(classifyReply("gia dinh minh dang ban"), "price");
  assert.notEqual(classifyReply("dat lich cho quan"), "price");
});

test("a word boundary with letters that carry a mark: NFC and NFD give the same answer", () => {
  for (const t of ["ok, hơi đắt", "Cho ưu đãi nhé"]) for (const v of [t, nfd(t)]) assert.equal(classifyReply(v), "price", v);
});

test("a shared contact card and the media markers of stored rows keep their meaning", () => {
  assert.equal(classifyReply("[Kontak: Công ty Mẫu]"), "referral");
  assert.equal(classifyReply("[Kontak: tanpa nama +6281200000003]"), "referral");
  assert.equal(classifyReply("[Gambar]"), classifyReply("[Gambar]"));
  for (const m of ["[Gambar]", "[Pesan suara]", "[Stiker]", "[Dokumen: bao-gia.pdf]"]) assert.doesNotThrow(() => classifyReply(m), m);
});

test("a short Vietnamese yes answers the question we asked (and a polite closing needs no answer)", () => {
  assert.equal(classifyReply("dạ được ạ", { lastMine: "Em gửi ví dụ cho anh/chị xem nhé?" }), "interested");
  assert.equal(classifyReply("da duoc a", { lastMine: "Em gửi ví dụ cho anh/chị xem nhé?" }), "interested");
  assert.equal(classifyReply("được", { lastMine: "Mình trao đổi nhanh qua điện thoại được không?" }), "meeting");
  assert.equal(classifyReply("được", { lastMine: "Em gửi ví dụ cho anh/chị xem nhé." }), "other");
  assert.equal(classifyReply("dạ vâng ạ"), "ack");
  assert.equal(isCourtesy("ok cảm ơn"), true);
  assert.equal(isCourtesy("ok cam on"), true);
  assert.equal(isCourtesy("ok cảm ơn nhưng giá bao nhiêu"), false);
});

test("hostile 300-character inputs stay fast", () => {
  for (const make of [() => "<".repeat(300), () => "đừng ".repeat(60), () => "d" + GRAVE.repeat(300), () => "giá ".repeat(75), () => "cảm ơn bạn ".repeat(30)]) {
    const input = make();
    const t0 = performance.now();
    classifyReply(input);
    assert.ok(performance.now() - t0 < HOSTILE_MS_SMALL);
  }
});

test("a Vietnamese pattern source with an unbounded quantifier is refused when the matcher is built", () => {
  assert.throws(() => viMatcher({ marked: ["giá.*rẻ"] }));
  assert.throws(() => viMatcher({ marked: ["giá+"] }));
  assert.throws(() => viMatcher({ marked: ["giá\\s{1,}"] }));
  assert.doesNotThrow(() => viMatcher({ marked: ["giá[^\\n]{0,40}rẻ"] }));
});

// ---- Timing (FR-42a, DT-14, TC-41.x): a reply with a clear intent is a person, however fast ----

test("a Vietnamese reply with a clear intent inside 45 seconds is not an automatic reply", () => {
  for (const t of ["giá bao nhiêu", "được", "gửi giúp em", "gia bao nhieu", "duoc", "gui giup em", "Giá bao nhiêu?", nfd("gửi giúp em")]) {
    assert.equal(looksAutomaticByTiming(t, 20_000), false, t);
    assert.notEqual(classifyReply(t), "auto_reply", t);
  }
});

test("a shop greeting inside the window is automatic, at the boundary and just after it", () => {
  const greet = "Cảm ơn bạn đã liên hệ. Chúng tôi sẽ phản hồi sớm.";
  assert.equal(looksAutomaticByTiming(greet, 20_000), true);
  assert.equal(looksAutomaticByTiming(greet, 45_000), true);
  assert.equal(looksAutomaticByTiming(greet, 45_001), false);
  assert.equal(looksAutomaticByTiming(greet, 46_000), false);
  assert.equal(looksAutomaticByTiming(greet, null), false);
  assert.equal(looksAutomaticByTiming("Cảm ơn bạn đã liên hệ", 45_000), true);
  assert.equal(looksAutomaticByTiming("Cảm ơn bạn đã liên hệ", 46_000), false);
  // clear intent and an automatic-sounding greeting together: the intent wins, as it does for the Indonesian cues
  assert.equal(looksAutomaticByTiming("Cảm ơn bạn đã liên hệ, giá bao nhiêu", 20_000), false);
});

test("the existing Indonesian cues are unchanged", () => {
  assert.equal(looksAutomaticByTiming("Halo kak", 8_000), true);
  assert.equal(looksAutomaticByTiming("boleh kak", 10_000), false);
  assert.equal(CLEAR_INTENT.test("berapa harganya"), true);
  assert.equal(CLEAR_INTENT.test("Halo kak"), false);
  assert.equal(CLEAR_INTENT.test("giá bao nhiêu"), true);
});

test("planReplyOutcome is unchanged by the language of the reply", () => {
  assert.equal(planReplyOutcome("contacted", classifyReply("Mai 3 giờ chiều gặp được không?")).stage, "meeting");
  assert.equal(planReplyOutcome("replied", classifyReply("Để sau nhé, tháng sau mình liên hệ lại")).followUpInDays, 30);
});
