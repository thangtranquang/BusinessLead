import type { OutputLanguage } from "../common/language";
import { nfc } from "../common/text";

/** WhatsApp and plain-text email show markdown symbols literally ("_booking_"), so they never belong in a draft. */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, "$1$2")
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?:;]|$)/g, "$1$2")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[*•]\s+/gm, "- ");
}

/** A draft for a business owner is plain text: pictographs read as unserious, and a model adds them whatever the prompt says. */
export function removeEmoji(text: string): string {
  return text.replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}‍️]/gu, "").replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
}

// ---- Vietnamese address (FR-22.3, FR-25.1) --------------------------------------------------------------------------------
//
// The recipient's name and gender are unknown, so a single-gender form of address (`anh`, `chị`, `ông`, `bà`) is a guess.
// The neutral form is `anh/chị`; the formal email form is `Quý khách`. A form that is followed by a name ("chị Lan"), is part
// of a name ("Minh Anh"), or is another word altogether ("anh em", "ông chủ", "bà con") is left alone.

const GUESS_WORD = /(?<![\p{L}\p{M}\p{N}/])(anh|chị|ông|bà)(?![\p{L}\p{M}\p{N}/])/giu;
const NEUTRAL_AFTER = /^\s{0,3}\/|^\s{1,3}(?:anh|chị)(?![\p{L}\p{M}\p{N}])/iu;
const NEUTRAL_BEFORE = /(?:anh|chị)\s{1,3}$/iu;
const OTHER_WORD_AFTER = /^\s{1,3}(?:em|chủ|ấy|ta|nội|ngoại|con|bà|ông)(?![\p{L}\p{M}\p{N}])/iu;
/** A name follows when a capital letter does. Deliberately without the `i` flag, which would make \p{Lu} match every letter. */
const NAME_AFTER = /^\s{1,3}\p{Lu}/u;
const NAME_BEFORE = /[\p{L}\p{M}][ \t]{0,3}$/u;
const CAPITAL = /^\p{Lu}/u;

interface Guess { offset: number; length: number; word: string }

/** The guessed single-gender forms of address in the text. Each is judged on a bounded window around it, so the scan is linear. */
function guesses(text: string): Guess[] {
  const out: Guess[] = [];
  for (const m of text.matchAll(GUESS_WORD)) {
    const offset = m.index ?? 0;
    const word = m[0];
    const after = text.slice(offset + word.length, offset + word.length + 24);
    const before = text.slice(Math.max(0, offset - 12), offset);
    if (NEUTRAL_AFTER.test(after) || NEUTRAL_BEFORE.test(before)) continue; // "anh / chị", "anh chị"
    if (OTHER_WORD_AFTER.test(after)) continue; // "anh em", "ông chủ", "bà ấy"
    if (NAME_AFTER.test(after)) continue; // "chị Lan"
    if (CAPITAL.test(word) && NAME_BEFORE.test(before)) continue; // "Minh Anh"
    out.push({ offset, length: word.length, word });
  }
  return out;
}

/** True when the text addresses an unknown reader with a single-gender form of address. */
export function hasGuessedHonorific(text: string): boolean {
  return typeof text === "string" && guesses(nfc(text)).length > 0;
}

function replaceGuessed(text: string, neutral: string): string {
  const found = guesses(text);
  if (found.length === 0) return text;
  let out = "";
  let at = 0;
  for (const g of found) {
    out += text.slice(at, g.offset) + (CAPITAL.test(g.word) ? neutral.charAt(0).toUpperCase() + neutral.slice(1) : neutral);
    at = g.offset + g.length;
  }
  return out + text.slice(at);
}

const GREETING = /^(\s*)(?:xin\s{1,3})?chào(?![\p{L}\p{M}\p{N}])/iu;
const GREETING_NEUTRAL = /^\s{1,3}anh\s{0,3}\/\s{0,3}chị/iu;
const GREETING_GUESS = /^\s{1,3}(?:anh|chị|ông|bà)(?![\p{L}\p{M}\p{N}/])/iu;
const GREETING_BARE = /^\s{0,3}[,.!:;]/u;

/**
 * The opening of a first message to an unknown recipient: "Xin chào anh/chị". A greeting that names a guessed gender
 * ("Chào chị,") or none ("Chào,") is written in that shape; a greeting to a named person ("Xin chào chị Lan,"), to "bạn",
 * or to a word that is not a form of address is left as it is. No greeting is added when the draft does not start with one.
 */
function openWithNeutralGreeting(text: string): string {
  const m = GREETING.exec(text);
  if (!m) return text;
  const canonical = `${m[1]}Xin chào anh/chị`;
  const rest = text.slice(m[0].length);
  const neutral = GREETING_NEUTRAL.exec(rest);
  if (neutral) return canonical + rest.slice(neutral[0].length);
  const guess = GREETING_GUESS.exec(rest);
  if (guess) {
    const after = rest.slice(guess[0].length, guess[0].length + 24);
    if (NAME_AFTER.test(after) || OTHER_WORD_AFTER.test(after)) return text;
    return canonical + rest.slice(guess[0].length);
  }
  if (GREETING_BARE.test(rest)) return canonical + rest;
  if (/^[ \t]{0,3}(?:\r?\n|$)/.test(rest)) return `${canonical},${rest}`;
  return text;
}

/**
 * A reply in the chat: a guessed single-gender form of address becomes `anh/chị`. English text is not touched (the
 * Indonesian rewrites are gone: they judged every language by one market).
 */
export function neutralHonorificChat(text: string, language: OutputLanguage): string {
  if (language !== "vietnamese") return text;
  return replaceGuessed(nfc(text), "anh/chị");
}

/** An email: the formal neutral form is "Quý khách"; "anh/chị" and a named address are left as written. English is not touched. */
export function neutralHonorific(text: string, language: OutputLanguage): string {
  if (language !== "vietnamese") return text;
  return replaceGuessed(nfc(text), "Quý khách");
}

/**
 * The first WhatsApp message goes to someone whose name and gender are unknown: it opens "Xin chào anh/chị," and addresses
 * the reader as anh/chị, never as a guessed anh, chị, ông or bà. Done in code because a model writes "Chào chị," or "Chào,"
 * alone now and then whatever the prompt says. English drafts are returned unchanged.
 */
export function tidyWhatsappOutreach(text: string, language: OutputLanguage): string {
  if (language !== "vietnamese") return text;
  return replaceGuessed(openWithNeutralGreeting(nfc(text)), "anh/chị");
}
