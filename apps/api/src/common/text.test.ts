import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ANGLE_LOOKALIKES,
  VI_UNACCENTED_MARKERS,
  VI_UNACCENTED_MIN,
  WORD_AFTER,
  WORD_BEFORE,
  capThenNfc,
  countUnaccentedMarkers,
  countVietnameseLetters,
  escapeRegExp,
  fold,
  hasVietnameseMarks,
  lacksVietnameseDiacritics,
  nfc,
  sliceChars,
  stripAngleLookalikes,
  wordRegex,
  wordRegexFromSource,
} from "./text";
import { HOSTILE_MS_LARGE, HOSTILE_MS_SMALL, assertLinear } from "./hostile-limits";

const NFD = (s: string) => s.normalize("NFD");
const hasLoneSurrogate = (s: string) => /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(s);

// ---- DT-4a nfc (TC-43.13, 43.14, 43.8) --------------------------------------------------------------------------------

test("nfc composes NFD and leaves NFC alone (DT-4a)", () => {
  assert.equal(nfc(NFD("dừng")), "dừng");
  assert.equal(nfc(NFD("Đường")), "Đường");
  assert.equal(nfc("Đ"), "Đ");
  assert.equal(nfc(""), "");
  assert.notEqual(NFD("dừng"), "dừng", "the fixture must really be decomposed");
});

test("nfc is idempotent and unifies mixed forms (TC-43.13)", () => {
  const mixed = `dừng ${NFD("gửi")} Đúng ${NFD("nhắn tin")}`;
  const once = nfc(mixed);
  assert.equal(once, "dừng gửi Đúng nhắn tin");
  assert.equal(nfc(once), once);
  assert.equal(once.normalize("NFD").normalize("NFC"), once);
});

test("nfc never throws on non-strings and returns the empty string (TC-43.8)", () => {
  for (const v of [null, undefined, 5, true, {}, [], ["dừng"], Symbol("x"), () => "x", 10n]) {
    assert.equal(nfc(v as never), "", String(typeof v));
  }
  assert.equal(nfc({ toString: () => "dừng" } as never), "");
});

// ---- DT-4b fold (TC-43.12) --------------------------------------------------------------------------------------------

const FOLD_TABLE: [string, string][] = [
  ["Đúng", "dung"], ["Dũng", "dung"], ["đung", "dung"], ["dùng thử", "dung thu"], ["dừng", "dung"], ["Gia đình", "gia dinh"],
  [NFD("dừng"), "dung"], ["Thôi cảm ơn nhé", "thoi cam on nhe"], ["DỪNG", "dung"], ["ĐƯỜNG", "duong"], ["Đ", "d"], ["café", "cafe"],
  ["STOP", "stop"], ["xin chào 123", "xin chao 123"], ["", ""], ["😀", "😀"],
];

test("fold strips marks, maps đ/Đ to d and lower-cases (DT-4b)", () => {
  for (const [input, out] of FOLD_TABLE) assert.equal(fold(input), out, JSON.stringify(input));
});

test("fold properties over every fixture (DT-4b, TC-43.12)", () => {
  for (const [input] of FOLD_TABLE) {
    assert.equal(fold(nfc(input)), fold(NFD(input)), input);
    assert.equal(fold(fold(input)), fold(input), input);
    assert.doesNotMatch(fold(input), /\p{M}/u);
    assert.doesNotMatch(fold(input), /[đĐ]/u);
  }
});

test("fold does not modify its input (strings are immutable, but the caller's copy must stay intact)", () => {
  const original = "Đúng rồi";
  const copy = original;
  fold(original);
  assert.equal(original, copy);
  assert.equal(original, "Đúng rồi");
});

test("fold returns the empty string on non-strings and a lone mark (S1)", () => {
  for (const v of [null, undefined, 5, {}, []]) assert.equal(fold(v as never), "");
  assert.equal(fold("́"), "");
  assert.equal(fold("İ"), "i");
});

// ---- DT-4c hasVietnameseMarks -----------------------------------------------------------------------------------------

test("hasVietnameseMarks (DT-4c)", () => {
  for (const s of ["dung", "Dung", "DUNG", "stop", "xin chao", "hello 123 😀", "", "ü", "ç", "naïve", NFD("naïve"), NFD("ü")]) {
    assert.equal(hasVietnameseMarks(s), false, JSON.stringify(s));
  }
  for (const s of ["Đung", "đung", "Đ", "dừng", NFD("dừng"), "dùng", NFD("dùng"), "ă", "Â", "ê", "Ô", "ơ", "Ư", "á", "ả", "ã", "ạ", "à", "ñ", "café"]) {
    assert.equal(hasVietnameseMarks(s), true, JSON.stringify(s));
  }
  for (const s of ["ă", "Â", "ê", "Ô", "ơ", "Ư", "ả", "ạ"]) assert.equal(hasVietnameseMarks(NFD(s)), true, `NFD ${s}`);
});

test("hasVietnameseMarks is false for non-strings and never throws (S1)", () => {
  for (const v of [null, undefined, 5, {}, [], ["đ"]]) assert.equal(hasVietnameseMarks(v as never), false);
});

// ---- countVietnameseLetters -------------------------------------------------------------------------------------------

test("countVietnameseLetters counts Vietnamese letters by occurrence, in NFC and NFD", () => {
  const cases: [string, number][] = [
    ["cảm ơn anh", 2], ["Đà Nẵng", 3], ["dạ", 1], ["dạ ạ", 2], ["dạ được ạ", 5], ["Café menu", 1], ["hello", 0], ["", 0],
    ["Xin chào anh/chị, em gọi từ Công ty Mẫu", 6], ["Crème brûlée", 2], ["ü ç", 0],
  ];
  for (const [text, n] of cases) {
    assert.equal(countVietnameseLetters(text), n, text);
    assert.equal(countVietnameseLetters(NFD(text)), n, `NFD ${text}`);
  }
  for (const v of [null, undefined, 5, {}]) assert.equal(countVietnameseLetters(v as never), 0);
});

// ---- DT-4d word boundary (TC-43.6) ------------------------------------------------------------------------------------

test("wordRegex whole-word table (DT-4d)", () => {
  const rows: [string, string, boolean][] = [
    ["ca", "ca", true], ["ca", "ca dao", true], ["ca", "(ca)", true], ["ca", "ca.", true],
    ["ca", "cả", false], ["ca", NFD("cả"), false], ["ca", "ca2", false], ["ca", "xca", false],
    ["đại lý", "đại lý", true], ["đại lý", "Mở đại lý xe", true], ["đại lý", "ok, đại lý", true],
    ["đại lý", "xđại lý", false], ["đại lý", "đại lýx", false],
    ["dịch vụ", "thiết kế dịch vụ", true], ["dịch vụ", "dịch vụ thiết kế", true], ["dịch vụ", "DỊCH VỤ", true],
    ["a.b", "a.b", true], ["a.b", "axb", false],
  ];
  for (const [word, text, expected] of rows) {
    assert.equal(wordRegex(word).test(text), expected, `${word} ~ ${JSON.stringify(text)}`);
    // NFD parity: a decomposed text must give the same answer when the words are NFC (the builder NFC-normalises its words)
    if (expected) assert.equal(wordRegex(NFD(word)).test(nfc(text)), true, `NFD word ${word}`);
  }
});

test("dung is not a word inside dũng or dùng, in NFC and NFD (TC-43.6)", () => {
  const re = wordRegex("dung");
  for (const t of ["dũng", "dùng", "Dũng", "dụng", NFD("dũng"), NFD("dùng"), NFD("Dũng"), "dùng thử", NFD("dùng thử")]) {
    assert.equal(re.test(t), false, JSON.stringify(t));
  }
  for (const t of ["dung", "dung gui", "xin dung", "Dung."]) assert.equal(re.test(t), true, t);
});

test("the legacy [\\p{L}\\p{N}] boundary would have matched the NFD cả (the regression this test guards)", () => {
  const legacy = /(?<![\p{L}\p{N}])ca(?![\p{L}\p{N}])/iu;
  assert.equal(legacy.test(NFD("cả")), true);
  assert.equal(wordRegex("ca").test(NFD("cả")), false);
});

test("wordRegex boundary constants and flags", () => {
  assert.equal(WORD_BEFORE.source, "(?<![\\p{L}\\p{M}\\p{N}])");
  assert.equal(WORD_AFTER.source, "(?![\\p{L}\\p{M}\\p{N}])");
  const re = wordRegex("cam on");
  assert.ok(re.flags.includes("u") && re.flags.includes("i"));
  assert.ok(wordRegex("khong", "giu").global);
});

test("wordRegex: phrase spaces become a bounded gap, alternation takes the longest word first", () => {
  const re = wordRegex(["toi", "chung toi", "cam on"], "giu");
  assert.deepEqual([...("chung toi cam   on toi").matchAll(re)].map((m) => m[0]), ["chung toi", "cam   on", "toi"]);
  assert.equal(wordRegex("cam on").test("cam on"), true);
  assert.equal(wordRegex("cam on").test("cam    on"), false, "four spaces is more than the 1-3 gap");
  assert.equal(wordRegex("cam on").test("cam\non"), true);
  assert.equal(wordRegex("cam on").test("camon"), false);
});

test("wordRegex escapes metacharacters: a word is literal text, never a pattern (S1)", () => {
  assert.equal(wordRegex("(?:a+)+$").test("x (?:a+)+$ y"), true);
  assert.equal(wordRegex("(?:a+)+$").test("aaaa"), false);
  assert.equal(wordRegex(["c++", "[x]", "a|b", "^start$", "{1}", "back\\slash"]).test("a|b"), true);
  assert.equal(wordRegex("a|b").test("a"), false);
  assert.equal(wordRegex("a|b").test("b"), false);
  assert.equal(wordRegex("a.b").test("axb"), false);
  assert.equal(wordRegex("back\\slash").test("back\\slash"), true);
});

test("wordRegex with no usable word never matches (and never matches the empty string)", () => {
  assert.equal(wordRegex([]).test(""), false);
  assert.equal(wordRegex([]).test("anything"), false);
  assert.equal(wordRegex(["", ""]).test("anything"), false);
  assert.equal(wordRegex("").test(""), false);
});

test("wordRegex does not throw on non-string words (data must never be a pattern)", () => {
  assert.doesNotThrow(() => wordRegex([null, undefined, 5, "ok"] as never));
  assert.equal(wordRegex([null, undefined, 5, "ok"] as never).test("ok"), true);
  assert.equal(wordRegex(null as never).test("x"), false);
});

test("wordRegexFromSource wraps a constant source with the same boundaries", () => {
  const re = wordRegexFromSource("dung\\s{1,3}gui");
  assert.equal(re.test("dung gui nua"), true);
  assert.equal(re.test("dũng gui"), false);
  assert.equal(re.test(NFD("xdung gui")), false);
  assert.ok(re.flags.includes("u"));
});

// ---- escapeRegExp / module loads under the u flag ---------------------------------------------------------------------

test("escapeRegExp escapes exactly the syntax characters and is valid under the u flag", () => {
  assert.equal(escapeRegExp("a.b*c+d?e^f$g{h}i(j)k|l[m]n\\o"), "a\\.b\\*c\\+d\\?e\\^f\\$g\\{h\\}i\\(j\\)k\\|l\\[m\\]n\\\\o");
  for (const ch of "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~ -") {
    assert.doesNotThrow(() => new RegExp(escapeRegExp(ch), "u"), JSON.stringify(ch));
    assert.equal(new RegExp(`^${escapeRegExp(ch)}$`, "u").test(ch), true, JSON.stringify(ch));
  }
  assert.equal(escapeRegExp("đại lý"), "đại lý");
  assert.equal(escapeRegExp(null as never), "");
});

test("the module loaded: every regex built at import time is valid under the u flag (S1)", () => {
  assert.doesNotThrow(() => new RegExp(WORD_BEFORE.source + "x" + WORD_AFTER.source, "iu"));
  assert.ok(VI_UNACCENTED_MARKERS.length > 0);
});

// ---- DT-4e sliceChars (TC-43.11) --------------------------------------------------------------------------------------

test("sliceChars cuts by code point (DT-4e)", () => {
  const rows: [string, number, string][] = [
    ["abc", 2, "ab"], ["abc", 0, ""], ["abc", 5, "abc"], ["", 3, ""], ["a😀b", 2, "a😀"], ["😀😀", 1, "😀"],
    ["a".repeat(59) + "😀" + "b", 60, "a".repeat(59) + "😀"], ["a".repeat(59) + "😀" + "b", 59, "a".repeat(59)],
    ["́abc", 2, "́a"],
  ];
  for (const [s, n, out] of rows) {
    assert.equal(sliceChars(s, n), out, JSON.stringify(s.slice(0, 12)) + n);
    assert.equal(hasLoneSurrogate(sliceChars(s, n)), false);
  }
  assert.equal("a😀b".slice(0, 2), "a\ud83d", "sanity: UTF-16 slice would cut the pair");
});

test("nfc(NFD(x)) then sliceChars equals sliceChars(x) and holds no combining mark (DT-4e last row)", () => {
  const x = "Chào buổi sáng, em là Minh Ánh ở cửa hàng Mẫu Đẹp, rất vui được hỗ trợ anh chị ạ".slice(0, 70);
  assert.equal(x.length, 70);
  assert.equal(sliceChars(nfc(NFD(x)), 60), sliceChars(x, 60));
  assert.doesNotMatch(sliceChars(nfc(NFD(x)), 60), /\p{M}/u);
});

test("sliceChars never yields a lone surrogate, even from a malformed input (S1)", () => {
  assert.equal(sliceChars("a\ud83db", 5), "ab");
  assert.equal(sliceChars("\ude00x", 5), "x");
  assert.equal(sliceChars("\ud83d", 1), "");
  for (let n = 0; n < 6; n++) assert.equal(hasLoneSurrogate(sliceChars("😀a😀\ud83d😀\ude00b", n)), false, String(n));
});

test("sliceChars is safe for odd arguments (S1)", () => {
  assert.equal(sliceChars(null as never, 3), "");
  assert.equal(sliceChars("abc", -1), "");
  assert.equal(sliceChars("abc", NaN), "");
  assert.equal(sliceChars("abc", 1.9), "a");
  assert.equal(sliceChars("abc", Infinity), "abc");
  assert.equal(sliceChars("abc", "2" as never), "");
});

test("sliceChars on a huge string stays cheap", () => {
  const t0 = Date.now();
  const out = sliceChars("😀".repeat(2_000_000), 10);
  assert.equal(out, "😀".repeat(10));
  assert.ok(Date.now() - t0 < HOSTILE_MS_SMALL);
});

// ---- capThenNfc -------------------------------------------------------------------------------------------------------

test("capThenNfc caps the raw length BEFORE normalising (S1)", () => {
  const nfd = NFD("ử").repeat(4000); // 3 code points per letter
  assert.equal(nfd.length, 12000);
  const out = capThenNfc(nfd, 6000);
  assert.equal(out, "ử".repeat(2000));
  assert.ok(out.length <= 6000);
  assert.equal(capThenNfc("abc", 2), "ab");
  assert.equal(capThenNfc(NFD("dừng"), 100), "dừng");
});

test("capThenNfc never cuts a surrogate pair and tolerates non-strings", () => {
  assert.equal(capThenNfc("a😀b", 2), "a😀");
  assert.equal(capThenNfc(null as never, 5), "");
  assert.equal(capThenNfc(undefined as never, 5), "");
  assert.equal(capThenNfc("abc", 0), "");
  assert.equal(capThenNfc("abc", -3), "");
});

test("capThenNfc collapses a run of more than 30 combining marks (S1)", () => {
  const flood = "a" + "́".repeat(10_000);
  const out = capThenNfc(flood, 20_000);
  assert.ok(out.length <= 31, String(out.length));
  assert.equal(capThenNfc("x" + "́".repeat(40), 100).length, 31);
  // ordinary Vietnamese (at most two marks per letter) is untouched
  assert.equal(capThenNfc("ượ".repeat(100), 1000), "ượ".repeat(100));
  assert.equal(capThenNfc("x" + "́".repeat(30), 100).length, 31, "exactly 30 marks are kept");
});

// ---- stripAngleLookalikes ---------------------------------------------------------------------------------------------

test("stripAngleLookalikes removes every angle look-alike, including the NFD form of the not-less-than sign", () => {
  const all = "<>＜＞﹤﹥‹›〈〉⟨⟩≮≯";
  assert.equal(stripAngleLookalikes(`a${all}b`), "ab");
  for (const ch of all) assert.equal(stripAngleLookalikes(`x${ch}y`), "xy", ch);
  assert.equal(stripAngleLookalikes("＜/data_bisnis＞﹤x﹥≮"), "/data_bisnisx");
  assert.equal(stripAngleLookalikes("a≮b"), "ab", "< followed by U+0338 composes to ≮ and is removed as one");
  assert.equal(stripAngleLookalikes("a≯b"), "ab");
  assert.equal(stripAngleLookalikes("dừng gửi"), "dừng gửi");
  assert.equal(stripAngleLookalikes(null as never), "");
  assert.equal(ANGLE_LOOKALIKES, all);
});

// ---- lacksVietnameseDiacritics ----------------------------------------------------------------------------------------

test("lacksVietnameseDiacritics: at least 3 words and fewer than 2 Vietnamese letters", () => {
  assert.equal(lacksVietnameseDiacritics("Em muon hoi gia dich vu thiet ke"), true);
  assert.equal(lacksVietnameseDiacritics("a b c"), true);
  assert.equal(lacksVietnameseDiacritics("Thank you very much"), true);
  assert.equal(lacksVietnameseDiacritics("Xin chào anh chị ạ"), false);
  assert.equal(lacksVietnameseDiacritics(NFD("Xin chào anh chị ạ")), false);
  assert.equal(lacksVietnameseDiacritics("Dạ em cảm ơn"), false);
  assert.equal(lacksVietnameseDiacritics("Chao anh a"), true);
  assert.equal(lacksVietnameseDiacritics("dạ"), false);
  assert.equal(lacksVietnameseDiacritics("khong co"), false, "fewer than three words");
  assert.equal(lacksVietnameseDiacritics("1 2 3 4"), false, "numbers are not words");
  assert.equal(lacksVietnameseDiacritics("Anh ạ ok nhé"), false, "two Vietnamese letters (ạ, é) are enough");
  assert.equal(lacksVietnameseDiacritics(""), false);
  assert.equal(lacksVietnameseDiacritics(null as never), false);
});

// ---- VI_UNACCENTED_MARKERS (TC-43.14, DT-5d, FR-24.1) -----------------------------------------------------------------

const EXPECTED_MARKERS = [
  "khong", "cam on", "xin chao", "toi", "chung toi", "duoc", "nhieu", "bao nhieu", "vay", "nhe", "cua", "voi", "nhung", "nguoi",
  "chua", "giup", "khach hang", "dich vu", "lien he",
];
const ENGLISH_WORDS = ["the", "and", "ban", "la", "co", "em", "an", "cho", "in", "is", "you", "to", "of", "for", "with", "we", "our", "can", "will", "have", "not", "thank", "send", "them", "email", "price", "hello", "today", "starts", "menu", "tomorrow", "call", "once", "said", "long", "sentence", "about", "nothing", "else"];
const INDONESIAN_WORDS = ["yang", "dan", "untuk", "ini", "itu", "ya", "kak", "nggak", "gak", "tidak", "sudah", "saya", "aku", "bisa", "dengan", "nanti", "mau", "ada", "dari", "di", "ke", "sih", "aja", "kok", "dong", "terima", "kasih", "siap", "oke", "ban", "anda", "kami", "kita", "berapa", "harga", "mohon", "tolong", "boleh", "silakan", "besok", "akan", "menghubungi", "ganti", "motor", "sewa"];

test("the unaccented marker list is the 19 entries of FR-24.1, frozen, with threshold 2", () => {
  assert.deepEqual([...VI_UNACCENTED_MARKERS], EXPECTED_MARKERS);
  assert.equal(VI_UNACCENTED_MARKERS.length, 19);
  assert.equal(VI_UNACCENTED_MIN, 2);
  assert.ok(Object.isFrozen(VI_UNACCENTED_MARKERS));
  assert.ok(VI_UNACCENTED_MARKERS.length >= 12);
});

test("no marker collides with an English or Indonesian word, and none carries a Vietnamese mark (DT-5d)", () => {
  const colliding = new Set([...ENGLISH_WORDS, ...INDONESIAN_WORDS]);
  for (const m of VI_UNACCENTED_MARKERS) {
    assert.ok(!colliding.has(m), `${m} collides`);
    for (const part of m.split(" ")) assert.ok(!colliding.has(part), `${m}: part ${part} collides`);
    assert.equal(hasVietnameseMarks(m), false, m);
    assert.equal(m, m.toLowerCase());
  }
  for (const excluded of ["ban", "la", "co", "em", "an", "cho", "roi", "dang", "gui", "minh", "anh"]) {
    assert.ok(!(VI_UNACCENTED_MARKERS as readonly string[]).includes(excluded), excluded);
  }
  for (const needed of ["khong", "cam on", "xin chao", "toi"]) assert.ok((VI_UNACCENTED_MARKERS as readonly string[]).includes(needed), needed);
});

test("countUnaccentedMarkers counts distinct markers once each, longest first, without overlap (DT-5a/5b/5d)", () => {
  const rows: [string, number][] = [
    ["xin chao anh, cam on, toi khong biet", 4], ["toi khong", 2], ["xin chao cam on", 2], ["cam on toi", 2],
    ["khong", 1], ["toi", 1], ["cam on", 1], ["xin chao", 1], ["khong khong", 1], ["cam on cam on", 1], ["chung toi", 1],
    ["The ban starts today", 0], ["Saya mau ganti ban motor", 0], ["Cho em an ban", 0], ["Send them an email", 0],
    ["I said toi once in this long English sentence about nothing else", 1], ["", 0], ["   ", 0], ["123 456", 0], ["😀😀", 0],
    ["KHONG TOI", 2], ["Khong  Toi", 2], ["cam   on toi", 2], ["cam    on", 0],
    ["gia bao nhieu vay", 2],
  ];
  for (const [text, n] of rows) assert.equal(countUnaccentedMarkers(text), n, JSON.stringify(text));
});

test("every entry alone is below the threshold, every distinct pair reaches it (DT-5d)", () => {
  for (const m of VI_UNACCENTED_MARKERS) assert.ok(countUnaccentedMarkers(m) < VI_UNACCENTED_MIN, m);
  for (const a of VI_UNACCENTED_MARKERS) {
    for (const b of VI_UNACCENTED_MARKERS) {
      if (a === b) continue;
      assert.ok(countUnaccentedMarkers(`${a} ${b}`) >= VI_UNACCENTED_MIN, `${a} + ${b}`);
    }
  }
});

test("countUnaccentedMarkers does not count accented words and ignores non-strings", () => {
  assert.equal(countUnaccentedMarkers("tôi không"), 0);
  assert.equal(countUnaccentedMarkers(NFD("tôi không")), 0);
  assert.equal(countUnaccentedMarkers("toi khong".normalize("NFD")), 2);
  for (const v of [null, undefined, 5, {}]) assert.equal(countUnaccentedMarkers(v as never), 0);
});

// ---- hostile input (TC-43.10, DT-8d, NFR-4) ---------------------------------------------------------------------------

const HOSTILE: [string, (n: number) => string][] = [
  ["angle brackets", (n) => "<".repeat(n)],
  ["repeated đừng", (n) => "đừng ".repeat(Math.ceil(n / 5)).slice(0, n)],
  ["letter + marks", (n) => "d" + "̀".repeat(n - 1)],
  ["kamu adalah", (n) => "kamu adalah ".repeat(Math.ceil(n / 12)).slice(0, n)],
  ["bạn bây giờ là", (n) => "bạn bây giờ là ".repeat(Math.ceil(n / 15)).slice(0, n)],
  ["sentence punctuation", (n) => ". ? ".repeat(Math.ceil(n / 4)).slice(0, n)],
  ["Ơ flood", (n) => "Ơ".repeat(n)],
  ["spaces", (n) => " ".repeat(n)],
  ["cam on gap", (n) => "cam " + " ".repeat(n)],
  ["marker soup", (n) => "chung toi toi khong cam on ".repeat(Math.ceil(n / 27)).slice(0, n)],
  ["lone surrogates", (n) => "\ud83d".repeat(n)],
  ["emoji", (n) => "😀".repeat(Math.ceil(n / 2)).slice(0, n)],
  ["NFD word", (n) => NFD("dừng ").repeat(Math.ceil(n / 7)).slice(0, n)],
];

const MATCHERS: [string, (s: string) => unknown][] = [
  ["nfc", nfc],
  ["fold", fold],
  ["hasVietnameseMarks", hasVietnameseMarks],
  ["countVietnameseLetters", countVietnameseLetters],
  ["lacksVietnameseDiacritics", lacksVietnameseDiacritics],
  ["countUnaccentedMarkers", countUnaccentedMarkers],
  ["capThenNfc", (s) => capThenNfc(s, 20_000)],
  ["stripAngleLookalikes", stripAngleLookalikes],
  ["sliceChars", (s) => sliceChars(s, 1000)],
  ["wordRegex.test", (s) => wordRegex(["dung gui", "dung nhan", "đừng", "khong"]).test(s)],
  ["wordRegexFromSource.test", (s) => wordRegexFromSource("dung\\s{1,3}gui|khong").test(s)],
];

test("every helper stays within the hostile-input limits and scales linearly (TC-43.10)", () => {
  for (const [hname, make] of HOSTILE) {
    for (const [mname, fn] of MATCHERS) {
      const small = make(2_000);
      let t = Date.now();
      fn(small);
      assert.ok(Date.now() - t < HOSTILE_MS_SMALL, `${mname} on ${hname} (2k)`);
      const large = make(20_000);
      t = Date.now();
      fn(large);
      assert.ok(Date.now() - t < HOSTILE_MS_LARGE, `${mname} on ${hname} (20k)`);
    }
  }
});

test("assertLinear: no helper is super-linear on the hostile families (ReDoS ratio)", () => {
  for (const [hname, make] of HOSTILE) {
    for (const [mname, fn] of MATCHERS) {
      assert.doesNotThrow(() => assertLinear(fn, make), `${mname} on ${hname}`);
    }
  }
});

test("a letter followed by 10,000 combining marks goes through nfc/fold/hasVietnameseMarks without error (TC-43.10, H8)", () => {
  const h8 = "d" + "̀".repeat(10_000);
  const t = Date.now();
  assert.equal(typeof nfc(h8), "string");
  assert.equal(typeof fold(h8), "string");
  assert.equal(hasVietnameseMarks(h8), true);
  assert.equal(typeof capThenNfc(h8, 20_000), "string");
  assert.ok(Date.now() - t < HOSTILE_MS_LARGE);
  assert.equal(fold("́abc"), "abc");
  assert.equal(nfc("́abc"), "́abc");
});
