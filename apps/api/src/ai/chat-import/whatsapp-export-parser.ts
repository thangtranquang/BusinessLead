/**
 * Parser for WhatsApp's official "Export chat" text files (.txt, also the .txt inside the .zip).
 * Handles the Android and iOS layouts, 12h/24h clocks (AM/PM and the Vietnamese SA/CH), "." or ":" time separators,
 * d/m/y vs m/d/y dates, multi-line messages, system lines and media placeholders.
 * Pure functions: no I/O, no database, no AI.
 *
 * Vietnamese-locale support is SIMULATED: no real Vietnamese export was available, so the Vietnamese placeholder, deleted-message,
 * edited-message and attachment strings and the meridiem tokens SA / CH below are a best-effort list built from invented fixtures
 * (docs: G-23, FR-36). Correct them from a real Android and a real iOS export when those are tested.
 *
 * Every pattern is linear on hostile input (security S7): bounded gaps instead of `\s+`, bounded file-name search instead of
 * `\S+`, and every message is cut at MAX_MESSAGE_CHARS before any pattern runs over it.
 */
import { capThenNfc, nfc, sliceChars } from "../../common/text";

export interface ParsedMessage {
  at: Date;
  sender: string;
  text: string;
  /** True when the message is only a media placeholder (image, video, sticker ...) */
  isMedia: boolean;
}

export interface ParsedChat {
  messages: ParsedMessage[];
  senders: string[];
  /** Lines that matched no header and could not be attached to a previous message. */
  skippedLines: number;
  systemLines: number;
  dateOrder: "dmy" | "mdy";
}

/**
 * The clock's AM/PM marker: Latin AM/PM (also "a.m."), or the Vietnamese SA (sáng) / CH (chiều), any case, with optional dots.
 * It sits right after the time, optionally behind one space, no-break space (U+00A0) or narrow no-break space (U+202F, used by
 * newer iOS and Android exports). Written with brace escapes so no invisible character lives in this file.
 */
const MERIDIEM = String.raw`(?:[\u{a0}\u{202f} ]?(S\.?A\.?|C\.?H\.?|[AP]\.?M\.?))?`;

// Android:  21/07/26 16.49 - Name: text      iOS:  [21/07/26, 16.49.12] Name: text
const ANDROID = new RegExp(String.raw`^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4}),?\s{1,3}(\d{1,2})[.:](\d{2})(?:[.:](\d{2}))?${MERIDIEM}\s{1,3}-\s{1,3}(.*)$`, "iu");
const IOS = new RegExp(String.raw`^\[(\d{1,2})[/.](\d{1,2})[/.](\d{2,4}),?\s{1,3}(\d{1,2})[.:](\d{2})(?:[.:](\d{2}))?${MERIDIEM}\]\s{1,3}(.*)$`, "iu");

// Written as escapes on purpose: no invisible/bidi characters may live in source files.
const INVISIBLE = new RegExp("[" + ["\\u200e", "\\u200f", "\\u202a-\\u202e", "\\u2066-\\u2069", "\\ufeff"].join("") + "]", "g");

/** Largest export accepted (characters). Real exports are a few MB; this bounds work on hostile input. */
export const MAX_EXPORT_CHARS = 50_000_000;
/** One message is cut here, by code point, before it is cleaned, matched or normalised. */
export const MAX_MESSAGE_CHARS = 10_000;
/** Headers and media placeholders are short; longer lines are never matched against these patterns. */
const MAX_HEADER_CHARS = 400;
const MAX_MEDIA_PLACEHOLDER_CHARS = 200;

const FILE_EXT = "jpe?g|png|webp|mp4|opus|m4a|pdf|vcf";
/** The words inside "(file attached)": English, Indonesian, Vietnamese (invented). */
const ATTACHED_WORDS = "file attached|file terlampir|đã đính kèm tệp";
/** "Media omitted" placeholders without the brackets, per language. Vietnamese entries are invented. */
const OMITTED_WORDS = "media omitted|media tidak disertakan|đã bỏ qua tệp phương tiện|đã bỏ qua phương tiện|không có tệp phương tiện";
/** Edited-message markers. Vietnamese entries are invented. */
const EDITED_WORDS = "this message was edited|pesan ini diedit|tin nhắn (?:này )?đã được chỉnh sửa|tin nhắn đã được sửa";

const MEDIA_ONLY = Object.freeze([
  new RegExp(`^<(?:${OMITTED_WORDS})>$`, "i"),
  /^<attached: .+>$/i,
  /^<lampiran: .+>$/i,
  /^<đính kèm: .+>$/i,
  /^(image|video|audio|sticker|gif|document|stiker|gambar|dokumen)\s{1,3}(omitted|tidak disertakan)$/i,
  /^(ảnh|hình ảnh|video|âm thanh|nhãn dán|gif|tài liệu)\s{1,3}(đã bị bỏ qua|đã bỏ qua)$/i,
  new RegExp(`^.{1,200}\\.(?:${FILE_EXT})\\s{0,3}\\((?:${ATTACHED_WORDS})\\)$`, "i"),
  /^(?:IMG|VID|PTT|AUD|STK|DOC)-\d{8}-WA\d{1,20}\.\w{1,10}$/i,
  /^(missed voice call|missed video call|panggilan suara tak terjawab|panggilan video tak terjawab|cuộc gọi thoại nhỡ|cuộc gọi video nhỡ|cuộc gọi nhỡ)$/i,
]);

/**
 * Attachment markers can sit in front of a caption ("IMG-20240101-WA0001.jpg (file attached) caption text").
 * They are file names, not words the person wrote, so they are removed before any statistics are computed.
 */
const INLINE_MARKERS = new RegExp(
  [
    "<(?:attached|lampiran|đính kèm):[^>]{0,200}>",
    `<(?:${OMITTED_WORDS})>`,
    `<(?:${EDITED_WORDS})>`,
    `(?:(?:IMG|VID|PTT|AUD|STK|DOC)-\\d{8}-WA\\d{1,20}\\.\\w{1,10}|\\S{1,255}?\\.(?:${FILE_EXT}))(?:\\s{0,3}\\((?:${ATTACHED_WORDS})\\))?`,
    `\\((?:${ATTACHED_WORDS})\\)`,
  ].join("|"),
  "gi",
);

/** "Deleted message" lines. The Vietnamese entries are invented, both spellings of "xóa" / "xoá" (tone mark on o or a). */
const DELETED = /^(this message was deleted|you deleted this message|pesan ini dihapus|anda menghapus pesan ini|tin nhắn này đã bị (?:xóa|xoá)|tin nhắn đã bị (?:xóa|xoá)|bạn đã (?:xóa|xoá) tin nhắn này)$/i;

const stripInvisible = (s: string) => s.replace(INVISIBLE, "");
const clean = (s: string) => stripInvisible(s).trim();

interface Header {
  a: number;
  b: number;
  y: number;
  hour: number;
  minute: number;
  second: number;
  meridiem?: string;
  rest: string;
}

function matchHeader(line: string): Header | null {
  // Fast reject: a header starts with a digit or "[" (after blanks and invisible marks). A non-ASCII first character takes the slow path.
  const first = line.charCodeAt(0);
  if (first > 32 && first < 128 && first !== 91 && !(first >= 48 && first <= 57)) return null;
  const long = line.length > MAX_HEADER_CHARS;
  // A short line is cleaned as a whole. A long line is matched on its head only; the rest of it is message text.
  const head = long ? stripInvisible(line.slice(0, MAX_HEADER_CHARS)).trimStart() : clean(line);
  const m = ANDROID.exec(head) ?? IOS.exec(head);
  if (!m) return null;
  const meridiem = m[7]?.toLowerCase().replace(/\./g, "");
  return {
    a: +m[1], b: +m[2], y: +m[3], hour: +m[4], minute: +m[5], second: m[6] ? +m[6] : 0,
    // SA (sáng) is the morning, CH (chiều) the afternoon
    meridiem: meridiem === "sa" ? "am" : meridiem === "ch" ? "pm" : meridiem,
    rest: long ? m[8] + line.slice(MAX_HEADER_CHARS, MAX_HEADER_CHARS + MAX_MESSAGE_CHARS + 1) : m[8],
  };
}

/** Day-first unless some message proves month-first (first number > 12 means day-first; second > 12 means month-first). */
function detectDateOrder(headers: Header[]): "dmy" | "mdy" {
  let dayFirst = 0;
  let monthFirst = 0;
  for (const h of headers) {
    if (h.a > 12 && h.b <= 12) dayFirst++;
    if (h.b > 12 && h.a <= 12) monthFirst++;
  }
  return monthFirst > dayFirst ? "mdy" : "dmy";
}

function toDate(h: Header, order: "dmy" | "mdy"): Date {
  const day = order === "dmy" ? h.a : h.b;
  const month = order === "dmy" ? h.b : h.a;
  const year = h.y < 100 ? 2000 + h.y : h.y;
  let hour = h.hour;
  if (h.meridiem === "pm" && hour < 12) hour += 12;
  if (h.meridiem === "am" && hour === 12) hour = 0;
  return new Date(Date.UTC(year, month - 1, day, hour, h.minute, h.second));
}

/** Splits "Name: text". Returns null for system lines (no sender). The text is cut at the per-message cap here, at its source. */
function splitSender(rest: string): { sender: string; text: string } | null {
  const idx = rest.slice(0, 82).indexOf(": ");
  if (idx <= 0 || idx > 80) return null;
  return { sender: nfc(clean(rest.slice(0, idx))), text: rest.slice(idx + 2, idx + 2 + MAX_MESSAGE_CHARS + 1) };
}

export function parseWhatsAppExport(raw: string): ParsedChat {
  if (raw.length > MAX_EXPORT_CHARS) throw new RangeError("WhatsApp export is too large");
  const lines = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
  const found: { header: Header; lineIndex: number }[] = [];
  lines.forEach((l, i) => {
    const h = matchHeader(l);
    if (h) found.push({ header: h, lineIndex: i });
  });
  const dateOrder = detectDateOrder(found.map((f) => f.header));

  const messages: ParsedMessage[] = [];
  let skipped = 0;
  let system = 0;
  let current: ParsedMessage | null = null;
  let headerPos = 0;

  for (let i = 0; i < lines.length; i++) {
    if (headerPos < found.length && found[headerPos].lineIndex === i) {
      const { header } = found[headerPos++];
      const parts = splitSender(header.rest);
      if (!parts) {
        system++;
        current = null; // system lines never absorb continuation text
        continue;
      }
      current = { at: toDate(header, dateOrder), sender: parts.sender, text: parts.text, isMedia: false };
      messages.push(current);
    } else if (current) {
      // once a message is at the cap nothing more is added: a hostile file cannot grow one message without bound
      if (current.text.length < MAX_MESSAGE_CHARS) current.text += `\n${lines[i].slice(0, MAX_MESSAGE_CHARS)}`;
    } else if (lines[i].trim()) {
      skipped++;
    }
  }

  const out: ParsedMessage[] = [];
  for (const m of messages) {
    // order matters: cap (code points) first, then NFC, so every pattern below sees one bounded, composed text
    const text = clean(capThenNfc(m.text, MAX_MESSAGE_CHARS));
    if (!text || DELETED.test(text)) continue;
    const mediaOnly = text.length <= MAX_MEDIA_PLACEHOLDER_CHARS && MEDIA_ONLY.some((re) => re.test(text));
    const stripped = mediaOnly ? text : nfc(clean(text.replace(INLINE_MARKERS, " ")));
    if (!mediaOnly && !stripped) {
      out.push({ ...m, text, isMedia: true }); // nothing but markers
      continue;
    }
    out.push({ ...m, text: sliceChars(stripped, MAX_MESSAGE_CHARS), isMedia: mediaOnly });
  }
  const senders = [...new Set(out.map((m) => m.sender))];
  return { messages: out, senders, skippedLines: skipped, systemLines: system, dateOrder };
}
