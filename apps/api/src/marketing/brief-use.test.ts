import { test } from "node:test";
import assert from "node:assert/strict";
import { briefForDraft, pickAngle, offerListWords } from "./brief-use";
import { emptyBrief } from "./brief-schema";
import { buildOutreachMessages } from "../ai/chat-import/style-prompt";

const angles = [
  { segment: "Rental kamera", pain: "Stok bentrok", hook: "Jadwal sewa bentrok?", benefit: "Jadwal dan stok satu layar" },
  { segment: "Wedding organizer", pain: "Vendor berantakan", hook: "Vendor lupa jadwal?", benefit: "Semua vendor terpantau" },
];

test("pickAngle matches on the name and the real Maps category, and returns nothing when nothing overlaps", () => {
  assert.equal(pickAngle(angles, "Solo Lensa", "Layanan Rental Alat")?.segment, "Rental kamera");
  assert.equal(pickAngle(angles, "Dian Wedding", "Penyelenggara pernikahan")?.segment, "Wedding organizer");
  assert.equal(pickAngle(angles, "Warung Bu Tini", "Restoran"), undefined);
});

test("the draft prompt carries the brief: matched angle, allowed proof, words to avoid", () => {
  const c = { ...emptyBrief(), angles, proof: { metrics: ["200+ stars"], customers: ["Klien Contoh"], testimonials: [] }, voice: { tone: "", wordsToUse: [], wordsToAvoid: ["solusi", "inovatif"] } };
  const brief = briefForDraft("Kami membuat sistem sewa.", c, { name: "Rental Kamera Solo", category: "Toko Kamera" });
  const m = buildOutreachMessages({ businessDescription: "X", offer: "sistem sewa", language: "vietnamese", lead: { name: "Rental Kamera Solo" }, brief });
  const sys = m[0].content;
  assert.match(sys, /BRIEF PEMASARAN/);
  assert.match(sys, /masalah yang mungkin dirasakan: Stok bentrok; manfaat: Jadwal dan stok satu layar/);
  assert.match(sys, /Bukti yang BOLEH disebut.*Klien Contoh; 200\+ stars/);
  assert.match(sys, /Hindari kata: solusi, inovatif/);
  const none = buildOutreachMessages({ businessDescription: "X", offer: "o", language: "vietnamese", lead: { name: "Y" }, brief: { summary: "s", proof: [], wordsToAvoid: [] } })[0].content;
  assert.match(none, /Tidak ada bukti yang boleh disebut/);
  assert.doesNotMatch(buildOutreachMessages({ businessDescription: "X", offer: "o", language: "vietnamese", lead: { name: "Y" } })[0].content, /BRIEF PEMASARAN/);
});

import { foreignVerticalWords } from "./brief-use";

test("a draft that names another kind of business is caught", () => {
  const angles = [
    { segment: "Rental Kamera/Alat Fotografi", pain: "", hook: "", benefit: "" },
    { segment: "Rental Kebaya/Busana", pain: "", hook: "", benefit: "" },
    { segment: "Rental Mobil/Motor", pain: "", hook: "", benefit: "" },
  ] as never;
  assert.deepEqual(foreignVerticalWords("Kami bantu catat jadwal sewa kebaya Anda.", { name: "Kostum Anak Ceria", category: "Penyewaan kostum" }, angles), ["kebaya"]);
  assert.deepEqual(foreignVerticalWords("Kami bantu jadwal sewa kamera dan lensa.", { name: "Zona Kamera", category: "Toko Elektronik" }, angles), []);
  assert.deepEqual(foreignVerticalWords("Kami bantu jadwal sewa kamera, fotografi, dan mobil.", { name: "Rental Kamera Medan", category: "Penyewaan alat" }, angles), ["mobil"]);
});

test("kinds of business listed in the offer are foreign to a lead that is none of them", async () => {
  const { foreignVerticalWords, offerListWords } = await import("./brief-use");
  const offer = "Kami membuat sistem sewa untuk semua jenis usaha, mulai dari kamera, kebaya, alat event, hingga mobil dan motor.";
  assert.deepEqual(offerListWords([offer]).includes("kebaya"), true);
  const lead = { name: "Penyewaan Jas Pria Solo", category: "Penyewaan jas" };
  assert.deepEqual(foreignVerticalWords("Sistem kami cocok untuk sewa kebaya dan jas.", lead, [], [offer]), ["kebaya"]);
  assert.deepEqual(foreignVerticalWords("Sistem kami cocok untuk usaha sewa jas.", lead, [], [offer]), []);
  // a sentence without a list adds nothing
  assert.deepEqual(offerListWords(["Kami membantu untuk mengotomatisasi proses bisnis, seperti pencatatan."]), []);
});

// ---------- Vietnamese (FR-41, TC-40.x, TC-43.5) ----------
import { tokens } from "./brief-use";
import { HOSTILE_MS_LARGE, assertLinear } from "../common/hostile-limits";

const nfd = (s: string) => s.normalize("NFD");
/** The tokeniser as it was before this change, kept here as the baseline for English and Indonesian text (NFR-7). */
const legacyTokens = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length >= 4);

test("English and Indonesian tokens are unchanged (TC-40.4)", () => {
  for (const s of ["Camera rental service in Boyolali", "Kami membuat sistem sewa untuk rental kamera, kebaya dan alat event.", "Photography studio, wedding organizer & event rentals (since 2019)!"]) {
    assert.deepEqual(tokens(s), legacyTokens(s), s);
  }
});

test("Vietnamese text gives syllable bigrams, with no minimum word length, in NFC and NFD (TC-40.1, 40.5)", () => {
  const sentence = "Công ty Mẫu cho thuê xe máy";
  const expected = ["công ty", "ty mẫu", "mẫu cho", "cho thuê", "thuê xe", "xe máy"];
  assert.deepEqual(tokens(sentence), expected);
  assert.deepEqual(tokens(nfd(sentence)), expected);
  assert.deepEqual(tokens(sentence.toUpperCase()), expected);
});

test("punctuation ends a run: no bigram across a comma or a slash", () => {
  assert.deepEqual(tokens("Tiệm cắt tóc, quán cà phê"), ["tiệm cắt", "cắt tóc", "quán cà", "cà phê"]);
  assert.deepEqual(tokens("anh/chị"), []);
});

test("mixed text: Vietnamese syllables get bigrams, other words keep the old rule (TC-40.12)", () => {
  assert.deepEqual(tokens("Công ty Mẫu cho thuê camera rental service"), ["công ty", "ty mẫu", "mẫu cho", "cho thuê", "camera", "rental", "service"]);
});

test("empty text, one syllable and hostile text (TC-40.9, 40.10, 40.11)", () => {
  for (const s of ["", "   ", "..."]) assert.deepEqual(tokens(s), []);
  assert.deepEqual(tokens("công"), ["công"]);
  assert.deepEqual(tokens("ty"), []);
  assert.deepEqual(tokens(null as never), []);
  const makers: ((n: number) => string)[] = [
    (n) => "<".repeat(n),
    (n) => "Công ty ".repeat(Math.ceil(n / 8)).slice(0, n),
    (n) => "d" + String.fromCharCode(0x300).repeat(n - 1),
    (n) => "ê" + String.fromCharCode(0x301).repeat(n - 1),
    (n) => "Ơ".repeat(n),
  ];
  for (const make of makers) {
    const t0 = Date.now();
    tokens(make(20_000));
    assert.ok(Date.now() - t0 < HOSTILE_MS_LARGE);
    assertLinear((s) => tokens(s), make);
  }
});

const VI_ANGLES = [
  { segment: "Tiệm cắt tóc", pain: "", hook: "Lịch hẹn bị trùng?", benefit: "" },
  { segment: "Quán cà phê", pain: "", hook: "Đặt bàn khó?", benefit: "" },
] as never;

test("pickAngle works on Vietnamese segments", () => {
  assert.equal(pickAngle(VI_ANGLES, "Tiệm Tóc Hoa", "Tiệm cắt tóc")?.segment, "Tiệm cắt tóc");
  assert.equal(pickAngle(VI_ANGLES, "Cà Phê Ví Dụ", "Quán cà phê")?.segment, "Quán cà phê");
  assert.equal(pickAngle(VI_ANGLES, "Công ty Mẫu", "Công ty xây dựng"), undefined);
});

test("a Vietnamese draft that names another segment's business is caught; its own segment and generic words are not (TC-40.3, 40.7, 40.8)", () => {
  const lead = { name: "Tiệm Tóc Hoa", category: "Tiệm cắt tóc" };
  const other = foreignVerticalWords("Em thấy quán cà phê của anh/chị có nhiều đánh giá tốt.", lead, VI_ANGLES);
  assert.ok(other.length > 0 && other.every((w) => /quán|cà|phê/.test(w)), other.join(","));
  assert.deepEqual(foreignVerticalWords(nfd("Em thấy quán cà phê của anh/chị có nhiều đánh giá tốt."), lead, VI_ANGLES), other);
  assert.deepEqual(foreignVerticalWords("Em thấy tiệm cắt tóc của anh/chị có nhiều đánh giá tốt.", lead, VI_ANGLES), []);
  const generic = [
    { segment: "Cửa hàng hoa", pain: "", hook: "x", benefit: "" },
    { segment: "Cửa hàng giày", pain: "", hook: "x", benefit: "" },
  ] as never;
  assert.deepEqual(foreignVerticalWords("Công ty em hỗ trợ cửa hàng và dịch vụ của anh/chị.", { name: "Tiệm Tóc Hoa", category: "Tiệm cắt tóc" }, generic), []);
});

test("Vietnamese list markers, separators and generic words (TC-40.2, 40.6)", () => {
  const items = offerListWords(["Công ty Mẫu cho thuê xe máy như xe số, xe tay ga và xe điện"]);
  assert.ok(items.includes("xe số") && items.includes("xe điện") && items.includes("xe tay"), items.join(","));
  for (const w of items) for (const syllable of ["như", "và", "hoặc", "đến", "ví", "dụ", "bao", "gồm"]) assert.ok(!w.split(" ").includes(syllable), `${syllable} in ${items.join(",")}`);
  assert.deepEqual(offerListWords(["Bao gồm xe số hoặc xe điện, xe đạp"]).sort(), ["xe điện", "xe đạp", "xe số"].sort());
  assert.deepEqual(offerListWords(["Ví dụ như cửa hàng hoa, dịch vụ cưới"]).sort(), ["hàng hoa", "vụ cưới"]);
  // one item is not a list
  assert.deepEqual(offerListWords(["Chúng tôi hỗ trợ như xe số"]), []);
  assert.deepEqual(offerListWords([nfd("Chúng tôi cho thuê, như xe số, xe điện")]), offerListWords(["Chúng tôi cho thuê, như xe số, xe điện"]));
});

test("the offer list names kinds of business that are foreign to a Vietnamese lead (FR-41)", () => {
  const offer = "Chúng tôi làm phần mềm cho nhiều ngành, ví dụ như tiệm cắt tóc, quán cà phê, cửa hàng hoa và phòng khám.";
  const lead = { name: "Phòng Khám Mẫu", category: "Phòng khám" };
  const foreign = foreignVerticalWords("Phần mềm này hợp với quán cà phê và phòng khám.", lead, [], [offer]);
  assert.ok(foreign.includes("quán cà") && foreign.includes("cà phê"), foreign.join(","));
  assert.ok(!foreign.some((w) => w.includes("phòng")));
});

test("the list and vertical helpers stay linear on hostile Vietnamese text", () => {
  const offer = "Chúng tôi làm phần mềm, ví dụ như tiệm cắt tóc, quán cà phê, cửa hàng hoa và phòng khám.";
  const makers: ((n: number) => string)[] = [
    (n) => "như ".repeat(Math.ceil(n / 4)).slice(0, n),
    (n) => "ví dụ như a, ".repeat(Math.ceil(n / 12)).slice(0, n),
    (n) => "d" + String.fromCharCode(0x300).repeat(n - 1),
    (n) => "Công ty, ".repeat(Math.ceil(n / 9)).slice(0, n),
  ];
  for (const make of makers) {
    const t0 = Date.now();
    offerListWords([make(20_000)]);
    foreignVerticalWords(make(20_000), { name: "Phòng Khám Mẫu", category: "Phòng khám" }, VI_ANGLES, [offer]);
    assert.ok(Date.now() - t0 < HOSTILE_MS_LARGE * 2);
    assertLinear((s) => offerListWords([s]), make);
  }
});
