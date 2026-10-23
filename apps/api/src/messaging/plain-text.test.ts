import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { HOSTILE_MS_LARGE, assertLinear } from "../common/hostile-limits";
import { hasGuessedHonorific, neutralHonorific, neutralHonorificChat, tidyWhatsappOutreach } from "./plain-text";

const VI = "vietnamese" as const;
const EN = "english" as const;
const nfd = (s: string) => s.normalize("NFD");

// DT-11 (FR-25.1, FR-22.3): the first WhatsApp message to an unknown recipient
test("DT-11: a guessed single-gender address becomes anh/chị, a named one is left alone", () => {
  const cases: [string, string][] = [
    ["Xin chào anh, em là Minh Anh đến từ Công ty Mẫu.", "Xin chào anh/chị, em là Minh Anh đến từ Công ty Mẫu."],
    ["Chào chị, em là Minh Anh.", "Xin chào anh/chị, em là Minh Anh."],
    ["Xin chào ông, em là Minh Anh.", "Xin chào anh/chị, em là Minh Anh."],
    ["Xin chào bà, em là Minh Anh.", "Xin chào anh/chị, em là Minh Anh."],
    ["Em thấy quán của anh có nhiều đánh giá tốt.", "Em thấy quán của anh/chị có nhiều đánh giá tốt."],
    ["Xin chào chị Lan, em là Minh Anh.", "Xin chào chị Lan, em là Minh Anh."],
    ["Dạ anh/chị cần gì ạ?", "Dạ anh/chị cần gì ạ?"],
    ["Xin chào anh/chị, em là Minh Anh.", "Xin chào anh/chị, em là Minh Anh."],
    ["Xin chào,\n\nEm là Minh Anh.", "Xin chào anh/chị,\n\nEm là Minh Anh."],
    ["Chào, em là Minh Anh.", "Xin chào anh/chị, em là Minh Anh."],
    ["Chào bạn, em là Minh Anh.", "Chào bạn, em là Minh Anh."],
    ["Em muốn gặp ông chủ quán.", "Em muốn gặp ông chủ quán."],
    ["Ông cần dịch vụ này không?", "Anh/chị cần dịch vụ này không?"],
    ["Quán của anh Minh đẹp quá.", "Quán của anh Minh đẹp quá."],
    ["Anh em mình cùng làm nhé.", "Anh em mình cùng làm nhé."],
    ["Em là Nguyễn Văn Anh, đến từ Công ty Mẫu.", "Em là Nguyễn Văn Anh, đến từ Công ty Mẫu."],
    ["Bà ấy nói anh/chị là chủ quán.", "Bà ấy nói anh/chị là chủ quán."],
  ];
  for (const [input, expected] of cases) {
    assert.equal(tidyWhatsappOutreach(input, VI), expected, input);
    assert.equal(tidyWhatsappOutreach(nfd(input), VI), expected, `NFD ${input}`);
    assert.equal(tidyWhatsappOutreach(expected, VI), expected, `idempotent ${input}`);
  }
});

test("H7/H8: no Indonesian rewrite remains, and English text is not touched", () => {
  assert.equal(tidyWhatsappOutreach("Halo Kak, perkenalkan saya Minh.", VI), "Halo Kak, perkenalkan saya Minh.");
  assert.equal(tidyWhatsappOutreach("Halo, Kak. Jika Bapak/Ibu berkenan, kami siap.", VI), "Halo, Kak. Jika Bapak/Ibu berkenan, kami siap.");
  for (const t of ["Hi, I help local shops.", "Hello,\n\nI am Sam from Example Co. Would you like a demo?", "Halo, Kak. Apakah Anda ingin berdiskusi?", "Dear sir, anh, chị"]) {
    assert.equal(tidyWhatsappOutreach(t, EN), t);
    assert.equal(neutralHonorific(t, EN), t);
    assert.equal(neutralHonorificChat(t, EN), t);
  }
  assert.equal(neutralHonorific("agar Bapak bisa melihat", EN), "agar Bapak bisa melihat");
  assert.equal(neutralHonorificChat("Mana yang Mbak lihat simpel", EN), "Mana yang Mbak lihat simpel");
});

test("TC-10.20: the Vietnamese helpers add no Indonesian text and the source has no Indonesian honorific branch", () => {
  const good = "Xin chào anh/chị, em là Minh Anh đến từ Công ty Mẫu. Em hỗ trợ các quán cà phê quản lý lịch hẹn qua WhatsApp. Anh/chị có muốn xem thử không ạ?";
  for (const out of [tidyWhatsappOutreach(good, VI), neutralHonorific(good, VI), neutralHonorificChat(good, VI)]) {
    assert.equal(out, good);
    for (const w of ["Kak", "Kakak", "Salam", "Bapak", "Ibu", "Halo", "Anda"]) assert.ok(!out.includes(w), w);
  }
  const src = readFileSync(path.join(__dirname, "plain-text.ts"), "utf8");
  for (const w of ["Bapak", "Ibu", "Mbak", "Kakak", "Anda"]) assert.ok(!new RegExp(`\\b${w}\\b`).test(src), `${w} is still in plain-text.ts`);
});

test("TC-16.8 / 13.14: the email variant keeps the formal form and forces no WhatsApp greeting", () => {
  for (const t of ["Kính gửi Quý công ty,\n\nChúng tôi xin gửi thông tin.", "Xin chào anh/chị,\n\nEm xin gửi thông tin.", "Kính gửi Quý khách,"]) assert.equal(neutralHonorific(t, VI), t);
  assert.equal(neutralHonorific("Em thấy quán của anh có nhiều đánh giá tốt.", VI), "Em thấy quán của Quý khách có nhiều đánh giá tốt.");
  assert.equal(neutralHonorific("Xin chào chị Lan,", VI), "Xin chào chị Lan,");
});

test("a reply to a customer of unknown gender is addressed as anh/chị", () => {
  assert.equal(neutralHonorificChat("Dạ anh cho em xin số điện thoại ạ.", VI), "Dạ anh/chị cho em xin số điện thoại ạ.");
  assert.equal(neutralHonorificChat("Dạ chị Lan cho em xin số điện thoại ạ.", VI), "Dạ chị Lan cho em xin số điện thoại ạ.");
  assert.equal(neutralHonorificChat("Dạ anh/chị cần gì thêm không ạ?", VI), "Dạ anh/chị cần gì thêm không ạ?");
});

test("hasGuessedHonorific: the same scan the draft checks use", () => {
  for (const t of ["Em thấy quán của anh có nhiều đánh giá tốt.", "Ông cần dịch vụ này không?", "Dạ chị cho em hỏi ạ", "Xin chào bà, em là Minh Anh."]) assert.equal(hasGuessedHonorific(t), true, t);
  for (const t of ["anh/chị", "Xin chào chị Lan,", "Em muốn gặp ông chủ", "Minh Anh", "anh chị em", "Dạ anh/chị cần gì ạ?", "", "ok"]) assert.equal(hasGuessedHonorific(t), false, t);
  assert.equal(hasGuessedHonorific(null as unknown as string), false);
});

test("hostile input: the honorific scan is linear", () => {
  for (const make of [
    (n: number) => "anh ".repeat(Math.ceil(n / 4)).slice(0, n),
    (n: number) => "Anh ".repeat(Math.ceil(n / 4)).slice(0, n),
    (n: number) => "Xin chào " + " ".repeat(n),
    (n: number) => "ông ".repeat(Math.ceil(n / 4)).slice(0, n),
    (n: number) => "<".repeat(n),
  ]) {
    for (const fn of [(s: string) => tidyWhatsappOutreach(s, VI), (s: string) => neutralHonorific(s, VI), (s: string) => neutralHonorificChat(s, VI), hasGuessedHonorific]) {
      const r = assertLinear(fn, make);
      assert.ok(r.large < HOSTILE_MS_LARGE, String(r.large));
    }
  }
});
