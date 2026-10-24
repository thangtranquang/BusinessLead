// Indonesian regression snapshot — must not change in the Vietnam market feature.
// Expected values were recorded by running the code as it was BEFORE any market change; invented data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { messageText, parseReferrals, vcardPhones, type WaMessageLike } from "./wa-text";

/**
 * Shared-contact extraction as it behaves TODAY. The text matcher only knows Indonesian numbers (+62 / 62 / 08...):
 * a +84 number written in text is NOT matched by it (a card or vCard carries it through). Vietnamese behaviour is
 * tested in a separate file in the Vietnam market work and must never edit this one.
 */
test("parseReferrals (TC-VM-5.12)", () => {
  const rows: Array<[string, string, Array<{ name: string | null; phone: string }>]> = [
  ["plus 62 spaced", "Hubungi +62 812 3456 789", []],
  ["local with dashes", "Hubungi 0812-3456-789", [{ name: null, phone: "0812-3456-789" }]],
  ["local plain", "Hubungi 08123456789", [{ name: null, phone: "08123456789" }]],
  ["landline looking +62 21", "Hubungi +62 21 555 1234", []],
  ["62 without plus after label", "kontak: 628123456789", [{ name: null, phone: "628123456789" }]],
  ["two numbers", "Pak Budi 0812-3456-789 atau Bu Sari +62 813 1111 2222", [{ name: null, phone: "0812-3456-789" }]],
  ["+84 not matched today", "Hubungi +84 90 123 4567", []],
  ["84 plain not matched", "Hubungi 84901234567", []],
  ["0901 not matched (not 08)", "Hubungi 0901234567", []],
  ["number at the end of 4000 chars", "a".repeat(3980) + " 0812-3456-789", [{ name: null, phone: "0812-3456-789" }]],
  ["number after char 4000", "a".repeat(4001) + " 0812-3456-789", []],
  ["no number", "Terima kasih, nanti saya kabari", []],
  ["empty", "", []],
  ["same number twice", "0812-3456-789 dan +62 812 3456 789", [{ name: null, phone: "0812-3456-789" }]],
  ["six numbers (cap 5)", "0812-0001-111 0812-0002-111 0812-0003-111 0812-0004-111 0812-0005-111 0812-0006-111", [{ name: null, phone: "0812-0001-111 08" }, { name: null, phone: "0812-0003-111 08" }, { name: null, phone: "0812-0005-111 08" }]],
  ["preceded by digit", "12 0812-3456-789", [{ name: null, phone: "0812-3456-789" }]],
  ["preceded by plus", "x+0812-3456-789", []],
  ["contact card with name", "[Kontak: Contoh Digital Agency +62 812 3456 789]", [{ name: "Contoh Digital Agency", phone: "+62 812 3456 789" }]],
  ["contact card without name", "[Kontak: tanpa nama +62 812 3456 789]", [{ name: null, phone: "+62 812 3456 789" }]],
  ["contact card with +84", "[Kontak: Cong ty Mau +84 90 000 0000]", [{ name: "Cong ty Mau", phone: "+84 90 000 0000" }]],
  ["contact card two numbers", "[Kontak: Contoh +62 812 3456 789, +62 813 1111 2222]", [{ name: "Contoh", phone: "+62 812 3456 789" }, { name: "Contoh", phone: "+62 813 1111 2222" }]],
  ["card plus text number", "[Kontak: Contoh +62 812 3456 789] atau 0821-9999-888", [{ name: "Contoh", phone: "+62 812 3456 789" }, { name: null, phone: "0821-9999-888" }]],
  ["card without phone", "[Kontak: Contoh]", []],
  ["lowercase tag", "[kontak: Contoh +62 812 3456 789]", [{ name: "Contoh", phone: "+62 812 3456 789" }]],
  ];
  for (const [label, text, expected] of rows) assert.deepEqual(parseReferrals(text), expected, label);
});

test("vcardPhones (TC-VM-5.12)", () => {
  const rows: Array<[string, string | null | undefined, string[]]> = [
  ["waid line", "BEGIN:VCARD\nVERSION:3.0\nFN:Contoh\nTEL;type=CELL;waid=628123456789:+62 812-3456-789\nEND:VCARD", ["+628123456789"]],
  ["TEL only plus", "BEGIN:VCARD\nTEL:+62 812 3456 789\nEND:VCARD", ["+628123456789"]],
  ["TEL local starts 0", "BEGIN:VCARD\nTEL:0812-3456-789\nEND:VCARD", ["08123456789"]],
  ["TEL +84", "BEGIN:VCARD\nTEL;type=CELL:+84 90 000 0000\nEND:VCARD", ["+84900000000"]],
  ["waid 84", "BEGIN:VCARD\nTEL;waid=84900000000:+84 90 000 0000\nEND:VCARD", ["+84900000000"]],
  ["short TEL ignored", "BEGIN:VCARD\nTEL:1234567\nEND:VCARD", []],
  ["null", null, []],
  ["undefined", undefined, []],
  ["CRLF two numbers", "TEL:+62 812 3456 789\r\nTEL:+62 813 1111 2222", ["+628123456789", "+6281311112222"]],
  ];
  for (const [label, vcard, expected] of rows) assert.deepEqual(vcardPhones(vcard), expected, label);
});

test("messageText with shared contacts and markers (TC-VM-5.12)", () => {
  const rows: Array<[string, WaMessageLike | null, { markers?: boolean }, string]> = [
  ["contact card with waid", { contactMessage: { displayName: "Contoh Digital Agency", vcard: "BEGIN:VCARD\nTEL;waid=628123456789:+62 812 3456 789\nEND:VCARD" } }, {  }, "[Kontak: Contoh Digital Agency +628123456789]"],
  ["contact card with +84", { contactMessage: { displayName: "Cong ty Mau", vcard: "BEGIN:VCARD\nTEL;type=CELL:+84 90 000 0000\nEND:VCARD" } }, {  }, "[Kontak: Cong ty Mau +84900000000]"],
  ["contact card local number", { contactMessage: { displayName: "Contoh", vcard: "TEL:0812-3456-789" } }, {  }, "[Kontak: Contoh 08123456789]"],
  ["contact card without name", { contactMessage: { displayName: "", vcard: "TEL:+62 812 3456 789" } }, {  }, "[Kontak: tanpa nama +628123456789]"],
  ["contact card plus caption words", { conversation: "Silakan hubungi dia", contactMessage: { displayName: "Contoh", vcard: "TEL:+62 812 3456 789" } }, {  }, "[Kontak: Contoh +628123456789] Silakan hubungi dia"],
  ["contacts array", { contactsArrayMessage: { contacts: [{ displayName: "A Contoh", vcard: "TEL:+62 812 3456 789" }, { displayName: "B Contoh", vcard: "TEL:+84 90 000 0000" }] } }, {  }, "[Kontak: A Contoh +628123456789] [Kontak: B Contoh +84900000000]"],
  ["plain text", { conversation: "Halo kak" }, {  }, "Halo kak"],
  ["image with caption and markers", { imageMessage: { caption: "Untuk fleet cm segini" } }, { markers: true }, "[Gambar] Untuk fleet cm segini"],
  ["document marker", { documentMessage: { fileName: "Brosur.pdf" } }, { markers: true }, "[Dokumen: Brosur.pdf]"],
  ["document marker off", { documentMessage: { fileName: "Brosur.pdf" } }, {  }, ""],
  ["voice marker", { audioMessage: {  } }, { markers: true }, "[Pesan suara]"],
  ["sticker marker", { stickerMessage: {  } }, { markers: true }, "[Stiker]"],
  ["null message", null, {  }, ""],
  ];
  for (const [label, message, opts, expected] of rows) assert.equal(messageText(message, opts), expected, label);
});
