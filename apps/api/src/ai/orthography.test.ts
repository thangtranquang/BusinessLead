import { test } from "node:test";
import assert from "node:assert/strict";
import { looksVietnamese, neutralGreeting, normalizeDraft, ORTHO_RULES } from "./orthography";
import { OUTPUT_LANGUAGES } from "../common/language";
import { VI_UNACCENTED_MARKERS, hasVietnameseMarks } from "../common/text";
import { HOSTILE_MS_LARGE, assertLinear } from "../common/hostile-limits";
import * as orthography from "./orthography";

const nfd = (s: string) => s.normalize("NFD");
const N = { language: "vietnamese" as const, names: ["Minh Anh", "Công ty Mẫu", "Cà Phê Ví Dụ", "Đồ Gỗ Mẫu"] };
const vi = (s: string, o: Parameters<typeof normalizeDraft>[1] = N) => normalizeDraft(s, o);

// DT-6 rows (TC-15.1, 10.6, 15.17, 15.18)
const ROWS: [string, string, string][] = [
  ["N1", "xin chào anh/chị. em là Minh Anh! anh/chị cần gì?", "Xin chào anh/chị. Em là Minh Anh! Anh/chị cần gì?"],
  ["N2", "Em là Minh Anh đến từ Công ty Mẫu", "Em là Minh Anh đến từ Công ty Mẫu."],
  ["N3", "Anh/chị có nhu cầu không", "Anh/chị có nhu cầu không?"],
  ["N4", "Khi nào anh/chị rảnh", "Khi nào anh/chị rảnh?"],
  ["N5", "Anh/chị đã dùng dịch vụ này chưa", "Anh/chị đã dùng dịch vụ này chưa?"],
  ["N6", "Anh/chị thấy sao nhỉ", "Anh/chị thấy sao nhỉ?"],
  ["N7", "Giá bao nhiêu", "Giá bao nhiêu?"],
  ["N8", "Em sẽ gửi thông tin ngay", "Em sẽ gửi thông tin ngay."],
  ["N9", "Xin chào anh/chị , em là Minh Anh .", "Xin chào anh/chị, em là Minh Anh."],
  ["N10", "Anh/chị rảnh không ? Em gọi nhé !", "Anh/chị rảnh không? Em gọi nhé!"],
  ["N11", "Quán có đánh giá 4.4 sao", "Quán có đánh giá 4,4 sao."],
  ["N12", "Giá từ 2.000.000đ", "Giá từ 2.000.000đ."],
  ["N13", "Hẹn anh/chị ngày 23.10.2026", "Hẹn anh/chị ngày 23.10.2026."],
  ["N14", "Bản v1.2 đã sẵn sàng", "Bản v1.2 đã sẵn sàng."],
  ["N15", "Em gọi lúc 9.30 sáng", "Em gọi lúc 9.30 sáng."],
  ["N16", "Gói 1.5 triệu một tháng", "Gói 1.5 triệu một tháng."],
  ["N17", "Số 0000 000 000", "Số 0000 000 000."],
  ["N18", "Em gửi Anh/Chị thông tin", "Em gửi anh/chị thông tin."],
  ["N19", "Em là Minh Anh", "Em là Minh Anh."],
  ["N20", "Chúng tôi gửi Quý khách thông tin", "Chúng tôi gửi Quý khách thông tin."],
  ["N21", "Em có nhiều món, vd. cà phê và trà sữa", "Em có nhiều món, vd. cà phê và trà sữa."],
  ["N22", "Dạ anh cần hỗ trợ gì ạ", "Dạ, anh cần hỗ trợ gì ạ?"],
  ["N23", "Dạ, anh cần hỗ trợ gì ạ?", "Dạ, anh cần hỗ trợ gì ạ?"],
  ["N24", "Cảm ơn anh/chị em sẽ gửi ngay", "Cảm ơn anh/chị, em sẽ gửi ngay."],
  ["N25", "Cảm ơn anh/chị đã phản hồi", "Cảm ơn anh/chị đã phản hồi."],
  ["N26", "Xin chào anh/chị, em là Minh Anh.", "Xin chào anh/chị, em là Minh Anh."],
  ["N28", "Em hỗ trợ:\n- Đặt lịch\n- Nhắc lịch", "Em hỗ trợ:\n- Đặt lịch\n- Nhắc lịch"],
  ["N29", "\"Xin chào anh/chị\"", "\"Xin chào anh/chị\""],
  ["N30", "em là minh anh đến từ công ty mẫu", "Em là Minh Anh đến từ Công ty Mẫu."],
  ["N31", "đồ gỗ mẫu xin chào anh/chị", "Đồ Gỗ Mẫu xin chào anh/chị."],
  ["N32", "Em thấy Ca Phe Vi Du có đánh giá tốt", "Em thấy Cà Phê Ví Dụ có đánh giá tốt."],
];

for (const [id, input, expected] of ROWS) {
  test(`normalizeDraft ${id}: ${input.slice(0, 40).replace(/\n/g, " ")}`, () => {
    assert.equal(vi(input), expected);
    assert.equal(vi(nfd(input)), expected, "NFD input gives the same NFC output");
    assert.equal(vi(expected), expected, "idempotent");
    assert.equal(expected, expected.normalize("NFC"));
  });
}

test("N27: a greeting followed by an address word gets a comma (the rest is recorded)", () => {
  assert.match(vi("Xin chào chị Lan em là Minh Anh"), /^Xin chào, chị Lan/);
});

test("N33: emoji and WhatsApp formatting characters keep their count and order", () => {
  const out = vi("*Xin chào* anh/chị 😊 _em_ là ~Minh Anh~");
  const keep = (s: string) => [...s].filter((c) => "*_~😊".includes(c)).join("");
  assert.equal(keep(out), keep("*Xin chào* anh/chị 😊 _em_ là ~Minh Anh~"));
});

test("a rating decimal is the only rewritten number; versions, dates, times and phones stay (G-15)", () => {
  assert.ok(vi("đánh giá 4.4").includes("4,4"));
  assert.ok(vi("Quán đạt 4.5 sao rồi").includes("4,5 sao"));
  assert.ok(vi("rating 4.6/5").includes("4,6/5"));
  for (const untouched of ["v1.2.3", "12.05.2026", "lúc 9.30", "0903.123.456", "bản 2.0"]) assert.ok(vi(`Mã ${untouched} ạ`).includes(untouched), untouched);
  assert.ok(vi("đánh giá 4.4.2 nhé").includes("4.4.2"));
});

test("a bare amount followed by a currency unit gets dot grouping; groups and other numbers are left alone", () => {
  assert.ok(vi("Giá chỉ 2000000đ thôi").includes("2.000.000đ"));
  assert.ok(vi("Giá 500000 VND").includes("500.000 VND"));
  assert.ok(vi("Giá 2,000,000đ").includes("2.000.000đ"));
  assert.ok(vi("Số 0903123456 nhé").includes("0903123456"));
  assert.ok(vi("Năm 2026 ạ").includes("2026"));
});

test("the sentence rules: capital after abbreviations is not forced", () => {
  assert.ok(vi("Em hỗ trợ tp. hồ chí minh và hà nội").includes("tp. hồ"));
  for (const abbr of ["vv.", "tp.", "TS.", "ThS.", "GS."]) assert.ok(vi(`Em gặp ${abbr} nguyễn văn a hôm qua`).includes(`${abbr} nguyễn`), abbr);
});

test("question detection by opening word and by final particle (TC-15.6)", () => {
  for (const starter of ["có", "liệu", "khi nào", "bao giờ", "ở đâu", "ai", "gì", "như thế nào", "bao nhiêu", "tại sao", "vì sao", "làm sao", "xin hỏi"]) {
    assert.match(vi(`${starter} anh/chị cần em hỗ trợ`), /\?$/, starter);
  }
  for (const final of ["không", "chưa", "nhỉ", "hả", "à"]) assert.match(vi(`Anh/chị đã xem thông tin ${final}`), /\?$/, final);
  assert.match(vi("Em sẽ gửi thông tin ngay"), /\.$/);
  // "AI" (the technology) and a business name ending in AI are not question words
  assert.match(vi("AI giúp quán tiết kiệm thời gian"), /\.$/);
  assert.match(vi("Em đến từ Công ty Mẫu AI"), /\.$/);
});

test("no space before punctuation; list items and quotes get no full stop; names with $ are safe", () => {
  assert.equal(vi("Xin chào , em là Minh Anh ."), "Xin chào, em là Minh Anh.");
  assert.equal(vi("> Xin chào anh/chị"), "> Xin chào anh/chị");
  assert.equal(vi("Em là $& từ Công ty Mẫu", { language: "vietnamese", names: ["Công ty $& Mẫu", "$'x"] }), "Em là $& từ Công ty Mẫu.");
  const dollar = vi("em là cửa hàng $& ạ", { language: "vietnamese", names: ["Cửa hàng $&"] });
  assert.ok(dollar.includes("Cửa hàng $&") && !dollar.includes("em là cửa"), dollar);
});

test("a proper name may lose its marks in the draft, but never gain or change them", () => {
  assert.equal(vi("Em thấy dung có đánh giá tốt", { language: "vietnamese", names: ["Dũng"] }), "Em thấy Dũng có đánh giá tốt.");
  // the name "Dung" must not rewrite the word "đúng"
  assert.equal(vi("Em thấy đúng rồi", { language: "vietnamese", names: ["Dung"] }), "Em thấy đúng rồi.");
});

test("pronouns are lower case mid-sentence; names that look like pronouns keep their capital", () => {
  assert.equal(vi("Em gửi Anh thông tin", { language: "vietnamese" }), "Em gửi anh thông tin.");
  assert.equal(vi("Em là Tuấn Anh", { language: "vietnamese" }), "Em là Tuấn Anh.");
  assert.equal(vi("Em gửi chị Anh thông tin", { language: "vietnamese" }), "Em gửi chị Anh thông tin.");
  assert.equal(vi("Dạ, Anh cần gì ạ", { language: "vietnamese" }), "Dạ, anh cần gì ạ?");
});

test("English drafts only get capitalization and punctuation; the Indonesian rule set is gone (TC-15.19)", () => {
  assert.equal(normalizeDraft("hi there, saw your cafe has 312 reviews. want a quick preview", { language: "english" }), "Hi there, saw your cafe has 312 reviews. Want a quick preview?");
  assert.equal(normalizeDraft("terima kasih anda", { language: "english" }), "Terima kasih anda.");
  assert.equal(normalizeDraft("hello there. how are you", { language: "english" }), "Hello there. How are you?");
  assert.equal(normalizeDraft("the rating is 4.4", { language: "english" }), "The rating is 4.4.");
});

test("auto picks Vietnamese rules for Vietnamese and English rules for everything else (TC-15.5)", () => {
  assert.equal(normalizeDraft("xin chào anh/chị. em là Minh Anh! anh/chị cần gì?", { language: "auto", names: ["Minh Anh"] }), "Xin chào anh/chị. Em là Minh Anh! Anh/chị cần gì?");
  assert.equal(normalizeDraft("hello there. how are you", { language: "auto" }), "Hello there. How are you?");
  assert.equal(normalizeDraft("terima kasih, kami akan menghubungi anda besok", { language: "auto" }), "Terima kasih, kami akan menghubungi anda besok.");
  assert.equal(normalizeDraft("dạ ok anh nhé", {}), vi("dạ ok anh nhé", { language: "vietnamese" }));
  assert.equal("looksIndonesian" in orthography, false);
});

test("an unknown language value reads as English; the rule tables are frozen and exhaustive", () => {
  assert.equal(normalizeDraft("the rating is 4.4", { language: "indonesian" as never }), "The rating is 4.4.");
  assert.equal(normalizeDraft("the rating is 4.4", { language: "__proto__" as never }), "The rating is 4.4.");
  assert.deepEqual(Object.keys(ORTHO_RULES).sort(), [...OUTPUT_LANGUAGES].sort());
  assert.ok(Object.isFrozen(ORTHO_RULES));
  for (const l of OUTPUT_LANGUAGES) assert.ok(Object.isFrozen(ORTHO_RULES[l]));
});

test("empty, whitespace and non-string input never throws (TC-15.12)", () => {
  assert.equal(vi(""), "");
  assert.equal(vi("   "), "");
  assert.equal(normalizeDraft(null as never, { language: "vietnamese" }), "");
  assert.equal(normalizeDraft(undefined as never), "");
  assert.equal(looksVietnamese(""), false);
  assert.equal(looksVietnamese(null as never), false);
});

test("mixed-language text gets the Vietnamese rules and keeps English words (TC-15.13)", () => {
  const out = normalizeDraft("Xin chào, please send the price list ạ", { language: "auto" });
  assert.equal(looksVietnamese(out), true);
  assert.ok(out.includes("please send the price list ạ"));
});

test("a lone combining mark and decomposed ệ do not throw and give the NFC result (TC-15.16)", () => {
  const lone = String.fromCharCode(0x301) + "abc";
  assert.doesNotThrow(() => vi(lone));
  assert.equal(vi(nfd("việc làm ạ")), vi("việc làm ạ"));
  assert.equal(vi(nfd("việc làm ạ")), vi(nfd("việc làm ạ")).normalize("NFC"));
});

test("no diacritic is removed, replaced or reordered by any rule (TC-43.9)", () => {
  const marked = (s: string) => {
    const counts = new Map<string, number>();
    for (const c of s.normalize("NFD")) if (/\p{M}|đ|Đ/u.test(c)) counts.set(c.toLowerCase(), (counts.get(c.toLowerCase()) ?? 0) + 1);
    return counts;
  };
  for (const [id, input] of ROWS) {
    const before = marked(input);
    const after = marked(vi(input));
    // a name restored from an unmarked draft (N32) may add marks, but a mark is never lost
    for (const [mark, n] of before) assert.ok((after.get(mark) ?? 0) >= n, `${id}: lost ${mark}`);
    if (id !== "N32") assert.equal([...after.values()].reduce((a, b) => a + b, 0), [...before.values()].reduce((a, b) => a + b, 0), id);
  }
});

test("a 50,000-character single line is not truncated and ends with a full stop (TC-15.20)", () => {
  const line = "em gửi thông tin ".repeat(3000).trim();
  assert.ok(line.length >= 50_000 - 100);
  const out = vi(line);
  assert.ok(out.length >= line.length - 1);
  assert.ok(out.endsWith("."));
});

// DT-5 (TC-15.2, 15.3, 15.4)
test("looksVietnamese is true for Vietnamese in both forms (DT-5a)", () => {
  const yes = [
    "Xin chào anh/chị, em gọi từ Công ty Mẫu", "dạ được ạ", "cảm ơn anh", "Đà Nẵng", "anh chị", "dạ ạ",
    "Xin chào, please send the price list ạ", "xin chao anh, cam on, toi khong biet", "toi khong", "xin chao cam on", "cam on toi",
  ];
  for (const t of yes) {
    assert.equal(looksVietnamese(t), true, t);
    assert.equal(looksVietnamese(nfd(t)), true, `NFD ${t}`);
  }
});

test("looksVietnamese is false for short, single-marker, English and Indonesian text (DT-5b, OG-8)", () => {
  const no = [
    "dạ", "ạ", "chị", "dạ ok", "khong", "toi", "cam on", "xin chao", "khong khong", "cam on cam on",
    "Thank you, we will call you tomorrow", "Terima kasih, kami akan menghubungi Anda besok", "The ban starts today", "Saya mau ganti ban motor",
    "Send them an email", "Cho em an ban", "la", "co", "ban", "em", "an", "cho", "Café menu", "", "   ", "123 456", "😀😀",
    "I said toi once in this long English sentence about nothing else",
  ];
  for (const t of no) {
    assert.equal(looksVietnamese(t), false, t);
    assert.equal(looksVietnamese(nfd(t)), false, `NFD ${t}`);
  }
});

test("known false positive: accented French or Spanish text can read as Vietnamese (gap G-4, recorded)", () => {
  assert.equal(looksVietnamese("Crème brûlée"), true);
});

test("the marker constant: every entry alone is false, every pair is true (DT-5d)", () => {
  for (const m of VI_UNACCENTED_MARKERS) assert.equal(looksVietnamese(m), false, m);
  for (let i = 0; i < VI_UNACCENTED_MARKERS.length; i++) {
    for (let j = i + 1; j < VI_UNACCENTED_MARKERS.length; j++) {
      const pair = `${VI_UNACCENTED_MARKERS[i]} ${VI_UNACCENTED_MARKERS[j]}`;
      // "chung toi" followed by "toi" is one phrase plus one word: the pair is still two distinct entries
      assert.equal(looksVietnamese(pair), true, pair);
    }
  }
  for (const m of VI_UNACCENTED_MARKERS) assert.equal(hasVietnameseMarks(m), false);
});

// neutralGreeting (TC-10.4)
test("opening time-of-day greetings become neutral", () => {
  const rows: [string, string][] = [
    ["Chào buổi sáng anh/chị", "Xin chào anh/chị"],
    ["chào buổi trưa chị", "Xin chào chị"],
    ["Chào buổi chiều, anh", "Xin chào, anh"],
    ["Chào buổi tối anh/chị", "Xin chào anh/chị"],
    ["Good morning, anh", "Hello, anh"],
    ["Good morning, Sam.", "Hello, Sam."],
    ["Xin chào anh/chị", "Xin chào anh/chị"],
    ["Chào anh/chị", "Chào anh/chị"],
    ["Em chào buổi sáng", "Em chào buổi sáng"],
    [nfd("Chào buổi sáng anh/chị"), "Xin chào anh/chị"],
    ["", ""],
  ];
  for (const [i, o] of rows) assert.equal(neutralGreeting(i), o, i);
  assert.equal(vi("Chào buổi sáng anh/chị, em là Minh Anh"), "Xin chào anh/chị, em là Minh Anh.");
  assert.equal(neutralGreeting(null as never), "");
});

test("hostile input stays linear (TC-15.15)", () => {
  const makers: [string, (n: number) => string][] = [
    ["flood of <", (n) => "<".repeat(n)],
    ["đừng repeated", (n) => "đừng ".repeat(Math.ceil(n / 5)).slice(0, n)],
    ["d plus combining marks", (n) => "d" + String.fromCharCode(0x300).repeat(n - 1)],
    ["punctuation soup", (n) => ". ? ".repeat(Math.ceil(n / 4)).slice(0, n)],
    ["one letter and a mark flood", (n) => "a" + String.fromCharCode(0x301).repeat(n)],
    ["capital Ơ", (n) => "Ơ".repeat(n)],
    ["letters and emoji", (n) => "😊 ".repeat(Math.ceil(n / 3)) + "x"],
    ["sentences", (n) => "a. b. c. ".repeat(Math.ceil(n / 9)).slice(0, n)],
    ["spaces and punctuation", (n) => "x" + " ".repeat(n) + "."],
    ["an unterminated name", (n) => "aaaa".repeat(Math.ceil(n / 4)).slice(0, n)],
  ];
  for (const [label, make] of makers) {
    const big = make(20_000);
    for (const fn of [(s: string) => vi(s), (s: string) => normalizeDraft(s, { language: "auto" }), looksVietnamese, neutralGreeting]) {
      const t0 = Date.now();
      fn(big);
      assert.ok(Date.now() - t0 < HOSTILE_MS_LARGE, `${label} took ${Date.now() - t0} ms`);
    }
    assertLinear((s) => vi(s), make);
    assertLinear(looksVietnamese, make);
  }
});

test("names list is bounded and ignores short or non-string entries", () => {
  const long = "x".repeat(5000);
  assert.doesNotThrow(() => vi("em là ab", { language: "vietnamese", names: ["ab", "", long, null as never, 5 as never] }));
});

test("function words that end in a non-ASCII letter are recognised, in NFC and NFD", () => {
  for (const t of ["và của", "vâng nhé", "cảm ơn anh", "xin chào em", "dạ chị"]) {
    assert.equal(looksVietnamese(t), true, t);
    assert.equal(looksVietnamese(nfd(t)), true, `NFD ${t}`);
  }
});
