import type { OutputLanguage } from "../common/language";

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

/** True when an incoming message asks not to be contacted again. Deliberately conservative: a false positive only stops one conversation. */
export function isOptOut(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 300) return false;
  return PATTERNS.some((p) => p.test(t)) || (t.length <= SHORT_MAX && SHORT_PATTERNS.some((p) => p.test(t)));
}

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

const INJECTION = [
  /ignore\s+(all\s+|any\s+|the\s+)?(previous|prior|above|earlier)/i,
  /abaikan\s+(semua\s+|seluruh\s+)?(instruksi|perintah|aturan)/i,
  /(system|developer)\s+prompt/i,
  /\byou\s+are\s+now\b/i,
  /\b(kamu|anda)\s+(sekarang\s+)?(adalah|menjadi)\b.*\b(asisten|ai|bot)\b/i,
  /\bact\s+as\b/i,
  /<\/?(system|pesan_pelanggan|instructions?)>/i,
];

/** True when an incoming message looks like it tries to give instructions to the AI. The draft is still written, but flagged for the reviewer. */
export function looksLikeInjection(text: string): boolean {
  return INJECTION.some((p) => p.test(text));
}
