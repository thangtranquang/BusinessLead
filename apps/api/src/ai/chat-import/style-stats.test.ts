import { strict as assert } from "node:assert";
import { test } from "node:test";
import { buildReplyPairs, computeStyleStats, styleLanguageMix, VI_FUNCTION_WORDS } from "./style-stats";
import type { ParsedMessage } from "./whatsapp-export-parser";
import { HOSTILE_MS_LARGE } from "../../common/hostile-limits";
import { nfc } from "../../common/text";

const t = (min: number) => new Date(Date.UTC(2026, 0, 1, 10, min));
const msg = (sender: string, text: string, min: number, isMedia = false): ParsedMessage => ({ sender, text, at: t(min), isMedia });
const mine = (...texts: string[]) => texts.map((x, i) => msg("Me", x, i));

const chat: ParsedMessage[] = [
  msg("Cust", "Kak ready kebaya?", 0),
  msg("Me", "Ready kak 🙏", 1),
  msg("Me", "Untuk tanggal berapa?", 2),
  msg("Cust", "Tanggal 12", 3),
  msg("Cust", "Bisa DP berapa?", 4),
  msg("Me", "DP 50% ya kak!", 5),
  msg("Me", "foto.jpg (file terlampir)", 6, true),
];

// DT-18 (invented): owner messages in Vietnamese, unaccented Vietnamese and English.
const VI = ["Dạ em chào anh/chị ạ", "Dạ vâng em gửi anh/chị thông tin nhé", "Em cảm ơn anh/chị ạ"];
const VI_PLAIN = ["da em chao anh chi a", "da vang em gui anh chi thong tin nhe"];
const EN = ["Hi, thanks for your message", "Sure, I will send it today"];

test("style stats count only my non-media messages", () => {
  const s = computeStyleStats(chat, "Me");
  assert.equal(s.messageCount, 3);
  assert.equal(s.emojiRate, 0.333);
  assert.equal(s.exclamationRate, 0.333);
  assert.equal(s.questionRate, 0.333);
  assert.equal(s.topEmoji[0].emoji, "🙏");
});

test("TC-30.10: an Indonesian chat still computes with finite numbers and the new language keys", () => {
  const s = computeStyleStats(chat, "Me");
  assert.deepEqual(Object.keys(s.language).sort(), ["english", "vietnamese"]);
  for (const v of Object.values(s.language)) assert.ok(Number.isFinite(v));
});

test("TC-30.1: Vietnamese owner statistics: vietnamese > english, keys exactly english and vietnamese", () => {
  const s = computeStyleStats(mine(...VI), "Me");
  assert.ok(s.language.vietnamese > s.language.english);
  assert.deepEqual(Object.keys(s.language).sort(), ["english", "vietnamese"]);
});

test("TC-30.5: Vietnamese typed without diacritics is still counted as Vietnamese", () => {
  const s = computeStyleStats(mine(...VI_PLAIN), "Me");
  assert.ok(s.language.vietnamese > s.language.english);
  assert.ok(s.language.vietnamese > 0.9);
});

test("TC-30.4: an English chat gives english > vietnamese; a mixed chat gives both greater than zero", () => {
  const en = computeStyleStats(mine(...EN), "Me");
  assert.ok(en.language.english > en.language.vietnamese);
  const mixed = computeStyleStats(mine(VI[0], EN[0]), "Me");
  assert.ok(mixed.language.vietnamese > 0 && mixed.language.english > 0);
});

test("TC-30.6 / 43.5: an NFD chat gives the same tokens and counts as NFC; the word chị is one token", () => {
  const nfcStats = computeStyleStats(mine(...VI), "Me");
  const nfdStats = computeStyleStats(mine(...VI.map((x) => x.normalize("NFD"))), "Me");
  assert.deepEqual(nfdStats, nfcStats);
  assert.ok(VI_FUNCTION_WORDS.has("chị"));
  const closers = computeStyleStats(mine("Cảm ơn chị".normalize("NFD")), "Me").topClosers;
  assert.deepEqual(closers, [{ word: "chị", count: 1 }]);
  assert.ok(computeStyleStats(mine("Dạ vâng ạ".normalize("NFD")), "Me").topOpeners.every((o) => o.word === nfc(o.word)));
});

test("TC-30.7: an empty chat and a chat with no messages from me give zeros and never throw", () => {
  const s = computeStyleStats([], "Me");
  assert.equal(s.messageCount, 0);
  assert.deepEqual(s.language, { vietnamese: 0, english: 0 });
  assert.deepEqual(computeStyleStats([msg("Cust", "Xin chào", 0)], "Me").language, { vietnamese: 0, english: 0 });
});

test("the Vietnamese function-word list holds accented and unaccented forms and no word that is also common English", () => {
  for (const w of ["và", "của", "không", "khong", "được", "duoc", "nhé", "nhe", "cảm", "ơn", "xin", "chào", "chao"]) assert.ok(VI_FUNCTION_WORDS.has(w), w);
  for (const english of ["the", "and", "for", "you", "is", "are", "can", "will", "on", "do", "a", "so", "no", "me", "to", "an", "it", "ok", "hi", "day", "den", "hang", "rat", "tin", "cam", "oi"]) assert.ok(!VI_FUNCTION_WORDS.has(english), english);
  for (const w of VI_FUNCTION_WORDS) assert.equal(w, nfc(w).toLowerCase());
});

test("S7 legacy: a stored profile with language {indonesian, english} and no vietnamese key is read without throwing, missing value 0", () => {
  assert.deepEqual(styleLanguageMix({ language: { indonesian: 1, english: 0 } }), { vietnamese: 0, english: 0 });
  assert.deepEqual(styleLanguageMix({ language: { indonesian: 0.7, english: 0.3 } }), { vietnamese: 0, english: 0.3 });
  assert.deepEqual(styleLanguageMix({ language: { vietnamese: 0.6, english: 0.4 } }), { vietnamese: 0.6, english: 0.4 });
  for (const odd of [null, undefined, {}, { language: null }, { language: "vi" }, { language: [] }, { language: { vietnamese: "x", english: NaN } }, 5, "x", []]) {
    assert.deepEqual(styleLanguageMix(odd), { vietnamese: 0, english: 0 }, JSON.stringify(odd));
  }
});

test("a legacy profile object is accepted by the reader even when typed as the new StyleStats", () => {
  const stored = JSON.parse(JSON.stringify({ ...computeStyleStats(chat, "Me"), language: { indonesian: 1, english: 0 } }));
  assert.doesNotThrow(() => styleLanguageMix(stored));
  assert.equal(styleLanguageMix(stored).vietnamese, 0);
});

test("a hostile 5 MB message is tokenised within the large limit", () => {
  const big = ("dạ em chào anh " + "a".repeat(50)).repeat(60_000).slice(0, 5_000_000);
  const t0 = performance.now();
  computeStyleStats(mine(big), "Me");
  assert.ok(performance.now() - t0 < HOSTILE_MS_LARGE * 2, "linear tokenising");
});

test("reply pairs join consecutive messages on each side", () => {
  const pairs = buildReplyPairs(chat, "Me");
  assert.equal(pairs.length, 2);
  assert.equal(pairs[0].incoming, "Kak ready kebaya?");
  assert.equal(pairs[0].reply, "Ready kak 🙏\nUntuk tanggal berapa?");
  assert.equal(pairs[1].incoming, "Tanggal 12\nBisa DP berapa?");
  assert.equal(pairs[1].reply, "DP 50% ya kak!");
});

test("a reply after a long gap is not used as an example", () => {
  const late = [msg("Cust", "Halo", 0), { ...msg("Me", "Halo juga", 0), at: new Date(Date.UTC(2026, 0, 2, 10, 0)) }];
  assert.equal(buildReplyPairs(late, "Me").length, 0);
});

test("a message from me with no preceding question is ignored", () => {
  assert.equal(buildReplyPairs([msg("Me", "Selamat pagi", 0)], "Me").length, 0);
});

test("the owner's name matches in NFC or NFD form (a sender typed with decomposed letters still finds the owner's messages)", () => {
  const chatNfc = [msg("Khách Mẫu", "Dạ em chào anh", 0), msg("Minh Anh", "Dạ vâng ạ", 1)];
  assert.equal(computeStyleStats(chatNfc, "Minh Anh".normalize("NFD")).messageCount, 1);
  assert.equal(computeStyleStats(chatNfc, "Khách Mẫu".normalize("NFD")).messageCount, 1);
  assert.equal(buildReplyPairs(chatNfc, "Minh Anh".normalize("NFD")).length, 1);
});
