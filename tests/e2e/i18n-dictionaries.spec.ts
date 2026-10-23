/**
 * Browser-less dictionary checks (no page, no server). English is the source of truth; the Vietnamese
 * dictionary must have the same keys and the same {placeholder} names, no empty value, NFC text,
 * no leftover Indonesian, and real Vietnamese (diacritics). Relative imports only: this file is run by
 * Playwright, which does not resolve the web app's "@/" alias.
 *
 * Covers QA cases TC-5.2, TC-5.4, TC-5.7, TC-3.6, TC-3.7 (docs/qa/vietnamese-language_test_cases.md).
 * Glossary: docs/i18n-vi-glossary.md.
 */
import { test, expect } from "@playwright/test";
import { enAll, viAll } from "../../apps/web/src/lib/i18n/messages";

const en = enAll as Record<string, string>;
const vi = viAll as Record<string, string>;

/** Placeholder names in a string: `{n}`, `{date}`, `{nama}`, ... (set semantics, order and count do not matter). */
const PLACEHOLDER = /\{[A-Za-z0-9_.]+\}/g;
function placeholderSet(text: string): string[] {
  return [...new Set(text.match(PLACEHOLDER) ?? [])].sort();
}

/** The parity validator under test (TC-5.7): returns one message per problem found for a single key. */
function compareEntry(key: string, enValue: string, viValue: string): string[] {
  const problems: string[] = [];
  if (viValue.trim().length === 0) problems.push(`${key}: empty value`);
  const a = placeholderSet(enValue);
  const b = placeholderSet(viValue);
  for (const p of a) if (!b.includes(p)) problems.push(`${key}: missing placeholder ${p}`);
  for (const p of b) if (!a.includes(p)) problems.push(`${key}: unexpected placeholder ${p}`);
  return problems;
}

/** Values that may legitimately equal the English text: product names, acronyms, technical tokens. */
const SAME_AS_ENGLISH_ALLOWED = new Set<string>([
  "WhatsApp",
  "Email",
  "Website",
  "Pipeline",
  "Outbox",
  "CRM",
  "API",
  "Telegram",
  "Gmail",
  "Webhook",
  "Zapier",
  "n8n",
  "Swagger",
  "Prospex",
  "LinkedIn",
  "Zalo",
  "Slug",
  "Chat",
  "Embedding",
  "OpenAI",
  "OpenAI API Key",
  "ap_...",
  "https://yourcompany.com",
  "you@company.com",
  "sk-... or your provider key",
]);

/** A value without a single letter outside placeholders, URLs and punctuation has nothing to translate. */
function hasNothingToTranslate(value: string): boolean {
  const stripped = value.replace(PLACEHOLDER, "").replace(/https?:\/\/\S+/g, "");
  return !/\p{L}/u.test(stripped);
}

/** Indonesian leftovers (whole words, case-insensitive, Unicode-aware). From TC-3.6 plus a few common function words. */
const INDONESIAN_DENYLIST = [
  "Kirim", "Pesan", "Pelanggan", "Simpan", "Batal", "Hapus", "Cari", "Tambah", "Pengaturan", "Bahasa", "Kampanye", "Anda", "Kak",
  "Gaya", "Kotak", "Keluar", "Dasbor", "Analitik", "Integrasi", "Belum", "Tidak", "Sudah", "Yang", "Untuk", "Dengan", "Atau", "Dari", "Dan",
];
/** Market-data exceptions (words that are correct in a Vietnamese string for a real reason). None needed so far. */
const INDONESIAN_ALLOWED_VALUES = new Set<string>([]);
const WORD_START = "(?<![\\p{L}\\p{M}\\p{N}])";
const WORD_END = "(?![\\p{L}\\p{M}\\p{N}])";
const INDONESIAN_RE = new RegExp(`${WORD_START}(?:${INDONESIAN_DENYLIST.join("|")})${WORD_END}`, "iu");

/** Letters that exist in Vietnamese orthography but not in plain ASCII (precomposed). */
const VIET_MARK = /[ăâđêôơưĂÂĐÊÔƠƯàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵÀÁẢÃẠẰẮẲẴẶẦẤẨẪẬÈÉẺẼẸỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌỒỐỔỖỘỜỚỞỠỢÙÚỦŨỤỪỨỬỮỰỲÝỶỸỴ]/;

function wordsOf(value: string): string[] {
  return value
    .replace(PLACEHOLDER, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((w) => w.length > 0);
}

const keys = Object.keys(en);

test.describe("TC-5.2 dictionary parity (English vs Vietnamese)", () => {
  test("viAll is exported and the English dictionary is large enough to be meaningful", () => {
    expect(viAll, "messages.ts must export viAll").toBeTruthy();
    expect(keys.length).toBeGreaterThan(800);
  });

  test("(1) key sets are identical", () => {
    const viKeys = new Set(Object.keys(vi));
    const missing = keys.filter((k) => !viKeys.has(k));
    const extra = [...viKeys].filter((k) => !(k in en));
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });

  test("(2) the same {placeholder} names per key, including {nama} and {kategori}", () => {
    const problems: string[] = [];
    for (const k of keys) for (const p of compareEntry(k, en[k], vi[k] ?? "")) problems.push(p);
    expect(problems).toEqual([]);
  });

  test("(3) no empty Vietnamese value", () => {
    const empty = keys.filter((k) => typeof vi[k] !== "string" || vi[k].trim().length === 0);
    expect(empty).toEqual([]);
  });

  test("(4) every value is NFC and has no stray whitespace or control characters", () => {
    const notNfc = keys.filter((k) => vi[k] !== vi[k].normalize("NFC"));
    const messy = keys.filter((k) => vi[k] !== vi[k].trim() || /[\u0000-\u0008\u000B-\u001F​﻿]/.test(vi[k]) || /\s{2,}/.test(vi[k]));
    expect({ notNfc, messy }).toEqual({ notNfc: [], messy: [] });
  });

  test("(5) text equal to the English value is a warning for translators, except proper nouns and acronyms", () => {
    const same = keys.filter((k) => vi[k] === en[k] && !SAME_AS_ENGLISH_ALLOWED.has(en[k]) && !hasNothingToTranslate(en[k]));
    if (same.length > 0) console.log(`Warning: ${same.length} Vietnamese values equal the English text:\n${same.map((k) => `  ${k}: ${vi[k]}`).join("\n")}`);
    // Not asserted for arbitrary text (TC-5.8) but a dictionary that is mostly untranslated is a failure.
    expect(same.length).toBeLessThan(keys.length * 0.02);
    expect(same).toEqual([]);
  });
});

test.describe("TC-5.4 template placeholder tokens", () => {
  test("tpl.placeholders keeps {nama} and {kategori} in both languages", () => {
    const a = placeholderSet(en["tpl.placeholders"]);
    const b = placeholderSet(vi["tpl.placeholders"]);
    expect(a).toEqual(["{kategori}", "{nama}"]);
    expect(b).toEqual(a);
  });
});

test.describe("TC-5.7 the parity validator catches drift", () => {
  test("reports a dropped placeholder", () => {
    expect(compareEntry("k", "{n} leads", "leads").join()).toContain("missing placeholder {n}");
  });
  test("reports a renamed placeholder in both directions", () => {
    const out = compareEntry("k", "{date}", "{ngay}").join();
    expect(out).toContain("missing placeholder {date}");
    expect(out).toContain("unexpected placeholder {ngay}");
  });
  test("reports an invented placeholder", () => {
    expect(compareEntry("k", "x", "{y}").join()).toContain("unexpected placeholder {y}");
  });
  test("reports an empty value", () => {
    expect(compareEntry("k", "x", "").join()).toContain("empty value");
    expect(compareEntry("k", "x", "   ").join()).toContain("empty value");
  });
  test("compares sets, so a repeated placeholder passes", () => {
    expect(compareEntry("k", "{n} {n}", "{n}")).toEqual([]);
  });
});

test.describe("TC-3.6 no Indonesian left, real Vietnamese", () => {
  test("no deny-list word in any value", () => {
    const hits = keys.filter((k) => !INDONESIAN_ALLOWED_VALUES.has(vi[k]) && INDONESIAN_RE.test(vi[k])).map((k) => `${k}: ${vi[k]}`);
    expect(hits).toEqual([]);
  });

  test("anh/chị is not used in UI text (warning list for the native reviewer)", () => {
    const withAnhChi = keys.filter((k) => /anh\s*\/\s*chị/i.test(vi[k]));
    if (withAnhChi.length > 0) console.log(`Warning: ${withAnhChi.length} values contain anh/chị:\n${withAnhChi.map((k) => `  ${k}: ${vi[k]}`).join("\n")}`);
    expect(withAnhChi).toEqual([]);
  });

  test("diacritics are present: at least 70% of multi-word values, and no sentence-length value without any", () => {
    const multi = keys.filter((k) => wordsOf(vi[k]).length >= 2);
    const withMarks = multi.filter((k) => VIET_MARK.test(vi[k]));
    expect(multi.length).toBeGreaterThan(500);
    expect(withMarks.length / multi.length).toBeGreaterThanOrEqual(0.7);
    const bare = keys.filter((k) => wordsOf(vi[k]).length >= 4 && !VIET_MARK.test(vi[k])).map((k) => `${k}: ${vi[k]}`);
    expect(bare).toEqual([]);
  });

  test("the second person is bạn, never an Indonesian or slang form", () => {
    const bad = keys.filter((k) => /(?<![\p{L}\p{M}\p{N}])(?:mày|tao|tớ|ko|dc|k0)(?![\p{L}\p{M}\p{N}])/iu.test(vi[k]));
    expect(bad).toEqual([]);
  });

  test("sentence case for short labels: no Title Case runs of three capitalised words", () => {
    const titleCase = keys.filter((k) => /(?:^|\s)\p{Lu}\p{Ll}+\s+\p{Lu}\p{Ll}+\s+\p{Lu}\p{Ll}+(?:\s|$)/u.test(vi[k]) && !/Google Maps|WhatsApp|Prospex/.test(vi[k]) && !/^ví dụ:/.test(vi[k])).map((k) => `${k}: ${vi[k]}`);
    expect(titleCase).toEqual([]);
  });
});

test.describe("TC-3.7 language labels", () => {
  test("Vietnamese and English labels, and the old key is gone", () => {
    expect(en["camp.lang.vietnamese"]).toBe("Vietnamese");
    expect(en["camp.lang.english"]).toBe("English");
    expect(vi["camp.lang.vietnamese"]).toBe("Tiếng Việt");
    expect(vi["camp.lang.english"]).toBe("Tiếng Anh");
    expect("camp.lang.indonesian" in en).toBe(false);
    expect("camp.lang.indonesian" in vi).toBe(false);
  });
});
