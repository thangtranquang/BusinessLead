import type { OutputLanguage } from "../common/language";
import { WORD_BEFORE, capThenNfc, escapeRegExp, fold, hasVietnameseMarks, nfc, wordRegex, wordRegexFromSource } from "../common/text";

// ---- Opt-out (inbound) -------------------------------------------------------------------------------------------------

const PATTERNS = [
  /^\s*stop\b/i,
  /^\s*unsubscribe\b/i,
  /^\s*berhenti\b/i,
  /\bjangan\s+(di)?(hubungi|kirim|chat|wa|whatsapp)\b/i,
  /\bhapus\s+(nomor|data|kontak)\b/i,
  /\btidak\s+(usah|perlu)\s+(di)?(hubungi|chat|kirim)\b/i,
  /\b(tolong\s+)?(berhenti|stop)\s+(kirim|chat|hubungi)/i,
];

/** A short message that contains the word itself: people answer our own "balas STOP" line inside a sentence ("Maaf kak belum ya STOP", "ok stop"). */
const SHORT_PATTERNS = [/(?<!\bbus\s)\bstop\b/i, /\bberhenti\b/i, /\bunsubscribe\b/i, /\bjangan\s+ganggu\b/i];
const SHORT_MAX = 80;
const OPT_OUT_MAX = 300;
/** A message this long (raw, before any normalisation) is never an opt-out: refusing it first keeps a huge input from costing anything. */
const OPT_OUT_RAW_MAX = 1_200;

/**
 * Vietnamese phrases written WITH diacritics. They are matched on the NFC text, with Unicode word boundaries (FR-30, FR-44).
 * Ambiguous words that also mean "no thanks" in normal conversation (a bare `thôi`) are deliberately absent, and so is a bare
 * `dừng` inside a longer sentence ("Xe dừng ở trước cửa"): only an explicit phrase counts.
 */
const VI_PHRASES: readonly string[] = Object.freeze([
  "dừng gửi", "dừng nhắn", "dừng nhắn tin", "dừng gọi", "dừng liên hệ", "dừng liên lạc", "dừng làm phiền", "xin dừng",
  "ngừng gửi", "ngừng nhắn", "ngừng nhắn tin", "ngừng gọi", "ngừng liên hệ", "ngừng liên lạc", "ngừng làm phiền", "xin ngừng",
  "đừng nhắn", "đừng gửi", "đừng gọi", "đừng liên hệ", "đừng liên lạc", "đừng làm phiền", "đừng quấy rầy",
  "không cần liên hệ", "không cần nhắn tin", "không muốn nhận tin", "không muốn được liên hệ", "không muốn bị làm phiền",
  "hủy đăng ký", "huỷ đăng ký", "hủy đăng kí", "huỷ đăng kí", "hủy nhận tin", "huỷ nhận tin",
  "xóa số của", "xoá số của", "xóa số điện thoại", "xoá số điện thoại", "xóa số này", "xoá số này", "xóa số tôi", "xoá số tôi", "xóa số em", "xoá số em",
  "xóa thông tin", "xoá thông tin", "xóa dữ liệu", "xoá dữ liệu",
]);

/** The same phrases without diacritics, for a customer typing on a phone without a Vietnamese keyboard. Built from the list above. */
const VI_PHRASES_FOLDED: readonly string[] = Object.freeze([...new Set(VI_PHRASES.map((p) => fold(p)))]);

/** A whole message that is only this word (after trimming spaces and punctuation), written with diacritics. */
const VI_BARE_MARKED: ReadonlySet<string> = new Set(["dừng", "ngừng", "xóa số", "xoá số"]);
/** The unmarked bare words. `dung` also folds from "đúng" and "dũng": it is used only for a text with no Vietnamese mark at all (FR-45). */
const VI_BARE_FOLDED: ReadonlySet<string> = new Set(["dung", "ngung"]);

const VI_PHRASE_RE = wordRegex(VI_PHRASES);
const VI_PHRASE_FOLDED_RE = wordRegex(VI_PHRASES_FOLDED);

const EDGE_CHAR = /^[\s\p{P}\p{S}]$/u;
function trimEdges(s: string): string {
  let a = 0;
  let b = s.length;
  while (a < b && EDGE_CHAR.test(s[a])) a++;
  while (b > a && EDGE_CHAR.test(s[b - 1])) b--;
  return s.slice(a, b);
}

/**
 * FR-45 (security-amended): a text WITH a Vietnamese mark (đ and Đ count) matches only the diacritic phrases, on the NFC
 * text. Accent-less phrases and the bare `dung` run only on a text WITHOUT any mark, because "Đúng gửi em nhé" folds to
 * "dung gui em nhe" and would otherwise stop a conversation for good. A confirmation must never be an opt-out.
 */
function viOptOut(t: string): boolean {
  if (hasVietnameseMarks(t)) return VI_BARE_MARKED.has(trimEdges(t).toLowerCase()) || VI_PHRASE_RE.test(t);
  const f = fold(t);
  return VI_BARE_FOLDED.has(trimEdges(f)) || VI_PHRASE_FOLDED_RE.test(f);
}

/**
 * True when an incoming message asks not to be contacted again. Deliberately conservative: a false positive only stops one
 * conversation. The Vietnamese, English and Indonesian rules are all applied to every message (a customer can answer in any
 * language). Normalised to NFC first; the length limits are measured after that.
 */
export function isOptOut(text: string): boolean {
  if (typeof text !== "string" || text.length > OPT_OUT_RAW_MAX) return false;
  const t = nfc(text).trim();
  if (!t || t.length > OPT_OUT_MAX) return false;
  if (PATTERNS.some((p) => p.test(t)) || (t.length <= SHORT_MAX && SHORT_PATTERNS.some((p) => p.test(t)))) return true;
  return viOptOut(t);
}

/** Why a lead was closed because they asked to stop (leads.lostReason). One constant for every write site (FR-33); older rows keep their stored Indonesian text. */
export const STOP_REASON = "Dừng nhận tin (STOP)".normalize("NFC");

// ---- The opt-out line on outgoing drafts ---------------------------------------------------------------------------------

/**
 * Line added to first-contact drafts so the recipient always has a way out. The literal STOP stays in every language:
 * isOptOut recognises it. Keep the Vietnamese text in NFC so it matches the stored message byte for byte.
 */
export const OPT_OUT_HINT_VI = "Nếu anh/chị không muốn nhận tin nhắn, vui lòng trả lời STOP.".normalize("NFC");
export const OPT_OUT_HINT_EN = "If you'd rather not hear from me, reply STOP.";
/** One line per output language (FR-49). Index it only with a value that went through toOutputLanguage. */
export const OPT_OUT_HINT: Readonly<Record<OutputLanguage, string>> = Object.freeze({ vietnamese: OPT_OUT_HINT_VI, english: OPT_OUT_HINT_EN });
/** The Indonesian line is no longer written into any draft; it stays only so that stored sent messages can still be recognised and stripped. */
export const OPT_OUT_HINT_ID_LEGACY = "Kalau tidak berkenan, balas STOP.";

const ALL_HINTS: readonly string[] = Object.freeze([OPT_OUT_HINT_VI, OPT_OUT_HINT_EN, OPT_OUT_HINT_ID_LEGACY].map((h) => h.normalize("NFC")));

/**
 * The text of a sent message without our opt-out line, every occurrence of the Vietnamese, English and legacy Indonesian
 * hint (G-19, G-20). The one stripper for the conversation loader, the inbound handler and the maintenance script. Works on
 * NFC text so a decomposed copy is removed too; literal split/join only, never a regular expression built from the hint.
 */
export function stripOptOutHints(text: string): string {
  let t = nfc(text);
  for (const hint of ALL_HINTS) if (t.includes(hint)) t = t.split(hint).join("");
  return t.trim();
}

// ---- Prompt-injection flag --------------------------------------------------------------------------------------------

/** Text is scanned whole, in windows of this many characters that overlap by INJECTION_OVERLAP (every pattern matches at most 200). */
export const INJECTION_WINDOW = 2_000;
export const INJECTION_OVERLAP = 200;

const SPC = "\\s{1,5}";
/** Literal Vietnamese words (alternatives split by `|`), folded: they match with and without diacritics. */
const viAlt = (words: string): string => `(?:${words.split("|").map((w) => fold(w).split(" ").map(escapeRegExp).join(SPC)).join("|")})`;
const viOpt = (words: string): string => `(?:${viAlt(words)}${SPC})?`;
const GAP = "[^\\n]{0,60}";
const ROLE = `${WORD_BEFORE.source}${viAlt("trợ lý|ai|bot|chatbot|mô hình|admin|quản trị viên|hacker|dan")}`;
const INSTRUCTION = viAlt("hướng dẫn|chỉ dẫn|chỉ thị|lệnh|quy tắc|quy định");
const EARLIER = `(?:${SPC}${viAlt("trước đó|trước đây|trước|ở trên|phía trên")})?`;

/** Patterns for the original text. Every one has a bounded match length (at most 200) and no unbounded quantifier. */
const PLAIN_INJECTION: readonly RegExp[] = Object.freeze([
  /ignore\s{1,5}(?:(?:all|any|the)\s{1,5})?(?:previous|prior|above|earlier)/iu,
  /abaikan\s{1,5}(?:(?:semua|seluruh)\s{1,5})?(?:instruksi|perintah|aturan)/iu,
  /(?:system|developer)\s{1,5}prompt/iu,
  /\byou\s{1,5}are\s{1,5}now\b/iu,
  /\b(?:kamu|anda)\s{1,5}(?:sekarang\s{1,5})?(?:adalah|menjadi)\b[^\n]{0,60}\b(?:asisten|ai|bot)\b/iu,
  /\bact\s{1,5}as\b/iu,
  // the delimiters the prompt builders put around outside text: a closing tag in a customer message tries to end the data block
  /<\s{0,3}\/?\s{0,3}(?:system|pesan_pelanggan|pesan_terbaru|pesan|instructions?|data_[a-z_]{1,30}|fakta|percakapan|draft)\s{0,3}>/iu,
]);

/** Vietnamese patterns, run on the folded text, so the same list catches "bỏ qua hướng dẫn trước" and "bo qua huong dan truoc". */
const FOLDED_INJECTION: readonly RegExp[] = Object.freeze([
  // "ignore (all) previous instructions"
  wordRegexFromSource(`${viAlt("bỏ qua")}${SPC}${viOpt("mọi|tất cả|toàn bộ|các")}${INSTRUCTION}${EARLIER}`),
  // "forget / disregard the earlier instructions" (needs the "earlier" part: "quên quy tắc" alone is ordinary speech)
  wordRegexFromSource(`${viAlt("quên|phớt lờ|không tuân theo")}${SPC}${viOpt("mọi|tất cả|toàn bộ|các")}${INSTRUCTION}${SPC}${viAlt("trước đó|trước đây|trước|ở trên|phía trên")}`),
  // "you are now a (free) assistant / bot"
  wordRegexFromSource(`(?:${viAlt("bạn")}${SPC}${viAlt("bây giờ|từ giờ|từ nay|giờ đây")}|${viAlt("từ bây giờ|bây giờ|từ giờ|giờ đây")}${SPC}${viAlt("bạn")})${SPC}${viAlt("là|trở thành")}${GAP}${ROLE}`),
  // "system prompt" in Vietnamese
  wordRegexFromSource(viAlt("lời nhắc hệ thống|prompt hệ thống")),
  wordRegexFromSource(`${viAlt("tiết lộ")}${SPC}(?:${viAlt("system")}${SPC})?${viAlt("prompt|lời nhắc")}`),
]);

/** Every pattern of the scan (for the static test that none has an unbounded quantifier). */
export const INJECTION_PATTERNS: readonly RegExp[] = Object.freeze([...PLAIN_INJECTION, ...FOLDED_INJECTION]);

const OPEN_ANGLES = /[＜﹤‹〈⟨≮]/gu;
const CLOSE_ANGLES = /[＞﹥›〉⟩≯]/gu;
const FORMAT_CHARS = /\p{Cf}/gu;
const HORIZONTAL_SPACE_RUN = /[^\S\n\r]{2,}/gu;

/**
 * The text as the scan reads it: NFC (marks flood collapsed), compatibility forms folded (full-width letters and brackets),
 * look-alike angle brackets mapped to < and >, zero-width and other format characters removed, runs of blanks collapsed so
 * that a bounded gap cannot be defeated by padding. Used for DETECTION ONLY; it never reaches a prompt or a stored text.
 */
function detectionText(text: string): string {
  return capThenNfc(text, Number.POSITIVE_INFINITY).normalize("NFKC").replace(FORMAT_CHARS, "").replace(OPEN_ANGLES, "<").replace(CLOSE_ANGLES, ">").replace(HORIZONTAL_SPACE_RUN, " ");
}

/** Cut points of the windows. A cut never falls between the two halves of a surrogate pair. */
function windows(text: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  const stride = INJECTION_WINDOW - INJECTION_OVERLAP;
  const safe = (i: number) => (i > 0 && i < text.length && text.charCodeAt(i) >= 0xdc00 && text.charCodeAt(i) <= 0xdfff ? i - 1 : i);
  for (let s = 0; ; s += stride) {
    // one code point of left context for every window after the first, so a word boundary is judged on real text
    const start = s === 0 ? 0 : safe(s - 1);
    const end = Math.min(text.length, safe(s + INJECTION_WINDOW));
    out.push({ start, end: end <= start ? text.length : end });
    if (s + INJECTION_WINDOW >= text.length) break;
  }
  return out;
}

const globalOf = (patterns: readonly RegExp[]): readonly RegExp[] => patterns.map((p) => new RegExp(p.source, `${p.flags}g`));
const PLAIN_GLOBAL = globalOf(PLAIN_INJECTION);
const FOLDED_GLOBAL = globalOf(FOLDED_INJECTION);

/** True when a match is found in `copy`; with `windowed`, a match that starts on the left-context character is left to the previous window. */
function scanCopy(copy: string, global: readonly RegExp[], windowed: boolean): boolean {
  if (!copy) return false;
  const parts = windowed ? windows(copy) : [{ start: 0, end: copy.length }];
  for (const [i, w] of parts.entries()) {
    const slice = copy.slice(w.start, w.end);
    for (const re of global) {
      re.lastIndex = 0;
      for (let m = re.exec(slice); m; m = re.exec(slice)) {
        if (!windowed || i === 0 || m.index > 0) return true;
        if (m[0].length === 0) re.lastIndex++;
      }
    }
  }
  return false;
}

function injectionScan(text: unknown, windowed: boolean): boolean {
  if (typeof text !== "string" || !text) return false;
  const copy = detectionText(text);
  return scanCopy(copy, PLAIN_GLOBAL, windowed) || scanCopy(fold(copy), FOLDED_GLOBAL, windowed);
}

/**
 * True when an incoming message looks like it tries to give instructions to the AI. The draft is still written, but flagged
 * for the reviewer. The WHOLE text is scanned (an attacker may put the phrase anywhere), in windows of INJECTION_WINDOW
 * characters that overlap by INJECTION_OVERLAP, so the cost is linear and the tail is never skipped.
 */
export function looksLikeInjection(text: string): boolean {
  return injectionScan(text, true);
}

/** The same scan without windows: the reference the windowed scan must agree with (tests, and a check that no phrase is lost at a window edge). */
export function looksLikeInjectionWhole(text: string): boolean {
  return injectionScan(text, false);
}
