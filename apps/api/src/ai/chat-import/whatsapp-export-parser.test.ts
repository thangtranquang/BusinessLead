import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseWhatsAppExport, MAX_MESSAGE_CHARS } from "./whatsapp-export-parser";
import { computeStyleStats } from "./style-stats";
import { assertLinear, HOSTILE_MS_LARGE } from "../../common/hostile-limits";
import { nfc } from "../../common/text";

// Invisible characters are built from code points on purpose: no raw bidi or no-break characters live in this file.
const LRM = String.fromCharCode(0x200e);
const NBSP = String.fromCharCode(0x00a0);
const NNBSP = String.fromCharCode(0x202f);

const ANDROID_ID = `21/07/26 16.49 - Pesan dan telepon terenkripsi end-to-end.
21/07/26 16.50 - ${LRM}Budi: Halo kak, ready kebaya kutubaru?
22/07/26 09.01 - Sari: Ready kak 🙏
Mau tanggal berapa?
Nanti saya cek dulu ya
22/07/26 09.02 - Budi: <Media tidak disertakan>
22/07/26 09.03 - Sari: Pesan ini dihapus
23/07/26 10.00 - Sari: IMG-20260723-WA0001.jpg (file terlampir)`;

test("Android Indonesian layout, multi-line, media, deleted", () => {
  const r = parseWhatsAppExport(ANDROID_ID);
  assert.deepEqual(r.senders, ["Budi", "Sari"]);
  assert.equal(r.systemLines, 1);
  assert.equal(r.messages.length, 4); // deleted message dropped
  assert.equal(r.messages[1].text, "Ready kak 🙏\nMau tanggal berapa?\nNanti saya cek dulu ya");
  assert.equal(r.messages[2].isMedia, true);
  assert.equal(r.messages[3].isMedia, true);
  assert.equal(r.dateOrder, "dmy");
  assert.equal(r.messages[0].at.toISOString(), "2026-07-21T16:50:00.000Z");
});

test("iOS layout with seconds", () => {
  const r = parseWhatsAppExport("[21/07/2026, 16.49.12] Budi: Halo\n[21/07/2026, 16.50.00] Sari: Hai");
  assert.equal(r.messages.length, 2);
  assert.equal(r.messages[1].sender, "Sari");
});

test("US layout with AM/PM is detected as month-first", () => {
  const r = parseWhatsAppExport("7/21/26, 4:49 PM - Budi: Hi\n7/22/26, 12:05 AM - Sari: Hello");
  assert.equal(r.dateOrder, "mdy");
  assert.equal(r.messages[0].at.toISOString(), "2026-07-21T16:49:00.000Z");
  assert.equal(r.messages[1].at.toISOString(), "2026-07-22T00:05:00.000Z");
});

test("system lines do not swallow the next text and colons in text are kept", () => {
  const r = parseWhatsAppExport("01/02/26 10.00 - Budi mengubah subjek grup\n01/02/26 10.01 - Budi: Jam 10:30 ya");
  assert.equal(r.messages.length, 1);
  assert.equal(r.messages[0].text, "Jam 10:30 ya");
});

test("garbage before the first header is counted, not crashed on", () => {
  const r = parseWhatsAppExport("random\n01/02/26 10.01 - Budi: ok");
  assert.equal(r.skippedLines, 1);
  assert.equal(r.messages.length, 1);
});

test("bare media file names are media placeholders", () => {
  const r = parseWhatsAppExport("01/02/26 10.00 - Budi: IMG-20260201-WA0003.jpg\n01/02/26 10.01 - Budi: PTT-20260201-WA0001.opus");
  assert.equal(r.messages.every((m) => m.isMedia), true);
});

test("attachment markers in front of a caption are not part of the caption", () => {
  const chat = parseWhatsAppExport([
    "12/10/25 09.00 - Budi: IMG-20251012-WA0001.jpg (file attached)",
    "ini foto barangnya kak",
    "12/10/25 09.01 - Budi: <attached: 00001-PHOTO-2025.jpg> siap kak",
    "12/10/25 09.02 - Budi: <Media omitted>",
  ].join("\n"));
  assert.deepEqual(chat.messages.map((m) => m.text), ["ini foto barangnya kak", "siap kak", "<Media omitted>"]);
  assert.deepEqual(chat.messages.map((m) => m.isMedia), [false, false, true]);
});

// ---------------------------------------------------------------------------------------------------------------------------
// Regression (TC-31.1, 31.6, 31.7, 31.10): English, Indonesian and other-locale exports parse EXACTLY as before this change.
// The expected values below were produced by the parser as it was before Vietnamese support (recorded, not hand-written).
// ---------------------------------------------------------------------------------------------------------------------------
const BASELINE_FIXTURES: Record<string, string> = {
  englishAndroid: [
    "7/21/26, 4:49 PM - Messages and calls are end-to-end encrypted.",
    "7/21/26, 4:50 PM - Budi: Hi, is the kebaya ready?",
    "7/21/26, 4:51 PM - Sari: Yes it is 🙏",
    "Which date do you need?",
    "7/22/26, 12:05 AM - Budi: <Media omitted>",
    "7/22/26, 12:06 AM - Sari: This message was deleted",
    "7/22/26, 9:00 AM - Sari: IMG-20260722-WA0001.jpg (file attached)",
    "nice photo",
    "7/22/26, 9:01 AM - Budi: Ok thanks <This message was edited>",
    "7/22/26, 12:30 PM - Sari: Noon message",
  ].join("\n"),
  englishIos: [
    `[7/21/26, 4:49:12${NNBSP}PM] Budi: Hello`,
    `[7/21/26, 4:50:00${NNBSP}PM] Sari: Hi there`,
    `[7/21/26, 4:51:00${NNBSP}PM] ${LRM}Sari: ${LRM}image omitted`,
    "[7/21/26, 11:59:00 PM] Budi: Late one",
  ].join("\n"),
  indonesianAndroid: [
    "21/07/26 16.49 - Pesan dan telepon terenkripsi end-to-end.",
    `21/07/26 16.50 - ${LRM}Budi: Halo kak, ready kebaya kutubaru?`,
    "22/07/26 09.01 - Sari: Ready kak 🙏",
    "Mau tanggal berapa?",
    "Nanti saya cek dulu ya",
    "22/07/26 09.02 - Budi: <Media tidak disertakan>",
    "22/07/26 09.03 - Sari: Pesan ini dihapus",
    "23/07/26 10.00 - Sari: IMG-20260723-WA0001.jpg (file terlampir)",
    "23/07/26 10.01 - Budi: <lampiran: 00001-PHOTO.jpg> siap kak",
    "23/07/26 10.02 - Budi: Pesan ini diedit <pesan ini diedit>",
  ].join("\n"),
  indonesianIos: ["[21/07/2026, 16.49.12] Budi: Halo", "[21/07/2026, 16.50.00] Sari: Hai", "[22/07/2026, 09.00.00] Budi: stiker omitted"].join("\n"),
  german: "23.10.2026, 09:05 - Max Muster: Hallo\n23.10.2026, 09:06 - Erika Muster: Guten Tag\nzweite Zeile",
  dayFirstProof: "13/02/26 10.00 - Budi: a\n01/02/26 10.01 - Sari: b",
  monthFirstProof: "02/13/26 10.00 - Budi: a\n02/01/26 10.01 - Sari: b",
  garbageFirst: "random\n01/02/26 10.01 - Budi: ok\n\n",
  empty: "",
};
const BASELINE = JSON.parse(
  '{"englishAndroid":{"messages":[{"at":"2026-07-21T16:50:00.000Z","sender":"Budi","text":"Hi, is the kebaya ready?","isMedia":false},{"at":"2026-07-21T16:51:00.000Z","sender":"Sari","text":"Yes it is 🙏\\nWhich date do you need?","isMedia":false},{"at":"2026-07-22T00:05:00.000Z","sender":"Budi","text":"<Media omitted>","isMedia":true},{"at":"2026-07-22T09:00:00.000Z","sender":"Sari","text":"nice photo","isMedia":false},{"at":"2026-07-22T09:01:00.000Z","sender":"Budi","text":"Ok thanks","isMedia":false},{"at":"2026-07-22T12:30:00.000Z","sender":"Sari","text":"Noon message","isMedia":false}],"senders":["Budi","Sari"],"skippedLines":0,"systemLines":1,"dateOrder":"mdy"},"englishIos":{"messages":[{"at":"2026-07-21T16:49:12.000Z","sender":"Budi","text":"Hello","isMedia":false},{"at":"2026-07-21T16:50:00.000Z","sender":"Sari","text":"Hi there","isMedia":false},{"at":"2026-07-21T16:51:00.000Z","sender":"Sari","text":"image omitted","isMedia":true},{"at":"2026-07-21T23:59:00.000Z","sender":"Budi","text":"Late one","isMedia":false}],"senders":["Budi","Sari"],"skippedLines":0,"systemLines":0,"dateOrder":"mdy"},"indonesianAndroid":{"messages":[{"at":"2026-07-21T16:50:00.000Z","sender":"Budi","text":"Halo kak, ready kebaya kutubaru?","isMedia":false},{"at":"2026-07-22T09:01:00.000Z","sender":"Sari","text":"Ready kak 🙏\\nMau tanggal berapa?\\nNanti saya cek dulu ya","isMedia":false},{"at":"2026-07-22T09:02:00.000Z","sender":"Budi","text":"<Media tidak disertakan>","isMedia":true},{"at":"2026-07-23T10:00:00.000Z","sender":"Sari","text":"IMG-20260723-WA0001.jpg (file terlampir)","isMedia":true},{"at":"2026-07-23T10:01:00.000Z","sender":"Budi","text":"siap kak","isMedia":false},{"at":"2026-07-23T10:02:00.000Z","sender":"Budi","text":"Pesan ini diedit","isMedia":false}],"senders":["Budi","Sari"],"skippedLines":0,"systemLines":1,"dateOrder":"dmy"},"indonesianIos":{"messages":[{"at":"2026-07-21T16:49:12.000Z","sender":"Budi","text":"Halo","isMedia":false},{"at":"2026-07-21T16:50:00.000Z","sender":"Sari","text":"Hai","isMedia":false},{"at":"2026-07-22T09:00:00.000Z","sender":"Budi","text":"stiker omitted","isMedia":true}],"senders":["Budi","Sari"],"skippedLines":0,"systemLines":0,"dateOrder":"dmy"},"german":{"messages":[{"at":"2026-10-23T09:05:00.000Z","sender":"Max Muster","text":"Hallo","isMedia":false},{"at":"2026-10-23T09:06:00.000Z","sender":"Erika Muster","text":"Guten Tag\\nzweite Zeile","isMedia":false}],"senders":["Max Muster","Erika Muster"],"skippedLines":0,"systemLines":0,"dateOrder":"dmy"},"dayFirstProof":{"messages":[{"at":"2026-02-13T10:00:00.000Z","sender":"Budi","text":"a","isMedia":false},{"at":"2026-02-01T10:01:00.000Z","sender":"Sari","text":"b","isMedia":false}],"senders":["Budi","Sari"],"skippedLines":0,"systemLines":0,"dateOrder":"dmy"},"monthFirstProof":{"messages":[{"at":"2026-02-13T10:00:00.000Z","sender":"Budi","text":"a","isMedia":false},{"at":"2026-02-01T10:01:00.000Z","sender":"Sari","text":"b","isMedia":false}],"senders":["Budi","Sari"],"skippedLines":0,"systemLines":0,"dateOrder":"mdy"},"garbageFirst":{"messages":[{"at":"2026-02-01T10:01:00.000Z","sender":"Budi","text":"ok","isMedia":false}],"senders":["Budi"],"skippedLines":1,"systemLines":0,"dateOrder":"dmy"},"empty":{"messages":[],"senders":[],"skippedLines":0,"systemLines":0,"dateOrder":"dmy"}}',
) as Record<string, { messages: { at: string; sender: string; text: string; isMedia: boolean }[]; senders: string[]; skippedLines: number; systemLines: number; dateOrder: string }>;

for (const name of Object.keys(BASELINE_FIXTURES)) {
  test(`TC-31.1 / 31.6 regression: the ${name} fixture parses exactly as before`, () => {
    const r = parseWhatsAppExport(BASELINE_FIXTURES[name]);
    assert.deepEqual({ ...r, messages: r.messages.map((m) => ({ ...m, at: m.at.toISOString() })) }, BASELINE[name]);
  });
}

test("TC-31.7: an oversized export is still refused with a RangeError", () => {
  assert.throws(() => parseWhatsAppExport("x".repeat(50_000_001)), RangeError);
});

// ---------------------------------------------------------------------------------------------------------------------------
// SIMULATED. Vietnamese-locale exports (FR-36, G-23, DT-17). Every line, placeholder and system string below is INVENTED,
// a best-effort guess at what a phone set to Vietnamese writes. No real Vietnamese export was available. These tests do not
// prove behaviour on a real export; correct the lists in whatsapp-export-parser.ts when a real Android and iOS export are tested.
// ---------------------------------------------------------------------------------------------------------------------------
const VI_ANDROID = [
  "23/10/2026 9:00 SA - Tin nhắn và cuộc gọi được mã hóa đầu cuối.", // V10 system line
  "23/10/2026 9:05 SA - Minh Anh: Dạ em chào anh/chị ạ", // V1
  "23/10/2026 12:10 SA - Minh Anh: Em gửi báo giá nhé", // V2
  "23/10/2026 1:30 CH - Khách Mẫu: Giá bao nhiêu vậy?", // V3
  "23/10/2026 12:30 CH - Minh Anh: Dạ 2.000.000đ ạ", // V4
  "23/10/2026 11:59 CH - Khách Mẫu: vâng", // V5
  "24/10/2026 12:00 SA - Khách Mẫu: ok nhé", // V5
].join("\n");

const hhmm = (d: Date) => d.toISOString().slice(11, 16);

test("SIMULATED TC-31.1: a Vietnamese Android export (SA / CH) gives the right sender, hour and body", () => {
  const r = parseWhatsAppExport(VI_ANDROID);
  assert.equal(r.systemLines, 1);
  assert.equal(r.skippedLines, 0);
  assert.equal(r.dateOrder, "dmy");
  assert.deepEqual(r.senders, ["Minh Anh", "Khách Mẫu"]);
  assert.deepEqual(r.messages.map((m) => hhmm(m.at)), ["09:05", "00:10", "13:30", "12:30", "23:59", "00:00"]);
  assert.equal(r.messages[0].text, "Dạ em chào anh/chị ạ");
  assert.equal(r.messages[0].at.toISOString(), "2026-10-23T09:05:00.000Z");
  assert.equal(r.messages[3].text, "Dạ 2.000.000đ ạ");
  assert.equal(r.messages[5].at.toISOString(), "2026-10-24T00:00:00.000Z");
});

test("SIMULATED TC-31.4: meridiem variants (case, dots, no-break spaces) read as SA / CH", () => {
  const sa = ["SA", "sa", "Sa", "S.A.", "SA.", "s.a"];
  const ch = ["CH", "ch", "Ch", "C.H.", "CH.", "c.h"];
  for (const token of sa) assert.equal(hhmm(parseWhatsAppExport(`23/10/2026 9:05 ${token} - Minh Anh: Dạ`).messages[0].at), "09:05", token);
  for (const token of ch) assert.equal(hhmm(parseWhatsAppExport(`23/10/2026 1:30 ${token} - Minh Anh: Dạ`).messages[0].at), "13:30", token);
  for (const gap of [NBSP, NNBSP, ""]) {
    assert.equal(hhmm(parseWhatsAppExport(`23/10/2026 9:05${gap}SA - Minh Anh: Dạ`).messages[0].at), "09:05", JSON.stringify(gap));
    assert.equal(hhmm(parseWhatsAppExport(`[23/10/2026, 1:30:05${gap}CH] Minh Anh: Dạ`).messages[0].at), "13:30", JSON.stringify(gap));
  }
});

test("SIMULATED TC-31.2: Latin AM/PM, iOS and 24-hour Vietnamese-locale lines still parse", () => {
  assert.equal(hhmm(parseWhatsAppExport("23/10/2026 9:05 AM - Minh Anh: Dạ").messages[0].at), "09:05"); // V7
  assert.equal(hhmm(parseWhatsAppExport("23/10/2026 1:30 PM - Minh Anh: Dạ").messages[0].at), "13:30");
  const ios = parseWhatsAppExport("[23/10/2026, 09:05:12] Minh Anh: Dạ vâng ạ"); // V8
  assert.equal(ios.messages[0].text, "Dạ vâng ạ");
  assert.equal(ios.messages[0].at.toISOString(), "2026-10-23T09:05:12.000Z");
  assert.equal(hhmm(parseWhatsAppExport("23/10/2026 14:05 - Minh Anh: Dạ").messages[0].at), "14:05"); // V9
});

test("SIMULATED TC-31.1 / 31.3: media, deleted, edited and attachment lines are classified, not counted as the owner's words", () => {
  const r = parseWhatsAppExport([
    "23/10/2026 9:01 SA - Minh Anh: <Đã bỏ qua tệp phương tiện>", // V11
    "23/10/2026 9:02 SA - Minh Anh: Tin nhắn này đã bị xóa", // V12
    "23/10/2026 9:03 SA - Minh Anh: Dạ vâng <Tin nhắn đã được chỉnh sửa>", // V13
    "23/10/2026 9:04 SA - Minh Anh: (đã đính kèm tệp) IMG-0001.jpg", // V14
    "23/10/2026 9:05 SA - Minh Anh: Bạn đã xóa tin nhắn này",
    "23/10/2026 9:06 SA - Minh Anh: ảnh đã bị bỏ qua",
    "23/10/2026 9:07 SA - Minh Anh: Cuộc gọi thoại nhỡ",
    "23/10/2026 9:08 SA - Minh Anh: <đính kèm: 0002-PHOTO.jpg> Em gửi ảnh anh/chị xem ạ",
    "23/10/2026 9:09 SA - Minh Anh: IMG-20261023-WA0001.jpg (đã đính kèm tệp)",
    "ảnh sản phẩm mới ạ",
  ].join("\n"));
  const byText = r.messages.map((m) => [m.text, m.isMedia]);
  assert.deepEqual(byText, [
    ["<Đã bỏ qua tệp phương tiện>", true],
    ["Dạ vâng", false],
    ["(đã đính kèm tệp) IMG-0001.jpg", true],
    ["ảnh đã bị bỏ qua", true],
    ["Cuộc gọi thoại nhỡ", true],
    ["Em gửi ảnh anh/chị xem ạ", false],
    ["ảnh sản phẩm mới ạ", false],
  ]);
});

test("SIMULATED TC-31.3: a continuation line without a header joins the previous Vietnamese message", () => {
  const r = parseWhatsAppExport("23/10/2026 9:05 SA - Minh Anh: Dạ em chào anh/chị\nEm gửi báo giá ạ\n23/10/2026 9:06 CH - Khách Mẫu: vâng"); // V15
  assert.equal(r.messages[0].text, "Dạ em chào anh/chị\nEm gửi báo giá ạ");
  assert.equal(r.messages.length, 2);
});

test("SIMULATED TC-31.8: SA / CH inside a body are not read as a meridiem", () => {
  const r = parseWhatsAppExport("23/10/2026 9:07 SA - Minh Anh: CH Hà Nội mở cửa lúc 9:05 SA"); // V16
  assert.equal(r.messages[0].text, "CH Hà Nội mở cửa lúc 9:05 SA");
  assert.equal(hhmm(r.messages[0].at), "09:07");
});

test("SIMULATED TC-31.5: an NFD export line gives an NFC sender and body", () => {
  const nfd = "23/10/2026 9:05 SA - Minh Anh: Dạ em chào anh/chị ạ".replace("Minh Anh", "Khách Mẫu").normalize("NFD");
  assert.notEqual(nfd, nfc(nfd));
  const r = parseWhatsAppExport(nfd);
  assert.equal(r.messages[0].sender, "Khách Mẫu");
  assert.equal(r.messages[0].sender, nfc(r.messages[0].sender));
  assert.equal(r.messages[0].text, "Dạ em chào anh/chị ạ");
  // the Vietnamese markers are found in NFD export text too
  const marker = parseWhatsAppExport("23/10/2026 9:05 SA - Minh Anh: <Đã bỏ qua tệp phương tiện>".normalize("NFD"));
  assert.equal(marker.messages[0].isMedia, true);
  assert.equal(marker.messages[0].text, nfc(marker.messages[0].text));
});

test("SIMULATED TC-31.10: the date order of a Vietnamese line follows the same rule as the English one", () => {
  const vi = parseWhatsAppExport("03/04/2026 9:05 SA - Minh Anh: Dạ");
  const en = parseWhatsAppExport("03/04/2026 9:05 AM - Minh Anh: Dạ");
  assert.equal(vi.dateOrder, en.dateOrder);
  assert.equal(vi.messages[0].at.toISOString(), en.messages[0].at.toISOString());
});

test("SIMULATED TC-31.11: the partner's Vietnamese lines do not count towards the owner's language statistics", () => {
  const r = parseWhatsAppExport([
    "23/10/2026 9:05 SA - Khách Mẫu: Dạ em chào anh/chị, cho em hỏi giá ạ",
    "23/10/2026 9:06 SA - Me: Hi, thanks for your message",
    "23/10/2026 9:07 SA - Khách Mẫu: Cảm ơn anh/chị nhiều ạ",
    "23/10/2026 9:08 SA - Me: Sure, I will send it today",
  ].join("\n"));
  const stats = computeStyleStats(r.messages, "Me");
  assert.ok(stats.language.english > stats.language.vietnamese);
});

test("SIMULATED TC-31.6: an export in an unrecognised language is read as before (no crash)", () => {
  const r = parseWhatsAppExport("23.10.2026, 09:05 - Max Muster: Hallo");
  assert.equal(r.messages.length, 1);
  assert.equal(r.messages[0].sender, "Max Muster");
});

// ---------------------------------------------------------------------------------------------------------------------------
// Hostile input (S7 HIGH, NFR-4). Times are printed so the report can quote them.
// ---------------------------------------------------------------------------------------------------------------------------
function timed(label: string, fn: () => unknown): number {
  const t0 = performance.now();
  fn();
  const ms = performance.now() - t0;
  console.log(`# hostile ${label}: ${ms.toFixed(0)} ms`);
  return ms;
}

test("S7 HIGH: a 10,000,000-character message after a valid header parses in under 1,500 ms and is cut at the per-message cap", () => {
  const input = "01/02/26 10.01 - Me: " + "a".repeat(10_000_000);
  let r!: ReturnType<typeof parseWhatsAppExport>;
  const ms = timed("10M-char message", () => { r = parseWhatsAppExport(input); });
  assert.ok(ms < HOSTILE_MS_LARGE, `${ms} ms`);
  assert.equal(r.messages.length, 1);
  assert.equal(r.messages[0].sender, "Me");
  assert.ok(r.messages[0].text.length <= MAX_MESSAGE_CHARS);
});

test("S7 HIGH: 120,000 header-like lines with a 380-space gap parse in under 1,500 ms", () => {
  const input = ("1/1/26 1:11" + " ".repeat(380) + "x\n").repeat(120_000).slice(0, -1);
  assert.ok(input.length < 50_000_000);
  let r!: ReturnType<typeof parseWhatsAppExport>;
  const ms = timed("120k lines x 380 spaces", () => { r = parseWhatsAppExport(input); });
  assert.ok(ms < HOSTILE_MS_LARGE, `${ms} ms`);
  assert.equal(r.messages.length, 0);
});

test("S7 HIGH: a 100,000-character line of digits, slashes, colons and SA (DT-17 V19) is cheap", () => {
  const line = ("12/3/45 6:7 SA ").repeat(100_000 / 15);
  const ms = timed("V19 header-like line", () => parseWhatsAppExport(line + "\n23/10/2026 9:05 SA - Minh Anh: Dạ"));
  assert.ok(ms < HOSTILE_MS_LARGE, `${ms} ms`);
});

test("S7 HIGH: hostile 10 MB messages (unterminated markers, long file names, mark floods) stay within the large limit", () => {
  const header = "23/10/2026 9:05 SA - Minh Anh: ";
  const cases: Record<string, string> = {
    "unterminated <attached:": header + "<attached:".repeat(1_000_000),
    "unterminated <đính kèm:": header + "<đính kèm:".repeat(1_000_000),
    "IMG-...-WA digits": header + "IMG-12345678-WA" + "1".repeat(10_000_000),
    "long non-space run before .jpg": header + "x".repeat(10_000_000) + ".jpg",
    "many dots": header + "a.".repeat(5_000_000),
    "combining mark flood": header + "a" + String.fromCharCode(0x0301).repeat(10_000_000),
    "many lines": header + "x\n".repeat(5_000_000),
    "(đã đính kèm tệp) flood": header + "(".repeat(5_000_000),
  };
  for (const [name, input] of Object.entries(cases)) {
    const ms = timed(name, () => parseWhatsAppExport(input));
    assert.ok(ms < HOSTILE_MS_LARGE, `${name}: ${ms} ms`);
  }
});

test("S7 HIGH: parsing time does not grow faster than linearly in the length of a message or of a header gap", () => {
  assertLinear((s) => parseWhatsAppExport(s), (n) => "01/02/26 10.01 - Me: " + "a".repeat(n));
  assertLinear((s) => parseWhatsAppExport(s), (n) => "1/1/26 1:11" + " ".repeat(n) + "x");
  assertLinear((s) => parseWhatsAppExport(s), (n) => "01/02/26 10.01 - Me: " + "IMG-1".repeat(n / 5) + "x");
  assertLinear((s) => parseWhatsAppExport(s), (n) => "01/02/26 10.01 - Me: " + "x".repeat(n) + ".jpg");
});

test("every message is cut at the per-message cap before it is cleaned, by code point, and the result is NFC", () => {
  const long = "Dạ em chào anh/chị ".repeat(2_000);
  const r = parseWhatsAppExport(`23/10/2026 9:05 SA - Minh Anh: ${long.normalize("NFD")}`);
  assert.ok([...r.messages[0].text].length <= MAX_MESSAGE_CHARS);
  assert.equal(r.messages[0].text, nfc(r.messages[0].text));
  const emoji = parseWhatsAppExport("23/10/2026 9:05 SA - Minh Anh: " + "a".repeat(MAX_MESSAGE_CHARS - 1) + "😀😀");
  assert.doesNotMatch(emoji.messages[0].text, /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/);
});
