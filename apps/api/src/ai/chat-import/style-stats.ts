import type { ParsedMessage } from "./whatsapp-export-parser";
import { nfc } from "../../common/text";

export interface StyleStats {
  messageCount: number;
  avgChars: number;
  medianChars: number;
  avgWords: number;
  /** Share of messages that contain at least one emoji. */
  emojiRate: number;
  exclamationRate: number;
  questionRate: number;
  /** Share of messages that start with a lowercase letter. */
  lowercaseStartRate: number;
  /** Share of messages ending without terminal punctuation. */
  noEndPunctuationRate: number;
  /** Share of messages with more than one line. */
  multiLineRate: number;
  /** Most common first words (greetings, "oke", "siap", ...). */
  topOpeners: { word: string; count: number }[];
  /** Most common last words. */
  topClosers: { word: string; count: number }[];
  /** Most used emoji. */
  topEmoji: { emoji: string; count: number }[];
  /**
   * Rough language mix from common function words. Profiles stored before Vietnamese support carry `{ indonesian, english }` and no
   * `vietnamese`: read them through `styleLanguageMix`, never by direct property access.
   */
  language: { vietnamese: number; english: number };
}

const EMOJI = /\p{Extended_Pictographic}/gu;
/**
 * Vietnamese function words, one syllable each (Vietnamese is written with a space between syllables). Accented forms, then the
 * same words without diacritics because chat is often typed that way. NFC lower-case. Unaccented forms that are also common English
 * words are left out on purpose (day, den, hang, rat, tin, cam, oi, ve, lam, on, do, a, so, no, me, to, an, it).
 */
export const VI_FUNCTION_WORDS: ReadonlySet<string> = new Set([
  "và", "của", "là", "có", "không", "được", "cho", "với", "này", "đó", "những", "một", "các", "em", "anh", "chị", "ạ", "dạ", "vâng", "nhé", "nhỉ", "nha", "ơi",
  "thì", "mà", "cũng", "đã", "sẽ", "rất", "xin", "chào", "cảm", "ơn", "gửi", "để", "trong", "khi", "nếu", "vì", "nên", "rồi", "đây", "bạn", "mình", "tôi", "chúng",
  "vậy", "thế", "nào", "gì", "đâu", "sao", "bao", "nhiêu", "lắm", "quá", "từ", "đến", "về", "giúp", "xem", "biết", "muốn", "thông", "báo", "khách", "hàng",
  "khong", "duoc", "voi", "nay", "nhung", "mot", "cac", "chi", "da", "vang", "nhe", "nhi", "thi", "cung", "se", "chao", "gui", "neu", "nen", "roi",
  "minh", "toi", "chung", "vay", "nao", "dau", "nhieu", "qua", "giup", "biet", "muon", "thong", "khach",
]);
const EN_WORDS = new Set(["the", "and", "for", "you", "your", "this", "that", "is", "are", "can", "will", "thanks", "thank", "please", "hello", "hi", "ok", "yes", "we", "with", "have"]);

/** NFC first: a decomposed tone mark is a combining mark and would otherwise be replaced by a space, splitting the syllable. */
const words = (t: string) => nfc(t).toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s']/gu, " ").split(/\s+/).filter(Boolean);
const ratio = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 1000) / 1000);
const top = <T extends string>(m: Map<T, number>, n: number) =>
  [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

/** Statistics about how one person writes. Media placeholders are ignored. */
export function computeStyleStats(messages: ParsedMessage[], me: string): StyleStats {
  const mine = messages.filter((m) => nfc(m.sender) === nfc(me) && !m.isMedia).map((m) => ({ ...m, text: nfc(m.text) }));
  const lengths = mine.map((m) => m.text.length).sort((a, b) => a - b);
  const wordCounts = mine.map((m) => words(m.text).length);
  const openers = new Map<string, number>();
  const closers = new Map<string, number>();
  const emojis = new Map<string, number>();
  let emojiMsgs = 0, excl = 0, quest = 0, lower = 0, noEnd = 0, multi = 0, vi = 0, en = 0;

  for (const m of mine) {
    const t = m.text;
    const w = words(t);
    if (w.length) {
      openers.set(w[0], (openers.get(w[0]) ?? 0) + 1);
      closers.set(w[w.length - 1], (closers.get(w[w.length - 1]) ?? 0) + 1);
    }
    const found = t.match(EMOJI);
    if (found) {
      emojiMsgs++;
      for (const e of found) emojis.set(e, (emojis.get(e) ?? 0) + 1);
    }
    if (t.includes("!")) excl++;
    if (t.includes("?")) quest++;
    if (/^\p{Ll}/u.test(t)) lower++;
    if (!/[.!?]["')\]]?$/.test(t.trimEnd())) noEnd++;
    if (t.includes("\n")) multi++;
    for (const x of w) { if (VI_FUNCTION_WORDS.has(x)) vi++; if (EN_WORDS.has(x)) en++; }
  }
  const n = mine.length;
  const total = vi + en || 1;
  return {
    messageCount: n,
    avgChars: n ? Math.round(lengths.reduce((a, b) => a + b, 0) / n) : 0,
    medianChars: n ? lengths[Math.floor(n / 2)] : 0,
    avgWords: n ? Math.round((wordCounts.reduce((a, b) => a + b, 0) / n) * 10) / 10 : 0,
    emojiRate: ratio(emojiMsgs, n),
    exclamationRate: ratio(excl, n),
    questionRate: ratio(quest, n),
    lowercaseStartRate: ratio(lower, n),
    noEndPunctuationRate: ratio(noEnd, n),
    multiLineRate: ratio(multi, n),
    topOpeners: top(openers, 8).map(([word, count]) => ({ word, count })),
    topClosers: top(closers, 8).map(([word, count]) => ({ word, count })),
    topEmoji: top(emojis, 8).map(([emoji, count]) => ({ emoji, count })),
    language: { vietnamese: ratio(vi, total), english: ratio(en, total) },
  };
}

/**
 * The language mix of a stored profile. A profile saved before Vietnamese support has `{ indonesian, english }` and no
 * `vietnamese`; a stored value may also be missing or damaged. A missing or non-numeric share is 0, nothing here throws.
 */
export function styleLanguageMix(stats: unknown): { vietnamese: number; english: number } {
  const language = (stats as { language?: Partial<Record<"vietnamese" | "english", unknown>> } | null | undefined)?.language;
  const share = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return { vietnamese: share(language?.vietnamese), english: share(language?.english) };
}

export interface ReplyPair {
  /** What the other side said (consecutive messages joined). */
  incoming: string;
  /** How the user replied (consecutive messages joined). */
  reply: string;
  at: Date;
}

/**
 * Builds (incoming -> reply) pairs for few-shot retrieval: a run of messages from
 * others followed by a run of messages from `me`. Media-only messages are skipped
 * and very long gaps (> maxGapHours) break a pair, because a reply a day later
 * is rarely a good example of conversational tone.
 */
export function buildReplyPairs(messages: ParsedMessage[], me: string, maxGapHours = 12): ReplyPair[] {
  const pairs: ReplyPair[] = [];
  let incoming: ParsedMessage[] = [];
  let reply: ParsedMessage[] = [];

  const flush = () => {
    if (incoming.length && reply.length) {
      const gap = (reply[0].at.getTime() - incoming[incoming.length - 1].at.getTime()) / 3_600_000;
      if (gap <= maxGapHours) {
        pairs.push({
          incoming: incoming.map((m) => m.text).join("\n"),
          reply: reply.map((m) => m.text).join("\n"),
          at: reply[0].at,
        });
      }
    }
    incoming = [];
    reply = [];
  };

  for (const m of messages) {
    if (m.isMedia) continue;
    if (nfc(m.sender) === nfc(me)) {
      if (!incoming.length) continue; // no preceding question: not a usable pair
      reply.push(m);
    } else {
      if (reply.length) flush();
      incoming.push(m);
    }
  }
  flush();
  return pairs;
}
