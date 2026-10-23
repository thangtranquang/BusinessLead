import test from "node:test";
import assert from "node:assert/strict";
import { toWhatsapp } from "./whatsapp-format";

test("Markdown becomes WhatsApp syntax", () => {
  assert.equal(toWhatsapp("Kami **Contoh**."), "Kami *Contoh*.");
  assert.equal(toWhatsapp("## Layanan\n* web\n• aplikasi"), "*Layanan*\n\n- web\n- aplikasi");
  assert.equal(toWhatsapp("Ini ~~lama~~ baru dan __miring__."), "Ini ~lama~ baru dan _miring_.");
});

test("valid WhatsApp spans are kept as written", () => {
  assert.equal(toWhatsapp("Saya dari *Contoh Digital Agency*, _terbuka_ untuk konsultasi."), "Saya dari *Contoh Digital Agency*, _terbuka_ untuk konsultasi.");
});

test("unbalanced or spaced symbols are removed instead of shown", () => {
  assert.equal(toWhatsapp("Halo * Kak, ini *penting"), "Halo Kak, ini penting");
  assert.equal(toWhatsapp("kata * bold * di sini"), "kata bold di sini");
  assert.equal(toWhatsapp("file_name dan snake_case ok"), "file_name dan snake_case ok");
});

test("emphasis stays sparing", () => {
  const many = "*a1* *b2* *c3* *d4* *e5* *f6*";
  assert.equal((toWhatsapp(many).match(/\*/g) ?? []).length, 8);
  const long = `*${"kalimat panjang ".repeat(6).trim()}*`;
  assert.doesNotMatch(toWhatsapp(long), /\*/);
});

test("paragraphs and lists are spaced for a phone screen", () => {
  assert.equal(toWhatsapp("Halo, Kak.\nSaya dari X:\n- web\n- aplikasi\nTerima kasih."), "Halo, Kak.\nSaya dari X:\n\n- web\n- aplikasi\n\nTerima kasih.");
  assert.equal(toWhatsapp("a\n\n\n\nb"), "a\n\nb");
});

test("one unbroken block is split into greeting, body and closing", () => {
  const block = "Halo, Kak. Saya dari X. Kami membuat aplikasi dan website. Kami juga menerima IT outsourcing. Terima kasih.";
  assert.equal(toWhatsapp(block), "Halo, Kak.\n\nSaya dari X. Kami membuat aplikasi dan website. Kami juga menerima IT outsourcing.\n\nTerima kasih.");
  assert.equal(toWhatsapp("Halo, Kak. Terima kasih."), "Halo, Kak. Terima kasih.");
});

import { tidyWhatsappOutreach } from "./plain-text";

test("the first message greets with anh/chị and never guesses a gender (Vietnamese)", () => {
  assert.equal(tidyWhatsappOutreach("Chào,\n\nEm là Minh Anh đến từ Công ty Mẫu.", "vietnamese"), "Xin chào anh/chị,\n\nEm là Minh Anh đến từ Công ty Mẫu.");
  assert.equal(tidyWhatsappOutreach("Chào chị, em là Minh Anh.", "vietnamese"), "Xin chào anh/chị, em là Minh Anh.");
  assert.equal(tidyWhatsappOutreach("Xin chào anh/chị, em là Minh Anh.", "vietnamese"), "Xin chào anh/chị, em là Minh Anh.");
  assert.equal(tidyWhatsappOutreach("Xin chào chị Lan, em là Minh Anh.", "vietnamese"), "Xin chào chị Lan, em là Minh Anh.");
  assert.equal(tidyWhatsappOutreach("Anh/chị có muốn xem thử không ạ?", "vietnamese"), "Anh/chị có muốn xem thử không ạ?");
  // English drafts are not rewritten by the Vietnamese rules (nor, any more, by Indonesian ones)
  assert.equal(tidyWhatsappOutreach("Halo, Kak. Apakah Anda ingin berdiskusi tentang bisnis Anda?", "english"), "Halo, Kak. Apakah Anda ingin berdiskusi tentang bisnis Anda?");
});

test("review MINOR-3: a Vietnamese greeting is split into its own paragraph, with and without diacritics", () => {
  const body = "Em đến từ Công ty Mẫu. Bên em làm phần mềm đặt lịch cho quán cà phê. Anh/chị có cần xem thử không ạ? Em cảm ơn anh/chị.";
  assert.equal(toWhatsapp("Xin chào anh/chị, " + body), "Xin chào anh/chị,\n\nEm đến từ Công ty Mẫu. Bên em làm phần mềm đặt lịch cho quán cà phê. Anh/chị có cần xem thử không ạ?\n\nEm cảm ơn anh/chị.");
  assert.ok(toWhatsapp("Xin chao anh/chi, " + body).startsWith("Xin chao anh/chi,\n\n"));
  assert.ok(toWhatsapp("Chào anh/chị, " + body).startsWith("Chào anh/chị,\n\n"));
  assert.ok(toWhatsapp("Xin chào anh/chị, " + body.normalize("NFD")).startsWith("Xin chào anh/chị,\n\n".normalize("NFD")) || toWhatsapp("Xin chào anh/chị, " + body.normalize("NFD")).includes("\n\n"));
  // not a greeting: the word is inside another word
  assert.ok(!toWhatsapp("Chàoo anh. " + body).startsWith("Chàoo anh.\n\n"));
});
