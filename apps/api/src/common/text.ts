/**
 * Shared Unicode helpers (FR-44). Vietnamese text arrives precomposed (NFC) or decomposed (NFD); every length check,
 * pattern and equality test must see one form. No other module re-implements these.
 *
 * Rules every helper here follows (security addendum S1):
 * - a non-string argument never throws: it behaves like the empty string;
 * - every pass is linear in the input, with no nested or unbounded-ambiguity quantifier;
 * - `fold` output is for boolean tests only and must never reach a prompt or a stored text.
 */

/** NFC form. Non-strings give "". Cap the input first with `capThenNfc` when it comes from outside. */
export function nfc(s: unknown): string {
  return typeof s === "string" ? s.normalize("NFC") : "";
}

/**
 * NFD, drop every combining mark, `đ`/`Đ` to `d`/`D`, lower-case. Accent-blind comparison only ("Đúng" and "dung" fold to
 * the same text, so a folded phrase must be paired with the guards of FR-45). Never use the result as text.
 */
export function fold(s: unknown): string {
  if (typeof s !== "string") return "";
  return s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
}

// Vietnamese tone marks (grave, acute, tilde, hook above, dot below) plus the letter modifications circumflex (â ê ô),
// breve (ă) and horn (ơ ư), all read on the NFD form so that precomposed and decomposed input answer the same.
const TONE_MARK = /[̣̀́̃̉]/u;
const HAS_VIETNAMESE_MARK = /[đĐ̣̀́̃̉]|[aAeEoO]\p{M}{0,4}̂|[aA]\p{M}{0,4}̆|[oOuU]\p{M}{0,4}̛/u;
const LETTER_CLUSTER = /\p{L}\p{M}*/gu;

/**
 * True when the text has at least one mark that Vietnamese uses: `đ`/`Đ` (the stroke letter counts as a mark although it
 * is not a combining mark), the vowel modifications of ă â ê ô ơ ư, or one of the five tone marks. Accented French or
 * Spanish text (é, ñ) counts too, because the tone marks are shared: callers account for that (FR-45, gap G-4).
 */
export function hasVietnameseMarks(s: unknown): boolean {
  if (typeof s !== "string") return false;
  return HAS_VIETNAMESE_MARK.test(s.normalize("NFD"));
}

/** How many letters of the text carry a Vietnamese mark (`đ`, vowel modifications, tone marks), counted by occurrence. */
export function countVietnameseLetters(s: unknown): number {
  if (typeof s !== "string") return 0;
  let n = 0;
  for (const m of s.normalize("NFD").matchAll(LETTER_CLUSTER)) {
    const cluster = m[0];
    const base = cluster[0];
    if (base === "đ" || base === "Đ") { n++; continue; }
    if (cluster.length === 1) continue;
    const marks = cluster.slice(1);
    if (
      TONE_MARK.test(marks) ||
      ("aAeEoO".includes(base) && marks.includes("̂")) ||
      ((base === "a" || base === "A") && marks.includes("̆")) ||
      ("oOuU".includes(base) && marks.includes("̛"))
    ) n++;
  }
  return n;
}

/**
 * The first `n` code points of `s`, never a half surrogate pair. A lone surrogate in a malformed input is dropped and not
 * counted, so the result is always well formed. Non-strings and n < 1 give "". `Infinity` returns the whole (cleaned) text.
 */
export function sliceChars(s: unknown, n: number): string {
  if (typeof s !== "string" || typeof n !== "number" || !(n >= 1)) return "";
  const max = Math.floor(n);
  let out = "";
  let count = 0;
  for (let i = 0; i < s.length && count < max; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        out += s[i] + s[i + 1];
        i++;
        count++;
      }
      // else: a lone high surrogate, dropped
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      // a lone low surrogate, dropped
    } else {
      out += s[i];
      count++;
    }
  }
  return out;
}

/** A run longer than this of combining marks after one letter is hostile ("Zalgo"); Vietnamese never needs more than 2. */
const MAX_MARK_RUN = 30;
const LONG_MARK_RUN = /\p{M}{31,}/gu;

/**
 * Caps the RAW length first (NFD can be about 3 times longer than NFC, so capping after normalising would let a larger
 * input through), collapses a flood of combining marks, then returns NFC. Use it for text from outside.
 */
export function capThenNfc(s: unknown, rawMax: number): string {
  const capped = sliceChars(s, rawMax);
  if (!capped) return "";
  return capped.replace(LONG_MARK_RUN, (run) => sliceChars(run, MAX_MARK_RUN)).normalize("NFC");
}

/** Angle brackets and their look-alikes. A model or a person can use these to fake a closing `<data_*>` tag. */
export const ANGLE_LOOKALIKES = "<>＜＞﹤﹥‹›〈〉⟨⟩≮≯";
const ANGLE_LOOKALIKE_RE = /[<>＜＞﹤﹥‹›〈〉⟨⟩≮≯]/gu;

/** Removes every angle bracket and look-alike (NFC first, so `<` + U+0338 is seen as the single `≮`). */
export function stripAngleLookalikes(s: unknown): string {
  return nfc(s).replace(ANGLE_LOOKALIKE_RE, "");
}

/** Word boundaries that survive NFD: a tone mark is a combining mark (`\p{M}`), so `\p{L}\p{N}` alone would split a word. */
export const WORD_BEFORE = /(?<![\p{L}\p{M}\p{N}])/u;
export const WORD_AFTER = /(?![\p{L}\p{M}\p{N}])/u;

/** Escapes regular-expression syntax characters. Only characters that are valid to escape under the `u` flag. */
export function escapeRegExp(s: unknown): string {
  return typeof s === "string" ? s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "";
}

const withUnicode = (flags: string) => (flags.includes("u") ? flags : `${flags}u`);

/** A phrase is literal text: its spaces become a bounded gap, every other character is escaped. */
function literalToSource(word: string): string {
  return word.split(" ").map(escapeRegExp).join("\\s{1,3}");
}

/**
 * A case-insensitive whole-word matcher for LITERAL words (a string or a readonly array written in source code, never data):
 * each word is NFC-normalised, escaped and matched between Unicode word boundaries. The longest word wins in an alternation,
 * a space inside a phrase matches one to three whitespace characters, and an empty list never matches anything.
 * Run it on NFC text. For a folded matcher build the list with `fold(word)` and run it on `fold(text)`.
 */
export function wordRegex(words: string | readonly string[], flags = "iu"): RegExp {
  const list = (Array.isArray(words) ? words : [words]).filter((w): w is string => typeof w === "string");
  const unique = [...new Set(list.map((w) => nfc(w).trim().replace(/\s+/g, " ")).filter((w) => w.length > 0))].sort((a, b) => b.length - a.length);
  if (unique.length === 0) return new RegExp("(?!)", withUnicode(flags));
  return new RegExp(`${WORD_BEFORE.source}(?:${unique.map(literalToSource).join("|")})${WORD_AFTER.source}`, withUnicode(flags));
}

/**
 * Same boundaries around a regular-expression SOURCE for the few patterns that need a bounded gap (for example
 * `dung\s{1,3}gui`). The source must be a constant in the code, bounded (no `*`, no `+`, no `{n,}`), and never built from data.
 */
export function wordRegexFromSource(source: string, flags = "iu"): RegExp {
  return new RegExp(`${WORD_BEFORE.source}(?:${source})${WORD_AFTER.source}`, withUnicode(flags));
}

/**
 * Text of at least three words with fewer than two Vietnamese letters: Vietnamese written without diacritics (or not
 * Vietnamese at all). Used to refuse a Vietnamese draft that lost its diacritics.
 */
export function lacksVietnameseDiacritics(text: unknown): boolean {
  if (typeof text !== "string") return false;
  let words = 0;
  for (const m of text.matchAll(/[\p{L}\p{M}\p{N}]+/gu)) {
    if (/\p{L}/u.test(m[0]) && ++words >= 3) break;
  }
  return words >= 3 && countVietnameseLetters(text) < 2;
}

/**
 * Unaccented Vietnamese function words and phrases that are not words of English or Indonesian (so a customer typing without
 * a Vietnamese keyboard can be told apart). Deliberately excluded because they collide: ban, la, co, em, an, cho, roi, dang,
 * gui, minh, anh. Each entry counts once; matches do not overlap and the longest entry wins ("chung toi" is not also "toi").
 */
export const VI_UNACCENTED_MARKERS: readonly string[] = Object.freeze([
  "khong", "cam on", "xin chao", "toi", "chung toi", "duoc", "nhieu", "bao nhieu", "vay", "nhe", "cua", "voi", "nhung", "nguoi",
  "chua", "giup", "khach hang", "dich vu", "lien he",
]);

/** Distinct unaccented markers needed before unmarked text counts as Vietnamese. */
export const VI_UNACCENTED_MIN = 2;

const UNACCENTED_MARKER_RE = wordRegex(VI_UNACCENTED_MARKERS, "giu");

/** How many DISTINCT entries of `VI_UNACCENTED_MARKERS` the text contains (case-insensitive, whole words, no overlap). */
export function countUnaccentedMarkers(text: unknown): number {
  const t = nfc(text);
  if (!t) return 0;
  const seen = new Set<string>();
  for (const m of t.matchAll(UNACCENTED_MARKER_RE)) seen.add(m[0].toLowerCase().replace(/\s+/g, " "));
  return seen.size;
}
