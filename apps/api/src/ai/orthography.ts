/**
 * Deterministic clean-up of drafts, applied after the model writes. Style imitation (length, word choice, emoji)
 * must never include copying sloppy capitalization or missing punctuation from chat habits, so the spelling rules
 * are enforced here instead of being left to the prompt.
 *
 * The rules are a table per output language (`ORTHO_RULES`, FR-24, FR-49). Vietnamese: a capital letter at the start of the
 * text, of every line and after . ! ? (except after known abbreviations), terminal punctuation (a question mark when the last
 * sentence is a question), no space before , . ! ? ; :, a comma after an opening filler or greeting that is followed by an
 * address word, decimal commas in ratings, dot grouping of amounts that carry a currency unit, pronouns in lower case.
 * English: capitalization and punctuation only. Every rule is linear in the input and never removes or changes a diacritic.
 *
 * `fold` is used here only to FIND a proper name in a draft that lost its marks; the folded text is never output.
 */

import { toOutputLanguage, type OutputLanguage } from "../common/language";
import { WORD_AFTER, WORD_BEFORE, countUnaccentedMarkers, countVietnameseLetters, fold, hasVietnameseMarks, nfc, VI_UNACCENTED_MIN, wordRegex } from "../common/text";

// ---------- language detection ----------

/** Common Vietnamese function words (FR-24.1). Two distinct ones make marked text Vietnamese even with few marked letters. */
const VI_FUNCTION_WORDS: readonly string[] = Object.freeze([
  "và", "của", "cho", "là", "không", "được", "anh", "chị", "em", "bạn", "tôi", "chúng tôi", "xin chào", "cảm ơn", "dạ", "ạ", "vâng", "nhé",
]);
const VI_FUNCTION_WORD_RE = wordRegex(VI_FUNCTION_WORDS, "giu");
const VI_LETTERS_MIN = 2;
const VI_FUNCTION_WORDS_MIN = 2;

function distinctFunctionWords(text: string): number {
  const seen = new Set<string>();
  for (const m of text.matchAll(VI_FUNCTION_WORD_RE)) seen.add(m[0].toLowerCase().replace(/\s+/g, " "));
  return seen.size;
}

/**
 * Is this text Vietnamese? Text with Vietnamese marks: at least two Vietnamese letters OR two distinct function words.
 * Text without any mark (typed without a Vietnamese keyboard): at least two distinct entries of `VI_UNACCENTED_MARKERS`.
 * There is no short-message exception: "dạ" alone is false and the caller falls back to the requested language (OG-8).
 * Accented French or Spanish text can read as Vietnamese because the tone marks are shared (gap G-4). Works on NFC and NFD input.
 */
export function looksVietnamese(text: unknown): boolean {
  const t = nfc(text);
  if (!t) return false;
  if (hasVietnameseMarks(t)) return countVietnameseLetters(t) >= VI_LETTERS_MIN || distinctFunctionWords(t) >= VI_FUNCTION_WORDS_MIN;
  return countUnaccentedMarkers(t) >= VI_UNACCENTED_MIN;
}

// ---------- rule tables ----------

export interface OrthoRules {
  /** Words (lower case) whose trailing full stop is an abbreviation, not the end of a sentence. */
  readonly abbreviations: ReadonlySet<string>;
  /** A sentence that opens like this is a question. */
  readonly questionStart: RegExp;
  /** A sentence that ends like this (after a trailing polite particle) is a question. Null: none. */
  readonly questionEnd: RegExp | null;
  /** A trailing polite particle that is not part of the question test ("gì ạ" is a question because of "gì"). */
  readonly politeTail: RegExp | null;
  /** A line that is a quotation in quotation marks gets no full stop. */
  readonly quotedLineNoStop: boolean;
  /** Language-specific rewrites applied to the whole text before the sentence rules. Null: none. */
  readonly rewrite: ((text: string) => string) | null;
}

const NOT_LETTER_BEFORE = WORD_BEFORE.source;
const NOT_LETTER_AFTER = WORD_AFTER.source;

/** `có`, `ai` ... as a sentence opener, written so that "AI" (the technology) is not "ai" (who). */
function opener(word: string): string {
  const first = word[0];
  return `[${first.toLowerCase()}${first.toUpperCase()}]${word.slice(1).replace(/ /g, "\\s{1,3}")}`;
}

const VI_QUESTION_OPENERS = ["có", "liệu", "khi nào", "bao giờ", "ở đâu", "ai", "gì", "như thế nào", "bao nhiêu", "tại sao", "vì sao", "làm sao", "xin hỏi", "thế nào"];
const VI_QUESTION_START = new RegExp(`^(?:${VI_QUESTION_OPENERS.map((w) => (w === "có" ? `${opener(w)}(?!\\s{1,3}lẽ)` : opener(w))).join("|")})${NOT_LETTER_AFTER}`, "u");
/** Final question words and particles; lower case only, so a business name ending in "AI" is not a question. */
const VI_QUESTION_END = new RegExp(`${NOT_LETTER_BEFORE}(?:không|chưa|nhỉ|hả|à|bao\\s{1,3}nhiêu|thế\\s{1,3}nào|(?<!(?:không|chẳng)\\s{1,3}có\\s{1,3})gì|nào|đâu|(?<!\\d\\s{0,3})sao|ai)$`, "u");

const VI_ABBREVIATIONS = ["vd", "vv", "tp", "ts", "ths", "gs", "pgs", "ks", "bs", "tt", "tr", "st", "no", "dr", "prof"];
const EN_ABBREVIATIONS = ["dr", "prof", "no", "mr", "mrs", "ms", "vs", "inc", "ltd", "jr", "sr", "st"];
const EN_QUESTION_START = /^(do|does|did|can|could|would|will|should|are|is|want|how|what|when|why|who|which|have|has)\b/i;

// --- Vietnamese rewrites (each pattern is bounded and uses the shared Unicode word boundaries) ---

const VI_TIME_OF_DAY_GREETING = new RegExp(`^chào\\s{1,3}buổi\\s{1,3}(?:sáng|trưa|chiều|tối)${NOT_LETTER_AFTER}`, "iu");
const COMPOUND_PRONOUN = new RegExp(`${NOT_LETTER_BEFORE}anh/chị${NOT_LETTER_AFTER}`, "giu");
const ADDRESS_WORDS: ReadonlySet<string> = new Set(["anh", "chị", "em", "bạn", "cô", "chú", "bác", "ông", "bà", "thầy", "cậu", "dì", "cụ"]);
/** "gửi Anh thông tin": a pronoun capitalised after a lower-case word. A word after an address word is a name ("chị Anh"). */
const CAPITAL_PRONOUN = new RegExp(`${NOT_LETTER_BEFORE}(\\p{Ll}[\\p{L}\\p{M}]{0,30})(\\s{1,3})(Anh|Chị|Em|Bạn)${NOT_LETTER_AFTER}`, "gu");
/** "Dạ, Anh cần": a pronoun capitalised after a comma and followed by a lower-case word. */
const COMMA_PRONOUN = new RegExp(`(,\\s{1,3})(Anh|Chị|Em|Bạn)(?=\\s{1,3}\\p{Ll})`, "gu");
const FILLER_ADDRESS = new RegExp(`(^|[.!?]\\s{1,3})(dạ|vâng|ừ|ok)\\s{1,3}(anh/chị|anh|chị|em|bạn|cô|chú|bác)(?=\\s{1,3}\\p{L})`, "gimu");
const GREETING_ADDRESS = new RegExp(`(^|[.!?]\\s{1,3})(xin\\s{1,3}chào|chào)\\s{1,3}(anh|chị|em|bạn|cô|chú|bác)${NOT_LETTER_AFTER}(?=\\s{1,3}\\p{L})`, "gimu");
const THANKS_ADDRESS = new RegExp(
  `(^|[.!?]\\s{1,3})((?:xin\\s{1,3})?c(?:ảm|ám)\\s{1,3}ơn)\\s{1,3}(anh/chị|anh|chị|bạn|quý\\s{1,3}khách)\\s{1,3}(?=(?:em|tôi|mình|chúng\\s{1,3}tôi|chúng\\s{1,3}em|bên\\s{1,3}em)${NOT_LETTER_AFTER})`,
  "gimu",
);
const RATING_AFTER_WORD = new RegExp(`${NOT_LETTER_BEFORE}(đánh\\s{1,3}giá|xếp\\s{1,3}hạng|rating|điểm\\s{1,3}số|điểm)(\\s{1,3})(\\d)\\.(\\d{1,2})(?!\\d|\\.\\d)`, "giu");
const RATING_BEFORE_UNIT = new RegExp(`(?<![\\p{N}.,])(\\d)\\.(\\d{1,2})(\\s{1,3}sao|\\s?/\\s?5|\\s{1,3}điểm)${NOT_LETTER_AFTER}`, "giu");
const CURRENCY_AFTER = `(?=\\s?(?:đ|₫|vnđ|vnd|đồng)${NOT_LETTER_AFTER})`;
const BARE_AMOUNT = new RegExp(`(?<![\\p{N}.,])(\\d{4,12})${CURRENCY_AFTER}`, "giu");
const COMMA_AMOUNT = new RegExp(`(?<![\\p{N}.,])(\\d{1,3}(?:,\\d{3}){1,4})${CURRENCY_AFTER}`, "giu");

function groupThousands(digits: string): string {
  let out = "";
  for (let i = 0; i < digits.length; i++) out += (i > 0 && (digits.length - i) % 3 === 0 ? "." : "") + digits[i];
  return out;
}

function vietnameseRewrites(text: string): string {
  let out = text.replace(VI_TIME_OF_DAY_GREETING, "Xin chào").replace(COMPOUND_PRONOUN, "anh/chị");
  out = out.replace(CAPITAL_PRONOUN, (m, prev: string, sp: string, pron: string) => (ADDRESS_WORDS.has(prev.toLowerCase()) ? m : `${prev}${sp}${pron.toLowerCase()}`));
  out = out.replace(COMMA_PRONOUN, (_m, comma: string, pron: string) => `${comma}${pron.toLowerCase()}`);
  out = out.replace(FILLER_ADDRESS, (_m, lead: string, filler: string, addr: string) => `${lead}${filler}, ${addr.toLowerCase()}`);
  out = out.replace(GREETING_ADDRESS, (_m, lead: string, greeting: string, addr: string) => `${lead}${greeting}, ${addr.toLowerCase()}`);
  out = out.replace(THANKS_ADDRESS, (_m, lead: string, thanks: string, addr: string) => `${lead}${thanks} ${/^q/i.test(addr) ? addr : addr.toLowerCase()}, `);
  // a rating has a decimal comma; versions, dates, times and phone numbers never match these two patterns (G-15)
  out = out.replace(RATING_AFTER_WORD, (_m, word: string, sp: string, whole: string, frac: string) => `${word}${sp}${whole},${frac}`);
  out = out.replace(RATING_BEFORE_UNIT, (_m, whole: string, frac: string, unit: string) => `${whole},${frac}${unit}`);
  // an amount with a currency unit uses dots for thousands
  out = out.replace(BARE_AMOUNT, (_m, digits: string) => groupThousands(digits));
  out = out.replace(COMMA_AMOUNT, (_m, grouped: string) => grouped.replace(/,/g, "."));
  return out;
}

export const ORTHO_RULES: Readonly<Record<OutputLanguage, OrthoRules>> = Object.freeze({
  vietnamese: Object.freeze({
    abbreviations: new Set(VI_ABBREVIATIONS),
    questionStart: VI_QUESTION_START,
    questionEnd: VI_QUESTION_END,
    politeTail: /\s{1,3}ạ$/u,
    quotedLineNoStop: true,
    rewrite: vietnameseRewrites,
  }),
  english: Object.freeze({
    abbreviations: new Set(EN_ABBREVIATIONS),
    questionStart: EN_QUESTION_START,
    questionEnd: null,
    politeTail: null,
    quotedLineNoStop: false,
    rewrite: null,
  }),
});

// ---------- sentence rules ----------

function upperFirst(s: string): string {
  return s.replace(/^(\P{L}*)(\p{L})/u, (_, pre: string, ch: string) => pre + ch.toUpperCase());
}

/** The letters directly before `index`, lower case; empty when the word is longer than any abbreviation. */
function wordBefore(s: string, index: number): string {
  let i = index;
  while (i > 0 && index - i < 11 && /\p{L}/u.test(s[i - 1])) i--;
  return index - i >= 11 ? "" : s.slice(i, index).toLowerCase();
}

const SENTENCE_BREAK = /[.!?]\s+(?=\p{L})/gu;

/** Capitalizes the first letter of the line and after . ! ? (except after known abbreviations). One pass, no backtracking. */
function capitalizeLine(line: string, abbreviations: ReadonlySet<string>): string {
  const s = upperFirst(line.trimStart());
  let out = "";
  let last = 0;
  for (const m of s.matchAll(SENTENCE_BREAK)) {
    const at = m.index ?? 0;
    if (m[0][0] === "." && abbreviations.has(wordBefore(s, at))) continue;
    const letterAt = at + m[0].length;
    const letter = String.fromCodePoint(s.codePointAt(letterAt) ?? 0);
    out += s.slice(last, letterAt) + letter.toUpperCase();
    last = letterAt + letter.length;
  }
  return out + s.slice(last);
}

const TAIL_CHAR = /^[^\p{L}\p{M}\p{N}.!?,;:)"”'’]$/u;
const QUESTION_TAIL_WINDOW = 40;

/** Splits trailing emoji and symbols from the text before them, scanning back from the end (linear). */
function splitTail(line: string): [string, string] {
  let i = line.length;
  while (i > 0) {
    const c = line.charCodeAt(i - 1);
    const pair = c >= 0xdc00 && c <= 0xdfff && i >= 2 && line.charCodeAt(i - 2) >= 0xd800 && line.charCodeAt(i - 2) <= 0xdbff;
    const len = pair ? 2 : 1;
    if (!TAIL_CHAR.test(line.slice(i - len, i))) break;
    i -= len;
  }
  return [line.slice(0, i), line.slice(i)];
}

/** Adds terminal punctuation to the last sentence of a line that has none (a question mark when it reads like a question). */
function ensureTerminalPunctuation(line: string, rules: OrthoRules): string {
  const trimmed = line.trimEnd();
  if (!trimmed) return line;
  if (rules.quotedLineNoStop && /^["“].*["”]$/su.test(trimmed)) return trimmed;
  const [body, tail] = splitTail(trimmed);
  if (!body || /[.!?]$/.test(body) || /[:;,]$/.test(body)) return trimmed;
  if (!/[\p{L}\p{M}\p{N})"”'’]$/u.test(body)) return trimmed;
  const lastSentence = (body.split(/(?<=[.!?])\s+/).pop() ?? body).trim();
  let isQuestion = rules.questionStart.test(lastSentence);
  if (!isQuestion && rules.questionEnd) {
    const end = lastSentence.slice(-QUESTION_TAIL_WINDOW);
    isQuestion = rules.questionEnd.test(rules.politeTail ? end.replace(rules.politeTail, "") : end);
  }
  return `${body}${isQuestion ? "?" : "."}${tail}`;
}

// ---------- proper names ----------

const MAX_NAMES = 12;
const MAX_NAME_LENGTH = 120;
const MAX_NAME_TEXT = 200_000;
const CLUSTER = /\p{M}+|[^\p{M}]\p{M}*/gu;

interface FoldIndex {
  /** The accent-blind text (`fold`); used only to look for names, never output. */
  folded: string;
  start: number[];
  end: number[];
  cluster: string[];
}

/** For each UTF-16 unit of the folded text: the span and the original letter cluster (base letter plus its marks) it came from. */
function foldIndex(text: string): FoldIndex {
  const index: FoldIndex = { folded: "", start: [], end: [], cluster: [] };
  for (const m of text.matchAll(CLUSTER)) {
    const f = fold(m[0]);
    const from = m.index ?? 0;
    for (let i = 0; i < f.length; i++) {
      index.start.push(from);
      index.end.push(from + m[0].length);
      index.cluster.push(m[0]);
    }
    index.folded += f;
  }
  return index;
}

/** A cluster that carries no mark and is not `đ`: the only kind a draft may use in place of a marked letter of the name. */
const isPlain = (c: string) => c.normalize("NFD") === c && !/[đĐ]/.test(c);
const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);

/**
 * Restores proper names to their exact spelling wherever they appear: in any casing, and also when the draft dropped the
 * marks of a letter (never when it has a different mark). The text is spliced, never built with a replacement string,
 * so a name such as "$&" cannot expand.
 */
function restoreNames(text: string, names: readonly unknown[]): string {
  if (text.length > MAX_NAME_TEXT) return text;
  const wanted = [...new Set(names.filter((n): n is string => typeof n === "string").map((n) => nfc(n).trim()).filter((n) => n.length >= 3 && n.length <= MAX_NAME_LENGTH))].slice(0, MAX_NAMES);
  if (wanted.length === 0) return text;
  const hay = foldIndex(text);
  const spans: { from: number; to: number; name: string }[] = [];
  for (const name of wanted) {
    const needle = foldIndex(name);
    if (!needle.folded) continue;
    const checkBefore = isWordChar(needle.folded[0]);
    const checkAfter = isWordChar(needle.folded[needle.folded.length - 1]);
    for (let at = hay.folded.indexOf(needle.folded); at !== -1; at = hay.folded.indexOf(needle.folded, at + 1)) {
      const last = at + needle.folded.length - 1;
      if (checkBefore && isWordChar(hay.folded[at - 1])) continue;
      if (checkAfter && isWordChar(hay.folded[last + 1])) continue;
      let same = true;
      for (let k = 0; k < needle.folded.length && same; k++) {
        const t = hay.cluster[at + k];
        const n = needle.cluster[k];
        same = t.toLowerCase() === n.toLowerCase() || isPlain(t);
      }
      if (same) spans.push({ from: hay.start[at], to: hay.end[last], name });
    }
  }
  if (spans.length === 0) return text;
  spans.sort((a, b) => a.from - b.from || b.to - a.to);
  let out = "";
  let pos = 0;
  for (const s of spans) {
    if (s.from < pos) continue;
    out += text.slice(pos, s.from) + s.name;
    pos = s.to;
  }
  return out + text.slice(pos);
}

// ---------- public API ----------

export interface NormalizeOptions {
  /** An output language, or "auto" (default: detect Vietnamese, otherwise English). */
  language?: OutputLanguage | "auto";
  /** Proper names (business, lead, owner) restored to their exact spelling wherever they appear in any casing. */
  names?: string[];
}

export function normalizeDraft(raw: string, opts: NormalizeOptions = {}): string {
  let out = nfc(raw).replace(/[ \t]+/g, " ").replace(/ +([,.!?;:])/g, "$1").replace(/[ \t]+\n/g, "\n").trim();
  const lang: OutputLanguage = opts.language && opts.language !== "auto" ? toOutputLanguage(opts.language) : looksVietnamese(out) ? "vietnamese" : "english";
  const rules = ORTHO_RULES[lang];
  if (rules.rewrite) out = rules.rewrite(out);
  // list items and quotes are fragments, not sentences: no full stop is added to them
  out = out.split("\n").map((l) => (/^(- |\d{1,2}\. |> )/.test(l.trimStart()) ? l : ensureTerminalPunctuation(l, rules))).join("\n");
  out = out.split("\n").map((l) => capitalizeLine(l, rules.abbreviations)).join("\n");
  out = restoreNames(out, opts.names ?? []);
  return nfc(out);
}

const TIME_OF_DAY_GREETING = new RegExp(`^(chào\\s{1,3}buổi\\s{1,3}(?:sáng|trưa|chiều|tối)|good\\s{1,3}(?:morning|afternoon|evening|night))${NOT_LETTER_AFTER}`, "iu");

/**
 * A draft is read hours or days after it is written, so a time-of-day greeting ("Chào buổi sáng") is often wrong.
 * An opening greeting is replaced by a neutral one ("Xin chào", "Hello"); greetings inside the text are left alone.
 */
export function neutralGreeting(text: string): string {
  return nfc(text).replace(TIME_OF_DAY_GREETING, (m) => (/^good/i.test(m) ? "Hello" : "Xin chào"));
}
